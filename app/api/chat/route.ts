import { NextRequest } from "next/server";
import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import { createStreamingChatChain, createFallbackChatChain, getSystemPrompt, type SkillId } from "@/lib/langchain";
import { toolRegistry } from "@/lib/tools";
import { skillRegistry } from "@/lib/skill-registry";
import { mcpClientManager } from "@/lib/mcp/manager";
import { weatherToolAdapter, projectFileResourceAdapter, listFilesAdapter } from "@/lib/mcp/adapters";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_TOOL_CALLS = 5;

const WEATHER_SERVER_ID = 'weather-server';
const PROJECT_FILES_SERVER_ID = 'project-files-server';

mcpClientManager.register(WEATHER_SERVER_ID, {
  serverId: WEATHER_SERVER_ID,
  command: 'npx',
  args: ['tsx', 'lib/mcp/servers/weather-server.ts'],
});

mcpClientManager.register(PROJECT_FILES_SERVER_ID, {
  serverId: PROJECT_FILES_SERVER_ID,
  command: 'npx',
  args: ['tsx', 'lib/mcp/servers/project-files-server.ts'],
});

function routeSkill(userMessage: string): SkillId {
  const readerHints = ["文件", "读取", "目录", "天气", "city", "weather", "read", "file", "directory", "location"];
  const utilityHints = ["计算", "时间", "日期", "换算", "convert", "datetime", "calculator", "math", "unit"];

  const lowerMsg = userMessage.toLowerCase();

  const readerMatches = readerHints.filter(hint => lowerMsg.includes(hint));
  const utilityMatches = utilityHints.filter(hint => lowerMsg.includes(hint));

  if (readerMatches.length > utilityMatches.length) {
    return "reader-skill";
  }
  if (utilityMatches.length > readerMatches.length) {
    return "utility-skill";
  }

  return "utility-skill";
}

function toLangChainMessages(messages: Array<{ role: string; content: string; files?: { name: string; type: string; content: string }[] }>) {
  return messages.map((msg) => {
    let content = msg.content;
    if (msg.role === "user" && (msg as any).files?.length) {
      const fileContext = (msg as any).files
        .map((f: any) => `\`\`\`\n文件: ${f.name}\n\`\`\`\n\`\`\`${f.type || "text"}\n${f.content}\n\`\`\``)
        .join("\n\n");
      content = content
        ? `${content}\n\n---\n以下是用户上传的代码文件：\n\n${fileContext}`
        : `用户上传了以下代码文件：\n\n${fileContext}`;
    }
    switch (msg.role) {
      case "system": return new SystemMessage(content);
      case "assistant": return new AIMessage(content);
      default: return new HumanMessage(content);
    }
  });
}

function getClientIP(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }
  const realIP = request.headers.get("x-real-ip");
  if (realIP) {
    return realIP;
  }
  const ip = request.headers.get("x-client-ip");
  if (ip) {
    return ip;
  }
  return "127.0.0.1";
}

function parseToolCalls(result: any): Array<{ id: string; name: string; args: Record<string, unknown> }> {
  if (result.tool_calls && result.tool_calls.length > 0) {
    return result.tool_calls.map((tc: any) => ({
      id: tc.id,
      name: tc.name,
      args: tc.args || {},
    }));
  }
  if (result.additional_kwargs?.tool_calls && result.additional_kwargs.tool_calls.length > 0) {
    return result.additional_kwargs.tool_calls.map((tc: any) => {
      const args = typeof tc.function?.arguments === "string" 
        ? JSON.parse(tc.function.arguments)
        : (tc.function?.arguments || {});
      return {
        id: tc.id,
        name: tc.function?.name || tc.name,
        args,
      };
    });
  }
  return [];
}

function writeNDJSON(writer: any, type: string, data: Record<string, unknown>) {
  writer.enqueue(new TextEncoder().encode(JSON.stringify({ type, ...data }) + "\n"));
}

