import { AIMessage, HumanMessage, SystemMessage, ToolMessage, type BaseMessage } from "@langchain/core/messages";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { getDeepSeekModel } from "@/lib/deepseek";
import { skillRegistry } from "@/lib/skill-registry";
import type { SkillDefinition, CapabilityType, CapabilityProviderKind, CapabilityExecutionResult } from "@/lib/capability/types";
import { executeTool } from "./tool-runtime";
import { StreamLifecycle, createTextChunk, createRecoveringChunk, createRecoveryFallbackChunk, type ChatStreamChunk } from "@/lib/ai/stream";
import { withTimeout } from "@/lib/ai/debug/timeout-detector";
import { resolveCapabilityContextInvocations } from "@/lib/capability/context";
import { resolveLocalCapabilityContextInvocations } from "@/lib/capability/local-context";
import { capabilityRegistry } from "@/lib/capability/registry";
import type { ExecutedToolResult } from "@/lib/capability/types";
import type { OrchestrationState, StatePatch, NodeId, GraphState } from "./orchestration-state";
import type { ChatSession } from "./chat-session";
import { resolveComposerContextInvocation, buildComposerContextPrompt } from "../composer/composer-context";
const MAX_TOOL_CALLS = 5;
const MAX_RETRY_ATTEMPTS = 2;

type CapabilityResolver = (userGoal: string, skillDefinition: SkillDefinition, executedToolResults?: ExecutedToolResult[]) => Array<{
  capabilityType: CapabilityType;
  capabilityId: string;
  name: string;
  serverId?: string;
  input: string;
  execute: (options?: { writer?: unknown; lifecycle?: unknown }) => Promise<CapabilityExecutionResult>;
}>;

export interface StepOperationOptions {
  session: ChatSession;
  lifecycle: StreamLifecycle;
  context: { clientIP?: string };
}

export async function executeConsumeRemoteCapabilityStep(
  state: OrchestrationState,
  options: StepOperationOptions
): Promise<StatePatch> {
  const { session, lifecycle } = options;
  const skill = skillRegistry.get(session.getSkillId());
  const skillDefinition = skill?.toCapabilityDefinition();
  const userGoal = state.messages[state.messages.length - 1]?.content as string || "";

  await consumeCapabilityContext(
    userGoal,
    skillDefinition,
    state.messages,
    lifecycle,
    "远程",
    resolveCapabilityContextInvocations
  );

  await consumeComposerContext(session, lifecycle, state.messages);

  return {
    currentNode: "CONSUME_REMOTE_CAPABILITY",
    visitedNodes: ["CONSUME_REMOTE_CAPABILITY"],
  };
}

export async function executeLLMInvokeStep(
  state: OrchestrationState,
  options: StepOperationOptions
): Promise<StatePatch> {
  const { session, lifecycle } = options;
  const model = session.getModel();

  const prompt = ChatPromptTemplate.fromMessages([
    ["system", session.getSystemPrompt()],
    new MessagesPlaceholder("messages"),
  ]);
  const chain = prompt.pipe(model);

  const result = await withTimeout('LLM chain.invoke', chain.invoke({ messages: state.messages }), { timeoutMs: 60000 });
  const toolCalls = parseToolCalls(result);

  if (toolCalls.length === 0) {
    const content = result.content;
    if (content) {
      const text = typeof content === "string" ? content : JSON.stringify(content);
      const textChunk = createTextChunk(text);
      lifecycle.writeChunk(textChunk);
      return {
        currentNode: "DIRECT_ANSWER",
        visitedNodes: ["LLM_INVOKE", "DIRECT_ANSWER"],
        chunks: [textChunk],
      };
    }
    return {
      currentNode: "DONE",
      visitedNodes: ["LLM_INVOKE", "DONE"],
    };
  }

  return {
    currentNode: "TOOL_CALL_EXECUTION",
    visitedNodes: ["LLM_INVOKE", "TOOL_CALL_EXECUTION"],
    messages: [result],
    hasToolCalls: true,
    toolResults: [],
    roundFailed: false,
  };
}

