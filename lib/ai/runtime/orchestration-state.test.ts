import { describe, it, expect } from 'vitest';
import { createInitialState, applyStatePatch, createRoute } from './orchestration-state';
import type { OrchestrationState, StatePatch } from './orchestration-state';
import { HumanMessage, AIMessage, ToolMessage } from '@langchain/core/messages';

describe('orchestration-state.ts', () => {
  describe('createInitialState', () => {
    it('should create initial state with default values', () => {
      const messages: AIMessage[] = [new HumanMessage('test')];
      const state = createInitialState(messages);
      
      expect(state.currentNode).toBe('START');
      expect(state.visitedNodes).toEqual([]);
      expect(state.routes).toEqual([]);
      expect(state.statePatchSummaries).toEqual([]);
      expect(state.messages).toEqual(messages);
      expect(state.toolCallCount).toBe(0);
      expect(state.hasToolCalls).toBe(false);
      expect(state.hasAuthoritativeResult).toBe(false);
      expect(state.toolResults).toEqual([]);
      expect(state.executedToolResults).toEqual([]);
      expect(state.roundFailed).toBe(false);
      expect(state.chunks).toEqual([]);
      expect(state.recoveryAttempts).toBe(0);
      expect(state.lastError).toBeUndefined();
    });

    it('should create initial state with empty messages', () => {
      const state = createInitialState([]);
      
      expect(state.messages).toEqual([]);
      expect(state.currentNode).toBe('START');
    });
  });

  describe('applyStatePatch', () => {
    it('should replace currentNode', () => {
      const initialState = createInitialState([]);
      const patch: StatePatch = { currentNode: 'LLM_INVOKE' };
      
      const result = applyStatePatch(initialState, patch);
      
      expect(result.currentNode).toBe('LLM_INVOKE');
      expect(result.statePatchSummaries).toHaveLength(1);
      expect(result.statePatchSummaries[0].updates.currentNode).toBe('LLM_INVOKE');
    });

    it('should append visitedNodes', () => {
      const initialState = createInitialState([]);
      const patch: StatePatch = { visitedNodes: ['LLM_INVOKE'] };
      
      const result = applyStatePatch(initialState, patch);
      
      expect(result.visitedNodes).toEqual(['LLM_INVOKE']);
      expect(result.statePatchSummaries[0].updates.visitedNodes).toBe('+1');
    });

    it('should append to existing visitedNodes', () => {
      const initialState: OrchestrationState = {
        ...createInitialState([]),
        visitedNodes: ['START'],
      };
      const patch: StatePatch = { visitedNodes: ['LLM_INVOKE', 'TOOL_CALL_EXECUTION'] };
      
      const result = applyStatePatch(initialState, patch);
      
      expect(result.visitedNodes).toEqual(['START', 'LLM_INVOKE', 'TOOL_CALL_EXECUTION']);
    });

    it('should append routes', () => {
      const initialState = createInitialState([]);
      const route = createRoute('START', 'LLM_INVOKE', 'always');
      const patch: StatePatch = { routes: [route] };
      
      const result = applyStatePatch(initialState, patch);
      
      expect(result.routes).toEqual([route]);
      expect(result.statePatchSummaries[0].updates.routes).toBe('+1');
    });

    it('should append messages', () => {
      const initialMessage = new HumanMessage('hello');
      const initialState: OrchestrationState = {
        ...createInitialState([initialMessage]),
      };
      const newMessage = new AIMessage('hi');
      const patch: StatePatch = { messages: [newMessage] };
      
      const result = applyStatePatch(initialState, patch);
      
      expect(result.messages).toEqual([initialMessage, newMessage]);
      expect(result.statePatchSummaries[0].updates.messages).toBe('+1');
    });

    it('should replace toolCallCount', () => {
      const initialState: OrchestrationState = {
        ...createInitialState([]),
        toolCallCount: 0,
      };
      const patch: StatePatch = { toolCallCount: 1 };
      
      const result = applyStatePatch(initialState, patch);
      
      expect(result.toolCallCount).toBe(1);
      expect(result.statePatchSummaries[0].updates.toolCallCount).toBe('1');
    });

    it('should replace hasToolCalls', () => {
      const initialState = createInitialState([]);
      const patch: StatePatch = { hasToolCalls: true };
      
      const result = applyStatePatch(initialState, patch);
      
      expect(result.hasToolCalls).toBe(true);
      expect(result.statePatchSummaries[0].updates.hasToolCalls).toBe('true');
    });

    it('should replace hasAuthoritativeResult', () => {
      const initialState = createInitialState([]);
      const patch: StatePatch = { hasAuthoritativeResult: true };
      
      const result = applyStatePatch(initialState, patch);
      
      expect(result.hasAuthoritativeResult).toBe(true);
    });

    it('should append toolResults', () => {
      const initialState: OrchestrationState = {
        ...createInitialState([]),
        toolResults: [{ toolName: 'calculator', result: '100', isAuthoritative: false }],
      };
      const patch: StatePatch = { 
        toolResults: [{ toolName: 'get_weather', result: 'sunny', isAuthoritative: true }] 
      };
      
      const result = applyStatePatch(initialState, patch);
      
      expect(result.toolResults).toHaveLength(2);
      expect(result.toolResults[0].toolName).toBe('calculator');
      expect(result.toolResults[1].toolName).toBe('get_weather');
    });

    it('should append executedToolResults', () => {
      const initialState = createInitialState([]);
      const patch: StatePatch = { 
        executedToolResults: [{ toolCall: { name: 'calculator', arguments: {} }, result: '100', success: true }] 
      };
      
      const result = applyStatePatch(initialState, patch);
      
      expect(result.executedToolResults).toHaveLength(1);
    });

    it('should replace roundFailed', () => {
      const initialState = createInitialState([]);
      const patch: StatePatch = { roundFailed: true };
      
      const result = applyStatePatch(initialState, patch);
      
      expect(result.roundFailed).toBe(true);
    });

    it('should append chunks', () => {
      const initialState = createInitialState([]);
      const patch: StatePatch = { 
        chunks: [{ type: 'text', content: 'hello' }] 
      };
      
      const result = applyStatePatch(initialState, patch);
      
      expect(result.chunks).toHaveLength(1);
      expect(result.chunks[0].content).toBe('hello');
    });

    it('should replace recoveryAttempts', () => {
      const initialState: OrchestrationState = {
        ...createInitialState([]),
        recoveryAttempts: 0,
      };
      const patch: StatePatch = { recoveryAttempts: 1 };
      
      const result = applyStatePatch(initialState, patch);
      
      expect(result.recoveryAttempts).toBe(1);
    });

    it('should replace lastError', () => {
      const initialState = createInitialState([]);
      const error = new Error('test error');
      const patch: StatePatch = { lastError: error };
      
      const result = applyStatePatch(initialState, patch);
      
      expect(result.lastError).toBe(error);
      expect(result.statePatchSummaries[0].updates.lastError).toBe('test error');
    });

    it('should merge multiple updates in a single patch', () => {
      const initialState = createInitialState([]);
      const patch: StatePatch = {
        currentNode: 'TOOL_CALL_EXECUTION',
        visitedNodes: ['LLM_INVOKE', 'TOOL_CALL_EXECUTION'],
        hasToolCalls: true,
        roundFailed: false,
      };
      
      const result = applyStatePatch(initialState, patch);
      
      expect(result.currentNode).toBe('TOOL_CALL_EXECUTION');
      expect(result.visitedNodes).toEqual(['LLM_INVOKE', 'TOOL_CALL_EXECUTION']);
      expect(result.hasToolCalls).toBe(true);
      expect(result.roundFailed).toBe(false);
      expect(result.statePatchSummaries).toHaveLength(1);
      expect(Object.keys(result.statePatchSummaries[0].updates)).toHaveLength(4);
    });

    it('should not add summary when patch is empty', () => {
      const initialState = createInitialState([]);
      const patch: StatePatch = {};
      
      const result = applyStatePatch(initialState, patch);
      
      expect(result.statePatchSummaries).toEqual([]);
    });

    it('should preserve existing state when patch does not modify it', () => {
      const initialState: OrchestrationState = {
        ...createInitialState([new HumanMessage('hello')]),
        toolCallCount: 2,
        hasToolCalls: true,
      };
      const patch: StatePatch = { currentNode: 'DONE' };
      
      const result = applyStatePatch(initialState, patch);
      
      expect(result.toolCallCount).toBe(2);
      expect(result.hasToolCalls).toBe(true);
      expect(result.messages).toHaveLength(1);
    });
  });

  describe('createRoute', () => {
    it('should create a route entry with fromNode and toNode', () => {
      const route = createRoute('START', 'LLM_INVOKE', 'always');
      
      expect(route.fromNode).toBe('START');
      expect(route.toNode).toBe('LLM_INVOKE');
      expect(route.condition).toBe('always');
      expect(typeof route.timestamp).toBe('number');
    });

    it('should create a route entry without condition', () => {
      const route = createRoute('LLM_INVOKE', 'DONE');
      
      expect(route.fromNode).toBe('LLM_INVOKE');
      expect(route.toNode).toBe('DONE');
      expect(route.condition).toBeUndefined();
    });
  });
});