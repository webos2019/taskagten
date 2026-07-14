"use client";

import type { ChatMessage } from "@/types/chat";
import { StructuredBlock } from "@/types/chat";
import MarkdownRenderer from "./MarkdownRenderer";
import StructuredBlockView from "./StructuredBlock";

interface ChatMessageProps {
  message: ChatMessage;
  isStreaming?: boolean;
  streamingText?: string;
  streamingBlocks?: StructuredBlock[];
}

export default function ChatMessageComponent({
  message,
  isStreaming,
  streamingText,
  streamingBlocks = [],
}: ChatMessageProps) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";

  const hasStructuredBlocks =
    (message.blocks && message.blocks.length > 0) ||
    (streamingBlocks && streamingBlocks.length > 0);

  const allBlocks = isStreaming ? streamingBlocks : (message.blocks || []);
  const textContent =
    isStreaming && streamingText !== undefined
      ? streamingText
      : message.content;

  console.log("[ChatMessage] 渲染消息:", {
    role: message.role,
    isStreaming,
    isUser,
    messageBlocksLength: message.blocks?.length || 0,
    streamingBlocksLength: streamingBlocks.length,
    allBlocksLength: allBlocks.length,
    textContentLength: textContent?.length || 0,
    textContentPreview: textContent?.substring(0, 50),
  });

  if (isSystem) return null;

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-6`}>
      <div className={`flex w-full max-w-[90%] gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
        {/* 头像 */}
        <div
          className={`mt-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-medium shadow-sm ${
            isUser
              ? "bg-gradient-to-br from-blue-500 to-blue-600 text-white"
              : "bg-gradient-to-br from-purple-500 to-purple-600 text-white"
          }`}
        >
          {isUser ? "U" : "AI"}
        </div>

        {/* 消息气泡 */}
        <div className="min-w-0 flex-1">
          {/* 用户消息 */}
          {isUser && (
            <div className="rounded-2xl bg-blue-600 px-4 py-2.5 text-sm text-white shadow-sm">
              {/* 文件列表 */}
              {message.files && message.files.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {message.files.map((file, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1 rounded-md bg-white/20 px-2 py-0.5 text-xs"
                    >
                      <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      {file.name}
                    </span>
                  ))}
                </div>
              )}
              <div className="whitespace-pre-wrap">{textContent}</div>
            </div>
          )}

          {/* AI 消息 */}
          {!isUser && (
            <div className="rounded-2xl bg-white px-4 py-3 text-sm text-gray-800 shadow-sm ring-1 ring-gray-100 dark:bg-gray-900 dark:text-gray-200 dark:ring-gray-800">
              {allBlocks.length > 0 ? (
                <>
                  {console.log("[ChatMessage] 走结构化块渲染路径，blocks数量:", allBlocks.length)}
                  {allBlocks.map((block, idx) => {
                    const toolStep = block.type === "tool_call"
                      ? allBlocks.filter((b, i) => b.type === "tool_call" && i <= idx).length
                      : undefined;
                    return <StructuredBlockView key={idx} block={block} step={toolStep} />;
                  })}
                </>
              ) : (
                <>
                  {console.log("[ChatMessage] 走文本渲染路径，textContent长度:", textContent?.length)}
                  <MarkdownRenderer content={textContent || ""} />
                </>
              )}

              {isStreaming && (
                <span className="ml-0.5 inline-block h-4 w-2 animate-pulse rounded-sm bg-gray-400 dark:bg-gray-500" />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}