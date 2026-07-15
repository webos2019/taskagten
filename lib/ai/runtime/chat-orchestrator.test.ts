import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HumanMessage } from '@langchain/core/messages';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { orchestrateChat, orchestrateChatWithLangGraph } from './chat-orchestrator';
import { stepExecutors } from './orchestration-steps';
import { executeTool } from './tool-runtime';

vi.mock('./tool-runtime', () => ({
  executeTool: vi.fn(),
}));

vi.mock('@/lib/skill-registry', () => ({
  skillRegistry: {
    get: vi.fn().mockReturnValue({
      toCapabilityDefinition: vi.fn().mockReturnValue(null),
      isCapabilityAllowed: vi.fn().mockReturnValue(true),
    }),
  },
}));

vi.mock('@/lib/ai/debug/timeout-detector', () => ({
  withTimeout: vi.fn(async (_, promise) => await promise),
}));

vi.mock('@langchain/core/prompts', () => ({
  ChatPromptTemplate: {
    fromMessages: vi.fn().mockReturnValue({
      pipe: vi.fn().mockReturnValue({
        invoke: vi.fn().mockResolvedValue({ content: '' }),
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
  },
}));

describe('chat-orchestrator.ts', () => {
  let mockWriter: { writeChunk: vi.Mock; close: vi.Mock };
  let mockSession: any;

  beforeEach(() => {
    mockWriter = {
      writeChunk: vi.fn(),
      close: vi.fn(),
    };

    mockSession = {
      getMessages: vi.fn().mockReturnValue([new HumanMessage('hello')]),
      getModel: vi.fn().mockReturnValue({}),
      getSystemPrompt: vi.fn().mockReturnValue('system prompt'),
      getSkillId: vi.fn().mockReturnValue('test-skill'),
    };

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should complete orchestration successfully with direct answer', async () => {
    vi.mocked(ChatPromptTemplate.fromMessages).mockReturnValue({
      pipe: vi.fn().mockReturnValue({
        invoke: vi.fn().mockResolvedValue({ content: 'hello world' }),
      }),
    } as any);

    await orchestrateChat(mockSession, mockWriter, {});

    expect(mockWriter.writeChunk).toHaveBeenCalled();
    expect(mockWriter.close).toHaveBeenCalled();
  });

  it('should retry once and then succeed', async () => {
    let callCount = 0;
    vi.mocked(ChatPromptTemplate.fromMessages).mockReturnValue({
      pipe: vi.fn().mockReturnValue({
        invoke: vi.fn().mockImplementation(async () => {
          callCount++;
          if (callCount === 1) {
            throw new Error('temporary error');
          }
          return { content: 'recovered successfully' };
        }),
      }),
    } as any);

    vi.useFakeTimers();
    const promise = orchestrateChat(mockSession, mockWriter, {});
    
    await vi.advanceTimersByTimeAsync(2000);
    await promise;
    
    vi.useRealTimers();

    expect(callCount).toBe(2);
    expect(mockWriter.writeChunk).toHaveBeenCalled();
    expect(mockWriter.close).toHaveBeenCalled();
  });

  it('should exhaust retries and execute fallback', async () => {
    vi.mocked(ChatPromptTemplate.fromMessages).mockReturnValue({
      pipe: vi.fn().mockReturnValue({
        invoke: vi.fn().mockRejectedValue(new Error('persistent error')),
      }),
    } as any);

    vi.useFakeTimers();
    const promise = orchestrateChat(mockSession, mockWriter, {});
    
    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(4000);
    await vi.advanceTimersByTimeAsync(6000);
    await promise;
    
    vi.useRealTimers();

    expect(mockWriter.writeChunk).toHaveBeenCalled();
    expect(mockWriter.close).toHaveBeenCalled();
  });

  it('should handle fallback execution failure', async () => {
    vi.mocked(ChatPromptTemplate.fromMessages).mockReturnValue({
      pipe: vi.fn().mockReturnValue({
        invoke: vi.fn().mockRejectedValue(new Error('persistent error')),
      }),
    } as any);

    const originalFallback = stepExecutors.FALLBACK;
    stepExecutors.FALLBACK = vi.fn().mockRejectedValue(new Error('fallback error'));

    vi.useFakeTimers();
    const promise = orchestrateChat(mockSession, mockWriter, {});
    
    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(4000);
    await vi.advanceTimersByTimeAsync(6000);
    await promise;
    
    vi.useRealTimers();

    stepExecutors.FALLBACK = originalFallback;

    expect(mockWriter.writeChunk).toHaveBeenCalled();
    expect(mockWriter.close).toHaveBeenCalled();
  });

  it('should handle clientIP in context', async () => {
    vi.mocked(ChatPromptTemplate.fromMessages).mockReturnValue({
      pipe: vi.fn().mockReturnValue({
        invoke: vi.fn().mockResolvedValue({ content: 'hello world' }),
      }),
    } as any);

    await orchestrateChat(mockSession, mockWriter, { clientIP: '192.168.1.1' });

    expect(mockWriter.writeChunk).toHaveBeenCalled();
    expect(mockWriter.close).toHaveBeenCalled();
  });

  it('should handle multiple retry attempts correctly', async () => {
    let callCount = 0;
    vi.mocked(ChatPromptTemplate.fromMessages).mockReturnValue({
      pipe: vi.fn().mockReturnValue({
        invoke: vi.fn().mockImplementation(async () => {
          callCount++;
          if (callCount <= 3) {
            throw new Error(`attempt ${callCount} failed`);
          }
          return { content: 'finally succeeded' };
        }),
      }),
    } as any);

    vi.useFakeTimers();
    const promise = orchestrateChat(mockSession, mockWriter, {});
    
    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(4000);
    await vi.advanceTimersByTimeAsync(6000);
    await promise;
    
    vi.useRealTimers();

    expect(callCount).toBe(4);
    expect(mockWriter.writeChunk).toHaveBeenCalled();
    expect(mockWriter.close).toHaveBeenCalled();
  });

  it('should complete with no content response', async () => {
    vi.mocked(ChatPromptTemplate.fromMessages).mockReturnValue({
      pipe: vi.fn().mockReturnValue({
        invoke: vi.fn().mockResolvedValue({ content: null }),
      }),
    } as any);

    await orchestrateChat(mockSession, mockWriter, {});

    expect(mockWriter.writeChunk).toHaveBeenCalled();
    expect(mockWriter.close).toHaveBeenCalled();
  });
});

describe('chat-orchestrator.ts (LangGraph)', () => {
  let mockWriter: { writeChunk: vi.Mock; close: vi.Mock };
  let mockSession: any;

  beforeEach(() => {
    mockWriter = {
      writeChunk: vi.fn(),
      close: vi.fn(),
    };

    mockSession = {
      getMessages: vi.fn().mockReturnValue([new HumanMessage('hello')]),
      getModel: vi.fn().mockReturnValue({}),
      getSystemPrompt: vi.fn().mockReturnValue('system prompt'),
      getSkillId: vi.fn().mockReturnValue('test-skill'),
    };

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should complete LangGraph orchestration successfully with direct answer', async () => {
    vi.mocked(ChatPromptTemplate.fromMessages).mockReturnValue({
      pipe: vi.fn().mockReturnValue({
        invoke: vi.fn().mockResolvedValue({ content: 'hello world' }),
      }),
    } as any);

    await orchestrateChatWithLangGraph(mockSession, mockWriter, {});

    expect(mockWriter.writeChunk).toHaveBeenCalled();
    expect(mockWriter.close).toHaveBeenCalled();
  });

  it('should handle tool calls in response with LangGraph', async () => {
    vi.mocked(ChatPromptTemplate.fromMessages).mockReturnValue({
      pipe: vi.fn().mockReturnValue({
        invoke: vi.fn().mockResolvedValue({
          content: null,
          tool_calls: [{ name: 'search', args: { query: 'test' } }],
        }),
      }),
    } as any);

    vi.mocked(executeTool).mockResolvedValue({
      chunks: [],
      messages: [],
      toolResults: [{ toolName: 'search', result: 'tool result', isAuthoritative: true }],
      failedToolCalls: [],
      hasAuthoritativeResult: true,
      roundFailed: false,
    });

    await orchestrateChatWithLangGraph(mockSession, mockWriter, {});

    expect(mockWriter.close).toHaveBeenCalled();
  });

  it('should complete weather query flow with LangGraph', async () => {
    mockSession.getMessages = vi.fn().mockReturnValue([new HumanMessage('北京今天天气怎么样')]);

    vi.mocked(ChatPromptTemplate.fromMessages).mockReturnValue({
      pipe: vi.fn().mockReturnValue({
        invoke: vi.fn().mockResolvedValue({
          content: null,
          tool_calls: [{ id: 'call_123', name: 'get_weather', args: { city: '北京' } }],
        }),
      }),
    } as any);

    vi.mocked(executeTool).mockResolvedValue({
      chunks: [],
      messages: [],
      toolResults: [{ toolName: 'get_weather', result: '{"city":"北京","weather":"晴朗","temp":"25-32°C"}', isAuthoritative: true }],
      failedToolCalls: [],
      hasAuthoritativeResult: true,
      roundFailed: false,
    });

    await orchestrateChatWithLangGraph(mockSession, mockWriter, {});

    expect(mockWriter.writeChunk).toHaveBeenCalled();
    expect(mockWriter.close).toHaveBeenCalled();
  });
});