export async function executeToolCallExecutionStep(
  state: OrchestrationState,
  options: StepOperationOptions
): Promise<StatePatch> {
  const { lifecycle, context } = options;
  
  if (state.toolCallCount >= MAX_TOOL_CALLS) {
    return {
      currentNode: "CHECK_TOOL_RESULTS",
      visitedNodes: ["CHECK_TOOL_RESULTS"],
    };
  }

  const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
  const toolCalls = parseToolCalls(lastMessage);
  
  if (toolCalls.length === 0) {
    return {
      currentNode: "CHECK_TOOL_RESULTS",
      visitedNodes: ["CHECK_TOOL_RESULTS"],
    };
  }

  const skill = skillRegistry.get(options.session.getSkillId());
  const chunks: ChatStreamChunk[] = [];
  const messages: BaseMessage[] = [];
  const toolResults: Array<{ toolName: string; result: string; isAuthoritative: boolean }> = [];
  const executedToolResults: ExecutedToolResult[] = [];
  let hasAuthoritativeResult = false;
  let roundFailed = true;

  for (const tc of toolCalls) {
    if (skill) {
      const providerKinds: CapabilityProviderKind[] = ['internal', 'mcp'];
      let isAllowed = false;
      
      for (const providerKind of providerKinds) {
        const capabilityIdentity = {
          name: tc.name,
          capabilityType: 'tool' as const,
          providerKind,
          location: 'local' as const,
        };
        
        if (skill.isCapabilityAllowed(capabilityIdentity)) {
          isAllowed = true;
          break;
        }
      }
      
      if (!isAllowed) {
        const warning = createTextChunk(`⚠️ 工具 ${tc.name} 不在当前技能的能力范围内`);
        chunks.push(warning);
        lifecycle.writeChunk(warning);
        continue;
      }
    }

    const executionResult = await withTimeout(
      `executeToolWithRetry ${tc.name}`,
      executeToolWithRetry(tc, { clientIP: context.clientIP }, lifecycle),
      { timeoutMs: 45000 }
    );

    executionResult.chunks.forEach(chunk => {
      chunks.push(chunk);
      lifecycle.writeChunk(chunk);
    });
    executionResult.messages.forEach(msg => messages.push(msg));
    executionResult.toolResults.forEach(tr => {
      toolResults.push(tr);
      executedToolResults.push({
        toolCall: { name: tr.toolName, arguments: {} },
        result: tr.result,
        success: true,
      });
    });

    if (executionResult.hasAuthoritativeResult) {
      hasAuthoritativeResult = true;
    }
    if (!executionResult.roundFailed) {
      roundFailed = false;
    }
  }

  return {
    currentNode: "CHECK_TOOL_RESULTS",
    visitedNodes: ["CHECK_TOOL_RESULTS"],
    messages,
    toolResults,
    executedToolResults,
    chunks,
    toolCallCount: state.toolCallCount + toolCalls.length,
    hasAuthoritativeResult: state.hasAuthoritativeResult || hasAuthoritativeResult,
    roundFailed,
  };
}

export async function executeCheckToolResultsStep(
  state: OrchestrationState,
  options: StepOperationOptions
): Promise<StatePatch> {
  if (state.roundFailed || state.toolCallCount >= MAX_TOOL_CALLS) {
    return {
      currentNode: "CONSUME_LOCAL_CAPABILITY",
      visitedNodes: ["CONSUME_LOCAL_CAPABILITY"],
    };
  }

  return {
    currentNode: "LLM_INVOKE",
    visitedNodes: ["LLM_INVOKE"],
  };
}

export async function executeConsumeLocalCapabilityStep(
  state: OrchestrationState,
  options: StepOperationOptions
): Promise<StatePatch> {
  const { session, lifecycle } = options;
  const skill = skillRegistry.get(session.getSkillId());
  const skillDefinition = skill?.toCapabilityDefinition();
  const userGoal = state.messages[state.messages.length - 1]?.content as string || "";

  await consumeCapabilityContext(
    userGoal,
    skillDefinition,
    state.messages,
    lifecycle,
    "本地",
    resolveLocalCapabilityContextInvocations,
    state.executedToolResults
  );

  return {
    currentNode: "CONSUME_LOCAL_CAPABILITY",
    visitedNodes: ["CONSUME_LOCAL_CAPABILITY"],
  };
}

