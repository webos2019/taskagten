import { AIMessage, HumanMessage, SystemMessage, type BaseMessage } from "@langchain/core/messages";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { getDeepSeekModel } from "@/lib/deepseek";
import { skillRegistry } from "@/lib/skill-registry";
import type { ChatSession } from "./chat-session";
import type { ToolCall } from "./tool-runtime";
import { executeTool } from "./tool-runtime";
import { StreamLifecycle, createId, createTextChunk, createRecoveringChunk, createRecoveryFallbackChunk } from "@/lib/ai/stream";
import type { StreamWriter } from "@/lib/ai/stream";
import { withTimeout } from "@/lib/ai/debug/timeout-detector";
import { resolveCapabilityContextInvocations } from "@/lib/capability/context";

const MAX_TOOL_CALLS = 5;
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 2000;

export interface OrchestratorContext {
  clientIP?: string;
}

export async function orchestrateChat(
  session: ChatSession,
  writer: StreamWriter,
  context: OrchestratorContext
): Promise<void> {
  const lifecycle = new StreamLifecycle(writer);
  const messageId = createId();
  lifecycle.emitStartOnce(messageId);

  let recoveryAttempts = 0;

  while (recoveryAttempts <= MAX_RETRY_ATTEMPTS) {
    try {
      await doOrchestrateChat(session, writer, context, lifecycle, recoveryAttempts);
      lifecycle.close();
      return;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "未知错误";
      
      if (recoveryAttempts < MAX_RETRY_ATTEMPTS) {
        recoveryAttempts++;
        lifecycle.writeChunk(createRecoveringChunk(`服务遇到问题，正在尝试恢复... (${recoveryAttempts}/${MAX_RETRY_ATTEMPTS})`, recoveryAttempts, MAX_RETRY_ATTEMPTS));
        
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * recoveryAttempts));
      } else {
        lifecycle.writeChunk(createRecoveryFallbackChunk(`多次尝试恢复失败，将尝试直接回答`, "direct-answer"));
        
        try {
          await fallbackToDirectAnswer(session, writer, context, lifecycle);
        } catch (fallbackErr) {
          lifecycle.emitErrorOnce(fallbackErr instanceof Error ? fallbackErr.message : "服务不可用");
        }
        
        lifecycle.close();
        return;
      }
    }
  }
}

async function doOrchestrateChat(
  session: ChatSession,
  writer: StreamWriter,
  context: OrchestratorContext,
  lifecycle: StreamLifecycle,
  attempt: number
): Promise<void> {
  let currentMessages = [...session.getMessages()];
  const model = session.getModel();
  const skill = skillRegistry.get(session.getSkillId());
  const resultPolicy = skill?.getResultPolicy() || "auto";
  const skillDefinition = skill?.toCapabilityDefinition();

  const userGoal = currentMessages[currentMessages.length - 1]?.content as string || "";
  const remoteCapabilityInvocations = skillDefinition 
    ? resolveCapabilityContextInvocations(userGoal, skillDefinition)
    : [];

  for (const invocation of remoteCapabilityInvocations) {
    lifecycle.writeChunk(createTextChunk(`🔍 调用远程能力: ${invocation.name}`));
    try {
      const capabilityResult = await invocation.execute({ writer, lifecycle });
      if (capabilityResult.success && capabilityResult.content) {
        lifecycle.writeChunk(createTextChunk(`📊 远程能力结果: ${capabilityResult.content}`));
        currentMessages.push(new HumanMessage(`远程能力 [${invocation.name}] 结果: ${capabilityResult.content}`));
      }
    } catch (capabilityErr) {
      lifecycle.writeChunk(createTextChunk(`⚠️ 远程能力 ${invocation.name} 调用失败`));
    }
  }

  const prompt = ChatPromptTemplate.fromMessages([
    ["system", session.getSystemPrompt()],
    new MessagesPlaceholder("messages"),
  ]);

  const chain = prompt.pipe(model);

  let toolCallCount = 0;
  let hasToolCalls = false;
  let hasAuthoritativeResult = false;
  const toolResults: Array<{ toolName: string; result: string; isAuthoritative: boolean }> = [];

  while (toolCallCount < MAX_TOOL_CALLS) {
    const result = await withTimeout('LLM chain.invoke', chain.invoke({ messages: currentMessages }), { timeoutMs: 60000 });
    const toolCalls = parseToolCalls(result);

    if (toolCalls.length === 0) {
      if (!hasToolCalls) {
        const content = result.content;
        if (content) {
          const text = typeof content === "string" ? content : JSON.stringify(content);
          lifecycle.writeChunk(createTextChunk(text));
        }
      }
      break;
    }

    hasToolCalls = true;
    currentMessages.push(result);

    let roundFailed = true;
    for (const tc of toolCalls) {
      const executionResult = await withTimeout(`executeToolWithRetry ${tc.name}`, executeToolWithRetry(tc, { clientIP: context.clientIP }, lifecycle), { timeoutMs: 45000 });

      executionResult.chunks.forEach(chunk => lifecycle.writeChunk(chunk));
      executionResult.messages.forEach(msg => currentMessages.push(msg));
      executionResult.toolResults.forEach(tr => toolResults.push(tr));

      if (executionResult.hasAuthoritativeResult) {
        hasAuthoritativeResult = true;
      }
      if (!executionResult.roundFailed) {
        roundFailed = false;
      }

      toolCallCount++;
    }

    if (roundFailed) {
      break;
    }

    if (toolCallCount >= MAX_TOOL_CALLS) {
      break;
    }
  }

  if (hasToolCalls) {
    if (toolResults.length > 0) {
      if (resultPolicy === "tool-first" && hasAuthoritativeResult) {
        const authoritativeResults = toolResults.filter(r => r.isAuthoritative);
        for (const tr of authoritativeResults) {
          const formattedText = formatToolResultForText(tr.result, tr.toolName);
          lifecycle.writeChunk(createTextChunk(formattedText));
        }
      } else {
        await generateSummaryAnswer(session, currentMessages, lifecycle);
      }
    } else {
      lifecycle.writeChunk(createTextChunk("抱歉，工具调用失败，请稍后重试。"));
    }
  }

  lifecycle.emitDoneOnce();
}

