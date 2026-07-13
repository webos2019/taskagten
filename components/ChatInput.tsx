"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { FileInfo } from "@/types/chat";
import FileUpload from "./FileUpload";

interface ChatInputProps {
  onSend: (text: string, files?: FileInfo[]) => Promise<void>;
  disabled: boolean;
  onError: (error: string) => void;
}

export default function ChatInput({ onSend, disabled, onError }: ChatInputProps) {
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<FileInfo[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 自动调整 Textarea 高度
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, [input]);

  // 发送消息后清空输入
  const handleSend = useCallback(async () => {
    if (disabled) return;

    const text = input.trim();
    if (!text && files.length === 0) return;

    await onSend(text, files.length > 0 ? files : undefined);
    setInput("");
    setFiles([]);

    // 聚焦回输入框
    textareaRef.current?.focus();
  }, [input, files, disabled, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Ctrl+Enter / Cmd+Enter 发送
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleSend();
      }
      // Enter alone inserts newline
    },
    [handleSend]
  );

  // 发送按钮状态
  const canSend = (input.trim().length > 0 || files.length > 0) && !disabled;

  return (
    <div className="border-t border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
      <div className="mx-auto max-w-4xl">
        {/* 文件上传 */}
        <div className="mb-2">
          <FileUpload files={files} onFilesChange={setFiles} onError={onError} />
        </div>

        {/* 输入区域 */}
        <div className="flex items-end gap-2 rounded-xl border border-gray-300 bg-gray-50 p-2 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:focus-within:border-blue-400">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入关于代码的问题… (Ctrl+Enter 发送)"
            rows={1}
            disabled={disabled}
            className="max-h-[200px] min-h-[40px] flex-1 resize-none bg-transparent px-2 py-2 text-sm text-gray-900 outline-none placeholder:text-gray-400 disabled:opacity-50 dark:text-gray-100 dark:placeholder:text-gray-500"
          />

          {/* 发送按钮 */}
          <button
            onClick={handleSend}
            disabled={!canSend}
            className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg transition-colors ${
              canSend
                ? "bg-blue-600 text-white hover:bg-blue-700"
                : "bg-gray-200 text-gray-400 dark:bg-gray-700 dark:text-gray-500"
            } disabled:cursor-not-allowed`}
            title="发送 (Ctrl+Enter)"
          >
            {disabled ? (
              <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            )}
          </button>
        </div>

        {/* 提示文字 */}
        <p className="mt-1.5 text-center text-xs text-gray-400">
          支持粘贴代码片段，或上传代码文件进行分析
        </p>
      </div>
    </div>
  );
}
