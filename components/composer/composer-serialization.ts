import { Editor } from '@tiptap/react';
import type { JSONContent } from '@tiptap/core';
import type { ChatComposerPayload, ChatComposerCommand, ChatComposerReference } from '@/types/chat';
import { COMMAND_CHIP_NODE_NAME, RESOURCE_CHIP_NODE_NAME } from './composer-chip-nodes';

interface ComposerMetadata {
  command?: ChatComposerCommand;
  references: ChatComposerReference[];
}

function getInlineTextFromContent(content: JSONContent[] | undefined): string {
  if (!content) return '';

  return content
    .map((node) => {
      if (node.type === 'text') {
        return node.text ?? '';
      }

      if (node.type === 'hardBreak') {
        return '\n';
      }

      if (node.type === COMMAND_CHIP_NODE_NAME || node.type === RESOURCE_CHIP_NODE_NAME) {
        return '';
      }

      if (node.content) {
        return getInlineTextFromContent(node.content);
      }

      return '';
    })
    .join('');
}

function getPlainTextFromContent(content: JSONContent[] | undefined): string {
  return getInlineTextFromContent(content);
}

function extractComposerMetadata(content: JSONContent[] | undefined): ComposerMetadata {
  const metadata: ComposerMetadata = {
    references: [],
  };

  if (!content) return metadata;

  for (const node of content) {
    if (node.type === COMMAND_CHIP_NODE_NAME) {
      metadata.command = {
        label: node.attrs?.label || '',
        name: (node.attrs?.commandName as ChatComposerCommand['name']) || 'summary',
      };
    }

    if (node.type === RESOURCE_CHIP_NODE_NAME) {
      metadata.references.push({
        id: node.attrs?.id || '',
        label: node.attrs?.label || '',
        uri: node.attrs?.uri || '',
        source: (node.attrs?.source as 'local' | 'remote') || 'local',
        type: 'resource',
        serverId: node.attrs?.serverId || undefined,
      });
    }

    if (node.content) {
      const nestedMetadata = extractComposerMetadata(node.content);
      if (!metadata.command && nestedMetadata.command) {
        metadata.command = nestedMetadata.command;
      }
      metadata.references = [...metadata.references, ...nestedMetadata.references];
    }
  }

  return metadata;
}

export function serializeComposerPayload(editor: Editor): ChatComposerPayload {
  const editorJSON = editor.getJSON();
  const content = (editorJSON as JSONContent).content || [];
  const metadata = extractComposerMetadata(content);

  return {
    plainText: getPlainTextFromContent(content),
    ...(metadata.command ? { command: metadata.command } : {}),
    ...(metadata.references.length > 0 ? { references: metadata.references } : {}),
  };
}

export function insertCommandChip(editor: Editor, commandName: string, label: string): void {
  editor.commands.deleteSelection();

  editor.commands.insertContent({
    type: COMMAND_CHIP_NODE_NAME,
    attrs: { commandName, label },
  });

  editor.commands.insertContent(' ');
}

export function insertResourceChip(
  editor: Editor,
  id: string,
  label: string,
  uri: string,
  source: 'local' | 'remote',
  serverId?: string
): void {
  editor.commands.deleteSelection();

  editor.commands.insertContent({
    type: RESOURCE_CHIP_NODE_NAME,
    attrs: { id, label, uri, source, serverId },
  });

  editor.commands.insertContent(' ');
}
