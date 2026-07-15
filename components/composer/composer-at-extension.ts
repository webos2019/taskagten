import { Extension } from '@tiptap/core';
import Suggestion from '@tiptap/suggestion';
import { atResourceSuggestionConfig } from './composer-resource-menu';

export const AtResourceExtension = Extension.create({
  name: 'atResource',

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        char: atResourceSuggestionConfig.char,
        items: atResourceSuggestionConfig.items,
        render: atResourceSuggestionConfig.render,
        command: atResourceSuggestionConfig.command,
        allow: atResourceSuggestionConfig.allow,
      }),
    ];
  },
});
