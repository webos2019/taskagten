import { NextRequest } from "next/server";
import { createChatService } from "@/lib/ai/chat-service";

export const runtime = "nodejs";
export const maxDuration = 60;

const chatService = createChatService();

function getClientIP(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }
  const realIP = request.headers.get("x-real-ip");
  if (realIP) {
    return realIP;
  }
  const ip = request.headers.get("x-client-ip");
  if (ip) {
    return ip;
  }
  return "127.0.0.1";
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const clientIP = getClientIP(request);

    const response = await chatService.streamChat(body, { clientIP });
    return response;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "请求解析失败";
    return Response.json({ error: errorMessage }, { status: 400 });
  }
}
