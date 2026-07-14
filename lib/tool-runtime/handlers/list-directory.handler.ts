import { ToolMessage } from "@langchain/core/messages";
import { listFilesAdapter } from "@/lib/mcp/adapters";
import { createToolCallChunk, createToolResultChunk } from "@/lib/ai/stream";
import type { ToolHandler, ToolHandlerResult, ToolExecutionContext } from "../types";

const PROJECT_FILES_SERVER_ID = 'project-files-server';

export const listDirectoryHandler: ToolHandler = async (
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

  chunks.push(createToolCallChunk(toolCallId, "list_files", {}, { serverId: PROJECT_FILES_SERVER_ID, source: 'mcp' }));

  try {
    const mcpResult = await listFilesAdapter();

    chunks.push(createToolResultChunk(toolCallId, "list_files", mcpResult.outputText, {
      isValid: true,
      serverId: mcpResult.serverId,
      source: mcpResult.source,
    }));

    toolResults.push({ toolName: "list_directory", result: mcpResult.outputText, isAuthoritative: false });

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
    failedToolCalls.push({ toolName: "list_directory", error: errorMsg });
    messages.push(new ToolMessage({
      content: JSON.stringify({ error: errorMsg }),
      tool_call_id: toolCallId,
    }));
  }

  return { chunks, messages, toolResults, failedToolCalls, hasAuthoritativeResult, roundFailed };
};