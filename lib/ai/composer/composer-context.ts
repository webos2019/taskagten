import type { ChatRequest, ChatComposerCommand, ChatComposerReference } from '@/types/chat';

export type ComposerContextKind = 'docs-summary' | 'docs-resource' | 'command-hint';

export interface ComposerContextInvocation {
  kind: ComposerContextKind;
  command?: ChatComposerCommand;
  reference?: ChatComposerReference;
  userGoal: string;
}

function getPrimaryComposerReference(request: ChatRequest): ChatComposerReference | undefined {
  return request.composer?.references?.[0];
}

function getLastUserMessageText(request: ChatRequest): string {
  const lastMessage = request.messages[request.messages.length - 1];
  if (!lastMessage) return '';
  if (typeof lastMessage.content === 'string') return lastMessage.content;
  return '';
}

function isProjectResourceReference(reference?: ChatComposerReference): boolean {
  return reference?.uri.startsWith('project://') ?? false;
}

export function resolveComposerContextInvocation(request: ChatRequest): ComposerContextInvocation | null {
  const command = request.composer?.command;
  const reference = getPrimaryComposerReference(request);
  const userGoal = getLastUserMessageText(request) || request.composer?.plainText || '';

  if (command?.name === 'summary' && isProjectResourceReference(reference)) {
    return { kind: 'docs-summary', command, reference, userGoal };
  }

  if (isProjectResourceReference(reference)) {
    return { kind: 'docs-resource', reference, userGoal };
  }

  if (command) {
    return { kind: 'command-hint', command, userGoal };
  }

  return null;
}

export function buildComposerContextPrompt(invocation: ComposerContextInvocation): string {
  switch (invocation.kind) {
    case 'docs-summary': {
      return `
你需要生成文档摘要。
资源: ${invocation.reference?.uri}
用户目标: ${invocation.userGoal}
请基于提供的资源内容，生成一份简洁的文档摘要。
      `.trim();
    }
    case 'docs-resource': {
      return `
你需要基于提供的资源回答用户问题。
资源: ${invocation.reference?.uri}
用户目标: ${invocation.userGoal}
请优先使用资源中的信息来回答，如果资源中没有相关信息，请告知用户。
      `.trim();
    }
    case 'command-hint': {
      const hintMap: Record<string, string> = {
        summary: '用户希望生成文档摘要',
        tasklist: '用户希望生成任务清单',
        check: '用户希望检查内容一致性',
      };
      return `
${hintMap[invocation.command?.name || ''] || '用户有特定的任务意图'}
用户目标: ${invocation.userGoal}
请根据用户的任务意图来处理用户的请求。
      `.trim();
    }
    default:
      return '';
  }
}
