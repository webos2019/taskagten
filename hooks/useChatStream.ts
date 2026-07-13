"use client";

import { useCallback, useRef, useState, useEffect } from "react";
import type { ChatMessage, ChatHookReturn, FileInfo, StreamStatus, StreamChunk, StructuredBlock } from "@/types/chat";
import { validateMessageText, validateFile } from "@/lib/validators";

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
  const [streamingBlocks, setStreamingBlocks] = useState<StructuredBlock[]>([]);
  const [status, setStatus] = useState<StreamStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [skill, setSkill] = useState<SkillId>("utility-skill");
  const [clientIP, setClientIP] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

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
      setStreamingBlocks([]);

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
        const blocks: StructuredBlock[] = [];
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.trim()) continue;

            try {
              const chunk: StreamChunk = JSON.parse(line);

              switch (chunk.type) {
                case "start":
                  break;

                case "reasoning":
                  updateBlock(blocks, "reasoning", chunk.content || "");
                  setStreamingBlocks([...blocks]);
                  break;

                case "tool_call": {
                  blocks.push({
                    type: "tool_call",
                    content: `调用工具: ${chunk.toolName}`,
                    toolCallId: chunk.toolCallId,
                    toolName: chunk.toolName,
                    toolArgs: chunk.toolArgs,
                  });
                  setStreamingBlocks([...blocks]);
                  break;
                }

                case "tool_result": {
                  blocks.push({
                    type: "tool_result",
                    content: chunk.toolResult || "",
                    toolCallId: chunk.toolCallId,
                    toolName: chunk.toolName,
                    toolResult: chunk.toolResult,
                    isValid: chunk.isValid,
                    serverId: chunk.serverId,
                  });
                  setStreamingBlocks([...blocks]);
                  break;
                }

                case "resource_start": {
                  blocks.push({
                    type: "resource_start",
                    content: `读取资源: ${chunk.resourceName}`,
                    resourceName: chunk.resourceName,
                    resourceUri: chunk.resourceUri,
                    serverId: chunk.serverId,
                  });
                  setStreamingBlocks([...blocks]);
                  break;
                }

                case "resource_end": {
                  blocks.push({
                    type: "resource_end",
                    content: chunk.contentPreview || "",
                    resourceName: chunk.resourceName,
                    resourceUri: chunk.resourceUri,
                    serverId: chunk.serverId,
                    isTruncated: chunk.isTruncated,
                    previewChars: chunk.previewChars,
                  });
                  setStreamingBlocks([...blocks]);
                  break;
                }

                case "resource_error": {
                  blocks.push({
                    type: "resource_error",
                    content: chunk.error || "",
                    resourceName: chunk.resourceName,
                    resourceUri: chunk.resourceUri,
                    serverId: chunk.serverId,
                  });
                  setStreamingBlocks([...blocks]);
                  break;
                }

                case "text": {
                  const text = chunk.content || "";
                  const lastBlock = blocks[blocks.length - 1];
                  if (lastBlock?.type === "text") {
                    lastBlock.content += text;
                  } else {
                    blocks.push({ type: "text", content: text });
                  }
                  setStreamingBlocks([...blocks]);
                  break;
                }

                case "error": {
                  const errorText = chunk.error || "服务端错误";
                  blocks.push({ type: "text", content: `⚠️ 错误：${errorText}` });
                  setStreamingBlocks([...blocks]);
                  
                  if (chunk.retryable !== false) {
                    setStatus("retrying");
                  }
                  break;
                }

                case "recovering": {
                  blocks.push({ type: "text", content: `🔄 ${chunk.message}` });
                  setStreamingBlocks([...blocks]);
                  break;
                }

                case "recovery_fallback": {
                  blocks.push({ type: "text", content: `📌 ${chunk.message}（${chunk.fallbackMethod}）` });
                  setStreamingBlocks([...blocks]);
                  break;
                }

                case "done":
                  break;
              }
            } catch (parseErr) {
              if (parseErr instanceof Error && parseErr.message.includes("服务端错误")) {
                throw parseErr;
              }
            }
          }
        }

        const assistantMessage: ChatMessage = {
          role: "assistant",
          content: blocks.filter((b) => b.type === "text").map((b) => b.content).join(""),
          blocks,
        };

        setMessages((prev) => {
          const newMessages = trimMessages([...prev, assistantMessage]);
          return newMessages;
        });

        setStreamingBlocks([]);
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
    setStreamingBlocks([]);
    setError(null);
    setStatus("idle");
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, []);

  return {
    messages,
    streamingBlocks,
    status,
    error,
    mode: skill,
    setMode: setSkill,
    sendMessage,
    cancelStream,
    clearMessages,
  };
}

function updateBlock(blocks: StructuredBlock[], type: StructuredBlock["type"], content: string) {
  for (let i = blocks.length - 1; i >= 0; i--) {
    if (blocks[i].type === type) {
      blocks[i].content += content;
      return;
    }
  }
  blocks.push({ type, content });
}
