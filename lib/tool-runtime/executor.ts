import { AIMessage, ToolMessage } from "@langchain/core/messages";
import { toolRegistry } from "@/lib/tools";
import { mcpClientManager } from "@/lib/mcp/manager";
import { weatherToolAdapter, projectFileResourceAdapter, listFilesAdapter } from "@/lib/mcp/adapters";
import { ChatStreamChunk, createToolCallChunk, createToolResultChunk, createResourceStartChunk, createResourceEndChunk, createResourceErrorChunk } from "@/lib/ai/stream";
import { withTimeout } from "@/lib/ai/debug/timeout-detector";
import { capabilityRegistry, createCapabilityId } from "@/lib/capability/registry";
import type { CapabilityIdentity } from "@/lib/capability/types";
import type { ToolCall, ToolResult, ToolExecutionContext, ToolHandler, ToolHandlerResult } from "./types";

const WEATHER_SERVER_ID = 'weather-server';
const PROJECT_FILES_SERVER_ID = 'project-files-server';
const TASKLIST_SERVER_ID = 'tasklist-server';

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

mcpClientManager.register(TASKLIST_SERVER_ID, {
  serverId: TASKLIST_SERVER_ID,
  command: process.execPath,
  args: [tsxPath, require('path').resolve(process.cwd(), 'lib/mcp/servers/tasklist-server.ts')],
});

const handlers = new Map<string, ToolHandler>();

export function registerHandler(toolName: string, handler: ToolHandler): void {
  handlers.set(toolName, handler);
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

  const handler = handlers.get(toolName);
  
  if (handler) {
    const handlerResult = await handler(toolCallId, args, context);
    chunks.push(...handlerResult.chunks);
    messages.push(...handlerResult.messages);
    toolResults.push(...handlerResult.toolResults);
    failedToolCalls.push(...handlerResult.failedToolCalls);
    
    if (handlerResult.hasAuthoritativeResult) {
      hasAuthoritativeResult = true;
    }
    if (!handlerResult.roundFailed) {
      roundFailed = false;
    }
  } else {
    const defaultResult = await executeDefaultTool(toolCallId, toolName, args, context);
    chunks.push(...defaultResult.chunks);
    messages.push(...defaultResult.messages);
    toolResults.push(...defaultResult.toolResults);
    failedToolCalls.push(...defaultResult.failedToolCalls);
    
    if (defaultResult.hasAuthoritativeResult) {
      hasAuthoritativeResult = true;
    }
    if (!defaultResult.roundFailed) {
      roundFailed = false;
    }
  }

  return { chunks, messages, toolResults, failedToolCalls, hasAuthoritativeResult, roundFailed };
}

async function executeDefaultTool(
  toolCallId: string,
  toolName: string,
  args: Record<string, unknown>,
  context: ToolExecutionContext
): Promise<ToolHandlerResult> {
  const chunks: ChatStreamChunk[] = [];
  const messages: AIMessage[] = [];
  const toolResults: ToolResult[] = [];
  const failedToolCalls: Array<{ toolName: string; error: string }> = [];
  let hasAuthoritativeResult = false;
  let roundFailed = false;

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
    roundFailed = true;
  } else {
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
      const locationResult = await handleLocationResult(toolCallId, toolResult);
      chunks.push(...locationResult.chunks);
      messages.push(...locationResult.messages);
      toolResults.push(...locationResult.toolResults);
      if (locationResult.hasAuthoritativeResult) {
        hasAuthoritativeResult = true;
      }
    }
  }

  return { chunks, messages, toolResults, failedToolCalls, hasAuthoritativeResult, roundFailed };
}

async function handleLocationResult(
  toolCallId: string,
  toolResult: string
): Promise<ToolHandlerResult> {
  const chunks: ChatStreamChunk[] = [];
  const messages: AIMessage[] = [];
  const toolResults: ToolResult[] = [];
  const failedToolCalls: Array<{ toolName: string; error: string }> = [];
  let hasAuthoritativeResult = false;

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

  return { chunks, messages, toolResults, failedToolCalls, hasAuthoritativeResult, roundFailed: false };
}