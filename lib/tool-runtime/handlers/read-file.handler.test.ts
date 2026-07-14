import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileHandler } from './read-file.handler';
import { projectFileResourceAdapter } from '@/lib/mcp/adapters';

vi.mock('@/lib/mcp/adapters', () => ({
  projectFileResourceAdapter: vi.fn(),
}));

describe('read-file.handler.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should read file successfully', async () => {
    const mockResult = {
      resourceName: 'README.md',
      uri: 'project://README.md',
      content: '# Code Assistant\n\nA code assistant application',
      contentPreview: '# Code Assistant',
      serverId: 'project-files-server',
      contentLength: 45,
      previewChars: 2000,
    };

    (projectFileResourceAdapter as vi.Mock).mockResolvedValue(mockResult);

    const result = await readFileHandler('test-call-id', { filename: 'README.md' }, {});

    expect(projectFileResourceAdapter).toHaveBeenCalledWith({ filename: 'README.md' });
    expect(result.roundFailed).toBe(false);
    expect(result.hasAuthoritativeResult).toBe(true);
    expect(result.toolResults).toHaveLength(1);
    expect(result.toolResults[0].toolName).toBe('read_file');
    expect(result.toolResults[0].isAuthoritative).toBe(true);
    
    const parsedResult = JSON.parse(result.toolResults[0].result);
    expect(parsedResult.message).toBe('已读取文件 "README.md"');
    expect(parsedResult.content).toBe('# Code Assistant\n\nA code assistant application');

    expect(result.chunks).toHaveLength(2);
    expect(result.chunks[0].type).toBe('resource_start');
    expect(result.chunks[1].type).toBe('resource_end');
  });

  it('should handle file read failure', async () => {
    (projectFileResourceAdapter as vi.Mock).mockRejectedValue(new Error('文件不存在'));

    const result = await readFileHandler('test-call-id', { filename: 'nonexistent.md' }, {});

    expect(projectFileResourceAdapter).toHaveBeenCalledWith({ filename: 'nonexistent.md' });
    expect(result.roundFailed).toBe(true);
    expect(result.hasAuthoritativeResult).toBe(false);
    expect(result.failedToolCalls).toHaveLength(1);
    expect(result.failedToolCalls[0].toolName).toBe('read_file');
    expect(result.failedToolCalls[0].error).toBe('文件不存在');

    expect(result.chunks).toHaveLength(2);
    expect(result.chunks[0].type).toBe('resource_start');
    expect(result.chunks[1].type).toBe('resource_error');
  });

  it('should handle empty filename', async () => {
    (projectFileResourceAdapter as vi.Mock).mockRejectedValue(new Error('文件名不能为空'));

    const result = await readFileHandler('test-call-id', {}, {});

    expect(projectFileResourceAdapter).toHaveBeenCalledWith({ filename: '' });
    expect(result.roundFailed).toBe(true);
    expect(result.failedToolCalls).toHaveLength(1);
  });
});