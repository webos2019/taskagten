import { ToolMessage } from "@langchain/core/messages";
import { projectFileResourceAdapter } from "@/lib/mcp/adapters";
import { createResourceStartChunk, createResourceEndChunk, createResourceErrorChunk } from "@/lib/ai/stream";
import type { ToolHandler, ToolHandlerResult, ToolExecutionContext } from "../types";

const PROJECT_FILES_SERVER_ID = 'project-files-server';

export const readFileHandler: ToolHandler = async (
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

    toolResults.push({ toolName: "read_file", result: resultContent, isAuthoritative: true });
    hasAuthoritativeResult = true;

    messages.push(new ToolMessage({
      content: resultContent,
      tool_call_id: toolCallId,
    }));
    roundFailed = false;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "读取文件失败";
    chunks.push(createResourceErrorChunk(filename, `project://${filename}`, errorMsg, { serverId: PROJECT_FILES_SERVER_ID }));
    failedToolCalls.push({ toolName: "read_file", error: errorMsg });
    messages.push(new ToolMessage({
      content: JSON.stringify({ error: errorMsg }),
      tool_call_id: toolCallId,
    }));
  }

  return { chunks, messages, toolResults, failedToolCalls, hasAuthoritativeResult, roundFailed };
};