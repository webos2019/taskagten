import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HumanMessage } from '@langchain/core/messages';
import { orchestrateChat } from '@/lib/ai/runtime/chat-orchestrator';
import { resolveVersionPlanTasklistAgentInvocation, isVersionPlanReference } from './agent-entry';
import { validateTasklistStructure } from './validate-tasklist-structure';

vi.mock('@/lib/skill-registry', () => ({
  skillRegistry: {
    get: vi.fn().mockReturnValue({
      toCapabilityDefinition: vi.fn().mockReturnValue(null),
      isCapabilityAllowed: vi.fn().mockReturnValue(true),
      getOutputPolicy: vi.fn().mockReturnValue('concise-utility'),
    }),
    register: vi.fn().mockReturnThis(),
    list: vi.fn().mockReturnValue([]),
    listMeta: vi.fn().mockReturnValue([]),
    getDefault: vi.fn().mockReturnValue(undefined),
  },
}));

vi.mock('@/lib/ai/debug/timeout-detector', () => ({
  withTimeout: vi.fn(async (_, promise) => await promise),
}));

vi.mock('@langchain/core/prompts', () => ({
  ChatPromptTemplate: {
    fromMessages: vi.fn().mockReturnValue({
      pipe: vi.fn().mockReturnValue({
        invoke: vi.fn().mockResolvedValue({ content: '{}' }),
      }),
    }),
  },
  MessagesPlaceholder: vi.fn(),
}));

vi.mock('@/lib/deepseek', () => ({
  getDeepSeekModel: vi.fn().mockReturnValue({}),
}));

vi.mock('@/lib/capability/context', () => ({
  resolveCapabilityContextInvocations: vi.fn().mockReturnValue([]),
}));

vi.mock('@/lib/capability/local-context', () => ({
  resolveLocalCapabilityContextInvocations: vi.fn().mockReturnValue([]),
}));

vi.mock('@/lib/capability/registry', () => ({
  capabilityRegistry: {
    getAll: vi.fn().mockReturnValue([]),
    get: vi.fn().mockReturnValue(null),
    register: vi.fn(),
    clear: vi.fn(),
    list: vi.fn().mockReturnValue([]),
    size: 0,
  },
  createCapabilityId: vi.fn().mockReturnValue('test-capability-id'),
}));

