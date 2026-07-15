"use client";

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { CommandChipNode, ResourceChipNode } from './composer-chip-nodes';
import { serializeComposerPayload } from './composer-serialization';
import { SlashCommandExtension } from './composer-slash-extension';
import { AtResourceExtension } from './composer-at-extension';
import type { ChatComposerPayload } from '@/types/chat';

interface ComposerEditorProps {
  onSubmit: (payload: ChatComposerPayload) => Promise<void>;
  disabled?: boolean;
}

export default function ComposerEditor({ onSubmit, disabled }: ComposerEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        bold: false,
        italic: false,
        strike: false,
        code: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
        dropcursor: {
          width: 2,
          color: '#3b82f6',
        },
      }),
      CommandChipNode,
      ResourceChipNode,
      SlashCommandExtension,
      AtResourceExtension,
    ],
    content: '',
    editorProps: {
      attributes: {
        class: 'outline-none min-h-[40px] max-h-[200px] overflow-y-auto px-2 py-2 text-sm text-gray-900 placeholder:text-gray-400 dark:text-gray-100 dark:placeholder:text-gray-500',
        placeholder: '输入关于代码的问题…',
      },
      handleKeyDown: (view, event) => {
        if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
          event.preventDefault();
          handleSubmit();
        }
      },
    },
  });

  const handleSubmit = async () => {
    if (!editor || disabled) return;

    const payload = serializeComposerPayload(editor);
    
    if (!payload.plainText.trim() && !payload.command && (!payload.references || payload.references.length === 0)) {
      return;
    }

    await onSubmit(payload);
    editor.commands.clearContent();
  };

  return (
    <div className="flex items-end gap-2 rounded-xl border border-gray-300 bg-gray-50 p-2 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:focus-within:border-blue-400">
      <EditorContent editor={editor} className="flex-1" />
      
      <button
        onClick={handleSubmit}
        disabled={disabled}
        className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg transition-colors ${
          disabled
            ? 'bg-gray-200 text-gray-400 dark:bg-gray-700 dark:text-gray-500'
            : 'bg-blue-600 text-white hover:bg-blue-700'
        } disabled:cursor-not-allowed`}
        title="发送 (Enter)"
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
  );
}
