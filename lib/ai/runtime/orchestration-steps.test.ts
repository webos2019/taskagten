import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { executeToolCallExecutionStep, executeLLMInvokeStep, executeCheckToolResultsStep, stepExecutors, parseToolCalls } from './orchestration-steps';
import { createInitialState } from './orchestration-state';
import type { OrchestrationState, StepOperationOptions } from './orchestration-steps';
import { createToolCallChunk, createToolResultChunk, createTextChunk } from '@/lib/ai/stream';
import { executeTool } from './tool-runtime';
import { skillRegistry } from '@/lib/skill-registry';
import { withTimeout } from '@/lib/ai/debug/timeout-detector';
import { getDeepSeekModel } from '@/lib/deepseek';

vi.mock('./tool-runtime', () => ({
  executeTool: vi.fn(),
}));

vi.mock('@/lib/skill-registry', () => ({
  skillRegistry: {
    get: vi.fn(),
  },
}));

vi.mock('@/lib/ai/debug/timeout-detector', () => ({
  withTimeout: vi.fn(async (_, promise) => await promise),
}));

vi.mock('@/lib/deepseek', () => ({
  getDeepSeekModel: vi.fn().mockReturnValue({}),
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

vi.mock('@/lib/capability/context', () => ({
  resolveCapabilityContextInvocations: vi.fn().mockReturnValue([]),
}));

vi.mock('@/lib/capability/local-context', () => ({
  resolveLocalCapabilityContextInvocations: vi.fn().mockReturnValue([]),
}));

vi.mock('@/lib/capability/registry', () => ({
  capabilityRegistry: {
    get: vi.fn(),
  },
}));

describe('orchestration-steps.ts', () => {
  let mockSession: any;
  let mockLifecycle: any;
  let stepOptions: StepOperationOptions;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockSession = {
      getSkillId: vi.fn().mockReturnValue('utility-skill'),
      getModel: vi.fn().mockReturnValue({
        pipe: vi.fn().mockReturnValue({
          invoke: vi.fn(),
        }),
      }),
      getSystemPrompt: vi.fn().mockReturnValue('system prompt'),
      getMessages: vi.fn().mockReturnValue([]),
    };

    mockLifecycle = {
      writeChunk: vi.fn(),
      emitDoneOnce: vi.fn(),
    };

    stepOptions = {
      session: mockSession,
      lifecycle: mockLifecycle,
      context: { clientIP: '127.0.0.1' },
    };
  });

  describe('executeToolCallExecutionStep', () => {
    it('should return CHECK_TOOL_RESULTS when tool calls exceed limit', async () => {
      const state: OrchestrationState = {
        ...createInitialState([]),
        toolCallCount: 5,
      };

      const result = await executeToolCallExecutionStep(state, stepOptions);

      expect(result.currentNode).toBe('CHECK_TOOL_RESULTS');
      expect(result.visitedNodes).toEqual(['CHECK_TOOL_RESULTS']);
    });

    it('should return CHECK_TOOL_RESULTS when no tool calls in message', async () => {
      const state: OrchestrationState = {
        ...createInitialState([]),
        messages: [new AIMessage('no tool calls here')],
      };

      const result = await executeToolCallExecutionStep(state, stepOptions);

      expect(result.currentNode).toBe('CHECK_TOOL_RESULTS');
    });

    it('should execute allowed tool and return results', async () => {
      const skillMock = {
        isCapabilityAllowed: vi.fn().mockReturnValue(true),
      };
      (skillRegistry.get as vi.Mock).mockReturnValue(skillMock);

      const toolCallId = 'test-call-id';
      const mockToolResult = {
        chunks: [createToolCallChunk(toolCallId, 'calculator', { expression: '1+1' }), createToolResultChunk(toolCallId, 'calculator', '2')],
        messages: [new ToolMessage({ content: '2', tool_call_id: toolCallId })],
        toolResults: [{ toolName: 'calculator', result: '2', isAuthoritative: false }],
        failedToolCalls: [],
        hasAuthoritativeResult: false,
        roundFailed: false,
      };
      (executeTool as vi.Mock).mockResolvedValue(mockToolResult);

      const state: OrchestrationState = {
        ...createInitialState([]),
        messages: [new AIMessage(JSON.stringify({ tool_calls: [{ name: 'calculator', arguments: { expression: '1+1' } }] }))],
        toolCallCount: 0,
      };

      const result = await executeToolCallExecutionStep(state, stepOptions);

      expect(result.currentNode).toBe('CHECK_TOOL_RESULTS');
      expect(result.toolResults).toHaveLength(1);
      expect(result.toolResults[0].toolName).toBe('calculator');
      expect(result.roundFailed).toBe(false);
      expect(result.toolCallCount).toBe(1);
      expect(executeTool).toHaveBeenCalled();
    });

    it('should skip tool when not allowed by skill', async () => {
      const skillMock = {
        isCapabilityAllowed: vi.fn().mockReturnValue(false),
      };
      (skillRegistry.get as vi.Mock).mockReturnValue(skillMock);

      const state: OrchestrationState = {
        ...createInitialState([]),
        messages: [new AIMessage(JSON.stringify({ tool_calls: [{ name: 'unallowed_tool', arguments: {} }] }))],
      };

      const result = await executeToolCallExecutionStep(state, stepOptions);

      expect(result.currentNode).toBe('CHECK_TOOL_RESULTS');
      expect(result.toolResults).toHaveLength(0);
      expect(result.roundFailed).toBe(true);
      expect(mockLifecycle.writeChunk).toHaveBeenCalledWith(expect.objectContaining({ type: 'text' }));
    });

    it('should set roundFailed when tool execution fails', async () => {
      const skillMock = {
        isCapabilityAllowed: vi.fn().mockReturnValue(true),
      };
      (skillRegistry.get as vi.Mock).mockReturnValue(skillMock);

      (executeTool as vi.Mock).mockResolvedValue({
        chunks: [],
        messages: [],
        toolResults: [],
        failedToolCalls: [{ toolName: 'calculator', error: 'execution failed' }],
        hasAuthoritativeResult: false,
        roundFailed: true,
      });

      const state: OrchestrationState = {
        ...createInitialState([]),
        messages: [new AIMessage(JSON.stringify({ tool_calls: [{ name: 'calculator', arguments: { expression: '1+1' } }] }))],
      };

      const result = await executeToolCallExecutionStep(state, stepOptions);

      expect(result.roundFailed).toBe(true);
      expect(result.toolResults).toHaveLength(0);
    });

    it('should handle multiple tool calls', async () => {
      const skillMock = {
        isCapabilityAllowed: vi.fn().mockReturnValue(true),
      };
      (skillRegistry.get as vi.Mock).mockReturnValue(skillMock);

      (executeTool as vi.Mock).mockResolvedValue({
        chunks: [],
        messages: [],
        toolResults: [{ toolName: 'calculator', result: '10', isAuthoritative: false }],
        failedToolCalls: [],
        hasAuthoritativeResult: false,
        roundFailed: false,
      });

      const state: OrchestrationState = {
        ...createInitialState([]),
        messages: [new AIMessage(JSON.stringify({
          tool_calls: [
            { name: 'calculator', arguments: { expression: '5+5' } },
            { name: 'calculator', arguments: { expression: '3+3' } },
          ],
        }))],
        toolCallCount: 0,
      };

      const result = await executeToolCallExecutionStep(state, stepOptions);

      expect(executeTool).toHaveBeenCalledTimes(2);
      expect(result.toolCallCount).toBe(2);
      expect(result.toolResults).toHaveLength(2);
    });
  });

  describe('executeLLMInvokeStep', () => {
    it('should route to DIRECT_ANSWER when no tool calls and has content', async () => {
      const mockChainResult = { content: 'hello world' };
      vi.mocked(ChatPromptTemplate.fromMessages).mockReturnValue({
        pipe: vi.fn().mockReturnValue({
          invoke: vi.fn().mockResolvedValue(mockChainResult),
        }),
      } as any);

      const state: OrchestrationState = {
        ...createInitialState([new HumanMessage('hi')]),
      };

      const result = await executeLLMInvokeStep(state, stepOptions);

      expect(result.currentNode).toBe('DIRECT_ANSWER');
      expect(result.chunks).toHaveLength(1);
      expect(result.chunks[0].type).toBe('text');
      expect(result.chunks[0].content).toBe('hello world');
      expect(mockLifecycle.writeChunk).toHaveBeenCalled();
    });

    it('should route to DONE when no tool calls and no content', async () => {
      const mockChainResult = { content: null };
      vi.mocked(ChatPromptTemplate.fromMessages).mockReturnValue({
        pipe: vi.fn().mockReturnValue({
          invoke: vi.fn().mockResolvedValue(mockChainResult),
        }),
      } as any);

      const state: OrchestrationState = {
        ...createInitialState([new HumanMessage('hi')]),
      };

      const result = await executeLLMInvokeStep(state, stepOptions);

      expect(result.currentNode).toBe('DONE');
      expect(result.chunks).toBeUndefined();
    });

    it('should route to TOOL_CALL_EXECUTION when has tool calls', async () => {
      const mockChainResult = {
        content: JSON.stringify({ tool_calls: [{ name: 'calculator', arguments: { expression: '1+1' } }] }),
      };
      vi.mocked(ChatPromptTemplate.fromMessages).mockReturnValue({
        pipe: vi.fn().mockReturnValue({
          invoke: vi.fn().mockResolvedValue(mockChainResult),
        }),
      } as any);

      const state: OrchestrationState = {
        ...createInitialState([new HumanMessage('calculate 1+1')]),
      };

      const result = await executeLLMInvokeStep(state, stepOptions);

      expect(result.currentNode).toBe('TOOL_CALL_EXECUTION');
      expect(result.hasToolCalls).toBe(true);
      expect(result.roundFailed).toBe(false);
    });
  });

  describe('executeCheckToolResultsStep', () => {
    it('should route to CONSUME_LOCAL_CAPABILITY when roundFailed', async () => {
      const state: OrchestrationState = {
        ...createInitialState([]),
        roundFailed: true,
      };

      const result = await executeCheckToolResultsStep(state, stepOptions);

      expect(result.currentNode).toBe('CONSUME_LOCAL_CAPABILITY');
    });

    it('should route to CONSUME_LOCAL_CAPABILITY when tool calls exceed limit', async () => {
      const state: OrchestrationState = {
        ...createInitialState([]),
        roundFailed: false,
        toolCallCount: 5,
      };

      const result = await executeCheckToolResultsStep(state, stepOptions);

      expect(result.currentNode).toBe('CONSUME_LOCAL_CAPABILITY');
    });

    it('should route to LLM_INVOKE when success and under limit', async () => {
      const state: OrchestrationState = {
        ...createInitialState([]),
        roundFailed: false,
        toolCallCount: 0,
      };

      const result = await executeCheckToolResultsStep(state, stepOptions);

      expect(result.currentNode).toBe('LLM_INVOKE');
    });
  });

  describe('parseToolCalls', () => {
    it('should parse tool_calls from AIMessage tool_calls property', () => {
      const result = new AIMessage({
        content: '',
        tool_calls: [{ id: 'call-1', name: 'calculator', args: { expression: '1+1' } }],
      });

      const toolCalls = parseToolCalls(result);
      
      expect(toolCalls).toHaveLength(1);
      expect(toolCalls[0].id).toBe('call-1');
      expect(toolCalls[0].name).toBe('calculator');
      expect(toolCalls[0].args).toEqual({ expression: '1+1' });
    });

    it('should parse tool_calls from additional_kwargs', () => {
      const result = new AIMessage({
        content: '',
        additional_kwargs: {
          tool_calls: [{ id: 'call-2', function: { name: 'get_weather', arguments: JSON.stringify({ city: '北京' }) } }],
        },
      });

      const toolCalls = parseToolCalls(result);
      
      expect(toolCalls).toHaveLength(1);
      expect(toolCalls[0].name).toBe('get_weather');
      expect(toolCalls[0].args).toEqual({ city: '北京' });
    });

    it('should parse tool_calls from JSON content with function field', () => {
      const result = new AIMessage({
        content: JSON.stringify({ function: 'calculator', args: { expression: '2+2' } }),
      });

      const toolCalls = parseToolCalls(result);
      
      expect(toolCalls).toHaveLength(1);
      expect(toolCalls[0].name).toBe('calculator');
      expect(toolCalls[0].args).toEqual({ expression: '2+2' });
    });

    it('should parse tool_calls from JSON content with tool_calls array', () => {
      const result = new AIMessage({
        content: JSON.stringify({ tool_calls: [{ name: 'get_weather', arguments: { city: '上海' } }] }),
      });

      const toolCalls = parseToolCalls(result);
      
      expect(toolCalls).toHaveLength(1);
      expect(toolCalls[0].name).toBe('get_weather');
      expect(toolCalls[0].args).toEqual({ city: '上海' });
    });

    it('should return empty array when no tool calls found', () => {
      const result = new AIMessage({ content: 'just a text response' });
      
      const toolCalls = parseToolCalls(result);
      
      expect(toolCalls).toHaveLength(0);
    });

    it('should return empty array when JSON content is invalid', () => {
      const result = new AIMessage({ content: '{invalid json' });
      
      const toolCalls = parseToolCalls(result);
      
      expect(toolCalls).toHaveLength(0);
    });
  });

  describe('stepExecutors', () => {
    it('should have all node executors defined', () => {
      const nodes: Array<keyof typeof stepExecutors> = [
        'START',
        'CONSUME_REMOTE_CAPABILITY',
        'LLM_INVOKE',
        'TOOL_CALL_EXECUTION',
        'CHECK_TOOL_RESULTS',
        'CONSUME_LOCAL_CAPABILITY',
        'GENERATE_SUMMARY',
        'DIRECT_ANSWER',
        'FALLBACK',
        'DONE',
      ];

      nodes.forEach(node => {
        expect(stepExecutors[node]).toBeDefined();
        expect(typeof stepExecutors[node]).toBe('function');
      });
    });
  });
});