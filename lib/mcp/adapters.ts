import { mcpClientManager } from './manager';
import { MCPHostError } from './types';

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
  const response = await mcpClientManager.callTool(WEATHER_SERVER_ID, WEATHER_TOOL_NAME, { city: input.city });
  
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