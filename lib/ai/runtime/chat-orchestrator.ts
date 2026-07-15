import { StreamLifecycle, createId, createTextChunk, createRecoveringChunk, createRecoveryFallbackChunk } from "@/lib/ai/stream";
import type { StreamWriter } from "@/lib/ai/stream";
import type { ChatSession } from "./chat-session";
import { createInitialState, applyStatePatch, type OrchestrationState, type StatePatch } from "./orchestration-state";
import { stepExecutors, type StepOperationOptions, graphNodeExecutors } from "./orchestration-steps";
import { determineNextNode, isTerminalNode, configureGraphWithRoutes } from "./orchestration-router";
import { createOrchestrationGraph, GraphStateSchema } from "./orchestration-state";
import { runVersionPlanTasklistAgentEntryStage } from "../agents/tasklist-agent/agent-entry";

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

  if (await runVersionPlanTasklistAgentEntryStage(session, lifecycle)) {
    lifecycle.close();
    return;
  }

  let recoveryAttempts = 0;

  while (recoveryAttempts <= MAX_RETRY_ATTEMPTS) {
    try {
      await runOrchestrationGraph(session, writer, context, lifecycle, recoveryAttempts);
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
          await executeFallbackDirectAnswer(session, writer, context, lifecycle);
        } catch (fallbackErr) {
          lifecycle.emitErrorOnce(fallbackErr instanceof Error ? fallbackErr.message : "服务不可用");
        }
        
        lifecycle.close();
        return;
      }
    }
  }
}

async function runOrchestrationGraph(
  session: ChatSession,
  writer: StreamWriter,
  context: OrchestratorContext,
  lifecycle: StreamLifecycle,
  attempt: number
): Promise<void> {
  const initialMessages = [...session.getMessages()];
  let state = createInitialState(initialMessages);
  
  const stepOptions: StepOperationOptions = {
    session,
    lifecycle,
    context,
  };

  while (!isTerminalNode(state.currentNode)) {
    const { nextNode, route } = determineNextNode(state);
    
    const executor = stepExecutors[nextNode];
    if (!executor) {
      break;
    }

    const patch = await executor(state, stepOptions);
    
    state = applyStatePatch(state, {
      ...patch,
      routes: [route],
    });
  }

  lifecycle.emitDoneOnce();
}

async function executeFallbackDirectAnswer(
  session: ChatSession,
  writer: StreamWriter,
  context: OrchestratorContext,
  lifecycle: StreamLifecycle
): Promise<void> {
  const initialMessages = [...session.getMessages()];
  let state = createInitialState(initialMessages);
  
  const stepOptions: StepOperationOptions = {
    session,
    lifecycle,
    context,
  };

  const fallbackExecutor = stepExecutors["FALLBACK"];
  if (fallbackExecutor) {
    const patch = await fallbackExecutor(state, stepOptions);
    state = applyStatePatch(state, patch);
  }
  
  lifecycle.emitDoneOnce();
}

export async function orchestrateChatWithLangGraph(
  session: ChatSession,
  writer: StreamWriter,
  context: OrchestratorContext
): Promise<void> {
  const lifecycle = new StreamLifecycle(writer);
  const messageId = createId();
  lifecycle.emitStartOnce(messageId);

  if (await runVersionPlanTasklistAgentEntryStage(session, lifecycle)) {
    lifecycle.close();
    return;
  }

  let recoveryAttempts = 0;

  while (recoveryAttempts <= MAX_RETRY_ATTEMPTS) {
    try {
      await runLangGraphOrchestration(session, writer, context, lifecycle, recoveryAttempts);
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
          await executeFallbackDirectAnswer(session, writer, context, lifecycle);
        } catch (fallbackErr) {
          lifecycle.emitErrorOnce(fallbackErr instanceof Error ? fallbackErr.message : "服务不可用");
        }
        
        lifecycle.close();
        return;
      }
    }
  }
}

async function runLangGraphOrchestration(
  session: ChatSession,
  writer: StreamWriter,
  context: OrchestratorContext,
  lifecycle: StreamLifecycle,
  attempt: number
): Promise<void> {
  const initialMessages = [...session.getMessages()];
  
  const stepOptions: StepOperationOptions = {
    session,
    lifecycle,
    context,
  };

  const { graph, START, END } = createOrchestrationGraph();

  graph.addNode("LLM_INVOKE", graphNodeExecutors["LLM_INVOKE"]);
  graph.addNode("TOOL_CALL_EXECUTION", graphNodeExecutors["TOOL_CALL_EXECUTION"]);
  graph.addNode("CHECK_TOOL_RESULTS", graphNodeExecutors["CHECK_TOOL_RESULTS"]);
  graph.addNode("GENERATE_SUMMARY", graphNodeExecutors["GENERATE_SUMMARY"]);
  graph.addNode("DIRECT_ANSWER", graphNodeExecutors["DIRECT_ANSWER"]);
  graph.addNode("CONSUME_LOCAL_CAPABILITY", graphNodeExecutors["CONSUME_LOCAL_CAPABILITY"]);
  graph.addNode("FALLBACK", graphNodeExecutors["FALLBACK"]);

  graph.addEdge(START, "LLM_INVOKE");
  
  graph.addConditionalEdges(
    "LLM_INVOKE",
    (state: GraphState) => {
      if (state.hasToolCalls && (state.toolCallCount ?? 0) < 5) {
        return "TOOL_CALL_EXECUTION";
      }
      if (!state.hasToolCalls && (state.chunks?.length ?? 0) > 0) {
        return "DIRECT_ANSWER";
      }
      return END;
    },
    { "TOOL_CALL_EXECUTION": "TOOL_CALL_EXECUTION", "DIRECT_ANSWER": "DIRECT_ANSWER", [END]: END }
  );

  graph.addEdge("TOOL_CALL_EXECUTION", "CHECK_TOOL_RESULTS");
  
  graph.addConditionalEdges(
    "CHECK_TOOL_RESULTS",
    (state: GraphState) => {
      if (!(state.roundFailed ?? false) && (state.toolResults?.length ?? 0) > 0) {
        return "GENERATE_SUMMARY";
      }
      if (!(state.roundFailed ?? false) && (state.toolResults?.length ?? 0) === 0 && (state.toolCallCount ?? 0) < 5) {
        return "LLM_INVOKE";
      }
      return "CONSUME_LOCAL_CAPABILITY";
    },
    { "GENERATE_SUMMARY": "GENERATE_SUMMARY", "LLM_INVOKE": "LLM_INVOKE", "CONSUME_LOCAL_CAPABILITY": "CONSUME_LOCAL_CAPABILITY", [END]: END }
  );

  graph.addEdge("GENERATE_SUMMARY", END);
  graph.addEdge("DIRECT_ANSWER", END);
  graph.addEdge("CONSUME_LOCAL_CAPABILITY", END);
  graph.addEdge("FALLBACK", END);

  const app = graph.compile();

  const initialState: typeof GraphStateSchema.State = {
    messages: initialMessages,
    toolCallCount: 0,
    hasToolCalls: false,
    hasAuthoritativeResult: false,
    toolResults: [],
    executedToolResults: [],
    roundFailed: false,
    chunks: [],
    recoveryAttempts: 0,
  };

  await app.invoke(initialState, {
    configurable: {
      stepOptions,
    },
  });

  lifecycle.emitDoneOnce();
}