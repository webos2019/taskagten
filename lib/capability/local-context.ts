import type { SkillDefinition, CapabilityType, CapabilityIdentity, CapabilityExecutionResult, ExecutedToolResult } from './types';
import { createCapabilityId } from './registry';
import { LOCAL_FILE_SUMMARY_PROMPT_NAME, LOCAL_FILE_SUMMARY_SERVER_ID, resolvePromptContextInvocation } from './prompt-context';
import { mcpClientManager } from '@/lib/mcp/manager';

const PROJECT_FILES_SERVER_ID = 'project-files-server';

export interface LocalCapabilityInvocation {
  capabilityType: CapabilityType;
  capabilityId: string;
  name: string;
  serverId?: string;
  input: string;
  execute: (options?: { writer?: unknown; lifecycle?: unknown }) => Promise<CapabilityExecutionResult>;
}

function isLocalCapabilityAllowed(skillDefinition: SkillDefinition, identity: CapabilityIdentity): boolean {
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

function createLocalCapabilityIdentity(name: string, capabilityType: CapabilityType, serverId?: string): CapabilityIdentity {
  return {
    name,
    capabilityType,
    providerKind: 'mcp',
    location: 'local',
    serverId,
  };
}

async function executeLocalResourceInvocation(invocation: LocalCapabilityInvocation): Promise<CapabilityExecutionResult> {
  try {
    const resourceResult = await mcpClientManager.readResource(PROJECT_FILES_SERVER_ID, invocation.input);
    const contentsArray = resourceResult.contents as Array<{ uri: string; text?: string; blob?: string }>;
    const resourceItem = contentsArray?.[0];
    
    if (!resourceItem) {
      return {
        success: false,
        error: '读取资源失败：没有返回可用内容',
      };
    }
    
    const textContent = resourceItem.text || '';
    
    if (!textContent && !resourceItem.blob) {
      return {
        success: false,
        error: '读取资源失败：没有返回可用文本内容',
      };
    }
    
    return {
      success: true,
      content: textContent,
      messageCount: 1,
      metadata: { resourceUri: invocation.input },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : '读取资源失败',
    };
  }
}

async function executeLocalPromptInvocation(invocation: LocalCapabilityInvocation, executedToolResults: ExecutedToolResult[]): Promise<CapabilityExecutionResult> {
  const promptInvocation = resolvePromptContextInvocation(invocation.input, executedToolResults);
  
  if (!promptInvocation) {
    return {
      success: false,
      error: '未找到匹配的 Prompt',
    };
  }
  
  const result = await promptInvocation.execute();
  
  return result.result;
}

function createLocalCapabilityInvocation(
  name: string,
  capabilityType: CapabilityType,
  input: string,
  serverId?: string,
  executedToolResults: ExecutedToolResult[] = []
): LocalCapabilityInvocation {
  const identity = createLocalCapabilityIdentity(name, capabilityType, serverId);
  const capabilityId = createCapabilityId(identity);
  
  return {
    capabilityType,
    capabilityId,
    name,
    serverId,
    input,
    execute: async () => {
      if (capabilityType === 'resource') {
        return executeLocalResourceInvocation({ capabilityType, capabilityId, name, serverId, input, execute: () => Promise.resolve({ success: true }) });
      }
      if (capabilityType === 'prompt') {
        return executeLocalPromptInvocation({ capabilityType, capabilityId, name, serverId, input, execute: () => Promise.resolve({ success: true }) }, executedToolResults);
      }
      return {
        success: false,
        error: '本地 Tool 能力通过 tool-runtime.ts 执行',
      };
    },
  };
}

export function resolveLocalCapabilityContextInvocations(
  userGoal: string,
  skillDefinition?: SkillDefinition,
  executedToolResults: ExecutedToolResult[] = []
): LocalCapabilityInvocation[] {
  if (!skillDefinition || skillDefinition.skillId !== 'reader-skill') {
    return [];
  }
  
  const invocations: LocalCapabilityInvocation[] = [];
  
  const summaryPatterns = ['总结', '摘要', '提炼', '概括', 'summarize', 'summary', 'abstract'];
  const needsSummary = summaryPatterns.some(pattern => userGoal.toLowerCase().includes(pattern.toLowerCase()));
  
  if (needsSummary && executedToolResults.length > 0) {
    const identity = createLocalCapabilityIdentity(LOCAL_FILE_SUMMARY_PROMPT_NAME, 'prompt', LOCAL_FILE_SUMMARY_SERVER_ID);
    
    if (isLocalCapabilityAllowed(skillDefinition, identity)) {
      invocations.push(createLocalCapabilityInvocation(
        LOCAL_FILE_SUMMARY_PROMPT_NAME,
        'prompt',
        userGoal,
        LOCAL_FILE_SUMMARY_SERVER_ID,
        executedToolResults
      ));
    }
  }
  
  return invocations;
}