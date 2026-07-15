import { mcpClientManager } from './manager';
import { MCPHostError } from './types';
import { withTimeout } from '@/lib/ai/debug/timeout-detector';

const WEATHER_SERVER_ID = 'weather-server';
const WEATHER_TOOL_NAME = 'get_weather';
const PROJECT_FILES_SERVER_ID = 'project-files-server';
const MAX_PROJECT_RESOURCE_PREVIEW_CHARS = 500;

interface WeatherToolAdapterInput {
  city: string;
}

export async function weatherToolAdapter(input: WeatherToolAdapterInput): Promise<{
  action: 'current';
  inputText: string;
  outputText: string;
  serverId: string;
  source: 'mcp';
  title: string;
  toolName: string;
}> {
  console.log(`[DEBUG-MCP-ADAPTER] weatherToolAdapter called with city: ${input.city}`);
  
  const start = Date.now();
  const response = await withTimeout(`mcpClientManager.callTool get_weather ${input.city}`, mcpClientManager.callTool(WEATHER_SERVER_ID, WEATHER_TOOL_NAME, { city: input.city }), { timeoutMs: 25000 });
  
  const elapsed = Date.now() - start;
  console.log(`[DEBUG-MCP-ADAPTER] weatherToolAdapter completed in ${elapsed}ms`);
  console.log(`[DEBUG-MCP-ADAPTER] Response isError: ${response.isError}`);

  const contentArray = response.content as Array<{ type: string; text?: string }>;
  const textContent = contentArray?.find(c => c.type === 'text')?.text || JSON.stringify(response, null, 2);

  if (response.isError) {
    console.error(`[DEBUG-MCP-ADAPTER] weatherToolAdapter error: ${textContent}`);
    throw new MCPHostError('REQUEST_FAILED', textContent || '天气 MCP Tool 调用失败。');
  }

  console.log(`[DEBUG-MCP-ADAPTER] weatherToolAdapter result: ${textContent.slice(0, 50)}...`);
  
  return {
    action: 'current',
    inputText: `city=${input.city}`,
    outputText: textContent,
    serverId: WEATHER_SERVER_ID,
    source: 'mcp',
    title: 'city-weather',
    toolName: 'city-weather',
  };
}

function assertSafeRootFilename(filename: string): string {
  if (filename.includes('/') || filename.includes('\\')) {
    throw new MCPHostError('INVALID_PATH', '访问被拒绝：仅支持读取项目根目录下的直接文件，不支持子目录路径');
  }
  if (filename.includes('..')) {
    throw new MCPHostError('INVALID_PATH', '访问被拒绝：不允许路径遍历');
  }
  if (filename.startsWith('.')) {
    throw new MCPHostError('INVALID_PATH', '访问被拒绝：不允许访问隐藏文件');
  }
  return filename;
}

function createProjectResourceUri(filename: string): string {
  return `project://${filename}`;
}

function createProjectResourcePreview(text: string): string {
  if (text.length <= MAX_PROJECT_RESOURCE_PREVIEW_CHARS) {
    return text;
  }
  return text.substring(0, MAX_PROJECT_RESOURCE_PREVIEW_CHARS) + '...';
}

interface ProjectFileResourceAdapterInput {
  filename: string;
}

export async function projectFileResourceAdapter(input: ProjectFileResourceAdapterInput): Promise<{
  content: string;
  contentPreview: string;
  previewChars: number;
  resourceName: string;
  serverId: string;
  status: 'completed';
  uri: string;
}> {
  const safeFilename = assertSafeRootFilename(input.filename);
  const uri = createProjectResourceUri(safeFilename);
  const response = await mcpClientManager.readResource(PROJECT_FILES_SERVER_ID, uri);

  const contentsArray = response.contents as Array<{ uri: string; text?: string; blob?: string }>;
  const resourceItem = contentsArray?.[0];
  
  if (!resourceItem) {
    throw new MCPHostError('REQUEST_FAILED', '项目文件 MCP Resource 没有返回可用内容。');
  }

  const textContent = resourceItem.text || '';

  if (!textContent && !resourceItem.blob) {
    throw new MCPHostError('REQUEST_FAILED', '项目文件 MCP Resource 没有返回可用文本内容。');
  }

  return {
    content: textContent,
    contentPreview: createProjectResourcePreview(textContent),
    previewChars: MAX_PROJECT_RESOURCE_PREVIEW_CHARS,
    resourceName: safeFilename,
    serverId: PROJECT_FILES_SERVER_ID,
    status: 'completed',
    uri,
  };
}

interface ListFilesAdapterInput {}

const TASKLIST_SERVER_ID = 'tasklist-server';

