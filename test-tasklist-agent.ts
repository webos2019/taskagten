import { HumanMessage } from '@langchain/core/messages';
import { orchestrateChat } from './lib/ai/runtime/chat-orchestrator';
import { ChatPromptTemplate } from '@langchain/core/prompts';

vi.mock('./lib/skill-registry', () => ({
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

vi.mock('./lib/ai/debug/timeout-detector', () => ({
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

vi.mock('./lib/deepseek', () => ({
  getDeepSeekModel: vi.fn().mockReturnValue({}),
}));

vi.mock('./lib/capability/context', () => ({
  resolveCapabilityContextInvocations: vi.fn().mockReturnValue([]),
}));

vi.mock('./lib/capability/local-context', () => ({
  resolveLocalCapabilityContextInvocations: vi.fn().mockReturnValue([]),
}));

vi.mock('./lib/capability/registry', () => ({
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

async function testTasklistAgent() {
  const chunks: any[] = [];
  
  const mockWriter = {
    writeChunk: (chunk: any) => {
      chunks.push(chunk);
      console.log(`[CHUNK] ${chunk.type}:`, chunk.type === 'text' ? chunk.content.substring(0, 100) + '...' : JSON.stringify(chunk).substring(0, 150));
    },
    close: () => console.log('[CLOSE] Stream closed'),
  };

  const mockSession = {
    getMessages: () => [new HumanMessage('测试任务清单')],
    getModel: () => ({}),
    getSystemPrompt: () => 'system prompt',
    getSkillId: () => 'test-skill',
    getComposerPayload: () => ({
      command: { name: 'tasklist', label: '生成任务清单' },
      plainText: '',
      references: [
        {
          id: 'v0.1.0',
          label: 'v0.1.0 受控版：版本方案到任务清单 Agent',
          uri: 'docs://versions/v0.1.0-controlled-version-plan-to-tasklist-agent.md',
          type: 'resource',
          source: 'remote',
        },
      ],
    }),
  };

  console.log('=== 开始测试 Tasklist Agent ===');
  console.log('输入: /tasklist + @docs://versions/v0.1.0-controlled-version-plan-to-tasklist-agent.md\n');

  await orchestrateChat(mockSession, mockWriter, {});

  console.log('\n=== 测试结果 ===');
  console.log(`总 chunks: ${chunks.length}`);
  
  const agentSteps = chunks.filter(c => c.type === 'agent-step-start' || c.type === 'agent-step-end');
  console.log(`Agent Step 事件: ${agentSteps.length}`);
  
  agentSteps.forEach((step, idx) => {
    console.log(`  ${idx + 1}. [${step.type}] ${step.title} - ${step.status || 'running'}`);
    if (step.summary) console.log(`     摘要: ${step.summary}`);
    if (step.durationMs) console.log(`     耗时: ${step.durationMs}ms`);
  });
  
  const textChunks = chunks.filter(c => c.type === 'text');
  console.log(`\n文本输出: ${textChunks.length} 段`);
  
  textChunks.forEach((text, idx) => {
    console.log(`\n--- 文本段 ${idx + 1} ---`);
    console.log(text.content);
  });
}

testTasklistAgent().catch(console.error);