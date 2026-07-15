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

export type StreamStatus = "idle" | "loading" | "streaming" | "retrying" | "error";

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
  | "error"
  | "recovering"
  | "recovery_fallback";

export interface StreamChunk {
  type: StreamChunkType;
  content?: string;
  messageId?: string;
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
  retryable?: boolean;
  retryDelay?: number;
  message?: string;
  attempt?: number;
  maxAttempts?: number;
  fallbackMethod?: string;
}

export type SkillId = "utility-skill" | "reader-skill";

export type ChatComposerCommandName = 'check' | 'summary' | 'tasklist';

export interface ChatComposerCommand {
  label: string;
  name: ChatComposerCommandName;
}

export interface ChatComposerReference {
  id: string;
  label: string;
  serverId?: string;
  source: 'local' | 'remote';
  type: 'resource';
  uri: string;
}

export interface ChatComposerPayload {
  command?: ChatComposerCommand;
  plainText: string;
  references?: ChatComposerReference[];
}

export interface ChatRequest {
  messages: ChatMessage[];
  skill?: SkillId;
  composer?: ChatComposerPayload;
}

export interface ChatHookReturn {
  messages: ChatMessage[];
  streamingBlocks: StructuredBlock[];
  streamingText: string;
  status: StreamStatus;
  error: string | null;
  mode: SkillId;
  setMode: (mode: SkillId) => void;
  sendMessage: (text: string, files?: FileInfo[]) => Promise<void>;
  cancelStream: () => void;
  clearMessages: () => void;
  regenerateLastResponse: () => void;
}
