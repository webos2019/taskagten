import { AIMessage, HumanMessage, SystemMessage, type BaseMessage } from "@langchain/core/messages";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { getDeepSeekModel } from "@/lib/deepseek";
import { skillRegistry } from "@/lib/skill-registry";
import type { ChatSession } from "./chat-session";
import type { ToolCall } from "./tool-runtime";
import { executeTool } from "./tool-runtime";
import { StreamLifecycle, createId, createTextChunk } from "@/lib/ai/stream";
import type { StreamWriter } from "@/lib/ai/stream";

const MAX_TOOL_CALLS = 5;

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

  try {
    let currentMessages = [...session.getMessages()];
    const model = session.getModel();
    const skill = skillRegistry.get(session.getSkillId());
    const resultPolicy = skill?.getResultPolicy() || "auto";

    const prompt = ChatPromptTemplate.fromMessages([
      ["system", session.getSystemPrompt()],
      new MessagesPlaceholder("messages"),
    ]);

    const chain = prompt.pipe(model);

    let toolCallCount = 0;
    let hasToolCalls = false;
    let allToolCallsFailed = false;
    let hasAuthoritativeResult = false;
    const toolResults: Array<{ toolName: string; result: string; isAuthoritative: boolean }> = [];
    const failedToolCalls: Array<{ toolName: string; error: string }> = [];

    while (toolCallCount < MAX_TOOL_CALLS) {
      const result = await chain.invoke({ messages: currentMessages });
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
        const executionResult = await executeTool(tc, { clientIP: context.clientIP });

        executionResult.chunks.forEach(chunk => lifecycle.writeChunk(chunk));
        executionResult.messages.forEach(msg => currentMessages.push(msg));
        executionResult.toolResults.forEach(tr => toolResults.push(tr));
        executionResult.failedToolCalls.forEach(f => failedToolCalls.push(f));

        if (executionResult.hasAuthoritativeResult) {
          hasAuthoritativeResult = true;
        }
        if (!executionResult.roundFailed) {
          roundFailed = false;
        }

        toolCallCount++;
      }

      if (roundFailed) {
        allToolCallsFailed = true;
        break;
      }

      if (toolCallCount >= MAX_TOOL_CALLS) {
        break;
      }
    }

    if (allToolCallsFailed) {
      const errorText = `工具调用失败，请检查参数格式是否正确：\n${failedToolCalls.map(f => `- ${f.toolName}: ${f.error}`).join("\n")}`;
      lifecycle.emitErrorOnce(errorText);
      lifecycle.close();
      return;
    }

    if (hasToolCalls) {
      if (resultPolicy === "tool-first" && hasAuthoritativeResult) {
        const authoritativeResults = toolResults.filter(r => r.isAuthoritative);
        for (const tr of authoritativeResults) {
          const formattedText = formatToolResultForText(tr.result, tr.toolName);
          lifecycle.writeChunk(createTextChunk(formattedText));
        }
      } else {
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
    }

    lifecycle.emitDoneOnce();
    lifecycle.close();
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "未知错误";
    lifecycle.emitErrorOnce(errorMessage);
    lifecycle.close();
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
