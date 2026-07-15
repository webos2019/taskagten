import { Editor } from '@tiptap/core';
import { insertResourceChip } from './composer-serialization';

interface ResourceItem {
  id: string;
  label: string;
  uri: string;
  source: 'local' | 'remote';
  serverId?: string;
}

const MOCK_RESOURCES: ResourceItem[] = [
  {
    id: 'project-files',
    label: '项目文档',
    uri: 'project://',
    source: 'local',
  },
  {
    id: 'latest-context',
    label: '最新上下文',
    uri: 'project://latest-context',
    source: 'local',
  },
];

function getResources(query: string): ResourceItem[] {
  if (!query) return MOCK_RESOURCES;

  return MOCK_RESOURCES.filter((resource) =>
    resource.label.toLowerCase().includes(query.toLowerCase()) ||
    resource.uri.toLowerCase().includes(query.toLowerCase())
  );
}

function renderResourceMenu(
  container: HTMLElement,
  items: ResourceItem[],
  onSelect: (item: ResourceItem) => void
): {
  update: (props: { items: ResourceItem[] }) => void;
  destroy: () => void;
} {
  let currentItems = items;

  const update = (props: { items: ResourceItem[] }) => {
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
      empty.textContent = '没有找到匹配的资源';
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
        icon.textContent = item.source === 'local' ? '📁' : '☁️';

        const content = document.createElement('div');
        content.className = 'flex-1 min-w-0';

        const label = document.createElement('div');
        label.className = 'font-medium text-gray-900 dark:text-gray-100';
        label.textContent = item.label;

        const uri = document.createElement('div');
        uri.className = 'truncate text-xs text-gray-500 dark:text-gray-400';
        uri.textContent = item.uri;

        content.appendChild(label);
        content.appendChild(uri);
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

export const atResourceSuggestionConfig = {
  char: '@',
  items: ({ query }: { query: string }) => getResources(query),
  render: () => {
    let component: {
      update: (props: { items: ResourceItem[] }) => void;
      destroy: () => void;
    } | null = null;

    return {
      onStart: (props: { editor: Editor; items: ResourceItem[] }) => {
        const dom = document.createElement('div');
        document.body.appendChild(dom);

        const selectItem = (item: ResourceItem) => {
          props.editor.commands.deleteSelection();
          insertResourceChip(props.editor, item.id, item.label, item.uri, item.source, item.serverId);
          component?.destroy();
        };

        component = renderResourceMenu(dom, props.items, selectItem);
      },
      onUpdate: (props: { items: ResourceItem[] }) => {
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
  command: ({ editor, props }: { editor: Editor; props: ResourceItem }) => {
    editor
      .chain()
      .focus()
      .insertContent({
        type: 'resourceChip',
        attrs: { id: props.id, label: props.label, uri: props.uri, source: props.source, serverId: props.serverId },
      })
      .insertContent(' ')
      .run();
  },
  allow: ({ editor }: { editor: Editor }) => {
    return !editor.isActive('codeBlock');
  },
};
