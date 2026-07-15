import { describe, it, expect, vi } from 'vitest';
import { determineNextNode, isTerminalNode, getAvailableRoutes } from './orchestration-router';
import { createInitialState } from './orchestration-state';
import type { OrchestrationState } from './orchestration-state';

vi.spyOn(console, 'log').mockImplementation(() => {});

describe('orchestration-router.ts', () => {
  describe('determineNextNode', () => {
    it('should route START -> CONSUME_REMOTE_CAPABILITY', () => {
      const state = createInitialState([]);
      const { nextNode, route } = determineNextNode(state);
      
      expect(nextNode).toBe('CONSUME_REMOTE_CAPABILITY');
      expect(route.condition).toBe('always');
    });

    it('should route CONSUME_REMOTE_CAPABILITY -> LLM_INVOKE', () => {
      const state: OrchestrationState = {
        ...createInitialState([]),
        currentNode: 'CONSUME_REMOTE_CAPABILITY',
      };
      const { nextNode, route } = determineNextNode(state);
      
      expect(nextNode).toBe('LLM_INVOKE');
      expect(route.condition).toBe('always');
    });

    it('should route LLM_INVOKE -> TOOL_CALL_EXECUTION when has tool calls', () => {
      const state: OrchestrationState = {
        ...createInitialState([]),
        currentNode: 'LLM_INVOKE',
        hasToolCalls: true,
        toolCallCount: 0,
      };
      const { nextNode, route } = determineNextNode(state);
      
      expect(nextNode).toBe('TOOL_CALL_EXECUTION');
      expect(route.condition).toBe('has_tool_calls_and_not_exceed_limit');
    });

    it('should route LLM_INVOKE -> DIRECT_ANSWER when no tool calls but has chunks', () => {
      const state: OrchestrationState = {
        ...createInitialState([]),
        currentNode: 'LLM_INVOKE',
        hasToolCalls: false,
        chunks: [{ type: 'text', content: 'hello' }],
      };
      const { nextNode, route } = determineNextNode(state);
      
      expect(nextNode).toBe('DIRECT_ANSWER');
      expect(route.condition).toBe('no_tool_calls_with_direct_answer');
    });

    it('should route LLM_INVOKE -> DONE when no tool calls and no chunks', () => {
      const state: OrchestrationState = {
        ...createInitialState([]),
        currentNode: 'LLM_INVOKE',
        hasToolCalls: false,
        chunks: [],
      };
      const { nextNode, route } = determineNextNode(state);
      
      expect(nextNode).toBe('DONE');
      expect(route.condition).toBe('no_tool_calls_no_content');
    });

    it('should route TOOL_CALL_EXECUTION -> CHECK_TOOL_RESULTS', () => {
      const state: OrchestrationState = {
        ...createInitialState([]),
        currentNode: 'TOOL_CALL_EXECUTION',
      };
      const { nextNode, route } = determineNextNode(state);
      
      expect(nextNode).toBe('CHECK_TOOL_RESULTS');
      expect(route.condition).toBe('always');
    });

    it('should route CHECK_TOOL_RESULTS -> GENERATE_SUMMARY when success with results', () => {
      const state: OrchestrationState = {
        ...createInitialState([]),
        currentNode: 'CHECK_TOOL_RESULTS',
        roundFailed: false,
        toolResults: [{ toolName: 'calculator', result: '100', isAuthoritative: false }],
      };
      const { nextNode, route } = determineNextNode(state);
      
      expect(nextNode).toBe('GENERATE_SUMMARY');
      expect(route.condition).toBe('success_has_results');
    });

    it('should route CHECK_TOOL_RESULTS -> LLM_INVOKE when success without results and under limit', () => {
      const state: OrchestrationState = {
        ...createInitialState([]),
        currentNode: 'CHECK_TOOL_RESULTS',
        roundFailed: false,
        toolResults: [],
        toolCallCount: 0,
      };
      const { nextNode, route } = determineNextNode(state);
      
      expect(nextNode).toBe('LLM_INVOKE');
      expect(route.condition).toBe('success_no_results_continue');
    });

    it('should route CHECK_TOOL_RESULTS -> CONSUME_LOCAL_CAPABILITY when round failed', () => {
      const state: OrchestrationState = {
        ...createInitialState([]),
        currentNode: 'CHECK_TOOL_RESULTS',
        roundFailed: true,
      };
      const { nextNode, route } = determineNextNode(state);
      
      expect(nextNode).toBe('CONSUME_LOCAL_CAPABILITY');
      expect(route.condition).toBe('failed_or_exceed_limit');
    });

    it('should route CHECK_TOOL_RESULTS -> CONSUME_LOCAL_CAPABILITY when tool calls exceed limit', () => {
      const state: OrchestrationState = {
        ...createInitialState([]),
        currentNode: 'CHECK_TOOL_RESULTS',
        roundFailed: false,
        toolCallCount: 5,
      };
      const { nextNode, route } = determineNextNode(state);
      
      expect(nextNode).toBe('CONSUME_LOCAL_CAPABILITY');
      expect(route.condition).toBe('failed_or_exceed_limit');
    });

    it('should route CONSUME_LOCAL_CAPABILITY -> GENERATE_SUMMARY when has tool calls and results', () => {
      const state: OrchestrationState = {
        ...createInitialState([]),
        currentNode: 'CONSUME_LOCAL_CAPABILITY',
        hasToolCalls: true,
        toolResults: [{ toolName: 'calculator', result: '100', isAuthoritative: false }],
      };
      const { nextNode, route } = determineNextNode(state);
      
      expect(nextNode).toBe('GENERATE_SUMMARY');
      expect(route.condition).toBe('has_tool_results');
    });

    it('should route CONSUME_LOCAL_CAPABILITY -> DONE when has tool calls but no results', () => {
      const state: OrchestrationState = {
        ...createInitialState([]),
        currentNode: 'CONSUME_LOCAL_CAPABILITY',
        hasToolCalls: true,
        toolResults: [],
      };
      const { nextNode, route } = determineNextNode(state);
      
      expect(nextNode).toBe('DONE');
      expect(route.condition).toBe('tool_calls_failed_no_results');
    });

    it('should route CONSUME_LOCAL_CAPABILITY -> DONE when no tool calls', () => {
      const state: OrchestrationState = {
        ...createInitialState([]),
        currentNode: 'CONSUME_LOCAL_CAPABILITY',
        hasToolCalls: false,
      };
      const { nextNode, route } = determineNextNode(state);
      
      expect(nextNode).toBe('DONE');
      expect(route.condition).toBe('no_tool_calls');
    });

    it('should route GENERATE_SUMMARY -> DONE', () => {
      const state: OrchestrationState = {
        ...createInitialState([]),
        currentNode: 'GENERATE_SUMMARY',
      };
      const { nextNode, route } = determineNextNode(state);
      
      expect(nextNode).toBe('DONE');
      expect(route.condition).toBe('always');
    });

    it('should route DIRECT_ANSWER -> DONE', () => {
      const state: OrchestrationState = {
        ...createInitialState([]),
        currentNode: 'DIRECT_ANSWER',
      };
      const { nextNode, route } = determineNextNode(state);
      
      expect(nextNode).toBe('DONE');
      expect(route.condition).toBe('always');
    });

    it('should route FALLBACK -> DONE', () => {
      const state: OrchestrationState = {
        ...createInitialState([]),
        currentNode: 'FALLBACK',
      };
      const { nextNode, route } = determineNextNode(state);
      
      expect(nextNode).toBe('DONE');
      expect(route.condition).toBe('always');
    });

    it('should route DONE -> DONE (terminal)', () => {
      const state: OrchestrationState = {
        ...createInitialState([]),
        currentNode: 'DONE',
      };
      const { nextNode, route } = determineNextNode(state);
      
      expect(nextNode).toBe('DONE');
      expect(route.condition).toBe('terminal');
    });

    it('should use default route when no conditional route matches', () => {
      const state: OrchestrationState = {
        ...createInitialState([]),
        currentNode: 'LLM_INVOKE',
        hasToolCalls: true,
        toolCallCount: 10,
      };
      const { nextNode, route } = determineNextNode(state);
      
      expect(nextNode).toBe('DONE');
      expect(route.condition).toBe('default');
    });
  });

  describe('isTerminalNode', () => {
    it('should return true for DONE', () => {
      expect(isTerminalNode('DONE')).toBe(true);
    });

    it('should return false for non-terminal nodes', () => {
      expect(isTerminalNode('START')).toBe(false);
      expect(isTerminalNode('LLM_INVOKE')).toBe(false);
      expect(isTerminalNode('TOOL_CALL_EXECUTION')).toBe(false);
      expect(isTerminalNode('GENERATE_SUMMARY')).toBe(false);
    });
  });

  describe('getAvailableRoutes', () => {
    it('should return available routes for a node', () => {
      const routes = getAvailableRoutes('CHECK_TOOL_RESULTS');
      
      expect(routes).toHaveLength(3);
      expect(routes).toContainEqual({ toNode: 'GENERATE_SUMMARY', conditionName: 'success_has_results' });
      expect(routes).toContainEqual({ toNode: 'LLM_INVOKE', conditionName: 'success_no_results_continue' });
      expect(routes).toContainEqual({ toNode: 'CONSUME_LOCAL_CAPABILITY', conditionName: 'failed_or_exceed_limit' });
    });

    it('should return empty array for unknown node', () => {
      const routes = getAvailableRoutes('UNKNOWN' as any);
      expect(routes).toHaveLength(0);
    });
  });
});