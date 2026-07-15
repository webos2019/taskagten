"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { StructuredBlock, StreamChunk } from "@/types/chat";

export interface AgentStepData {
  actionType?: string;
  agentName?: string;
  partId?: string;
  runId?: string;
  stepIndex?: number;
  title?: string;
  status?: string;
  durationMs?: number;
  error?: string;
  summary?: string;
}

export interface StreamTextBufferResult {
  streamingBlocks: StructuredBlock[];
  streamingText: string;
  agentSteps: AgentStepData[];
  addChunk: (chunk: StreamChunk) => void;
  clearBuffer: () => void;
}

export function useStreamTextBuffer(): StreamTextBufferResult {
  const [streamingBlocks, setStreamingBlocks] = useState<StructuredBlock[]>([]);
  const [agentSteps, setAgentSteps] = useState<AgentStepData[]>([]);
  const hasMounted = useRef(false);

  useEffect(() => {
    if (!hasMounted.current && process.env.NEXT_PUBLIC_DEBUG_AGENT_TRACE === "true") {
      hasMounted.current = true;
      const mockSteps: AgentStepData[] = [
        { actionType: "read_resource", agentName: "tasklist-agent", partId: "step-0", stepIndex: 0, title: "读取版本方案", status: "completed", durationMs: 120, summary: "已读取版本方案: docs://versions/v0.1.0.md" },
        { actionType: "plan_extract", agentName: "tasklist-agent", partId: "step-1", stepIndex: 1, title: "提取版本方案结构", status: "completed", durationMs: 850, summary: "已提取 5 个目标" },
        { actionType: "draft_tasklist", agentName: "tasklist-agent", partId: "step-2", stepIndex: 2, title: "生成任务清单草稿 v1", status: "completed", durationMs: 2340, summary: "草稿已生成 (1250 字符)" },
        { actionType: "validate_tasklist_structure", agentName: "tasklist-agent", partId: "step-3", stepIndex: 3, title: "结构校验", status: "completed", durationMs: 56, summary: "校验通过" },
        { actionType: "final_answer", agentName: "tasklist-agent", partId: "step-4", stepIndex: 4, title: "生成最终回答", status: "running" },
      ];
      setAgentSteps(mockSteps);
    }
  }, []);

  const addChunk = useCallback((chunk: StreamChunk) => {
    console.log('[StreamChunk] Received:', chunk);
    
    if (chunk.type === "agent-step-start") {
      setAgentSteps((prev) => [
        ...prev,
        {
          actionType: chunk.actionType,
          agentName: chunk.agentName,
          partId: chunk.partId,
          runId: chunk.runId,
          stepIndex: chunk.stepIndex,
          title: chunk.title,
          status: "running",
        },
      ]);
    } else if (chunk.type === "agent-step-end") {
      setAgentSteps((prev) =>
        prev.map((step) =>
          step.partId === chunk.partId
            ? {
                ...step,
                status: chunk.status,
                durationMs: chunk.durationMs,
                error: chunk.error,
                summary: chunk.summary,
              }
            : step
        )
      );
    }
    
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
    setAgentSteps([]);
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
    agentSteps,
    addChunk,
    clearBuffer,
  };
}