export async function tasklistDraftPromptAdapter(goal: string): Promise<{
  content: string;
  serverId: string;
  promptName: string;
}> {
  console.log(`[DEBUG-MCP-ADAPTER] tasklistDraftPromptAdapter called with goal: ${goal}`);

  const start = Date.now();
  const response = await withTimeout(
    `mcpClientManager.getPrompt tasklist-draft`,
    mcpClientManager.getPrompt(TASKLIST_SERVER_ID, 'tasklist-draft', { goal }),
    { timeoutMs: 25000 }
  );

  const elapsed = Date.now() - start;
  console.log(`[DEBUG-MCP-ADAPTER] tasklistDraftPromptAdapter completed in ${elapsed}ms`);

  const messages = response.messages || [];
  const textParts = messages
    .filter(m => m.content)
    .map(m => {
      if (typeof m.content === 'string') return m.content;
      if (Array.isArray(m.content)) {
        return m.content
          .filter((c: { type: string; text?: string }) => c.type === 'text')
          .map((c: { text?: string }) => c.text || '')
          .join('\n');
      }
      return '';
    })
    .filter(text => text.length > 0);

  const content = textParts.join('\n\n') || '任务列表生成失败：未返回有效内容';

  console.log(`[DEBUG-MCP-ADAPTER] tasklistDraftPromptAdapter result length: ${content.length}`);

  return {
    content,
    serverId: TASKLIST_SERVER_ID,
    promptName: 'tasklist-draft',
  };
}

export async function latestContextResourceAdapter(): Promise<{
  content: string;
  serverId: string;
  resourceName: string;
}> {
  console.log(`[DEBUG-MCP-ADAPTER] latestContextResourceAdapter called`);

  const start = Date.now();
  const response = await withTimeout(
    `mcpClientManager.readResource project://latest-context`,
    mcpClientManager.readResource(TASKLIST_SERVER_ID, 'project://latest-context'),
    { timeoutMs: 25000 }
  );

  const elapsed = Date.now() - start;
  console.log(`[DEBUG-MCP-ADAPTER] latestContextResourceAdapter completed in ${elapsed}ms`);

  const contentsArray = response.contents as Array<{ uri: string; text?: string }>;
  const resourceItem = contentsArray?.[0];

  if (!resourceItem || !resourceItem.text) {
    throw new MCPHostError('REQUEST_FAILED', '项目上下文 MCP Resource 没有返回可用内容。');
  }

  return {
    content: resourceItem.text,
    serverId: TASKLIST_SERVER_ID,
    resourceName: 'project://latest-context',
  };
}

export async function checkDocConsistencyToolAdapter(docContent: string, actualContent: string): Promise<{
  content: string;
  serverId: string;
  toolName: string;
}> {
  console.log(`[DEBUG-MCP-ADAPTER] checkDocConsistencyToolAdapter called`);

  const start = Date.now();
  const response = await withTimeout(
    `mcpClientManager.callTool check_doc_consistency`,
    mcpClientManager.callTool(TASKLIST_SERVER_ID, 'check_doc_consistency', { docContent, actualContent }),
    { timeoutMs: 25000 }
  );

  const elapsed = Date.now() - start;
  console.log(`[DEBUG-MCP-ADAPTER] checkDocConsistencyToolAdapter completed in ${elapsed}ms`);

  const contentArray = response.content as Array<{ type: string; text?: string }>;
  const textContent = contentArray?.find(c => c.type === 'text')?.text || JSON.stringify(response, null, 2);

  if (response.isError) {
    throw new MCPHostError('REQUEST_FAILED', textContent || '文档一致性检查 MCP Tool 调用失败。');
  }

  return {
    content: textContent,
    serverId: TASKLIST_SERVER_ID,
    toolName: 'check_doc_consistency',
  };
}

interface ListFilesAdapterInputEmpty {}

export async function listFilesAdapter(): Promise<{
  action: 'current';
  inputText: string;
  outputText: string;
  serverId: string;
  source: 'mcp';
  title: string;
  toolName: string;
}> {
  const response = await mcpClientManager.callTool(PROJECT_FILES_SERVER_ID, 'list_files', {});

  const contentArray = response.content as Array<{ type: string; text?: string }>;
  const textContent = contentArray?.find(c => c.type === 'text')?.text || JSON.stringify(response, null, 2);

  if (response.isError) {
    throw new MCPHostError('REQUEST_FAILED', textContent || '文件列表 MCP Tool 调用失败。');
  }

  return {
    action: 'current',
    inputText: '',
    outputText: textContent,
    serverId: PROJECT_FILES_SERVER_ID,
    source: 'mcp',
    title: 'list-files',
    toolName: 'list_files',
  };
}