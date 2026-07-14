import type { NextRequest } from "next/server";
import { createChatSession } from "./runtime/chat-session";
import { orchestrateChat } from "./runtime/chat-orchestrator";
import { createNDJSONStream } from "./stream";
import type { StreamWriter } from "./stream";
import type { SkillId } from "@/lib/langchain";
import "@/lib/tools";

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
    // 保持显式指定的skill不变
    return explicitSkill;
  }

  // 自动检测技能，优先使用utility-skill处理天气
  const utilityKeywords = ["计算", "时间", "日期", "换算", "convert", "datetime", "calculator", "math", "unit", "天气", "weather", "city"];
  const readerKeywords = ["文件", "读取", "目录", "read", "file", "directory", "location"];

  const lowerMsg = userMessage.toLowerCase();
  const utilityMatches = utilityKeywords.filter(keyword => lowerMsg.includes(keyword));
  const readerMatches = readerKeywords.filter(keyword => lowerMsg.includes(keyword));

  // 优先使用utility-skill，除非明确匹配到文件操作
  if (readerMatches.length > utilityMatches.length || readerMatches.length > 0) {
    return "reader-skill";
  }

  return "utility-skill";
}
