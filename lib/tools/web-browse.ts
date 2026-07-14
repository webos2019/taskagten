import { tool as langchainTool } from "@langchain/core/tools";
import { z } from "zod";
import type { ChatToolDefinition } from "../tool-registry";

const webBrowseSchema = z.object({
  url: z.string().describe("要浏览的网页URL"),
  maxChars: z.number().optional().describe("最大返回字符数，默认2000"),
});

export const webBrowseTool: ChatToolDefinition<z.infer<typeof webBrowseSchema>> = {
  name: "web_browse",
  tool: langchainTool(
    async ({ url, maxChars = 2000 }) => {
      return { url, content: `网页内容预览（${url}）：这是网页的模拟内容...`, truncated: true };
    },
    {
      name: "web_browse",
      description: "浏览网页内容",
      schema: webBrowseSchema,
    },
  ),
  schema: webBrowseSchema,
  formatInput: ({ url }) => `浏览网页：${url}`,
  formatOutput: (result) => JSON.stringify(result),
  getDisplayConfig: () => ({ title: "网页浏览", description: "访问网页", category: "web" }),
  planningCategory: 'information',
  decisionWeight: 0.75,
  keywords: ["网页", "网站", "URL", "浏览", "内容"],
};