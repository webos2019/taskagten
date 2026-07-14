import { SystemMessage, HumanMessage, type BaseMessage } from "@langchain/core/messages";
import type { CapabilityExecutionResult, ExecutedToolResult } from "./types";

export const LOCAL_FILE_SUMMARY_PROMPT_NAME = 'local-file-summary';
export const LOCAL_FILE_SUMMARY_SERVER_ID = 'project-files-server';

export interface PromptContextInvocation {
  promptName: string;
  source: 'mcp' | 'internal';
  location: 'local' | 'remote';
  serverId?: string;
  input: string;
  execute: () => Promise<{ messages: BaseMessage[]; result: CapabilityExecutionResult }>;
}



function getLastUserMessageText(userInput: string): string {
  return userInput.trim();
}

function shouldUseLocalFileSummaryPrompt(userGoal: string): boolean {
  const patterns = ['总结', '摘要', '提炼', '概括', 'summarize', 'summary', 'abstract'];
  return patterns.some((pattern) => userGoal.toLowerCase().includes(pattern.toLowerCase()));
}

function getLatestSuccessfulLocalTextReadResult(executedToolResults: ExecutedToolResult[]): ExecutedToolResult | undefined {
  return executedToolResults
    .filter((r) => r.success && r.toolCall.name === 'local-text-read')
    .pop();
}

function getLocalTextReadFilename(toolCall: { arguments: Record<string, unknown> }): string | undefined {
  return toolCall.arguments.filename as string | undefined;
}

function formatPromptInvocationInput(filename: string, userGoal: string): string {
  return `filename=${filename}&goal=${userGoal}`;
}

function buildLocalSummaryPromptContextMessages(filename: string, userGoal: string): BaseMessage[] {
  return [
    new SystemMessage(`你是一个专业的文档总结助手。请阅读以下文件内容，并根据用户的问题进行总结。

文件: ${filename}

用户目标: ${userGoal}

请输出结构化的总结，包括：
1. 核心要点
2. 关键数据
3. 重要结论`),
  ];
}

export function resolvePromptContextInvocation(
  userInput: string,
  executedToolResults: ExecutedToolResult[]
): PromptContextInvocation | null {
  const userGoal = getLastUserMessageText(userInput);
  
  if (!shouldUseLocalFileSummaryPrompt(userGoal)) {
    return null;
  }
  
  const localTextReadResult = getLatestSuccessfulLocalTextReadResult(executedToolResults);
  
  if (!localTextReadResult) {
    return null;
  }
  
  const filename = getLocalTextReadFilename(localTextReadResult.toolCall);
  
  if (!filename) {
    return null;
  }
  
  return {
    promptName: LOCAL_FILE_SUMMARY_PROMPT_NAME,
    source: 'mcp',
    location: 'local',
    serverId: LOCAL_FILE_SUMMARY_SERVER_ID,
    input: formatPromptInvocationInput(filename, userGoal),
    execute: async () => {
      const messages = buildLocalSummaryPromptContextMessages(filename, userGoal);
      return {
        messages,
        result: {
          success: true,
          content: `本地文件总结 Prompt [${LOCAL_FILE_SUMMARY_PROMPT_NAME}] 已注入`,
          messageCount: messages.length,
          metadata: { filename, userGoal },
        },
      };
    },
  };
}