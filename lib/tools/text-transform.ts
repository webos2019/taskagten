import { tool as langchainTool } from "@langchain/core/tools";
import { z } from "zod";
import type { ChatToolDefinition } from "../tool-registry";

const textTransformSchema = z.object({
  content: z.string().describe("要转换的文本内容"),
  action: z.enum(["markdown_to_text", "extract_links", "extract_code_blocks", "json_pretty"]).describe("转换操作"),
});

export const textTransformTool: ChatToolDefinition<z.infer<typeof textTransformSchema>> = {
  name: "text_transform",
  tool: langchainTool(
    async ({ content, action }) => {
      switch (action) {
        case "markdown_to_text": {
          const text = content.replace(/[#*`>\[\]]/g, "").replace(/\n{2,}/g, "\n").trim();
          return { action, result: text };
        }
        case "extract_links": {
          const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
          const links: Array<{ text: string; url: string }> = [];
          let match;
          while ((match = linkRegex.exec(content)) !== null) {
            links.push({ text: match[1], url: match[2] });
          }
          return { action, links, count: links.length };
        }
        case "extract_code_blocks": {
          const codeRegex = /```(\w+)?\n([\s\S]*?)```/g;
          const blocks: Array<{ language: string; code: string }> = [];
          let match;
          while ((match = codeRegex.exec(content)) !== null) {
            blocks.push({ language: match[1] || "text", code: match[2].trim() });
          }
          return { action, blocks, count: blocks.length };
        }
        case "json_pretty": {
          try {
            const parsed = JSON.parse(content);
            return { action, result: JSON.stringify(parsed, null, 2) };
          } catch {
            return { action, error: "无效的 JSON 格式" };
          }
        }
        default:
          return { action, error: "未知操作" };
      }
    },
    {
      name: "text_transform",
      description: "文本转换：markdown转文本、提取链接、提取代码块、JSON美化",
      schema: textTransformSchema,
    },
  ),
  schema: textTransformSchema,
  formatInput: ({ action }) => {
    const actions: Record<string, string> = {
      markdown_to_text: "Markdown 转纯文本",
      extract_links: "提取链接",
      extract_code_blocks: "提取代码块",
      json_pretty: "JSON 美化",
    };
    return actions[action] || action;
  },
  formatOutput: (result) => JSON.stringify(result),
  getDisplayConfig: () => ({ title: "文本转换", description: "文本处理", category: "text" }),
  planningCategory: 'utility',
  decisionWeight: 0.5,
  keywords: ["markdown", "链接", "代码", "json", "格式化"],
};