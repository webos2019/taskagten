import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/tools', () => ({
  toolRegistry: {
    execute: vi.fn(),
  },
}));

vi.mock('@/lib/mcp/adapters', () => ({
  weatherToolAdapter: vi.fn(),
}));

vi.mock('@/lib/ai/debug/timeout-detector', () => ({
  withTimeout: vi.fn(async (_name, promise) => await promise),
}));

import { getWeatherHandler } from './get-weather.handler';
import { toolRegistry } from '@/lib/tools';
import { weatherToolAdapter } from '@/lib/mcp/adapters';

const mockWeatherToolAdapter = weatherToolAdapter as vi.Mock;
const mockToolRegistryExecute = toolRegistry.execute as vi.Mock;

describe('get-weather.handler.ts', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should get weather successfully via local tool', async () => {
    mockToolRegistryExecute.mockResolvedValue(
      JSON.stringify({ city: '北京', temperature: 25, condition: '晴朗', humidity: 60 })
    );

    const result = await getWeatherHandler('test-call-id', { city: '北京' }, {});

    expect(mockToolRegistryExecute).toHaveBeenCalledWith('get_weather', { city: '北京' });
    expect(result.roundFailed).toBe(false);
    expect(result.hasAuthoritativeResult).toBe(true);
    expect(result.toolResults).toHaveLength(1);
    expect(result.toolResults[0].toolName).toBe('get_weather');

    const parsedResult = JSON.parse(result.toolResults[0].result);
    expect(parsedResult.city).toBe('北京');
    expect(parsedResult.temperature).toBe(25);
  });

  it('should verify mock works directly', async () => {
    const mockMCPResult = {
      action: 'current' as const,
      inputText: 'city=北京',
      outputText: '北京天气晴朗，25度',
      source: 'mcp' as const,
      serverId: 'weather-server',
      title: 'city-weather',
      toolName: 'city-weather',
    };
    mockWeatherToolAdapter.mockResolvedValue(mockMCPResult);
    
    const result = await weatherToolAdapter({ city: '北京' });
    expect(result).toEqual(mockMCPResult);
    expect(mockWeatherToolAdapter).toHaveBeenCalledWith({ city: '北京' });
  });

  it('should verify withTimeout mock works', async () => {
    const mockMCPResult = {
      action: 'current' as const,
      inputText: 'city=北京',
      outputText: '北京天气晴朗，25度',
      source: 'mcp' as const,
      serverId: 'weather-server',
      title: 'city-weather',
      toolName: 'city-weather',
    };
    mockWeatherToolAdapter.mockResolvedValue(mockMCPResult);

    const withTimeout = (await import('@/lib/ai/debug/timeout-detector')).withTimeout;
    
    const result = await withTimeout('test', weatherToolAdapter({ city: '北京' }), { timeoutMs: 1000 });
    expect(result).toEqual(mockMCPResult);
  });

  it('should fallback to MCP when local tool fails', async () => {
    mockToolRegistryExecute.mockResolvedValue(
      JSON.stringify({ error: '本地工具调用失败' })
    );

    const mockMCPResult = {
      action: 'current' as const,
      inputText: 'city=北京',
      outputText: '北京天气晴朗，25度',
      source: 'mcp' as const,
      serverId: 'weather-server',
      title: 'city-weather',
      toolName: 'city-weather',
    };
    mockWeatherToolAdapter.mockResolvedValue(mockMCPResult);

    console.log('Before calling getWeatherHandler, mock results:', mockWeatherToolAdapter.mock.results);
    
    const result = await getWeatherHandler('test-call-id', { city: '北京' }, {});

    console.log('After calling getWeatherHandler, mock calls:', mockWeatherToolAdapter.mock.calls);
    console.log('After calling getWeatherHandler, mock results:', mockWeatherToolAdapter.mock.results);
    console.log('Result:', JSON.stringify(result, null, 2));

    expect(mockToolRegistryExecute).toHaveBeenCalledWith('get_weather', { city: '北京' });
    expect(mockWeatherToolAdapter).toHaveBeenCalledWith({ city: '北京' });
    expect(result.roundFailed).toBe(false);
    expect(result.hasAuthoritativeResult).toBe(true);

    const parsedResult = JSON.parse(result.toolResults[0].result);
    expect(parsedResult.message).toBe('北京天气晴朗，25度');
    expect(parsedResult.source).toBe('mcp');
  });

  it('should fail when both local and MCP fail', async () => {
    mockToolRegistryExecute.mockResolvedValue(
      JSON.stringify({ error: '本地工具调用失败' })
    );
    mockWeatherToolAdapter.mockRejectedValue(new Error('MCP服务不可用'));

    const result = await getWeatherHandler('test-call-id', { city: '北京' }, {});

    expect(mockToolRegistryExecute).toHaveBeenCalled();
    expect(mockWeatherToolAdapter).toHaveBeenCalled();
    expect(result.roundFailed).toBe(true);
    expect(result.failedToolCalls).toHaveLength(1);
    expect(result.failedToolCalls[0].toolName).toBe('get_weather');
  });

  it('should handle complete failure', async () => {
    mockToolRegistryExecute.mockRejectedValue(new Error('完全失败'));

    const result = await getWeatherHandler('test-call-id', { city: '北京' }, {});

    expect(result.roundFailed).toBe(true);
    expect(result.failedToolCalls).toHaveLength(1);
  });

  it('should handle missing city parameter', async () => {
    mockToolRegistryExecute.mockResolvedValue(
      JSON.stringify({ error: '城市参数不能为空' })
    );

    const result = await getWeatherHandler('test-call-id', {}, {});

    expect(mockToolRegistryExecute).toHaveBeenCalledWith('get_weather', {});
    expect(result.roundFailed).toBe(true);
  });
});