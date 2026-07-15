import { Extension } from '@tiptap/core';
import Suggestion from '@tiptap/suggestion';
import { slashCommandSuggestionConfig } from './composer-command-menu';

export const SlashCommandExtension = Extension.create({
  name: 'slashCommand',

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        char: slashCommandSuggestionConfig.char,
        items: slashCommandSuggestionConfig.items,
        render: slashCommandSuggestionConfig.render,
        command: slashCommandSuggestionConfig.command,
        allow: slashCommandSuggestionConfig.allow,
      }),
    ];
  },
});