export async function executeGenerateSummaryStep(
  state: OrchestrationState,
  options: StepOperationOptions
): Promise<StatePatch> {
  const { session, lifecycle } = options;
  const skill = skillRegistry.get(session.getSkillId());
  const outputPolicy = skill?.getOutputPolicy() || "concise-utility";

  const summaryResult = await generateSummaryAnswer(session, state.messages, lifecycle, outputPolicy);
  
  return {
    currentNode: "GENERATE_SUMMARY",
    visitedNodes: ["GENERATE_SUMMARY"],
    chunks: summaryResult ? [{ type: "text", content: summaryResult }] : [],
  };
}

export async function executeDirectAnswerStep(
  state: OrchestrationState,
  options: StepOperationOptions
): Promise<StatePatch> {
  return {
    currentNode: "DONE",
    visitedNodes: ["DONE"],
  };
}

export async function executeFallbackStep(
  state: OrchestrationState,
  options: StepOperationOptions
): Promise<StatePatch> {
  const { session, lifecycle, context } = options;

  const fallbackResult = await fallbackToDirectAnswer(session, lifecycle, context);
  
  return {
    currentNode: "FALLBACK",
    visitedNodes: ["FALLBACK"],
    chunks: fallbackResult ? [{ type: "text", content: fallbackResult }] : [],
    recoveryAttempts: state.recoveryAttempts + 1,
  };
}

async function consumeCapabilityContext(
  userInput: string,
  skillDefinition: SkillDefinition | undefined,
  currentMessages: BaseMessage[],
  lifecycle: StreamLifecycle,
  capabilityType: string,
  resolver: CapabilityResolver,
  executedToolResults?: ExecutedToolResult[]
): Promise<void> {
  const capabilityInvocations = skillDefinition 
    ? resolver(userInput, skillDefinition, executedToolResults)
    : [];

  console.log(`[Chat Orchestrator] 发现 ${capabilityInvocations.length} 个${capabilityType}能力调用`);

  for (const invocation of capabilityInvocations) {
    const capabilityDef = capabilityRegistry.get(invocation.capabilityId);
    
    if (capabilityDef) {
      console.log(`[Chat Orchestrator] ${capabilityType}能力 ${invocation.name} 状态: ${capabilityDef.availability}`);
      
      if (capabilityDef.availability !== 'available') {
        lifecycle.writeChunk(createTextChunk(`⚠️ ${capabilityType}能力 ${invocation.name} 当前不可用 (${capabilityDef.availability})`));
        continue;
      }
    }
    
    lifecycle.writeChunk(createTextChunk(`🔍 调用${capabilityType}能力: ${invocation.name}`));
    
    try {
      const capabilityResult = await invocation.execute({ writer: null, lifecycle });
      console.log(`[Chat Orchestrator] ${capabilityType}能力 ${invocation.name} 执行结果: ${capabilityResult.success ? '成功' : '失败'}`);
      
      if (capabilityResult.success && capabilityResult.content) {
        lifecycle.writeChunk(createTextChunk(`📊 ${capabilityType}能力结果: ${capabilityResult.content}`));
        
        if (capabilityType === "远程") {
          currentMessages.push(new HumanMessage(`${capabilityType}能力 [${invocation.name}] 结果: ${capabilityResult.content}`));
        }
      }
    } catch (capabilityErr) {
      console.error(`[Chat Orchestrator] ${capabilityType}能力 ${invocation.name} 调用失败:`, capabilityErr);
      lifecycle.writeChunk(createTextChunk(`⚠️ ${capabilityType}能力 ${invocation.name} 调用失败`));
    }
  }
}

