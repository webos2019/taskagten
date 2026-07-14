import { ToolMessage } from "@langchain/core/messages";
import { toolRegistry } from "@/lib/tools";
import { weatherToolAdapter } from "@/lib/mcp/adapters";
import { createToolCallChunk, createToolResultChunk } from "@/lib/ai/stream";
import { withTimeout } from "@/lib/ai/debug/timeout-detector";
import type { ToolHandler, ToolHandlerResult, ToolExecutionContext } from "../types";

const WEATHER_SERVER_ID = 'weather-server';

export const getWeatherHandler: ToolHandler = async (
  toolCallId: string,
  args: Record<string, unknown>,
  context: ToolExecutionContext
): Promise<ToolHandlerResult> => {
  const chunks: any[] = [];
  const messages: any[] = [];
  const toolResults: any[] = [];
  const failedToolCalls: Array<{ toolName: string; error: string }> = [];
  let hasAuthoritativeResult = false;
  let roundFailed = true;

  chunks.push(createToolCallChunk(toolCallId, "get_weather", args));
  console.log(`[DEBUG-TOOL-RUNTIME] get_weather called with city: ${args.city}`);

  try {
    const localResult = await toolRegistry.execute("get_weather", args);
    const parsedResult = JSON.parse(localResult);
    
    if (parsedResult.error) {
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

        chunks.push(createToolResultChunk(toolCallId, "get_weather", weatherResult, {
          isValid: true,
          isAuthoritative: true,
          serverId: mcpResult.serverId,
          source: mcpResult.source,
        }));

        toolResults.push({ toolName: "get_weather", result: weatherResult, isAuthoritative: true });
        hasAuthoritativeResult = true;

        messages.push(new ToolMessage({
          content: weatherResult,
          tool_call_id: toolCallId,
        }));
        roundFailed = false;
        console.log(`[DEBUG-TOOL-RUNTIME] get_weather successful via MCP, roundFailed: false`);
      } catch (mcpErr) {
        console.log(`[DEBUG-TOOL-RUNTIME] Both local and MCP failed, using local error result`);
        chunks.push(createToolResultChunk(toolCallId, "get_weather", localResult, {
          isValid: false,
        }));
        failedToolCalls.push({ toolName: "get_weather", error: parsedResult.error });
        messages.push(new ToolMessage({
          content: localResult,
          tool_call_id: toolCallId,
        }));
      }
    } else {
      chunks.push(createToolResultChunk(toolCallId, "get_weather", localResult, {
        isValid: true,
        isAuthoritative: false,
      }));

      toolResults.push({ toolName: "get_weather", result: localResult, isAuthoritative: false });
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
    
    chunks.push(createToolResultChunk(toolCallId, "get_weather", JSON.stringify({ error: errorMsg }), {
      isValid: false,
    }));
    failedToolCalls.push({ toolName: "get_weather", error: errorMsg });
    messages.push(new ToolMessage({
      content: JSON.stringify({ error: errorMsg }),
      tool_call_id: toolCallId,
    }));
  }

  return { chunks, messages, toolResults, failedToolCalls, hasAuthoritativeResult, roundFailed };
};