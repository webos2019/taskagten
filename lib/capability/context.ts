import type { SkillDefinition, CapabilitySelector, RemoteCapabilityInvocation, CapabilityType, CapabilityIdentity } from './types';
import { createCapabilityId } from './registry';

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

function createRemoteCapabilityIdentity(name: string, capabilityType: CapabilityType): CapabilityIdentity {
  return {
    name,
    capabilityType,
    providerKind: 'mcp',
    location: 'remote',
    serverId: 'project-assistant-service',
  };
}

function createRemoteCapabilityInvocation(
  name: string,
  capabilityType: CapabilityType,
  userGoal: string
): RemoteCapabilityInvocation {
  const identity = createRemoteCapabilityIdentity(name, capabilityType);
  const capabilityId = createCapabilityId(identity);
  
  return {
    capabilityType,
    capabilityId,
    name,
    serverId: 'project-assistant-service',
    input: capabilityType === 'resource' ? 'project://latest-context' : `goal=${userGoal}`,
    execute: async () => {
      return {
        success: true,
        content: `[Mock] ${name} 执行结果: ${userGoal.substring(0, 50)}...`,
        messageCount: 1,
      };
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
  const candidates: Array<[string, CapabilityType, boolean]> = [
    ['project://latest-context', 'resource', matchesAny(userGoal, PROJECT_CONTEXT_PATTERNS)],
    ['tasklist-draft', 'prompt', matchesAny(userGoal, TASKLIST_DRAFT_PATTERNS)],
    ['check_doc_consistency', 'tool', matchesAny(userGoal, DOC_CONSISTENCY_PATTERNS)],
  ];
  
  for (const [name, capabilityType, matched] of candidates) {
    const identity = createRemoteCapabilityIdentity(name, capabilityType);
    
    if (matched && isRemoteCapabilityAllowed(skillDefinition, identity)) {
      invocations.push(createRemoteCapabilityInvocation(name, capabilityType, userGoal));
    }
  }
  
  return invocations;
}