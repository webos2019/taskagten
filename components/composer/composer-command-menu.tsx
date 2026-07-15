import { Editor, Range } from '@tiptap/core';
import { COMPOSER_COMMANDS } from './composer-constants';
import { insertCommandChip } from './composer-serialization';

interface SuggestionItem {
  commandName: string;
  label: string;
  description: string;
  icon: string;
}

function getItems(query: string): SuggestionItem[] {
  const filtered = COMPOSER_COMMANDS.filter((cmd) =>
    cmd.label.toLowerCase().includes(query.toLowerCase()) ||
    cmd.description.toLowerCase().includes(query.toLowerCase())
  );

  return filtered.map((cmd) => ({
    commandName: cmd.name,
    label: cmd.label,
    description: cmd.description,
    icon: cmd.icon,
  }));
}

function renderSuggestionMenu(
  container: HTMLElement,
  items: SuggestionItem[],
  onSelect: (item: SuggestionItem) => void
): {
  update: (props: { items: SuggestionItem[] }) => void;
  destroy: () => void;
} {
  let currentItems = items;

  const update = (props: { items: SuggestionItem[] }) => {
    currentItems = props.items;
    render();
  };

  const render = () => {
    container.innerHTML = '';

    const wrapper = document.createElement('div');
    wrapper.className = 'fixed z-50';

    const list = document.createElement('div');
    list.className =
      'flex max-h-64 w-72 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800';

    if (currentItems.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'flex-1 flex items-center justify-center px-4 py-2 text-sm text-gray-500 dark:text-gray-400';
      empty.textContent = '没有找到匹配的命令';
      list.appendChild(empty);
    } else {
      const ul = document.createElement('ul');
      ul.className = 'flex-1 overflow-y-auto py-1';

      currentItems.forEach((item) => {
        const li = document.createElement('li');
        li.className =
          'flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-blue-50 dark:hover:bg-gray-700';

        const icon = document.createElement('span');
        icon.className = 'flex h-6 w-6 flex-shrink-0 items-center justify-center text-lg';
        icon.textContent = item.icon;

        const content = document.createElement('div');
        content.className = 'flex-1 min-w-0';

        const label = document.createElement('div');
        label.className = 'font-medium text-gray-900 dark:text-gray-100';
        label.textContent = item.label;

        const description = document.createElement('div');
        description.className = 'truncate text-xs text-gray-500 dark:text-gray-400';
        description.textContent = item.description;

        content.appendChild(label);
        content.appendChild(description);
        li.appendChild(icon);
        li.appendChild(content);

        li.addEventListener('click', () => onSelect(item));
        ul.appendChild(li);
      });

      list.appendChild(ul);
    }

    wrapper.appendChild(list);
    container.appendChild(wrapper);
  };

  render();

  return {
    update,
    destroy: () => {
      container.remove();
    },
  };
}

export const slashCommandSuggestionConfig = {
  char: '/',
  items: ({ query }: { query: string }) => getItems(query),
  render: () => {
    let component: {
      update: (props: { items: SuggestionItem[] }) => void;
      destroy: () => void;
    } | null = null;

    return {
      onStart: (props: { editor: Editor; items: SuggestionItem[] }) => {
        const dom = document.createElement('div');
        document.body.appendChild(dom);

        const selectItem = (item: SuggestionItem) => {
          props.editor.commands.deleteSelection();
          insertCommandChip(props.editor, item.commandName, item.label);
          component?.destroy();
        };

        component = renderSuggestionMenu(dom, props.items, selectItem);
      },
      onUpdate: (props: { items: SuggestionItem[] }) => {
        component?.update({ items: props.items });
      },
      onKeyDown: ({ event }: { event: KeyboardEvent }) => {
        if (event.key === 'Escape') {
          component?.destroy();
          return true;
        }
        if (event.key === 'Enter') {
          return true;
        }
        return false;
      },
      onExit: () => {
        component?.destroy();
      },
    };
  },
  command: ({ editor, props }: { editor: Editor; props: SuggestionItem }) => {
    editor
      .chain()
      .focus()
      .insertContent({
        type: 'commandChip',
        attrs: { commandName: props.commandName, label: props.label },
      })
      .insertContent(' ')
      .run();
  },
  allow: ({ editor }: { editor: Editor }) => {
    return !editor.isActive('codeBlock');
  },
};
