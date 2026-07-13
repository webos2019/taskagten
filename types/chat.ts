export interface FileInfo {
  name: string;
  size: number;
  type: string;
  content: string;
}

export interface StructuredBlock {
  type: "reasoning" | "tool_call" | "tool_result" | "text" | "resource_start" | "resource_end" | "resource_error";
  content: string;
  toolCallId?: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolResult?: string;
  isValid?: boolean;
  resourceName?: string;
  resourceUri?: string;
  serverId?: string;
  isTruncated?: boolean;
  previewChars?: number;
}

export interface ChatMessage {
  id?: string;
  role: "user" | "assistant" | "system";
  content: string;
  blocks?: StructuredBlock[];
  files?: FileInfo[];
}

export type StreamStatus = "idle" | "loading" | "streaming" | "error";

export type StreamChunkType =
  | "start"
  | "reasoning"
  | "text"
  | "tool_call"
  | "tool_result"
  | "resource_start"
  | "resource_end"
  | "resource_error"
  | "done"
  | "error";

export interface StreamChunk {
  type: StreamChunkType;
  content?: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    args: Record<string, unknown>;
  }>;
  toolCallId?: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolResult?: string;
  isValid?: boolean;
  error?: string;
  resourceName?: string;
  resourceUri?: string;
  serverId?: string;
  contentPreview?: string;
  isTruncated?: boolean;
  previewChars?: number;
}

export type SkillId = "utility-skill" | "reader-skill";

export interface ChatRequest {
  messages: ChatMessage[];
  skill?: SkillId;
}

export interface ChatHookReturn {
  messages: ChatMessage[];
  streamingBlocks: StructuredBlock[];
  status: StreamStatus;
  error: string | null;
  mode: SkillId;
  setMode: (mode: SkillId) => void;
  sendMessage: (text: string, files?: FileInfo[]) => Promise<void>;
  cancelStream: () => void;
  clearMessages: () => void;
}
