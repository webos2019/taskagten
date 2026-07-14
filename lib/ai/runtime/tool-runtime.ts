import { AIMessage, ToolMessage } from "@langchain/core/messages";
import { toolRegistry } from "@/lib/tools";
import { mcpClientManager } from "@/lib/mcp/manager";
import { weatherToolAdapter, projectFileResourceAdapter, listFilesAdapter } from "@/lib/mcp/adapters";
import { ChatStreamChunk, createToolCallChunk, createToolResultChunk, createResourceStartChunk, createResourceEndChunk, createResourceErrorChunk } from "@/lib/ai/stream";
import { withTimeout } from "@/lib/ai/debug/timeout-detector";
import { capabilityRegistry, createCapabilityId } from "@/lib/capability/registry";
import type { CapabilityIdentity } from "@/lib/capability/types";

const WEATHER_SERVER_ID = 'weather-server';
const PROJECT_FILES_SERVER_ID = 'project-files-server';

const tsxPath = require('path').resolve(process.cwd(), 'node_modules/tsx/dist/cli.mjs');

mcpClientManager.register(WEATHER_SERVER_ID, {
  serverId: WEATHER_SERVER_ID,
  command: process.execPath,
  args: [tsxPath, require('path').resolve(process.cwd(), 'lib/mcp/servers/weather-server.ts')],
});

mcpClientManager.register(PROJECT_FILES_SERVER_ID, {
  serverId: PROJECT_FILES_SERVER_ID,
  command: process.execPath,
  args: [tsxPath, require('path').resolve(process.cwd(), 'lib/mcp/servers/project-files-server.ts')],
});

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface ToolResult {
  toolName: string;
  result: string;
  isAuthoritative: boolean;
}

export interface ToolExecutionContext {
  clientIP?: string;
}

