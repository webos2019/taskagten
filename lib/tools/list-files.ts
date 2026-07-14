import { tool as langchainTool } from "@langchain/core/tools";
import { z } from "zod";
import type { ChatToolDefinition } from "../tool-registry";

const listFilesSchema = z.object({});

export const listFilesTool: ChatToolDefinition<z.infer<typeof listFilesSchema>> = {
  name: "list_files",
  tool: langchainTool(
    async () => {
      return { files: ["package.json", "README.md", "src/"] };
    },
    {
      name: "list_files",
      description: "列出项目根目录下的文件",
      schema: listFilesSchema,
    },
  ),
  schema: listFilesSchema,
  formatInput: () => "列出文件",
  formatOutput: (result) => JSON.stringify(result),
  getDisplayConfig: () => ({ title: "列出文件", description: "文件列表", category: "file" }),
  planningCategory: 'information',
  decisionWeight: 0.6,
  keywords: ["文件", "列表", "目录", "项目"],
};