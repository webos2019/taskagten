import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { executeTool, registerHandler } from './executor';
import type { ToolCall, ToolExecutionContext, ToolHandler } from './types';
import { capabilityRegistry, createCapabilityId } from '@/lib/capability/registry';
import { toolRegistry } from '@/lib/tools';
import { weatherToolAdapter } from '@/lib/mcp/adapters';

vi.mock('@/lib/capability/registry', () => ({
  capabilityRegistry: {
    get: vi.fn(),
  },
  createCapabilityId: vi.fn().mockReturnValue('test-capability-id'),
}));

vi.mock('@/lib/tools', () => ({
  toolRegistry: {
    validate: vi.fn(),
    execute: vi.fn(),
    get: vi.fn(),
  },
}));

vi.mock('@/lib/mcp/adapters', () => ({
  weatherToolAdapter: vi.fn(),
}));

describe('executor.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('executeTool', () => {
    it('should return failure when capability is unavailable', async () => {
      const mockCapability = { availability: 'unavailable' as const };
      (capabilityRegistry.get as vi.Mock).mockReturnValue(mockCapability);

      const toolCall: ToolCall = {
        id: 'test-1',
        name: 'get_weather',
        args: { city: '北京' },
      };

      const result = await executeTool(toolCall, {});

      expect(result.roundFailed).toBe(true);
      expect(result.hasAuthoritativeResult).toBe(false);
      expect(result.failedToolCalls).toHaveLength(1);
      expect(result.failedToolCalls[0].toolName).toBe('get_weather');
      expect(result.failedToolCalls[0].error).toBe('能力不可用');
      expect(result.chunks).toHaveLength(2);
    });

    it('should use registered handler when available', async () => {
      (capabilityRegistry.get as vi.Mock).mockReturnValue(null);

      const mockHandler: ToolHandler = vi.fn().mockResolvedValue({
        chunks: [],
        messages: [],
        toolResults: [{ toolName: 'custom_tool', result: 'custom result', isAuthoritative: true }],
        failedToolCalls: [],
        hasAuthoritativeResult: true,
        roundFailed: false,
      });

      registerHandler('custom_tool', mockHandler);

      const toolCall: ToolCall = {
        id: 'test-2',
        name: 'custom_tool',
        args: { foo: 'bar' },
      };

      const result = await executeTool(toolCall, {});

      expect(mockHandler).toHaveBeenCalledWith('test-2', { foo: 'bar' }, {});
      expect(result.roundFailed).toBe(false);
      expect(result.hasAuthoritativeResult).toBe(true);
      expect(result.toolResults).toHaveLength(1);
      expect(result.toolResults[0].toolName).toBe('custom_tool');
    });

    it('should execute default tool when no handler registered', async () => {
      (capabilityRegistry.get as vi.Mock).mockReturnValue(null);
      (toolRegistry.validate as vi.Mock).mockReturnValue({ valid: true });
      (toolRegistry.execute as vi.Mock).mockResolvedValue(JSON.stringify({ result: 'default result' }));
      (toolRegistry.get as vi.Mock).mockReturnValue({ resultIsAuthoritative: false });

      const toolCall: ToolCall = {
        id: 'test-3',
        name: 'calculator',
        args: { expression: '1+1' },
      };

      const result = await executeTool(toolCall, {});

      expect(toolRegistry.validate).toHaveBeenCalledWith('calculator', { expression: '1+1' });
      expect(toolRegistry.execute).toHaveBeenCalledWith('calculator', { expression: '1+1' }, { clientIP: undefined });
      expect(result.roundFailed).toBe(false);
      expect(result.toolResults).toHaveLength(1);
    });

    it('should fail when default tool validation fails', async () => {
      (capabilityRegistry.get as vi.Mock).mockReturnValue(null);
      (toolRegistry.validate as vi.Mock).mockReturnValue({
        valid: false,
        errors: [{ field: 'expression', message: '必填字段' }],
      });

      const toolCall: ToolCall = {
        id: 'test-4',
        name: 'calculator',
        args: {},
      };

      const result = await executeTool(toolCall, {});

      expect(result.roundFailed).toBe(true);
      expect(result.failedToolCalls).toHaveLength(1);
      expect(result.failedToolCalls[0].toolName).toBe('calculator');
    });

    it('should trigger weather query after get_location', async () => {
      (capabilityRegistry.get as vi.Mock).mockReturnValue(null);
      (toolRegistry.validate as vi.Mock).mockReturnValue({ valid: true });
      (toolRegistry.execute as vi.Mock).mockResolvedValue(JSON.stringify({ city: '北京', country: '中国' }));
      (toolRegistry.get as vi.Mock).mockReturnValue({ resultIsAuthoritative: false });

      vi.mocked(weatherToolAdapter).mockResolvedValue({
        outputText: '北京天气晴朗，25度',
        source: 'mcp',
        serverId: 'weather-server',
      });

      const toolCall: ToolCall = {
        id: 'test-5',
        name: 'get_location',
        args: {},
      };

      const result = await executeTool(toolCall, {});

      expect(result.toolResults).toHaveLength(2);
      expect(result.toolResults[0].toolName).toBe('get_location');
      expect(result.toolResults[1].toolName).toBe('get_weather');
      expect(result.hasAuthoritativeResult).toBe(true);
    });

    it('should not trigger weather query when get_location fails', async () => {
      (capabilityRegistry.get as vi.Mock).mockReturnValue(null);
      (toolRegistry.validate as vi.Mock).mockReturnValue({ valid: true });
      (toolRegistry.execute as vi.Mock).mockResolvedValue(JSON.stringify({ error: '获取位置失败' }));
      (toolRegistry.get as vi.Mock).mockReturnValue({ resultIsAuthoritative: false });

      const weatherAdapter = vi.mocked(weatherToolAdapter);

      const toolCall: ToolCall = {
        id: 'test-6',
        name: 'get_location',
        args: {},
      };

      const result = await executeTool(toolCall, {});

      expect(weatherAdapter).not.toHaveBeenCalled();
      expect(result.toolResults).toHaveLength(1);
      expect(result.toolResults[0].toolName).toBe('get_location');
    });
  });
});