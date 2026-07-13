import { ChatMessage, FileInfo } from "@/types/chat";

// ─── 文件类型白名单 ─────────────────────────────────────────
const ALLOWED_EXTENSIONS = new Set([
  ".py",
  ".js",
  ".ts",
  ".jsx",
  ".tsx",
  ".go",
  ".rs",
  ".java",
  ".md",
  ".json",
  ".yaml",
  ".yml",
  ".css",
  ".scss",
  ".sql",
  ".sh",
  ".bash",
  ".dockerfile",
  ".toml",
  ".xml",
  ".html",
  ".vue",
  ".svelte",
  ".c",
  ".cpp",
  ".h",
  ".hpp",
  ".rb",
  ".php",
  ".swift",
  ".kt",
  ".dart",
]);

const MAX_FILE_SIZE = 1 * 1024 * 1024; // 1 MB
const MAX_MESSAGE_LENGTH = 8000;

// ─── 文本校验 ──────────────────────────────────────────────
export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export function validateMessageText(text: string): ValidationResult {
  if (!text || text.trim().length === 0) {
    return { valid: false, error: "消息内容不能为空" };
  }
  if (text.length > MAX_MESSAGE_LENGTH) {
    return {
      valid: false,
      error: `消息内容超出长度限制（最长 ${MAX_MESSAGE_LENGTH} 字符）`,
    };
  }
  return { valid: true };
}

// ─── 文件校验 ──────────────────────────────────────────────
export function validateFile(file: {
  name: string;
  size: number;
}): ValidationResult {
  const ext =
    "." + file.name.split(".").pop()?.toLowerCase();
  if (!ext || !ALLOWED_EXTENSIONS.has(ext)) {
    return {
      valid: false,
      error: `不支持的文件类型 "${ext}"。允许的类型：${Array.from(ALLOWED_EXTENSIONS).join(", ")}`,
    };
  }
  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `文件 "${file.name}" 超出大小限制（最大 1MB）`,
    };
  }
  return { valid: true };
}

// ─── API 请求协议校验 ───────────────────────────────────────
export function validateChatRequest(body: unknown): ValidationResult & { data?: { messages: ChatMessage[]; mode?: "code" | "general" } } {
  if (!body || typeof body !== "object") {
    return { valid: false, error: "请求体必须为 JSON 对象" };
  }

  const req = body as Record<string, unknown>;

  if (!Array.isArray(req.messages) || req.messages.length === 0) {
    return { valid: false, error: "messages 必须为非空数组" };
  }

  for (let i = 0; i < req.messages.length; i++) {
    const msg = req.messages[i] as Record<string, unknown>;
    if (!msg || typeof msg !== "object") {
      return { valid: false, error: `messages[${i}] 必须是对象` };
    }
    if (!["user", "assistant", "system"].includes(msg.role as string)) {
      return { valid: false, error: `messages[${i}].role 无效（必须为 user/assistant/system）` };
    }
    if (typeof msg.content !== "string") {
      return { valid: false, error: `messages[${i}].content 必须为字符串` };
    }
  }

  return { valid: true, data: { messages: req.messages as ChatMessage[], mode: (req.mode as "code" | "general") || "code" } };
}

// ─── XSS 安全过滤 ──────────────────────────────────────────
export function sanitizeContent(content: string): string {
  return content
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, "")
    .replace(/on\w+\s*=\s*[^\s>]+/gi, "")
    .replace(/javascript\s*:/gi, "blocked:");
}
