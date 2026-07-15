export type StreamChunkType =
  | "start"
  | "text"
  | "reasoning"
  | "tool_call"
  | "tool_result"
  | "resource_start"
  | "resource_end"
  | "resource_error"
  | "error"
  | "recovering"
  | "recovery_fallback"
  | "done"
  | "agent-step-start"
  | "agent-step-end";

export interface StreamChunkBase {
  type: StreamChunkType;
}

export interface StartChunk extends StreamChunkBase {
  type: "start";
  messageId: string;
}

export interface TextChunk extends StreamChunkBase {
  type: "text";
  content: string;
}

export interface ReasoningChunk extends StreamChunkBase {
  type: "reasoning";
  content: string;
}

export interface ToolCallChunk extends StreamChunkBase {
  type: "tool_call";
  toolCallId: string;
  toolName: string;
  toolArgs: Record<string, unknown>;
  serverId?: string;
  source?: string;
}

export interface ToolResultChunk extends StreamChunkBase {
  type: "tool_result";
  toolCallId: string;
  toolName: string;
  toolResult: string;
  isValid: boolean;
  isAuthoritative?: boolean;
  serverId?: string;
  source?: string;
}

export interface ResourceStartChunk extends StreamChunkBase {
  type: "resource_start";
  resourceName: string;
  resourceUri: string;
  serverId?: string;
}

export interface ResourceEndChunk extends StreamChunkBase {
  type: "resource_end";
  resourceName: string;
  resourceUri: string;
  serverId?: string;
  contentPreview?: string;
  isTruncated?: boolean;
  previewChars?: number;
}

export interface ResourceErrorChunk extends StreamChunkBase {
  type: "resource_error";
  resourceName: string;
  resourceUri: string;
  serverId?: string;
  error: string;
}

export interface ErrorChunk extends StreamChunkBase {
  type: "error";
  error: string;
  retryable?: boolean;
  retryDelay?: number;
}

export interface RecoveringChunk extends StreamChunkBase {
  type: "recovering";
  message: string;
  attempt: number;
  maxAttempts: number;
}

export interface RecoveryFallbackChunk extends StreamChunkBase {
  type: "recovery_fallback";
  message: string;
  fallbackMethod: string;
}

export interface DoneChunk extends StreamChunkBase {
  type: "done";
}

export type AgentStepActionType = "read_resource" | "plan_extract" | "draft_tasklist" | "validate_tasklist_structure" | "revise_tasklist" | "final_answer";

export type AgentStepStatus = "running" | "completed" | "failed";

export interface AgentStepStartChunk extends StreamChunkBase {
  actionType: AgentStepActionType;
  agentName: string;
  partId: string;
  runId: string;
  stepIndex: number;
  title: string;
  type: "agent-step-start";
}

export interface AgentStepEndChunk extends StreamChunkBase {
  durationMs?: number;
  error?: string;
  partId: string;
  runId: string;
  status: AgentStepStatus;
  summary?: string;
  type: "agent-step-end";
}

export type ChatStreamChunk =
  | StartChunk
  | TextChunk
  | ReasoningChunk
  | ToolCallChunk
  | ToolResultChunk
  | ResourceStartChunk
  | ResourceEndChunk
  | ResourceErrorChunk
  | ErrorChunk
  | RecoveringChunk
  | RecoveryFallbackChunk
  | DoneChunk
  | AgentStepStartChunk
  | AgentStepEndChunk;

export function createStartChunk(messageId: string): StartChunk {
  return { type: "start", messageId };
}

export function createTextChunk(content: string): TextChunk {
  return { type: "text", content };
}

export function createReasoningChunk(content: string): ReasoningChunk {
  return { type: "reasoning", content };
}

export function createToolCallChunk(
  toolCallId: string,
  toolName: string,
  toolArgs: Record<string, unknown>,
  options?: { serverId?: string; source?: string }
): ToolCallChunk {
  return { type: "tool_call", toolCallId, toolName, toolArgs, ...options };
}

export function createToolResultChunk(
  toolCallId: string,
  toolName: string,
  toolResult: string,
  options?: { isValid?: boolean; isAuthoritative?: boolean; serverId?: string; source?: string }
): ToolResultChunk {
  return { type: "tool_result", toolCallId, toolName, toolResult, isValid: options?.isValid ?? true, ...options };
}

export function createResourceStartChunk(
  resourceName: string,
  resourceUri: string,
  options?: { serverId?: string }
): ResourceStartChunk {
  return { type: "resource_start", resourceName, resourceUri, ...options };
}

export function createResourceEndChunk(
  resourceName: string,
  resourceUri: string,
  options?: { serverId?: string; contentPreview?: string; isTruncated?: boolean; previewChars?: number }
): ResourceEndChunk {
  return { type: "resource_end", resourceName, resourceUri, ...options };
}

export function createResourceErrorChunk(
  resourceName: string,
  resourceUri: string,
  error: string,
  options?: { serverId?: string }
): ResourceErrorChunk {
  return { type: "resource_error", resourceName, resourceUri, error, ...options };
}

export function createErrorChunk(error: string, options?: { retryable?: boolean; retryDelay?: number }): ErrorChunk {
  return { type: "error", error, ...options };
}

export function createRecoveringChunk(message: string, attempt: number, maxAttempts: number): RecoveringChunk {
  return { type: "recovering", message, attempt, maxAttempts };
}

export function createRecoveryFallbackChunk(message: string, fallbackMethod: string): RecoveryFallbackChunk {
  return { type: "recovery_fallback", message, fallbackMethod };
}

export function createDoneChunk(): DoneChunk {
  return { type: "done" };
}