describe('tasklist-agent', () => {
  describe('agent-entry.ts', () => {
    it('should return null when command is not tasklist', () => {
      const invocation = resolveVersionPlanTasklistAgentInvocation({
        messages: [],
        composer: {
          command: { name: 'summary', label: '总结文档' },
          plainText: 'test',
          references: [],
        },
      });

      expect(invocation).toBeNull();
    });

    it('should return missing-version-plan when tasklist command has no version plan reference', () => {
      const invocation = resolveVersionPlanTasklistAgentInvocation({
        messages: [],
        composer: {
          command: { name: 'tasklist', label: '生成任务清单' },
          plainText: 'test',
          references: [],
        },
      });

      expect(invocation).toEqual({ kind: 'missing-version-plan' });
    });

    it('should return missing-version-plan when tasklist command has wrong reference type', () => {
      const invocation = resolveVersionPlanTasklistAgentInvocation({
        messages: [],
        composer: {
          command: { name: 'tasklist', label: '生成任务清单' },
          plainText: 'test',
          references: [
            {
              id: '1',
              label: '文件',
              uri: 'project://test.txt',
              type: 'resource',
              source: 'local',
            },
          ],
        },
      });

      expect(invocation).toEqual({ kind: 'missing-version-plan' });
    });

    it('should return ready when tasklist command has valid version plan reference', () => {
      const reference = {
        id: '1',
        label: 'v0.1.0',
        uri: 'docs://versions/v0.1.0-test.md',
        type: 'resource' as const,
        source: 'remote' as const,
      };

      const invocation = resolveVersionPlanTasklistAgentInvocation({
        messages: [],
        composer: {
          command: { name: 'tasklist', label: '生成任务清单' },
          plainText: 'test',
          references: [reference],
        },
      });

      expect(invocation).toEqual({ kind: 'ready', versionPlanReference: reference });
    });

    it('should validate version plan reference pattern correctly', () => {
      expect(isVersionPlanReference({ uri: 'docs://versions/v0.1.0.md' } as any)).toBe(true);
      expect(isVersionPlanReference({ uri: 'docs://versions/v1.2.3-feature.md' } as any)).toBe(true);
      expect(isVersionPlanReference({ uri: 'docs://versions/test.md' } as any)).toBe(true);
      expect(isVersionPlanReference({ uri: 'docs://other/test.md' } as any)).toBe(false);
      expect(isVersionPlanReference({ uri: 'project://versions/test.md' } as any)).toBe(false);
      expect(isVersionPlanReference({ uri: 'docs://versions/' } as any)).toBe(false);
    });
  });

  describe('validate-tasklist-structure.ts', () => {
    it('should validate a complete tasklist structure', () => {
      const draft = `# v0.1.0 任务清单

## 来源版本方案
docs://versions/v0.1.0.md

## 步骤
1. 实现 Agent 入口控制
2. 添加结构校验工具
3. 实现自动修正机制

## 勾选项
- [ ] 入口控制测试通过
- [ ] 校验工具测试通过
- [ ] 修正机制测试通过

## 非目标
- 不做通用 Agent

## 风险与暂停点
- 风险：模型输出不稳定
- 暂停点：校验失败时需要人工确认

## 验证内容
所有测试用例通过`;

      const result = validateTasklistStructure(draft, 'docs://versions/v0.1.0.md');

      expect(result.isValid).toBe(true);
      expect(result.blockingIssues).toEqual([]);
      expect(result.structure.title).toBe('v0.1.0 任务清单');
      expect(result.structure.steps.length).toBe(3);
      expect(result.structure.checklistItems.length).toBe(3);
      expect(result.structure.hasAnyVerificationContent).toBe(true);
    });

    it('should detect missing title', () => {
      const draft = `## 步骤
1. 步骤1`;

      const result = validateTasklistStructure(draft, 'docs://versions/v0.1.0.md');

      expect(result.isValid).toBe(false);
      expect(result.blockingIssues).toContain('缺少标题或标题过短');
    });

    it('should detect missing steps', () => {
      const draft = `# 任务清单

## 勾选项
- [ ] 测试项`;

      const result = validateTasklistStructure(draft, 'docs://versions/v0.1.0.md');

      expect(result.isValid).toBe(false);
      expect(result.blockingIssues).toContain('缺少主要步骤');
    });

    it('should detect missing checklist', () => {
      const draft = `# 任务清单

## 步骤
1. 步骤1`;

      const result = validateTasklistStructure(draft, 'docs://versions/v0.1.0.md');

      expect(result.isValid).toBe(false);
      expect(result.blockingIssues).toContain('缺少勾选项清单');
    });

    it('should detect missing verification content', () => {
      const draft = `# 任务清单

## 步骤
1. 步骤1

## 勾选项
- [ ] 测试项`;

      const result = validateTasklistStructure(draft, 'docs://versions/v0.1.0.md');

      expect(result.isValid).toBe(false);
      expect(result.blockingIssues).toContain('缺少验证内容');
    });

    it('should generate warnings for incomplete structure', () => {
      const draft = `# 任务清单

## 步骤
1. 步骤1

## 勾选项
- [ ] 测试项

## 验证内容
测试通过`;

      const result = validateTasklistStructure(draft, 'docs://versions/v0.1.0.md');

      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('步骤数量较少，建议至少3个步骤');
      expect(result.warnings).toContain('1 个步骤缺少验收标准');
      expect(result.warnings).toContain('建议添加非目标说明');
      expect(result.warnings).toContain('建议识别关键风险');
    });
  });

  describe('orchestration integration', () => {
    let mockWriter: { writeChunk: vi.Mock; close: vi.Mock };

    beforeEach(() => {
      mockWriter = {
        writeChunk: vi.fn(),
        close: vi.fn(),
      };

      vi.clearAllMocks();
    });

    afterEach(() => {
      vi.clearAllMocks();
    });

    it('should trigger tasklist agent when composer has tasklist command and version plan reference', async () => {
      const mockModel = {
        invoke: vi.fn().mockResolvedValue({
          content: JSON.stringify({
            version: 'v0.1.0',
            goals: ['实现 Tasklist Agent', '入口控制'],
            nonGoals: ['不做通用 Agent'],
            keyChanges: ['添加运行时目录', '添加校验工具'],
            testPlan: ['单元测试', '集成测试'],
            deliverables: ['tasklist 草稿', '校验结论'],
          }),
        }),
      };
      const mockSession: any = {
        getMessages: vi.fn().mockReturnValue([new HumanMessage('test')]),
        getModel: vi.fn().mockReturnValue(mockModel),
        getSystemPrompt: vi.fn().mockReturnValue('system prompt'),
        getSkillId: vi.fn().mockReturnValue('test-skill'),
        getComposerPayload: vi.fn().mockReturnValue({
          command: { name: 'tasklist', label: '生成任务清单' },
          plainText: '',
          references: [
            {
              id: '1',
              label: 'v0.1.0',
              uri: 'docs://versions/v0.1.0-controlled-version-plan-to-tasklist-agent.md',
              type: 'resource',
              source: 'remote',
            },
          ],
        }),
      };

      await orchestrateChat(mockSession, mockWriter, {});

      expect(mockWriter.writeChunk).toHaveBeenCalled();
      expect(mockWriter.close).toHaveBeenCalled();

      const chunks = mockWriter.writeChunk.mock.calls.map((call) => call[0]);
      
      console.log('\n=== Agent Execution Output ===');
      chunks.forEach((chunk: any, idx: number) => {
        if (chunk.type === 'agent-step-start') {
          console.log(`[${idx}] 🟢 ${chunk.type}: ${chunk.title} (step ${chunk.stepIndex})`);
        } else if (chunk.type === 'agent-step-end') {
          console.log(`[${idx}] 🔴 ${chunk.type}: ${chunk.status} - ${chunk.summary || ''} (${chunk.durationMs}ms)`);
        } else if (chunk.type === 'text') {
          console.log(`[${idx}] 📝 ${chunk.type}: ${chunk.content.substring(0, 200)}${chunk.content.length > 200 ? '...' : ''}`);
        } else {
          console.log(`[${idx}] ⚪ ${chunk.type}`);
        }
      });

      const agentStepChunks = chunks.filter((chunk: any) => 
        chunk.type === 'agent-step-start' || chunk.type === 'agent-step-end'
      );
      
      expect(agentStepChunks.length).toBeGreaterThan(0);
      
      const textChunks = chunks.filter((chunk: any) => chunk.type === 'text');
      const hasTasklistContent = textChunks.some((chunk: any) => 
        chunk.content.includes('任务清单') || chunk.content.includes('tasklist')
      );
      
      expect(hasTasklistContent).toBe(true);
    });

    it('should show missing-version-plan message when tasklist command has no version plan', async () => {
      const mockSession: any = {
        getMessages: vi.fn().mockReturnValue([new HumanMessage('test')]),
        getModel: vi.fn().mockReturnValue({}),
        getSystemPrompt: vi.fn().mockReturnValue('system prompt'),
        getSkillId: vi.fn().mockReturnValue('test-skill'),
        getComposerPayload: vi.fn().mockReturnValue({
          command: { name: 'tasklist', label: '生成任务清单' },
          plainText: '',
          references: [],
        }),
      };

      await orchestrateChat(mockSession, mockWriter, {});

      expect(mockWriter.writeChunk).toHaveBeenCalled();
      expect(mockWriter.close).toHaveBeenCalled();

      const chunks = mockWriter.writeChunk.mock.calls.map((call) => call[0]);
      const textChunks = chunks.filter((chunk: any) => chunk.type === 'text');
      
      expect(textChunks.some((chunk: any) => 
        chunk.content.includes('请先通过 @ 引用')
      )).toBe(true);
    });

    it('should not trigger tasklist agent when composer is missing', async () => {
      const mockSession: any = {
        getMessages: vi.fn().mockReturnValue([new HumanMessage('hello')]),
        getModel: vi.fn().mockReturnValue({}),
        getSystemPrompt: vi.fn().mockReturnValue('system prompt'),
        getSkillId: vi.fn().mockReturnValue('test-skill'),
        getComposerPayload: vi.fn().mockReturnValue(undefined),
      };

      vi.mocked((await import('@langchain/core/prompts')).ChatPromptTemplate.fromMessages).mockReturnValue({
        pipe: vi.fn().mockReturnValue({
          invoke: vi.fn().mockResolvedValue({ content: 'hello world' }),
        }),
      } as any);

      await orchestrateChat(mockSession, mockWriter, {});

      expect(mockWriter.writeChunk).toHaveBeenCalled();
      expect(mockWriter.close).toHaveBeenCalled();
    });

    it('should not trigger tasklist agent when command is not tasklist', async () => {
      const mockSession: any = {
        getMessages: vi.fn().mockReturnValue([new HumanMessage('test')]),
        getModel: vi.fn().mockReturnValue({}),
        getSystemPrompt: vi.fn().mockReturnValue('system prompt'),
        getSkillId: vi.fn().mockReturnValue('test-skill'),
        getComposerPayload: vi.fn().mockReturnValue({
          command: { name: 'summary', label: '总结文档' },
          plainText: '',
          references: [
            {
              id: '1',
              label: 'v0.1.0',
              uri: 'docs://versions/v0.1.0.md',
              type: 'resource',
              source: 'remote',
            },
          ],
        }),
      };

      vi.mocked((await import('@langchain/core/prompts')).ChatPromptTemplate.fromMessages).mockReturnValue({
        pipe: vi.fn().mockReturnValue({
          invoke: vi.fn().mockResolvedValue({ content: 'hello world' }),
        }),
      } as any);

      await orchestrateChat(mockSession, mockWriter, {});

      expect(mockWriter.writeChunk).toHaveBeenCalled();
      expect(mockWriter.close).toHaveBeenCalled();
    });
  });
});