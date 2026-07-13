import type { NextRequest } from "next/server";
import { createChatSession } from "./runtime/chat-session";
import { orchestrateChat } from "./runtime/chat-orchestrator";
import { createNDJSONStream } from "./stream";
import type { StreamWriter } from "./stream";
import type { SkillId } from "@/lib/langchain";

export interface ChatRequest {
  messages: Array<{ role: string; content: string; files?: { name: string; type: string; content: string }[] }>;
  skill?: SkillId;
  clientIP?: string;
}

export interface ChatExecutionContext {
  clientIP?: string;
}

export interface ChatServiceDependencies {}

export function createChatService(_deps: ChatServiceDependencies = {}) {
  return {
    async streamChat(request: ChatRequest, context: ChatExecutionContext) {
      const { messages, skill: explicitSkill, clientIP } = request;

      if (!Array.isArray(messages)) {
        throw new Error("messages 必须是数组");
      }

      const resolvedIP = clientIP || context.clientIP || "127.0.0.1";
      const userMessage = messages[messages.length - 1]?.content || "";
      const resolvedSkill = resolveSkill(explicitSkill, userMessage);

      const session = createChatSession({
        skillId: resolvedSkill,
        messages,
      });

      const streamResult = await createChatStreamResult(session, resolvedIP);

      return new Response(streamResult.body, {
        headers: streamResult.headers,
      });
    },
  };
}

async function createChatStreamResult(
  session: ReturnType<typeof createChatSession>,
  clientIP: string
) {
  return createNDJSONStream(async (writer: StreamWriter) => {
    await orchestrateChat(session, writer, { clientIP });
  });
}

function resolveSkill(explicitSkill: SkillId | undefined, userMessage: string): SkillId {
  if (explicitSkill) {
    const readerKeywords = ["天气", "city", "weather", "location", "文件", "读取", "目录", "read", "file", "directory"];
    const lowerMsg = userMessage.toLowerCase();
    const needsReader = readerKeywords.some(keyword => lowerMsg.includes(keyword));
    return needsReader ? "reader-skill" : explicitSkill;
  }

  const readerHints = ["文件", "读取", "目录", "天气", "city", "weather", "read", "file", "directory", "location"];
  const utilityHints = ["计算", "时间", "日期", "换算", "convert", "datetime", "calculator", "math", "unit"];

  const lowerMsg = userMessage.toLowerCase();
  const readerMatches = readerHints.filter(hint => lowerMsg.includes(hint));
  const utilityMatches = utilityHints.filter(hint => lowerMsg.includes(hint));

  if (readerMatches.length > utilityMatches.length) {
    return "reader-skill";
  }
  if (utilityMatches.length > readerMatches.length) {
    return "utility-skill";
  }

  return "utility-skill";
}