export async function executeTool(
  toolCall: ToolCall,
  context: ToolExecutionContext
): Promise<{
  chunks: ChatStreamChunk[];
  messages: AIMessage[];
  toolResults: ToolResult[];
  failedToolCalls: Array<{ toolName: string; error: string }>;
  hasAuthoritativeResult: boolean;
  roundFailed: boolean;
}> {
  const { id: toolCallId, name: toolName, args } = toolCall;
  const chunks: ChatStreamChunk[] = [];
  const messages: AIMessage[] = [];
  const toolResults: ToolResult[] = [];
  const failedToolCalls: Array<{ toolName: string; error: string }> = [];
  let hasAuthoritativeResult = false;
  let roundFailed = true;

  const mcpToolCapabilityId = createCapabilityId({
    name: toolName,
    capabilityType: 'tool',
    providerKind: 'mcp',
    location: 'local',
    serverId: toolName === 'get_weather' ? WEATHER_SERVER_ID : undefined,
  });
  
  const mcpCapability = capabilityRegistry.get(mcpToolCapabilityId);
  if (mcpCapability && mcpCapability.availability !== 'available') {
    chunks.push(createToolCallChunk(toolCallId, toolName, args));
    chunks.push(createToolResultChunk(toolCallId, toolName, `能力 ${toolName} 当前不可用 (${mcpCapability.availability})`, { isValid: false }));
    failedToolCalls.push({ toolName, error: `能力不可用` });
    return { chunks, messages, toolResults, failedToolCalls, hasAuthoritativeResult, roundFailed: true };
  }

  if (toolName === "read_file") {
    const filename = String(args.filename || "");
    chunks.push(createResourceStartChunk(filename, `project://${filename}`, { serverId: PROJECT_FILES_SERVER_ID }));

    try {
      const resourceResult = await projectFileResourceAdapter({ filename });

      chunks.push(createResourceEndChunk(
        resourceResult.resourceName,
        resourceResult.uri,
        {
          serverId: resourceResult.serverId,
          contentPreview: resourceResult.contentPreview,
          isTruncated: resourceResult.content.length > resourceResult.previewChars,
          previewChars: resourceResult.previewChars,
        }
      ));

      const resultContent = JSON.stringify({
        message: `已读取文件 "${filename}"`,
        content: resourceResult.content,
      });

      toolResults.push({ toolName, result: resultContent, isAuthoritative: true });

      messages.push(new ToolMessage({
        content: resultContent,
        tool_call_id: toolCallId,
      }));
      roundFailed = false;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "读取文件失败";
      chunks.push(createResourceErrorChunk(filename, `project://${filename}`, errorMsg, { serverId: PROJECT_FILES_SERVER_ID }));
      failedToolCalls.push({ toolName, error: errorMsg });
      messages.push(new ToolMessage({
        content: JSON.stringify({ error: errorMsg }),
        tool_call_id: toolCallId,
      }));
    }
  } else if (toolName === "get_weather") {
    chunks.push(createToolCallChunk(toolCallId, toolName, args));
    console.log(`[DEBUG-TOOL-RUNTIME] get_weather called with city: ${args.city}`);

    try {
      // 首先尝试本地工具
      const localResult = await toolRegistry.execute(toolName, args);
      const parsedResult = JSON.parse(localResult);
      
      if (parsedResult.error) {
        // 如果本地工具失败，尝试MCP服务
        console.log(`[DEBUG-TOOL-RUNTIME] Local weather tool failed, trying MCP...`);
        try {
          const start = Date.now();
          const mcpResult = await withTimeout(`weatherToolAdapter ${args.city}`, weatherToolAdapter({ city: String(args.city || "") }), { timeoutMs: 30000 });
          const elapsed = Date.now() - start;
          console.log(`[DEBUG-TOOL-RUNTIME] weatherToolAdapter completed in ${elapsed}ms`);
          
          const weatherResult = JSON.stringify({
            message: mcpResult.outputText,
            city: String(args.city || ""),
            source: mcpResult.source,
          });

          chunks.push(createToolResultChunk(toolCallId, toolName, weatherResult, {
            isValid: true,
            isAuthoritative: true,
            serverId: mcpResult.serverId,
            source: mcpResult.source,
          }));

          toolResults.push({ toolName, result: weatherResult, isAuthoritative: true });
          hasAuthoritativeResult = true;

          messages.push(new ToolMessage({
            content: weatherResult,
            tool_call_id: toolCallId,
          }));
          roundFailed = false;
          console.log(`[DEBUG-TOOL-RUNTIME] get_weather successful via MCP, roundFailed: false`);
        } catch (mcpErr) {
          // MCP也失败，使用本地错误结果
          console.log(`[DEBUG-TOOL-RUNTIME] Both local and MCP failed, using local error result`);
          chunks.push(createToolResultChunk(toolCallId, toolName, localResult, {
            isValid: false,
          }));
          failedToolCalls.push({ toolName, error: parsedResult.error });
          messages.push(new ToolMessage({
            content: localResult,
            tool_call_id: toolCallId,
          }));
        }
      } else {
        // 本地工具成功
        chunks.push(createToolResultChunk(toolCallId, toolName, localResult, {
          isValid: true,
          isAuthoritative: false,
        }));

        toolResults.push({ toolName, result: localResult, isAuthoritative: false });
        hasAuthoritativeResult = true;

        messages.push(new ToolMessage({
          content: localResult,
          tool_call_id: toolCallId,
        }));
        roundFailed = false;
        console.log(`[DEBUG-TOOL-RUNTIME] get_weather successful via local tool, roundFailed: false`);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "天气查询失败";
      console.error(`[DEBUG-TOOL-RUNTIME] get_weather failed completely: ${errorMsg}`);
      
      chunks.push(createToolResultChunk(toolCallId, toolName, JSON.stringify({ error: errorMsg }), {
        isValid: false,
      }));
      failedToolCalls.push({ toolName, error: errorMsg });
      messages.push(new ToolMessage({
        content: JSON.stringify({ error: errorMsg }),
        tool_call_id: toolCallId,
      }));
    }
  } else if (toolName === "list_directory") {
    chunks.push(createToolCallChunk(toolCallId, "list_files", {}, { serverId: PROJECT_FILES_SERVER_ID, source: 'mcp' }));

    try {
      const mcpResult = await listFilesAdapter();

      chunks.push(createToolResultChunk(toolCallId, "list_files", mcpResult.outputText, {
        isValid: true,
        serverId: mcpResult.serverId,
        source: mcpResult.source,
      }));

      toolResults.push({ toolName, result: mcpResult.outputText, isAuthoritative: false });

      messages.push(new ToolMessage({
        content: mcpResult.outputText,
        tool_call_id: toolCallId,
      }));
      roundFailed = false;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "获取文件列表失败";
      chunks.push(createToolResultChunk(toolCallId, "list_files", JSON.stringify({ error: errorMsg }), {
        isValid: false,
        serverId: PROJECT_FILES_SERVER_ID,
      }));
      failedToolCalls.push({ toolName, error: errorMsg });
      messages.push(new ToolMessage({
        content: JSON.stringify({ error: errorMsg }),
        tool_call_id: toolCallId,
      }));
    }
  } else {
    chunks.push(createToolCallChunk(toolCallId, toolName, args));

    const validation = toolRegistry.validate(toolName, args);
    if (!validation.valid) {
      const errorMsg = `工具调用参数校验失败: ${toolName} - ${JSON.stringify(validation.errors)}`;
      failedToolCalls.push({ toolName, error: errorMsg });
      chunks.push(createToolResultChunk(toolCallId, toolName, JSON.stringify({ error: errorMsg }), { isValid: false }));
      messages.push(new ToolMessage({
        content: JSON.stringify({ error: errorMsg }),
        tool_call_id: toolCallId,
      }));
    } else {
      roundFailed = false;
      const toolDefinition = toolRegistry.get(toolName);
      const toolResult = await toolRegistry.execute(toolName, args, { clientIP: context.clientIP });
      const isAuthoritative = toolDefinition?.resultIsAuthoritative || false;

      if (isAuthoritative) {
        hasAuthoritativeResult = true;
      }

      toolResults.push({ toolName, result: toolResult, isAuthoritative });

      chunks.push(createToolResultChunk(toolCallId, toolName, toolResult, {
        isValid: true,
        isAuthoritative,
      }));

      messages.push(new ToolMessage({
        content: toolResult,
        tool_call_id: toolCallId,
      }));

      if (toolName === "get_location") {
        try {
          const locationData = JSON.parse(toolResult);
          if (locationData.city && !locationData.error) {
            const weatherToolCallId = `call_${Date.now()}_weather`;

            chunks.push(createToolCallChunk(weatherToolCallId, "get_weather", { city: locationData.city }, {
              serverId: WEATHER_SERVER_ID,
              source: 'mcp',
            }));

            const mcpResult = await weatherToolAdapter({ city: locationData.city });
            const weatherResult = JSON.stringify({
              message: mcpResult.outputText,
              city: locationData.city,
              source: mcpResult.source,
            });

            chunks.push(createToolResultChunk(weatherToolCallId, "get_weather", weatherResult, {
              isValid: true,
              isAuthoritative: true,
              serverId: mcpResult.serverId,
              source: mcpResult.source,
            }));

            toolResults.push({ toolName: "get_weather", result: weatherResult, isAuthoritative: true });
            hasAuthoritativeResult = true;

            messages.push(new AIMessage({
              content: "",
              tool_calls: [{ id: weatherToolCallId, name: "get_weather", args: { city: locationData.city } }],
            }));
            messages.push(new ToolMessage({
              content: weatherResult,
              tool_call_id: weatherToolCallId,
            }));
          }
        } catch {
        }
      }
    }
  }

  return { chunks, messages, toolResults, failedToolCalls, hasAuthoritativeResult, roundFailed };
}
