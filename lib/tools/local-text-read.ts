import { tool as langchainTool } from "@langchain/core/tools";
import { z } from "zod";
import type { ChatToolDefinition } from "../tool-registry";

const localTextReadSchema = z.object({
  filename: z.string().describe("要读取的文件名"),
});

export const localTextReadTool: ChatToolDefinition<z.infer<typeof localTextReadSchema>> = {
  name: "local-text-read",
  tool: langchainTool(
    async ({ filename }) => {
      return { filename, content: "文件内容模拟..." };
    },
    {
      name: "local-text-read",
      description: "读取本地文本文件内容",
      schema: localTextReadSchema,
    },
  ),
  schema: localTextReadSchema,
  formatInput: ({ filename }) => `读取文件：${filename}`,
  formatOutput: (result) => JSON.stringify(result),
  getDisplayConfig: () => ({ title: "读取文件", description: "本地文件读取", category: "file" }),
  planningCategory: 'information',
  decisionWeight: 0.7,
  keywords: ["文件", "读取", "本地", "内容"],
};