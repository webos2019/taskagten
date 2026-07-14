"use client";

import { useCallback, useRef, useState, useEffect } from "react";
import type { ChatMessage, ChatHookReturn, FileInfo, StreamStatus, StreamChunk, StructuredBlock } from "@/types/chat";
import { validateMessageText, validateFile } from "@/lib/validators";
import { useStreamTextBuffer } from "./useStreamTextBuffer";

export type SkillId = "utility-skill" | "reader-skill";

const MAX_CONTEXT_ROUNDS = 8;

async function getPublicIP(): Promise<string | null> {
  try {
    const response = await fetch("https://api.ipify.org?format=json");
    const data = await response.json();
    return data.ip || null;
  } catch {
    try {
      const response = await fetch("https://api.ipgeolocation.io/getip");
      const data = await response.json();
      return data.ip || null;
    } catch {
      return null;
    }
  }
}

export function useChatStream(): ChatHookReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<StreamStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [skill, setSkill] = useState<SkillId>("utility-skill");
  const [clientIP, setClientIP] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const {
    streamingBlocks,
    streamingText,
    addChunk,
    clearBuffer,
  } = useStreamTextBuffer();

  useEffect(() => {
    getPublicIP().then((ip) => {
      if (ip) {
        setClientIP(ip);
      }
    });
  }, []);

  const trimMessages = useCallback((msgs: ChatMessage[]): ChatMessage[] => {
    const assistantIndices = msgs
      .map((m, i) => (m.role === "assistant" ? i : -1))
      .filter((i) => i !== -1);

    if (assistantIndices.length <= MAX_CONTEXT_ROUNDS) {
      return msgs;
    }

    const cutoffIndex = assistantIndices[assistantIndices.length - MAX_CONTEXT_ROUNDS];
    return msgs.slice(cutoffIndex);
  }, []);

  const sendMessage = useCallback(
    async (text: string, files?: FileInfo[]) => {
      const textValidation = validateMessageText(text);
      if (!textValidation.valid) {
        setError(textValidation.error || "无效的消息");
        return;
      }

      if (files && files.length > 0) {
        for (const file of files) {
          const fileValidation = validateFile(file);
          if (!fileValidation.valid) {
            setError(fileValidation.error || "无效的文件");
            return;
          }
        }
      }

      if (abortRef.current) {
        abortRef.current.abort();
      }

      const controller = new AbortController();
      abortRef.current = controller;

      setError(null);
      setStatus("loading");
      clearBuffer();

      const userMessage: ChatMessage = {
        role: "user",
        content: text,
        files: files?.length ? files : undefined,
      };

      const updatedMessages = [...messages, userMessage];
      setMessages(updatedMessages);

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: updatedMessages, skill, clientIP }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || `请求失败 (${response.status})`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error("无法读取响应流");
        }

        setStatus("streaming");

        const decoder = new TextDecoder();
        let buffer = "";
        let isStreamDone = false;
        const collectedBlocks: StructuredBlock[] = [];
        let collectedText = "";

        console.log("[sendMessage] 开始接收流数据，初始化 collectedText = ''");

        while (!isStreamDone) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          console.log("[sendMessage] 读取到数据块，当前 buffer 长度:", buffer.length);

          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          console.log("[sendMessage] 解析出", lines.length, "行完整数据，剩余 buffer 长度:", buffer.length);

          for (const line of lines) {
            if (!line.trim()) continue;

            try {
              const chunk: StreamChunk = JSON.parse(line);
              console.log("[sendMessage] 解析到 chunk:", chunk.type, chunk.content?.substring(0, 50) + "...");
              
              addChunk(chunk);

              if (chunk.type === "text") {
                const addedText = chunk.content || "";
                collectedText += addedText;
                console.log("[sendMessage] ✅ text chunk，追加内容长度:", addedText.length, 
                  "，collectedText 总长度:", collectedText.length,
                  "，collectedText 内容:", collectedText.substring(0, 100));
              }

              const block: StructuredBlock = {
                type: chunk.type as StructuredBlock["type"],
                content: chunk.content || "",
                toolCallId: chunk.toolCallId,
                toolName: chunk.toolName,
                toolArgs: chunk.toolArgs,
                toolResult: chunk.toolResult,
                isValid: chunk.isValid,
                resourceName: chunk.resourceName,
                resourceUri: chunk.resourceUri,
                serverId: chunk.serverId,
                isTruncated: chunk.isTruncated,
                previewChars: chunk.previewChars,
              };
              collectedBlocks.push(block);
              console.log("[sendMessage] ✅ 收集到 block:", chunk.type, "，collectedBlocks 数量:", collectedBlocks.length);

              switch (chunk.type) {
                case "start":
                  console.log("[sendMessage] ⏳ 流开始，messageId:", chunk.messageId);
                  break;

                case "error": {
                  console.error("[sendMessage] ❌ 流错误:", chunk.error);
                  if (chunk.retryable !== false) {
                    setStatus("retrying");
                  }
                  break;
                }

                case "done":
                  console.log("[sendMessage] ✅ 流结束");
                  isStreamDone = true;
                  break;
                }
            } catch (parseErr) {
              if (parseErr instanceof Error && parseErr.message.includes("服务端错误")) {
                throw parseErr;
              }
            }
            
            if (isStreamDone) break;
          }
          
          if (isStreamDone) break;
        }

        console.log("[sendMessage] 循环结束，最终 collectedText:", collectedText);
        console.log("[sendMessage] 闭包中的 streamingText（旧值）:", streamingText);

        const assistantMessage: ChatMessage = {
          role: "assistant",
          content: collectedText || streamingText,
          blocks: collectedBlocks,
        };

        console.log("[sendMessage] 创建 assistantMessage，content 长度:", assistantMessage.content.length);
        console.log("[sendMessage] 创建 assistantMessage，blocks 数量:", collectedBlocks.length);
        console.log("[sendMessage] 闭包中的 streamingBlocks（旧值）数量:", streamingBlocks.length);

        setMessages((prev) => {
          const newMessages = trimMessages([...prev, assistantMessage]);
          return newMessages;
        });

        clearBuffer();
        setStatus("idle");
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") {
          setStatus("idle");
          return;
        }

        const errorMsg = err instanceof Error ? err.message : "未知错误";
        setError(errorMsg);
        setStatus("error");

        setMessages((prev) => prev.slice(0, -1));
      } finally {
        abortRef.current = null;
      }
    },
    [messages, skill, trimMessages]
  );

  const cancelStream = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    clearBuffer();
    setError(null);
    setStatus("idle");
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, [clearBuffer]);

  const regenerateLastResponse = useCallback(() => {
    // Find the last user message
    let lastUserIndex = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        lastUserIndex = i;
        break;
      }
    }
    
    if (lastUserIndex === -1) {
      setError("没有找到可以重新生成的用户消息");
      return;
    }

    // Remove all messages after the last user message (typically just the last assistant message)
    const messagesUpToLastUser = messages.slice(0, lastUserIndex + 1);
    
    // Get the last user message content
    const lastUserMessage = messagesUpToLastUser[lastUserIndex];
    
    // Update messages to remove the last assistant response
    setMessages(messagesUpToLastUser);
    
    // Send the last user message again to regenerate the response
    sendMessage(lastUserMessage.content, lastUserMessage.files);
  }, [messages, sendMessage]);

  return {
    messages,
    streamingBlocks,
    streamingText,
    status,
    error,
    mode: skill,
    setMode: setSkill,
    sendMessage,
    cancelStream,
    clearMessages,
    regenerateLastResponse,
  };
}
