"use client";

import { useCallback, useState } from "react";
import type { StructuredBlock, StreamChunk } from "@/types/chat";

export interface StreamTextBufferResult {
  streamingBlocks: StructuredBlock[];
  streamingText: string;
  addChunk: (chunk: StreamChunk) => void;
  clearBuffer: () => void;
}

export function useStreamTextBuffer(): StreamTextBufferResult {
  const [streamingBlocks, setStreamingBlocks] = useState<StructuredBlock[]>([]);

  const addChunk = useCallback((chunk: StreamChunk) => {
    console.log('[StreamChunk] Received:', chunk);
    setStreamingBlocks((prev) => {
      const blocks = [...prev];
      
      switch (chunk.type) {
        case "reasoning": {
          const lastBlock = blocks[blocks.length - 1];
          if (lastBlock?.type === "reasoning") {
            lastBlock.content += chunk.content || "";
          } else {
            blocks.push({
              type: "reasoning",
              content: chunk.content || "",
            });
          }
          break;
        }

        case "tool_call": {
          blocks.push({
            type: "tool_call",
            toolName: chunk.toolName || "",
            toolArgs: chunk.toolArgs || {},
            serverId: chunk.serverId,
            content: chunk.content || "",
          });
          break;
        }

        case "tool_result": {
          blocks.push({
            type: "tool_result",
            toolName: chunk.toolName || "",
            toolResult: chunk.toolResult || chunk.content || "",
            isValid: chunk.isValid,
            serverId: chunk.serverId,
            content: chunk.toolResult || chunk.content || "",
          });
          break;
        }

        case "resource_start": {
          blocks.push({
            type: "resource_start",
            resourceName: chunk.resourceName || "",
            resourceUri: chunk.resourceUri || "",
            serverId: chunk.serverId,
            content: chunk.contentPreview || "",
          });
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
          break;
        }

        case "error": {
          const errorText = chunk.error || "服务端错误";
          blocks.push({ type: "text", content: `⚠️ 错误：${errorText}` });
          break;
        }

        case "recovering": {
          blocks.push({ type: "text", content: `🔄 ${chunk.message}` });
          break;
        }

        case "recovery_fallback": {
          blocks.push({ type: "text", content: `📌 ${chunk.message}（${chunk.fallbackMethod}）` });
          break;
        }
      }
      
      return blocks;
    });
  }, []);

  const clearBuffer = useCallback(() => {
    setStreamingBlocks([]);
  }, []);

  const streamingText = streamingBlocks
    .filter((b) => b.type === "text")
    .map((b) => b.content)
    .join("");

  // Log streaming text calculation for debugging
  console.log('[StreamTextBuffer] streamingText computed:', {
    totalBlocks: streamingBlocks.length,
    textBlocks: streamingBlocks.filter((b) => b.type === "text").length,
    streamingText,
    streamingTextLength: streamingText.length
  });

  return {
    streamingBlocks,
    streamingText,
    addChunk,
    clearBuffer,
  };
}