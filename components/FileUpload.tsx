"use client";

import { useState, useRef, useCallback } from "react";
import type { FileInfo } from "@/types/chat";
import { validateFile } from "@/lib/validators";

interface FileUploadProps {
  files: FileInfo[];
  onFilesChange: (files: FileInfo[]) => void;
  onError: (error: string) => void;
}

export default function FileUpload({ files, onFilesChange, onError }: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const readFile = useCallback(
    (file: File) => {
      const validation = validateFile({ name: file.name, size: file.size });
      if (!validation.valid) {
        onError(validation.error || "文件校验失败");
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        const ext = file.name.split(".").pop()?.toLowerCase() || "";

        const newFile: FileInfo = {
          name: file.name,
          size: file.size,
          type: ext,
          content,
        };

        onFilesChange([...files, newFile]);
      };
      reader.onerror = () => {
        onError(`读取文件 "${file.name}" 失败`);
      };
      reader.readAsText(file);
    },
    [files, onFilesChange, onError]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFiles = e.target.files;
      if (!selectedFiles) return;

      for (let i = 0; i < selectedFiles.length; i++) {
        readFile(selectedFiles[i]);
      }

      // Reset input so the same file can be re-selected
      e.target.value = "";
    },
    [readFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const droppedFiles = e.dataTransfer.files;
      if (!droppedFiles) return;

      for (let i = 0; i < droppedFiles.length; i++) {
        readFile(droppedFiles[i]);
      }
    },
    [readFile]
  );

  const removeFile = useCallback(
    (index: number) => {
      onFilesChange(files.filter((_, i) => i !== index));
    },
    [files, onFilesChange]
  );

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const languageLabels: Record<string, string> = {
    py: "Python",
    js: "JavaScript",
    ts: "TypeScript",
    jsx: "React JSX",
    tsx: "React TSX",
    go: "Go",
    rs: "Rust",
    java: "Java",
    md: "Markdown",
    json: "JSON",
    yaml: "YAML",
    yml: "YAML",
    css: "CSS",
    scss: "SCSS",
    sql: "SQL",
    sh: "Shell",
    bash: "Bash",
    html: "HTML",
    vue: "Vue",
    svelte: "Svelte",
    c: "C",
    cpp: "C++",
    rb: "Ruby",
    php: "PHP",
    swift: "Swift",
    kt: "Kotlin",
    dart: "Dart",
  };

  return (
    <div className="w-full">
      {/* 拖拽上传区域 */}
      <div
        className={`relative flex cursor-pointer items-center justify-center rounded-lg border-2 border-dashed p-4 transition-colors ${
          isDragging
            ? "border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-950"
            : "border-gray-300 bg-gray-50 hover:border-gray-400 hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-800 dark:hover:border-gray-500 dark:hover:bg-gray-750"
        }`}
        onClick={() => inputRef.current?.click()}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileSelect}
          accept=".py,.js,.ts,.jsx,.tsx,.go,.rs,.java,.md,.json,.yaml,.yml,.css,.scss,.sql,.sh,.bash,.html,.vue,.svelte,.c,.cpp,.h,.hpp,.rb,.php,.swift,.kt,.dart,.toml,.xml,.dockerfile"
        />
        <div className="text-center text-sm text-gray-500 dark:text-gray-400">
          <svg className="mx-auto mb-1 h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          <span>拖拽代码文件到此处，或点击选择文件</span>
        </div>
      </div>

      {/* 已上传文件列表 */}
      {files.length > 0 && (
        <div className="mt-2 space-y-1">
          {files.map((file, index) => (
            <div
              key={`${file.name}-${index}`}
              className="flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800"
            >
              <svg className="h-4 w-4 flex-shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span className="truncate font-medium text-gray-700 dark:text-gray-300">
                {file.name}
              </span>
              <span className="flex-shrink-0 text-xs text-gray-400">
                {formatSize(file.size)}
              </span>
              <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                {languageLabels[file.type] || file.type.toUpperCase()}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeFile(index);
                }}
                className="ml-auto flex-shrink-0 text-gray-400 hover:text-red-500"
                title="删除文件"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
