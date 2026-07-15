import type { ChatComposerCommandName } from '@/types/chat';

export interface ComposerCommand {
  name: ChatComposerCommandName;
  label: string;
  description: string;
  icon: string;
}

export const COMPOSER_COMMANDS: ComposerCommand[] = [
  {
    name: 'summary',
    label: '总结文档',
    description: '生成文档摘要',
    icon: '📋',
  },
  {
    name: 'tasklist',
    label: '生成任务清单',
    description: '整理待办事项',
    icon: '✅',
  },
  {
    name: 'check',
    label: '检查一致性',
    description: '验证文档内容',
    icon: '🔍',
  },
];

export const SLASH_COMMAND_TRIGGER = '/';
