import type { BaseMessage } from "@langchain/core/messages";
import type { ChatStreamChunk } from "@/lib/ai/stream";
import type { ExecutedToolResult } from "@/lib/capability/types";
import { Annotation, START, END, StateGraph } from "@langchain/langgraph";
import * as z from "zod";

export type NodeId = 
  | "START"
  | "CONSUME_REMOTE_CAPABILITY"
  | "LLM_INVOKE"
  | "TOOL_CALL_EXECUTION"
  | "CHECK_TOOL_RESULTS"
  | "CONSUME_LOCAL_CAPABILITY"
  | "GENERATE_SUMMARY"
  | "DIRECT_ANSWER"
  | "FALLBACK"
  | "DONE";

export interface RouteEntry {
  fromNode: NodeId;
  toNode: NodeId;
  condition?: string;
  timestamp: number;
}

export interface StatePatchSummary {
  nodeId: NodeId;
  timestamp: number;
  updates: Record<string, string>;
}

export interface OrchestrationState {
  currentNode: NodeId;
  visitedNodes: NodeId[];
  routes: RouteEntry[];
  statePatchSummaries: StatePatchSummary[];
  
  messages: BaseMessage[];
  toolCallCount: number;
  hasToolCalls: boolean;
  hasAuthoritativeResult: boolean;
  toolResults: Array<{ toolName: string; result: string; isAuthoritative: boolean }>;
  executedToolResults: ExecutedToolResult[];
  roundFailed: boolean;
  
  chunks: ChatStreamChunk[];
  recoveryAttempts: number;
  lastError?: Error;
}

export interface StatePatch {
  currentNode?: NodeId;
  visitedNodes?: NodeId[];
  routes?: RouteEntry[];
  statePatchSummaries?: StatePatchSummary[];
  
  messages?: BaseMessage[];
  toolCallCount?: number;
  hasToolCalls?: boolean;
  hasAuthoritativeResult?: boolean;
  toolResults?: Array<{ toolName: string; result: string; isAuthoritative: boolean }>;
  executedToolResults?: ExecutedToolResult[];
  roundFailed?: boolean;
  
  chunks?: ChatStreamChunk[];
  recoveryAttempts?: number;
  lastError?: Error;
}

export function createInitialState(messages: BaseMessage[]): OrchestrationState {
  return {
    currentNode: "START",
    visitedNodes: [],
    routes: [],
    statePatchSummaries: [],
    
    messages,
    toolCallCount: 0,
    hasToolCalls: false,
    hasAuthoritativeResult: false,
    toolResults: [],
    executedToolResults: [],
    roundFailed: false,
    
    chunks: [],
    recoveryAttempts: 0,
  };
}

export function applyStatePatch(state: OrchestrationState, patch: StatePatch): OrchestrationState {
  const summary: StatePatchSummary = {
    nodeId: patch.currentNode ?? state.currentNode,
    timestamp: Date.now(),
    updates: {},
  };

  const merged: OrchestrationState = { ...state };

  if (patch.currentNode !== undefined) {
    merged.currentNode = patch.currentNode;
    summary.updates.currentNode = patch.currentNode;
  }

  if (patch.visitedNodes !== undefined) {
    merged.visitedNodes = [...state.visitedNodes, ...patch.visitedNodes];
    summary.updates.visitedNodes = `+${patch.visitedNodes.length}`;
  }

  if (patch.routes !== undefined) {
    merged.routes = [...state.routes, ...patch.routes];
    summary.updates.routes = `+${patch.routes.length}`;
  }

  if (patch.messages !== undefined) {
    merged.messages = [...state.messages, ...patch.messages];
    summary.updates.messages = `+${patch.messages.length}`;
  }

  if (patch.toolCallCount !== undefined) {
    merged.toolCallCount = patch.toolCallCount;
    summary.updates.toolCallCount = String(patch.toolCallCount);
  }

  if (patch.hasToolCalls !== undefined) {
    merged.hasToolCalls = patch.hasToolCalls;
    summary.updates.hasToolCalls = String(patch.hasToolCalls);
  }

  if (patch.hasAuthoritativeResult !== undefined) {
    merged.hasAuthoritativeResult = patch.hasAuthoritativeResult;
    summary.updates.hasAuthoritativeResult = String(patch.hasAuthoritativeResult);
  }

  if (patch.toolResults !== undefined) {
    merged.toolResults = [...state.toolResults, ...patch.toolResults];
    summary.updates.toolResults = `+${patch.toolResults.length}`;
  }

  if (patch.executedToolResults !== undefined) {
    merged.executedToolResults = [...state.executedToolResults, ...patch.executedToolResults];
    summary.updates.executedToolResults = `+${patch.executedToolResults.length}`;
  }

  if (patch.roundFailed !== undefined) {
    merged.roundFailed = patch.roundFailed;
    summary.updates.roundFailed = String(patch.roundFailed);
  }

  if (patch.chunks !== undefined) {
    merged.chunks = [...state.chunks, ...patch.chunks];
    summary.updates.chunks = `+${patch.chunks.length}`;
  }

  if (patch.recoveryAttempts !== undefined) {
    merged.recoveryAttempts = patch.recoveryAttempts;
    summary.updates.recoveryAttempts = String(patch.recoveryAttempts);
  }

  if (patch.lastError !== undefined) {
    merged.lastError = patch.lastError;
    summary.updates.lastError = patch.lastError.message;
  }

  if (Object.keys(summary.updates).length > 0) {
    merged.statePatchSummaries = [...state.statePatchSummaries, summary];
  }

  return merged;
}

export function createRoute(fromNode: NodeId, toNode: NodeId, condition?: string): RouteEntry {
  return { fromNode, toNode, condition, timestamp: Date.now() };
}

const messagesAnnotation = Annotation({
  schema: z.array(z.any()).default(() => []),
  reducer: (left: any[], right: any[]) => [...left, ...right],
});

const toolResultsAnnotation = Annotation({
  schema: z.array(z.object({
    toolName: z.string(),
    result: z.string(),
    isAuthoritative: z.boolean(),
  })).default(() => []),
  reducer: (left: any[], right: any[]) => [...left, ...right],
});

const executedToolResultsAnnotation = Annotation({
  schema: z.array(z.any()).default(() => []),
  reducer: (left: any[], right: any[]) => [...left, ...right],
});

const chunksAnnotation = Annotation({
  schema: z.array(z.any()).default(() => []),
  reducer: (left: any[], right: any[]) => [...left, ...right],
});

export const GraphStateSchema = Annotation.Root({
  messages: messagesAnnotation,
  toolCallCount: Annotation({
    schema: z.number().default(0),
  }),
  hasToolCalls: Annotation({
    schema: z.boolean().default(false),
  }),
  hasAuthoritativeResult: Annotation({
    schema: z.boolean().default(false),
  }),
  toolResults: toolResultsAnnotation,
  executedToolResults: executedToolResultsAnnotation,
  roundFailed: Annotation({
    schema: z.boolean().default(false),
  }),
  chunks: chunksAnnotation,
  recoveryAttempts: Annotation({
    schema: z.number().default(0),
  }),
});

export type GraphState = typeof GraphStateSchema.State;

export function createOrchestrationGraph() {
  const graph = new StateGraph(GraphStateSchema);
  return { graph, START, END };
}