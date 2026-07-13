import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import fs from 'fs';
import path from 'path';

const ALLOWED_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.json', '.md', '.txt', '.yaml', '.yml', '.html', '.css',
]);

const MAX_FILE_SIZE = 1 * 1024 * 1024;

function assertSafeRootFilename(filename: string): string {
  if (filename.includes('/') || filename.includes('\\')) {
    throw new Error('访问被拒绝：仅支持读取项目根目录下的直接文件，不支持子目录路径');
  }
  if (filename.includes('..')) {
    throw new Error('访问被拒绝：不允许路径遍历');
  }
  if (filename.startsWith('.')) {
    throw new Error('访问被拒绝：不允许访问隐藏文件');
  }
  if (path.isAbsolute(filename)) {
    throw new Error('访问被拒绝：不允许绝对路径');
  }
  return filename;
}

function assertAllowedExtension(filename: string): void {
  const ext = '.' + filename.split('.').pop()?.toLowerCase();
  if (!ext || !ALLOWED_EXTENSIONS.has(ext)) {
    throw new Error(`不支持的文件类型 "${ext}"。允许的类型：${Array.from(ALLOWED_EXTENSIONS).join(', ')}`);
  }
}

const server = new McpServer({
  name: 'project-files-server',
  version: '0.0.9',
});

server.registerTool('list_files', {
  description: '列出项目根目录下的文件',
}, async () => {
  try {
    const entries = fs.readdirSync(process.cwd(), { withFileTypes: true })
      .filter((entry) => !entry.name.startsWith('.'))
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name);

    return {
      type: 'tool_result',
      content: [
        {
          type: 'text' as const,
          text: `项目根目录文件列表：\n${entries.join('\n')}`,
        },
      ],
      isError: false,
    };
  } catch (error) {
    return {
      type: 'tool_result',
      content: [
        {
          type: 'text' as const,
          text: `读取目录失败：${error instanceof Error ? error.message : '未知错误'}`,
        },
      ],
      isError: true,
    };
  }
});

server.resource('project-files', 'project://{filename}', {
  description: '项目文件资源',
}, async (uri) => {
  try {
    const filename = uri.pathname.slice(1);
    const safeFilename = assertSafeRootFilename(filename);
    assertAllowedExtension(safeFilename);

    const fullPath = path.resolve(process.cwd(), safeFilename);

    const stats = fs.statSync(fullPath);
    if (stats.size > MAX_FILE_SIZE) {
      throw new Error(`文件 "${filename}" 超出大小限制（最大 1MB）`);
    }

    const content = fs.readFileSync(fullPath, 'utf-8');

    return {
      contents: [
        {
          uri: uri.toString(),
          text: content,
        },
      ],
    };
  } catch (error) {
    return {
      contents: [
        {
          uri: uri.toString(),
          text: error instanceof Error ? error.message : '读取文件失败',
        },
      ],
    };
  }
});

const transport = new StdioServerTransport();
server.connect(transport);