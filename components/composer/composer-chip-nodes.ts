import { Node } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import InlineComposerChipNodeView from './composer-chip-view';

export const COMMAND_CHIP_NODE_NAME = 'commandChip';
export const RESOURCE_CHIP_NODE_NAME = 'resourceChip';

export const CommandChipNode = Node.create({
  name: COMMAND_CHIP_NODE_NAME,
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      commandName: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-command-name'),
        renderHTML: (attributes) => ({
          'data-command-name': attributes.commandName,
        }),
      },
      label: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-label'),
        renderHTML: (attributes) => ({
          'data-label': attributes.label,
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: `span[data-${COMMAND_CHIP_NODE_NAME}]`,
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', { ...HTMLAttributes, 'data-command-chip': '' }];
  },

  addNodeView() {
    return ReactNodeViewRenderer(InlineComposerChipNodeView);
  },
});

export const ResourceChipNode = Node.create({
  name: RESOURCE_CHIP_NODE_NAME,
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      id: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-id'),
        renderHTML: (attributes) => ({
          'data-id': attributes.id,
        }),
      },
      label: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-label'),
        renderHTML: (attributes) => ({
          'data-label': attributes.label,
        }),
      },
      uri: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-uri'),
        renderHTML: (attributes) => ({
          'data-uri': attributes.uri,
        }),
      },
      source: {
        default: 'local',
        parseHTML: (element) => element.getAttribute('data-source'),
        renderHTML: (attributes) => ({
          'data-source': attributes.source,
        }),
      },
      serverId: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-server-id'),
        renderHTML: (attributes) => ({
          'data-server-id': attributes.serverId,
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: `span[data-${RESOURCE_CHIP_NODE_NAME}]`,
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', { ...HTMLAttributes, 'data-resource-chip': '' }];
  },

  addNodeView() {
    return ReactNodeViewRenderer(InlineComposerChipNodeView);
  },
});
