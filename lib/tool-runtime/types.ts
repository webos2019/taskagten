import { AIMessage } from "@langchain/core/messages";
import { ChatStreamChunk } from "@/lib/ai/stream";

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface ToolResult {
  toolName: string;
  result: string;
  isAuthoritative: boolean;
}

export interface ToolExecutionContext {
  clientIP?: string;
}

export interface ToolHandlerResult {
  chunks: ChatStreamChunk[];
  messages: AIMessage[];
  toolResults: ToolResult[];
  failedToolCalls: Array<{ toolName: string; error: string }>;
  hasAuthoritativeResult: boolean;
  roundFailed: boolean;
}

export type ToolHandler = (
  toolCallId: string,
  args: Record<string, unknown>,
  context: ToolExecutionContext
) => Promise<ToolHandlerResult>;