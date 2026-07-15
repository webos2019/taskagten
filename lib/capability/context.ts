import type { SkillDefinition, CapabilityType, CapabilityIdentity, CapabilityExecutionResult, RemoteCapabilityInvocation } from './types';
import { createCapabilityId } from './registry';
import { tasklistDraftPromptAdapter, latestContextResourceAdapter, checkDocConsistencyToolAdapter } from '@/lib/mcp/adapters';

export const LATEST_CONTEXT_RESOURCE_NAME = 'project://latest-context';
export const TASKLIST_DRAFT_PROMPT_NAME = 'tasklist-draft';
export const DOC_CONSISTENCY_TOOL_NAME = 'check_doc_consistency';

export type RemoteCapabilityName = typeof LATEST_CONTEXT_RESOURCE_NAME | typeof TASKLIST_DRAFT_PROMPT_NAME | typeof DOC_CONSISTENCY_TOOL_NAME;

const PROJECT_CONTEXT_PATTERNS = ['项目上下文', '最近更新', 'latest context', '当前状态'];
const TASKLIST_DRAFT_PATTERNS = ['任务列表', '任务草稿', 'tasklist', '待办'];
const DOC_CONSISTENCY_PATTERNS = ['文档一致性', '检查文档', 'doc consistency', '不一致'];

function matchesAny(text: string, patterns: string[]): boolean {
  return patterns.some((pattern) => text.toLowerCase().includes(pattern.toLowerCase()));
}

export function isRemoteCapabilityAllowed(skillDefinition: SkillDefinition, identity: CapabilityIdentity): boolean {
  const capabilityId = createCapabilityId(identity);
  
  for (const selector of skillDefinition.capabilitySelectors) {
    if (selector.providerKind && identity.providerKind !== selector.providerKind) {
      continue;
    }
    if (selector.location && identity.location !== selector.location) {
      continue;
    }
    if (selector.capabilityType && identity.capabilityType !== selector.capabilityType) {
      continue;
    }
    if (selector.serverId && identity.serverId !== selector.serverId) {
      continue;
    }
    if (selector.names && !selector.names.includes(identity.name)) {
      continue;
    }
    return true;
  }
  
  return false;
}

export function createRemoteCapabilityIdentity(name: string, capabilityType: CapabilityType): CapabilityIdentity {
  return {
    name,
    capabilityType,
    providerKind: 'mcp',
    location: 'remote',
    serverId: 'tasklist-server',
  };
}

async function executeRemoteResourceInvocation(invocation: RemoteCapabilityInvocation): Promise<CapabilityExecutionResult> {
  try {
    const result = await latestContextResourceAdapter();
    return {
      success: true,
      content: result.content,
      messageCount: 1,
      metadata: { resourceUri: invocation.input, serverId: result.serverId },
    };
  } catch (err) {
    return {
      success: false,
      content: `项目上下文获取失败：${err instanceof Error ? err.message : '未知错误'}`,
      messageCount: 0,
      metadata: { resourceUri: invocation.input, error: err instanceof Error ? err.message : '未知' },
    };
  }
}

async function executeRemotePromptInvocation(invocation: RemoteCapabilityInvocation): Promise<CapabilityExecutionResult> {
  try {
    const goal = invocation.input.replace(/^goal=/, '');
    const result = await tasklistDraftPromptAdapter(goal);
    return {
      success: true,
      content: result.content,
      messageCount: 1,
      metadata: { promptInput: invocation.input, serverId: result.serverId, promptName: result.promptName },
    };
  } catch (err) {
    return {
      success: false,
      content: `任务列表生成失败：${err instanceof Error ? err.message : '未知错误'}`,
      messageCount: 0,
      metadata: { promptInput: invocation.input, error: err instanceof Error ? err.message : '未知' },
    };
  }
}

async function executeRemoteToolInvocation(invocation: RemoteCapabilityInvocation): Promise<CapabilityExecutionResult> {
  try {
    const input = invocation.input.replace(/^goal=/, '');
    const result = await checkDocConsistencyToolAdapter(input, input);
    return {
      success: true,
      content: result.content,
      messageCount: 1,
      metadata: { toolInput: invocation.input, serverId: result.serverId, toolName: result.toolName },
    };
  } catch (err) {
    return {
      success: false,
      content: `文档一致性检查失败：${err instanceof Error ? err.message : '未知错误'}`,
      messageCount: 0,
      metadata: { toolInput: invocation.input, error: err instanceof Error ? err.message : '未知' },
    };
  }
}

function createRemoteCapabilityInvocation(
  name: RemoteCapabilityName,
  capabilityType: CapabilityType,
  userGoal: string
): RemoteCapabilityInvocation {
  const identity = createRemoteCapabilityIdentity(name, capabilityType);
  const capabilityId = createCapabilityId(identity);
  const input = capabilityType === 'resource' ? LATEST_CONTEXT_RESOURCE_NAME : `goal=${userGoal}`;
  
  return {
    capabilityType,
    capabilityId,
    name,
    serverId: 'tasklist-server',
    input,
    execute: async () => {
      if (capabilityType === 'resource') {
        return executeRemoteResourceInvocation({ capabilityType, capabilityId, name, serverId: 'tasklist-server', input, execute: () => Promise.resolve({ success: true }) });
      }
      if (capabilityType === 'prompt') {
        return executeRemotePromptInvocation({ capabilityType, capabilityId, name, serverId: 'tasklist-server', input, execute: () => Promise.resolve({ success: true }) });
      }
      return executeRemoteToolInvocation({ capabilityType, capabilityId, name, serverId: 'tasklist-server', input, execute: () => Promise.resolve({ success: true }) });
    },
  };
}

export function resolveCapabilityContextInvocations(
  userGoal: string,
  skillDefinition?: SkillDefinition
): RemoteCapabilityInvocation[] {
  if (!skillDefinition || skillDefinition.skillId !== 'reader-skill') {
    return [];
  }
  
  const invocations: RemoteCapabilityInvocation[] = [];
  const candidates: Array<[RemoteCapabilityName, CapabilityType, boolean]> = [
    [LATEST_CONTEXT_RESOURCE_NAME, 'resource', matchesAny(userGoal, PROJECT_CONTEXT_PATTERNS)],
    [TASKLIST_DRAFT_PROMPT_NAME, 'prompt', matchesAny(userGoal, TASKLIST_DRAFT_PATTERNS)],
    [DOC_CONSISTENCY_TOOL_NAME, 'tool', matchesAny(userGoal, DOC_CONSISTENCY_PATTERNS)],
  ];
  
  for (const [name, capabilityType, matched] of candidates) {
    const identity = createRemoteCapabilityIdentity(name, capabilityType);
    
    if (matched && isRemoteCapabilityAllowed(skillDefinition, identity)) {
      invocations.push(createRemoteCapabilityInvocation(name, capabilityType, userGoal));
    }
  }
  
  return invocations;
}