async function executeToolWithRetry(
  toolCall: { id: string; name: string; args: Record<string, unknown> },
  context: { clientIP?: string },
  lifecycle: StreamLifecycle
) {
  let attempts = 0;
  let executionResult = await executeTool(toolCall, context);
  
  while (attempts < MAX_RETRY_ATTEMPTS) {
    if (!executionResult.roundFailed) {
      return executionResult;
    }
    
    attempts++;
    if (attempts < MAX_RETRY_ATTEMPTS) {
      lifecycle.writeChunk(createRecoveringChunk(`工具 ${toolCall.name} 调用失败，正在重试...`, attempts, MAX_RETRY_ATTEMPTS));
      await new Promise(resolve => setTimeout(resolve, 1000));
      executionResult = await executeTool(toolCall, context);
    }
  }
  
  return executionResult;
}

async function fallbackToDirectAnswer(
  session: ChatSession,
  lifecycle: StreamLifecycle,
  context: { clientIP?: string }
): Promise<string | null> {
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
    return text;
  }
  
  return null;
}

async function generateSummaryAnswer(
  session: ChatSession,
  currentMessages: BaseMessage[],
  lifecycle: StreamLifecycle,
  outputPolicy: string = "concise-utility"
): Promise<string | null> {
  const model = session.getModel();
  
  let outputInstruction = "";
  if (outputPolicy === "detailed-explanation") {
    outputInstruction = "\n\n请提供详细的解释，包括分析过程和步骤。";
  }
  
  const fallbackPrompt = ChatPromptTemplate.fromMessages([
    ["system", session.getSystemPrompt()],
    new MessagesPlaceholder("messages"),
  ]);
  const summaryChain = fallbackPrompt.pipe(model);

  const toolResultMessages = currentMessages.filter(m => m._getType() === "tool");
  const toolResultText = toolResultMessages.map(m => (m as ToolMessage).content).join("\n\n");

  const summaryMessages: BaseMessage[] = [
    new SystemMessage(session.getSystemPrompt()),
    new HumanMessage(`用户问：${currentMessages[currentMessages.length - 1].content}\n\n工具调用结果：\n${toolResultText}\n\n请根据工具结果用自然语言总结回答用户。${outputInstruction}`),
  ];

  const finalResult = await summaryChain.invoke({ messages: summaryMessages });
  const finalContent = finalResult.content;

  if (finalContent) {
    const text = typeof finalContent === "string" ? finalContent : JSON.stringify(finalContent);
    lifecycle.writeChunk(createTextChunk(text));
    return text;
  }
  
  return null;
}

async function consumeComposerContext(
  session: ChatSession,
  lifecycle: StreamLifecycle,
  currentMessages: BaseMessage[]
): Promise<void> {
  const composerPayload = (session as any).getComposerPayload?.();
  if (!composerPayload) return;

  const request: any = {
    messages: currentMessages,
    composer: composerPayload,
  };

  const invocation = resolveComposerContextInvocation(request);
  if (!invocation) return;

  console.log(`[Chat Orchestrator] 发现 composer 上下文: ${invocation.kind}`);

  const composerPrompt = buildComposerContextPrompt(invocation);
  if (composerPrompt) {
    lifecycle.writeChunk(createTextChunk(`🔍 Composer 上下文: ${composerPrompt.substring(0, 100)}...`));
    currentMessages.push(new SystemMessage(`[Composer Context]\n${composerPrompt}`));
  }
}

export function parseToolCalls(result: AIMessage): Array<{ id: string; name: string; args: Record<string, unknown> }> {
  if (result.tool_calls && result.tool_calls.length > 0) {
    return result.tool_calls.map((tc) => ({
      id: tc.id ?? `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`,
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
        id: tc.id ?? `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`,
        name: tc.function?.name || tc.name,
        args,
      };
    });
  }
  
  const content = result.content;
  if (typeof content === "string") {
    try {
      const parsed = JSON.parse(content);
      if (parsed.function || parsed.tool) {
        const toolName = parsed.function || parsed.tool;
        const args = parsed.args || parsed.params || {};
        return [{
          id: `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`,
          name: toolName,
          args,
        }];
      }
      if (parsed.tool_calls && Array.isArray(parsed.tool_calls)) {
        return parsed.tool_calls.map((tc: any) => ({
          id: tc.id ?? `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`,
          name: tc.name,
          args: tc.arguments || tc.args || {},
        }));
      }
    } catch {
    }
  }
  
  return [];
}

