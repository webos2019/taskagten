import { describe, it, expect, vi, beforeEach } from 'vitest';
import { listDirectoryHandler } from './list-directory.handler';
import { listFilesAdapter } from '@/lib/mcp/adapters';

vi.mock('@/lib/mcp/adapters', () => ({
  listFilesAdapter: vi.fn(),
}));

describe('list-directory.handler.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should list files successfully', async () => {
    const mockResult = {
      outputText: JSON.stringify({
        files: [
          { name: 'package.json', type: 'file', size: 1500 },
          { name: 'README.md', type: 'file', size: 2000 },
          { name: 'src', type: 'directory' },
        ],
        count: 3,
      }),
      source: 'mcp',
      serverId: 'project-files-server',
    };

    (listFilesAdapter as vi.Mock).mockResolvedValue(mockResult);

    const result = await listDirectoryHandler('test-call-id', {}, {});

    expect(listFilesAdapter).toHaveBeenCalled();
    expect(result.roundFailed).toBe(false);
    expect(result.hasAuthoritativeResult).toBe(false);
    expect(result.toolResults).toHaveLength(1);
    expect(result.toolResults[0].toolName).toBe('list_directory');

    expect(result.chunks).toHaveLength(2);
    expect(result.chunks[0].type).toBe('tool_call');
    expect(result.chunks[1].type).toBe('tool_result');
  });

  it('should handle list files failure', async () => {
    (listFilesAdapter as vi.Mock).mockRejectedValue(new Error('获取文件列表失败'));

    const result = await listDirectoryHandler('test-call-id', {}, {});

    expect(listFilesAdapter).toHaveBeenCalled();
    expect(result.roundFailed).toBe(true);
    expect(result.failedToolCalls).toHaveLength(1);
    expect(result.failedToolCalls[0].toolName).toBe('list_directory');
    expect(result.failedToolCalls[0].error).toBe('获取文件列表失败');

    expect(result.chunks).toHaveLength(2);
    expect(result.chunks[0].type).toBe('tool_call');
    expect(result.chunks[1].type).toBe('tool_result');
  });

  it('should handle empty directory', async () => {
    const mockResult = {
      outputText: JSON.stringify({ files: [], count: 0 }),
      source: 'mcp',
      serverId: 'project-files-server',
    };

    (listFilesAdapter as vi.Mock).mockResolvedValue(mockResult);

    const result = await listDirectoryHandler('test-call-id', {}, {});

    expect(result.roundFailed).toBe(false);
    expect(result.toolResults).toHaveLength(1);
    
    const parsedResult = JSON.parse(result.toolResults[0].result);
    expect(parsedResult.files).toEqual([]);
    expect(parsedResult.count).toBe(0);
  });
});