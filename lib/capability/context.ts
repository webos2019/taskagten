import type { SkillDefinition, CapabilityType, CapabilityIdentity, CapabilityExecutionResult, RemoteCapabilityInvocation } from './types';
import { createCapabilityId } from './registry';

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
    serverId: 'project-assistant-service',
  };
}

async function executeRemoteResourceInvocation(invocation: RemoteCapabilityInvocation): Promise<CapabilityExecutionResult> {
  return {
    success: true,
    content: `[Mock Remote Resource] ${invocation.name}: 项目最新上下文信息（模拟数据）`,
    messageCount: 1,
    metadata: { resourceUri: invocation.input },
  };
}

async function executeRemotePromptInvocation(invocation: RemoteCapabilityInvocation): Promise<CapabilityExecutionResult> {
  return {
    success: true,
    content: `[Mock Remote Prompt] ${invocation.name}: 任务列表草稿模板已生成`,
    messageCount: 2,
    metadata: { promptInput: invocation.input },
  };
}

async function executeRemoteToolInvocation(invocation: RemoteCapabilityInvocation): Promise<CapabilityExecutionResult> {
  return {
    success: true,
    content: `[Mock Remote Tool] ${invocation.name} 执行结果：文档一致性检查通过，未发现明显不一致`,
    messageCount: 1,
    metadata: { toolInput: invocation.input },
  };
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
    serverId: 'project-assistant-service',
    input,
    execute: async () => {
      if (capabilityType === 'resource') {
        return executeRemoteResourceInvocation({ capabilityType, capabilityId, name, serverId: 'project-assistant-service', input, execute: () => Promise.resolve({ success: true }) });
      }
      if (capabilityType === 'prompt') {
        return executeRemotePromptInvocation({ capabilityType, capabilityId, name, serverId: 'project-assistant-service', input, execute: () => Promise.resolve({ success: true }) });
      }
      return executeRemoteToolInvocation({ capabilityType, capabilityId, name, serverId: 'project-assistant-service', input, execute: () => Promise.resolve({ success: true }) });
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