async function executeToolWithRetry(
  toolCall: ToolCall,
  context: OrchestratorContext,
  lifecycle: StreamLifecycle
) {
  let attempts = 0;
  
  while (attempts < 2) {
    const executionResult = await executeTool(toolCall, context);
    
    if (!executionResult.roundFailed) {
      return executionResult;
    }
    
    attempts++;
    if (attempts < 2) {
      lifecycle.writeChunk(createRecoveringChunk(`工具 ${toolCall.name} 调用失败，正在重试...`, attempts, 2));
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  return executionResult;
}

async function fallbackToDirectAnswer(
  session: ChatSession,
  writer: StreamWriter,
  context: OrchestratorContext,
  lifecycle: StreamLifecycle
): Promise<void> {
  const messages = [...session.getMessages()];
  const model = session.getModel();
  
  const prompt = ChatPromptTemplate.fromMessages([
    ["system", session.getSystemPrompt()],
    new MessagesPlaceholder("messages"),
  ]);

  const chain = prompt.pipe(model);
  const result = await chain.invoke({ messages });
  
  const content = result.content;
  if (content) {
    const text = typeof content === "string" ? content : JSON.stringify(content);
    lifecycle.writeChunk(createTextChunk(text));
  }
  
  lifecycle.emitDoneOnce();
}

async function generateSummaryAnswer(
  session: ChatSession,
  currentMessages: BaseMessage[],
  lifecycle: StreamLifecycle
): Promise<void> {
  const fallbackModel = getDeepSeekModel();
  const fallbackPrompt = ChatPromptTemplate.fromMessages([
    ["system", session.getSystemPrompt()],
    new MessagesPlaceholder("messages"),
  ]);
  const summaryChain = fallbackPrompt.pipe(fallbackModel);

  const toolResultMessages = currentMessages.filter(m => m._getType() === "tool");
  const toolResultText = toolResultMessages.map(m => (m as any).content).join("\n\n");

  const summaryMessages: BaseMessage[] = [
    new SystemMessage(session.getSystemPrompt()),
    new HumanMessage(`用户问：${currentMessages[currentMessages.length - 1].content}\n\n工具调用结果：\n${toolResultText}\n\n请根据工具结果用自然语言总结回答用户。`),
  ];

  const finalResult = await summaryChain.invoke({ messages: summaryMessages });
  const finalContent = finalResult.content;

  if (finalContent) {
    const text = typeof finalContent === "string" ? finalContent : JSON.stringify(finalContent);
    lifecycle.writeChunk(createTextChunk(text));
  }
}

function parseToolCalls(result: any): ToolCall[] {
  if (result.tool_calls && result.tool_calls.length > 0) {
    return result.tool_calls.map((tc: any) => ({
      id: tc.id,
      name: tc.name,
      args: tc.args || {},
    }));
  }
  if (result.additional_kwargs?.tool_calls && result.additional_kwargs.tool_calls.length > 0) {
    return result.additional_kwargs.tool_calls.map((tc: any) => {
      const args = typeof tc.function?.arguments === "string"
        ? JSON.parse(tc.function.arguments)
        : (tc.function?.arguments || {});
      return {
        id: tc.id,
        name: tc.function?.name || tc.name,
        args,
      };
    });
  }
  return [];
}

function formatToolResultForText(toolResult: string, toolName: string): string {
  try {
    const parsed = JSON.parse(toolResult);
    if (parsed.message) {
      return parsed.message;
    }
    if (parsed.result !== undefined) {
      if (parsed.fromName && parsed.toName) {
        return `${parsed.value} ${parsed.fromName} = ${parsed.result} ${parsed.toName}`;
      }
      return String(parsed.result);
    }
    if (parsed.expression !== undefined) {
      return `${parsed.expression} = ${parsed.result}`;
    }
    if (parsed.currentTime) {
      return `当前时间：${parsed.currentTime}`;
    }
    return JSON.stringify(parsed, null, 2);
  } catch {
    return toolResult;
  }
}
