"use client";

import { useEffect, useRef } from "react";
import type { ChatHookReturn } from "@/types/chat";
import ChatMessageComponent from "./ChatMessage";
import ChatInput from "./ChatInput";
import styles from "@/styles/ChatContainer.module.css";

interface ChatContainerProps extends ChatHookReturn {
  streamingMessageId?: string;
}

export default function ChatContainer(props: ChatContainerProps) {
  const {
    messages,
    streamingBlocks,
    streamingText,
    status,
    error,
    mode,
    setMode,
    sendMessage,
    cancelStream,
    clearMessages,
    regenerateLastResponse,
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

  return (
        <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.headerIconContainer}>
            {"</>"}
          </div>
          <div>
            <h1 className={styles.headerTitle}>
              AI 助手
            </h1>
            <p className={styles.headerSubtitle}>
              {mode === "utility-skill" ? "实用工具模式" : "文件与天气模式"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className={styles.modeSelector}>
            <button
              onClick={() => setMode("utility-skill")}
              className={`${styles.modeButton} ${mode === "utility-skill" ? styles.active : ""}`}
            >
              工具
            </button>
            <button
              onClick={() => setMode("reader-skill")}
              className={`${styles.modeButton} ${mode === "reader-skill" ? styles.active : ""}`}
            >
              文件
            </button>
          </div>

           {messages.length > 0 && (
             <div className={styles.actionButtons}>
               <button
                 onClick={regenerateLastResponse}
                 disabled={isStreaming}
                 className={styles.actionButton}
                 title="重新生成上一个回答"
               >
                 <svg className={styles.iconRefresh} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                 </svg>
                 重新生成
               </button>
               <button
                 onClick={clearMessages}
                 disabled={isStreaming}
                 className={styles.actionButton}
                 title="清空对话"
               >
                 <svg className={styles.iconTrash} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                 </svg>
                 清空
               </button>
             </div>
           )}
        </div>
      </header>

      <div ref={chatBodyRef} className={styles.chatBody}>
        <div className={styles.chatContent}>
            {isEmpty && (
              <div className={styles.emptyState}>
                <div className={styles.emptyIconContainer}>
                  <svg className={styles.emptyIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                  </svg>
                </div>

                <h2 className={styles.emptyTitle}>
                  {mode === "utility-skill" ? "实用工具助手" : "文件与天气助手"}
                </h2>
                <p className={styles.emptyDescription}>
                  {mode === "utility-skill"
                    ? "处理确定性实用任务：数学计算、日期查询、文本转换、单位换算。模型会严格使用工具确保结果准确。"
                    : "接入外部上下文来源：读取本地文件、查询实时天气。这些信息模型无法自行获取，必须通过工具调用。"}
                </p>

                {mode === "utility-skill" ? (
                  <div className={styles.featureGrid}>
                    {[
                      { title: "数学计算", desc: "精确计算数学表达式", icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" },
                      { title: "日期时间", desc: "获取当前时间、日期加减、判断星期", icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" },
                      { title: "文本转换", desc: "Markdown转文本、提取链接、JSON美化", icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" },
                      { title: "单位换算", desc: "长度、重量、温度单位转换", icon: "M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" },
                    ].map((item) => (
                      <div key={item.title} className={styles.featureCardUtility}>
                        <div className={styles.featureIconContainer}>
                          <svg className={styles.featureIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
                          </svg>
                        </div>
                        <h3 className={styles.featureTitle}>{item.title}</h3>
                        <p className={styles.featureDescription}>{item.desc}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className={styles.featureGrid}>
                    {[
                      { title: "目录遍历", desc: "查看项目根目录结构（仅根目录）", icon: "M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" },
                      { title: "文件读取", desc: "读取项目根目录下的文本文件", icon: "M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" },
                      { title: "地理位置", desc: "通过IP获取用户所在城市", icon: "M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" },
                      { title: "实时天气", desc: "查询指定城市的实时天气信息", icon: "M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" },
                    ].map((item) => (
                      <div key={item.title} className={styles.featureCard}>
                        <div className={styles.featureIconContainerPurple}>
                          <svg className={styles.featureIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
                          </svg>
                        </div>
                        <h3 className={styles.featureTitle}>{item.title}</h3>
                        <p className={styles.featureDescription}>{item.desc}</p>
                      </div>
                    ))}
                  </div>
                )}

                <div className={styles.infoBox}>
                  <svg className={styles.infoIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  支持流式错误自动恢复，始终保障服务可用
                </div>
            </div>
          )}

          {!isEmpty && (
            <div className={styles.messagesContainer}>
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
                <div className={styles.errorContainer}>
                  <div className={styles.errorContent}>
                    <svg className={styles.errorIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div className={styles.errorText}>
                      <p className={styles.errorTitle}>出错了</p>
                      <p className={styles.errorMessage}>{error}</p>
                      <button
                        onClick={() => {
                          const lastUserMsg = messages[messages.length - 1];
                          if (lastUserMsg && lastUserMsg.role === "user") {
                            sendMessage(lastUserMsg.content);
                          }
                        }}
                        className={styles.retryButton}
                      >
                        重试
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
      </div>

      <div className={styles.footerContainer}>
        {isStreaming ? (
          <div className={styles.streamingControls}>
            <button
              onClick={cancelStream}
              className={styles.stopButton}
            >
              <svg className={styles.stopIcon} fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="6" width="12" height="12" rx="1" />
              </svg>
              停止生成
            </button>
          </div>
        ) : status === "retrying" ? (
          <div className={styles.retryStatus}>
            <svg className={styles.spinner} fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            正在尝试恢复，请稍候...
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
