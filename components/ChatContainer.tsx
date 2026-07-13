"use client";

import { useEffect, useRef } from "react";
import type { ChatHookReturn } from "@/types/chat";
import ChatMessageComponent from "./ChatMessage";
import ChatInput from "./ChatInput";

interface ChatContainerProps extends ChatHookReturn {
  streamingMessageId?: string;
}

export default function ChatContainer(props: ChatContainerProps) {
  const {
    messages,
    streamingBlocks,
    status,
    error,
    mode,
    setMode,
    sendMessage,
    cancelStream,
    clearMessages,
  } = props;

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatBodyRef = useRef<HTMLDivElement>(null);

  const isStreaming = status === "loading" || status === "streaming";
  const isEmpty = messages.length === 0 && !isStreaming;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingBlocks]);

  const lastAssistantIndex = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") return i;
    }
    return -1;
  })();

  const streamingText = streamingBlocks
    .filter((b) => b.type === "text")
    .map((b) => b.content)
    .join("");

  return (
    <div className="flex h-screen flex-col bg-gray-50 dark:bg-gray-950">
      <header className="flex items-center justify-between border-b border-gray-200 bg-white/80 px-4 py-3 backdrop-blur-sm dark:border-gray-800 dark:bg-gray-900/80">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 text-sm font-bold text-white shadow-sm">
            {"</>"}
          </div>
          <div>
            <h1 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              AI 助手
            </h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {mode === "utility-skill" ? "实用工具模式" : "文件与天气模式"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded-lg border border-gray-200 bg-gray-100 text-xs dark:border-gray-700 dark:bg-gray-800">
            <button
              onClick={() => setMode("utility-skill")}
              className={`px-3 py-1.5 transition-colors ${
                mode === "utility-skill"
                  ? "bg-white font-medium text-blue-600 shadow-sm dark:bg-gray-700 dark:text-blue-400"
                  : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              }`}
            >
              工具
            </button>
            <button
              onClick={() => setMode("reader-skill")}
              className={`px-3 py-1.5 transition-colors ${
                mode === "reader-skill"
                  ? "bg-white font-medium text-blue-600 shadow-sm dark:bg-gray-700 dark:text-blue-400"
                  : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              }`}
            >
              文件
            </button>
          </div>

          {messages.length > 0 && (
            <button
              onClick={clearMessages}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-300"
              title="清空对话"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              清空
            </button>
          )}
        </div>
      </header>

      <div ref={chatBodyRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-4 py-6">
          {isEmpty && (
            <div className="flex min-h-[70vh] flex-col items-center justify-center text-center">
              <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-50 to-purple-50 shadow-sm ring-1 ring-gray-200 dark:from-blue-950/50 dark:to-purple-950/50 dark:ring-gray-800">
                <svg className="h-7 w-7 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
              </div>

              <h2 className="mb-2 text-2xl font-bold text-gray-800 dark:text-gray-100">
                {mode === "utility-skill" ? "实用工具助手" : "文件与天气助手"}
              </h2>
              <p className="mb-8 max-w-md text-sm text-gray-500 dark:text-gray-400">
                {mode === "utility-skill"
                  ? "处理确定性实用任务：数学计算、日期查询、文本转换、单位换算。模型会严格使用工具确保结果准确。"
                  : "接入外部上下文来源：读取本地文件、查询实时天气。这些信息模型无法自行获取，必须通过工具调用。"}
              </p>

              {mode === "utility-skill" ? (
                <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
                  {[
                    { title: "数学计算", desc: "精确计算数学表达式", icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" },
                    { title: "日期时间", desc: "获取当前时间、日期加减、判断星期", icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" },
                    { title: "文本转换", desc: "Markdown转文本、提取链接、JSON美化", icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" },
                    { title: "单位换算", desc: "长度、重量、温度单位转换", icon: "M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" },
                  ].map((item) => (
                    <div key={item.title} className="group rounded-xl border border-gray-200 bg-white p-4 text-left shadow-sm transition-all hover:border-blue-200 hover:shadow-md dark:border-gray-800 dark:bg-gray-900 dark:hover:border-blue-800">
                      <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600 transition-colors group-hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-400 dark:group-hover:bg-blue-900">
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
                        </svg>
                      </div>
                      <h3 className="text-sm font-medium text-gray-800 dark:text-gray-200">{item.title}</h3>
                      <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{item.desc}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
                  {[
                    { title: "目录遍历", desc: "查看项目根目录结构（仅根目录）", icon: "M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" },
                    { title: "文件读取", desc: "读取项目根目录下的文本文件", icon: "M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" },
                    { title: "地理位置", desc: "通过IP获取用户所在城市", icon: "M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" },
                    { title: "实时天气", desc: "查询指定城市的实时天气信息", icon: "M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" },
                  ].map((item) => (
                    <div key={item.title} className="group rounded-xl border border-gray-200 bg-white p-4 text-left shadow-sm transition-all hover:border-purple-200 hover:shadow-md dark:border-gray-800 dark:bg-gray-900 dark:hover:border-purple-800">
                      <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-purple-50 text-purple-600 transition-colors group-hover:bg-purple-100 dark:bg-purple-950 dark:text-purple-400 dark:group-hover:bg-purple-900">
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
                        </svg>
                      </div>
                      <h3 className="text-sm font-medium text-gray-800 dark:text-gray-200">{item.title}</h3>
                      <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{item.desc}</p>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-8 flex items-center gap-2 rounded-lg bg-gray-100 px-4 py-2 text-xs text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                支持流式错误自动恢复，始终保障服务可用
              </div>
            </div>
          )}

          {!isEmpty && (
            <div className="space-y-6">
              {messages.map((msg, index) => {
                const isLastAssistant =
                  index === lastAssistantIndex && msg.role === "assistant";

                return (
                  <ChatMessageComponent
                    key={msg.id || index}
                    message={msg}
                    isStreaming={isStreaming && isLastAssistant}
                    streamingText={isLastAssistant ? streamingText : undefined}
                    streamingBlocks={isLastAssistant ? streamingBlocks : undefined}
                  />
                );
              })}

              {isStreaming && lastAssistantIndex < 0 && (
                <ChatMessageComponent
                  message={{ role: "assistant", content: streamingText }}
                  isStreaming={true}
                  streamingText={streamingText}
                  streamingBlocks={streamingBlocks}
                />
              )}

              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
                  <div className="flex items-start gap-3">
                    <svg className="mt-0.5 h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div>
                      <p className="font-medium">出错了</p>
                      <p className="mt-1 text-red-600 dark:text-red-300">{error}</p>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-gray-200 bg-white/80 backdrop-blur-sm dark:border-gray-800 dark:bg-gray-900/80">
        {isStreaming ? (
          <div className="mx-auto flex max-w-3xl items-center justify-center px-4 py-3">
            <button
              onClick={cancelStream}
              className="flex items-center gap-2 rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-red-600"
            >
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="6" width="12" height="12" rx="1" />
              </svg>
              停止生成
            </button>
          </div>
        ) : (
          <ChatInput
            onSend={sendMessage}
            disabled={false}
            onError={() => {}}
          />
        )}
      </div>
    </div>
  );
}