function formatToolResultForText(toolResult: string, toolName: string): string {
  try {
    const parsed = JSON.parse(toolResult);
    if (parsed.message) {
      return parsed.message;
    }
    if (parsed.result !== undefined) {
      if (parsed.fromName && parsed.toName) {
        return `${parsed.value} ${parsed.fromName} = ${parsed.result} ${parsed.toName}`;
      }
      return String(parsed.result);
    }
    if (parsed.expression !== undefined) {
      return `${parsed.expression} = ${parsed.result}`;
    }
    if (parsed.currentTime) {
      return `当前时间：${parsed.currentTime}`;
    }
    return JSON.stringify(parsed, null, 2);
  } catch {
    return toolResult;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { messages, skill: explicitSkill, clientIP } = body;

    const resolvedIP = clientIP || getClientIP(request);

    if (!Array.isArray(messages)) {
      return Response.json({ error: "messages 必须是数组" }, { status: 400 });
    }

    const langchainMessages = toLangChainMessages(messages as Array<{ role: string; content: string; files?: { name: string; type: string; content: string }[] }>);
    
    const userMessage = messages[messages.length - 1]?.content || "";
    const routedSkill = routeSkill(userMessage);
    
    let resolvedSkill: SkillId;
    if (explicitSkill) {
      const explicit = explicitSkill as SkillId;
      const readerKeywords = ["天气", "city", "weather", "location", "文件", "读取", "目录", "read", "file", "directory"];
      const lowerMsg = userMessage.toLowerCase();
      const needsReader = readerKeywords.some(keyword => lowerMsg.includes(keyword));
      resolvedSkill = needsReader ? "reader-skill" : explicit;
    } else {
      resolvedSkill = routedSkill;
    }
    
    const skillDefinition = skillRegistry.get(resolvedSkill);
    const resultPolicy = skillDefinition?.getResultPolicy() || "auto";

    const stream = new ReadableStream({
      async start(controller) {
        const writer = controller;

        try {
          writeNDJSON(writer, "start", {});

          let currentMessages = [...langchainMessages];
          const chain = createStreamingChatChain(resolvedSkill);
          let toolCallCount = 0;
          let hasToolCalls = false;
          let allToolCallsFailed = false;
          let hasAuthoritativeResult = false;
          const toolResults: Array<{ toolName: string; result: string; isAuthoritative: boolean }> = [];
          const failedToolCalls: Array<{ toolName: string; error: string }> = [];

          while (toolCallCount < MAX_TOOL_CALLS) {
            const result = await chain.invoke({ messages: currentMessages });
            const toolCalls = parseToolCalls(result);

            if (toolCalls.length === 0) {
              if (!hasToolCalls) {
                const content = result.content;
                if (content) {
                  const text = typeof content === "string" ? content : JSON.stringify(content);
                  writeNDJSON(writer, "text", { content: text });
                }
              }
              break;
            }

            hasToolCalls = true;
            currentMessages.push(result);

            let roundFailed = true;
            for (const tc of toolCalls) {
              if (tc.name === "read_file") {
                const filename = String(tc.args.filename || "");
                writeNDJSON(writer, "resource_start", {
                  resourceName: filename,
                  resourceUri: `project://${filename}`,
                  serverId: PROJECT_FILES_SERVER_ID,
                });

                try {
                  const resourceResult = await projectFileResourceAdapter({ filename });

                  writeNDJSON(writer, "resource_end", {
                    resourceName: resourceResult.resourceName,
                    resourceUri: resourceResult.uri,
                    serverId: resourceResult.serverId,
                    contentPreview: resourceResult.contentPreview,
                    isTruncated: resourceResult.content.length > resourceResult.previewChars,
                    previewChars: resourceResult.previewChars,
                  });

                  toolResults.push({ 
                    toolName: tc.name, 
                    result: JSON.stringify({ 
                      message: `已读取文件 "${filename}"`,
                      content: resourceResult.content,
                    }), 
                    isAuthoritative: true 
                  });

                  currentMessages.push(new ToolMessage({
                    content: JSON.stringify({ 
                      message: `已读取文件 "${filename}"`,
                      content: resourceResult.content,
                    }),
                    tool_call_id: tc.id,
                  }));
                  roundFailed = false;
                } catch (err) {
                  const errorMsg = err instanceof Error ? err.message : "读取文件失败";
                  writeNDJSON(writer, "resource_error", {
                    resourceName: filename,
                    resourceUri: `project://${filename}`,
                    serverId: PROJECT_FILES_SERVER_ID,
                    error: errorMsg,
                  });

                  failedToolCalls.push({ toolName: tc.name, error: errorMsg });
                  currentMessages.push(new ToolMessage({
                    content: JSON.stringify({ error: errorMsg }),
                    tool_call_id: tc.id,
                  }));
                }
              } else if (tc.name === "get_weather") {
                writeNDJSON(writer, "tool_call", {
                  toolCallId: tc.id,
                  toolName: tc.name,
                  toolArgs: tc.args,
                  serverId: WEATHER_SERVER_ID,
                  source: 'mcp',
                });

                try {
                  const mcpResult = await weatherToolAdapter({ city: String(tc.args.city || "") });
                  const weatherResult = JSON.stringify({
                    message: mcpResult.outputText,
                    city: String(tc.args.city || ""),
                    source: mcpResult.source,
                  });

                  writeNDJSON(writer, "tool_result", {
                    toolCallId: tc.id,
                    toolName: tc.name,
                    toolResult: weatherResult,
                    isValid: true,
                    isAuthoritative: true,
                    serverId: mcpResult.serverId,
                    source: mcpResult.source,
                  });

                  toolResults.push({ toolName: tc.name, result: weatherResult, isAuthoritative: true });
                  hasAuthoritativeResult = true;

                  currentMessages.push(new ToolMessage({
                    content: weatherResult,
                    tool_call_id: tc.id,
                  }));
                  roundFailed = false;
                } catch (err) {
                  const errorMsg = err instanceof Error ? err.message : "天气查询失败";
                  writeNDJSON(writer, "tool_result", {
                    toolCallId: tc.id,
                    toolName: tc.name,
                    toolResult: JSON.stringify({ error: errorMsg }),
                    isValid: false,
                    serverId: WEATHER_SERVER_ID,
                  });

                  failedToolCalls.push({ toolName: tc.name, error: errorMsg });
                  currentMessages.push(new ToolMessage({
                    content: JSON.stringify({ error: errorMsg }),
                    tool_call_id: tc.id,
                  }));
                }
              } else if (tc.name === "list_directory") {
                writeNDJSON(writer, "tool_call", {
                  toolCallId: tc.id,
                  toolName: "list_files",
                  toolArgs: {},
                  serverId: PROJECT_FILES_SERVER_ID,
                  source: 'mcp',
                });

                try {
                  const mcpResult = await listFilesAdapter();

                  writeNDJSON(writer, "tool_result", {
                    toolCallId: tc.id,
                    toolName: "list_files",
                    toolResult: mcpResult.outputText,
                    isValid: true,
                    serverId: mcpResult.serverId,
                    source: mcpResult.source,
                  });

                  toolResults.push({ toolName: tc.name, result: mcpResult.outputText, isAuthoritative: false });

                  currentMessages.push(new ToolMessage({
                    content: mcpResult.outputText,
                    tool_call_id: tc.id,
                  }));
                  roundFailed = false;
                } catch (err) {
                  const errorMsg = err instanceof Error ? err.message : "获取文件列表失败";
                  writeNDJSON(writer, "tool_result", {
                    toolCallId: tc.id,
                    toolName: "list_files",
                    toolResult: JSON.stringify({ error: errorMsg }),
                    isValid: false,
                    serverId: PROJECT_FILES_SERVER_ID,
                  });

                  failedToolCalls.push({ toolName: tc.name, error: errorMsg });
                  currentMessages.push(new ToolMessage({
                    content: JSON.stringify({ error: errorMsg }),
                    tool_call_id: tc.id,
                  }));
                }
              } else {
                writeNDJSON(writer, "tool_call", {
                  toolCallId: tc.id,
                  toolName: tc.name,
                  toolArgs: tc.args,
                });

                const validation = toolRegistry.validate(tc.name, tc.args);
                if (!validation.valid) {
                  const errorMsg = `工具调用参数校验失败: ${tc.name} - ${JSON.stringify(validation.errors)}`;
                  failedToolCalls.push({ toolName: tc.name, error: errorMsg });
                  
                  writeNDJSON(writer, "tool_result", {
                    toolCallId: tc.id,
                    toolName: tc.name,
                    toolResult: JSON.stringify({ error: errorMsg }),
                    isValid: false,
                  });
                  
                  currentMessages.push(new ToolMessage({
                    content: JSON.stringify({ error: errorMsg }),
                    tool_call_id: tc.id,
                  }));
                } else {
                  roundFailed = false;
                  const toolDefinition = toolRegistry.get(tc.name);
                  const toolResult = await toolRegistry.execute(tc.name, tc.args, { clientIP: resolvedIP });
                  const isAuthoritative = toolDefinition?.resultIsAuthoritative || false;
                  
                  if (isAuthoritative) {
                    hasAuthoritativeResult = true;
                  }
                  
                  toolResults.push({ toolName: tc.name, result: toolResult, isAuthoritative });
                  
                  writeNDJSON(writer, "tool_result", {
                    toolCallId: tc.id,
                    toolName: tc.name,
                    toolResult,
                    isValid: true,
                    isAuthoritative,
                  });
                  
                  currentMessages.push(new ToolMessage({
                    content: toolResult,
                    tool_call_id: tc.id,
                  }));

                  if (tc.name === "get_location") {
                    try {
                      const locationData = JSON.parse(toolResult);
                      if (locationData.city && !locationData.error) {
                        const weatherToolCallId = `call_${toolCallCount}_weather`;
                        
                        writeNDJSON(writer, "tool_call", {
                          toolCallId: weatherToolCallId,
                          toolName: "get_weather",
                          toolArgs: { city: locationData.city },
                          serverId: WEATHER_SERVER_ID,
                          source: 'mcp',
                        });

                        const mcpResult = await weatherToolAdapter({ city: locationData.city });
                        const weatherResult = JSON.stringify({
                          message: mcpResult.outputText,
                          city: locationData.city,
                          source: mcpResult.source,
                        });

                        writeNDJSON(writer, "tool_result", {
                          toolCallId: weatherToolCallId,
                          toolName: "get_weather",
                          toolResult: weatherResult,
                          isValid: true,
                          isAuthoritative: true,
                          serverId: mcpResult.serverId,
                          source: mcpResult.source,
                        });

                        toolResults.push({ toolName: "get_weather", result: weatherResult, isAuthoritative: true });
                        hasAuthoritativeResult = true;

                        currentMessages.push(new AIMessage({
                          content: "",
                          tool_calls: [{ id: weatherToolCallId, name: "get_weather", args: { city: locationData.city } }],
                        }));
                        currentMessages.push(new ToolMessage({
                          content: weatherResult,
                          tool_call_id: weatherToolCallId,
                        }));

                        toolCallCount = MAX_TOOL_CALLS;
                      }
                    } catch {
                    }
                  }
                }
              }

              toolCallCount++;
            }

            if (roundFailed) {
              allToolCallsFailed = true;
              break;
            }

            if (toolCallCount >= MAX_TOOL_CALLS) {
              break;
            }
          }

          if (allToolCallsFailed) {
            const errorText = `工具调用失败，请检查参数格式是否正确：\n${failedToolCalls.map(f => `- ${f.toolName}: ${f.error}`).join("\n")}`;
            writeNDJSON(writer, "error", { error: errorText });
            writeNDJSON(writer, "done", {});
            writer.close();
            return;
          }

          if (hasToolCalls) {
            if (resultPolicy === "tool-first" && hasAuthoritativeResult) {
              const authoritativeResults = toolResults.filter(r => r.isAuthoritative);
              for (const tr of authoritativeResults) {
                const formattedText = formatToolResultForText(tr.result, tr.toolName);
                writeNDJSON(writer, "text", { content: formattedText });
              }
            } else {
              const summaryChain = createFallbackChatChain(resolvedSkill);
              const toolResultMessages = currentMessages.filter(m => m._getType() === "tool");
              const toolResultText = toolResultMessages.map(m => (m as any).content).join("\n\n");
              
              const summaryMessages = [
                new SystemMessage(getSystemPrompt(resolvedSkill)),
                new HumanMessage(`用户问：${langchainMessages[langchainMessages.length - 1].content}\n\n工具调用结果：\n${toolResultText}\n\n请根据工具结果用自然语言总结回答用户。`),
              ];
              const finalResult = await summaryChain.invoke({ messages: summaryMessages });
              const finalContent = finalResult.content;
              
              if (finalContent) {
                const text = typeof finalContent === "string" ? finalContent : JSON.stringify(finalContent);
                writeNDJSON(writer, "text", { content: text });
              }
            }
          }

          writeNDJSON(writer, "done", {});
          writer.close();
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : "未知错误";
          writeNDJSON(writer, "error", { error: errorMessage });
          writer.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "请求解析失败";
    return Response.json({ error: errorMessage }, { status: 400 });
  }
}