export type StepExecutor = (state: OrchestrationState, options: StepOperationOptions) => Promise<StatePatch>;

export const stepExecutors: Record<NodeId, StepExecutor> = {
  START: executeConsumeRemoteCapabilityStep,
  CONSUME_REMOTE_CAPABILITY: executeLLMInvokeStep,
  LLM_INVOKE: executeLLMInvokeStep,
  TOOL_CALL_EXECUTION: executeToolCallExecutionStep,
  CHECK_TOOL_RESULTS: executeCheckToolResultsStep,
  CONSUME_LOCAL_CAPABILITY: executeConsumeLocalCapabilityStep,
  GENERATE_SUMMARY: executeGenerateSummaryStep,
  DIRECT_ANSWER: executeDirectAnswerStep,
  FALLBACK: executeFallbackStep,
  DONE: async () => ({ currentNode: "DONE" }),
};

export type GraphNodeExecutor = (state: GraphState, config: { configurable?: { stepOptions?: StepOperationOptions } }) => Promise<Partial<GraphState>>;

export const graphNodeExecutors: Record<string, GraphNodeExecutor> = {
  CONSUME_REMOTE_CAPABILITY: async (state, config) => {
    const options = config.configurable?.stepOptions as StepOperationOptions;
    const wrappedState: OrchestrationState = {
      ...state,
      messages: state.messages || [],
      toolCallCount: state.toolCallCount ?? 0,
      hasToolCalls: state.hasToolCalls ?? false,
      hasAuthoritativeResult: state.hasAuthoritativeResult ?? false,
      toolResults: state.toolResults || [],
      executedToolResults: state.executedToolResults || [],
      roundFailed: state.roundFailed ?? false,
      chunks: state.chunks || [],
      recoveryAttempts: state.recoveryAttempts ?? 0,
      currentNode: "CONSUME_REMOTE_CAPABILITY",
      visitedNodes: [],
      routes: [],
      statePatchSummaries: [],
    };
    await executeConsumeRemoteCapabilityStep(wrappedState, options);
    return {
      messages: wrappedState.messages || [],
      toolCallCount: wrappedState.toolCallCount ?? 0,
      hasToolCalls: wrappedState.hasToolCalls ?? false,
      toolResults: wrappedState.toolResults || [],
      chunks: wrappedState.chunks || [],
    };
  },
  
  LLM_INVOKE: async (state, config) => {
    const options = config.configurable?.stepOptions as StepOperationOptions;
    const wrappedState: OrchestrationState = {
      ...state,
      messages: state.messages || [],
      toolCallCount: state.toolCallCount ?? 0,
      hasToolCalls: state.hasToolCalls ?? false,
      hasAuthoritativeResult: state.hasAuthoritativeResult ?? false,
      toolResults: state.toolResults || [],
      executedToolResults: state.executedToolResults || [],
      roundFailed: state.roundFailed ?? false,
      chunks: state.chunks || [],
      recoveryAttempts: state.recoveryAttempts ?? 0,
      currentNode: "LLM_INVOKE",
      visitedNodes: [],
      routes: [],
      statePatchSummaries: [],
    };
    const patch = await executeLLMInvokeStep(wrappedState, options);
    return {
      messages: patch.messages || [],
      hasToolCalls: patch.hasToolCalls ?? false,
      chunks: patch.chunks || [],
      toolResults: patch.toolResults || [],
      roundFailed: patch.roundFailed ?? false,
    };
  },
  
  TOOL_CALL_EXECUTION: async (state, config) => {
    const options = config.configurable?.stepOptions as StepOperationOptions;
    const wrappedState: OrchestrationState = {
      ...state,
      messages: state.messages || [],
      toolCallCount: state.toolCallCount ?? 0,
      hasToolCalls: state.hasToolCalls ?? false,
      hasAuthoritativeResult: state.hasAuthoritativeResult ?? false,
      toolResults: state.toolResults || [],
      executedToolResults: state.executedToolResults || [],
      roundFailed: state.roundFailed ?? false,
      chunks: state.chunks || [],
      recoveryAttempts: state.recoveryAttempts ?? 0,
      currentNode: "TOOL_CALL_EXECUTION",
      visitedNodes: [],
      routes: [],
      statePatchSummaries: [],
    };
    const patch = await executeToolCallExecutionStep(wrappedState, options);
    return {
      messages: patch.messages || [],
      toolResults: patch.toolResults || [],
      executedToolResults: patch.executedToolResults || [],
      chunks: patch.chunks || [],
      toolCallCount: patch.toolCallCount ?? (state.toolCallCount ?? 0),
      hasAuthoritativeResult: patch.hasAuthoritativeResult ?? (state.hasAuthoritativeResult ?? false),
      roundFailed: patch.roundFailed ?? (state.roundFailed ?? false),
    };
  },
  
  CHECK_TOOL_RESULTS: async (state) => {
    return {
      messages: state.messages || [],
      toolResults: state.toolResults || [],
      toolCallCount: state.toolCallCount ?? 0,
      roundFailed: state.roundFailed ?? false,
      hasToolCalls: state.hasToolCalls ?? false,
      chunks: state.chunks || [],
    };
  },
  
  CONSUME_LOCAL_CAPABILITY: async (state, config) => {
    const options = config.configurable?.stepOptions as StepOperationOptions;
    const wrappedState: OrchestrationState = {
      ...state,
      messages: state.messages || [],
      toolCallCount: state.toolCallCount ?? 0,
      hasToolCalls: state.hasToolCalls ?? false,
      hasAuthoritativeResult: state.hasAuthoritativeResult ?? false,
      toolResults: state.toolResults || [],
      executedToolResults: state.executedToolResults || [],
      roundFailed: state.roundFailed ?? false,
      chunks: state.chunks || [],
      recoveryAttempts: state.recoveryAttempts ?? 0,
      currentNode: "CONSUME_LOCAL_CAPABILITY",
      visitedNodes: [],
      routes: [],
      statePatchSummaries: [],
    };
    await executeConsumeLocalCapabilityStep(wrappedState, options);
    return {};
  },
  
  GENERATE_SUMMARY: async (state, config) => {
    const options = config.configurable?.stepOptions as StepOperationOptions;
    const wrappedState: OrchestrationState = {
      ...state,
      messages: state.messages || [],
      toolCallCount: state.toolCallCount ?? 0,
      hasToolCalls: state.hasToolCalls ?? false,
      hasAuthoritativeResult: state.hasAuthoritativeResult ?? false,
      toolResults: state.toolResults || [],
      executedToolResults: state.executedToolResults || [],
      roundFailed: state.roundFailed ?? false,
      chunks: state.chunks || [],
      recoveryAttempts: state.recoveryAttempts ?? 0,
      currentNode: "GENERATE_SUMMARY",
      visitedNodes: [],
      routes: [],
      statePatchSummaries: [],
    };
    const patch = await executeGenerateSummaryStep(wrappedState, options);
    return {
      chunks: patch.chunks || [],
    };
  },
  
  DIRECT_ANSWER: async () => {
    return {};
  },
  
  FALLBACK: async (state, config) => {
    const options = config.configurable?.stepOptions as StepOperationOptions;
    const wrappedState: OrchestrationState = {
      ...state,
      messages: state.messages || [],
      toolCallCount: state.toolCallCount ?? 0,
      hasToolCalls: state.hasToolCalls ?? false,
      hasAuthoritativeResult: state.hasAuthoritativeResult ?? false,
      toolResults: state.toolResults || [],
      executedToolResults: state.executedToolResults || [],
      roundFailed: state.roundFailed ?? false,
      chunks: state.chunks || [],
      recoveryAttempts: state.recoveryAttempts ?? 0,
      currentNode: "FALLBACK",
      visitedNodes: [],
      routes: [],
      statePatchSummaries: [],
    };
    const patch = await executeFallbackStep(wrappedState, options);
    return {
      chunks: patch.chunks || [],
      recoveryAttempts: patch.recoveryAttempts ?? (state.recoveryAttempts ?? 0),
    };
  },
};