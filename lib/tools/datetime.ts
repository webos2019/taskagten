import { tool as langchainTool } from "@langchain/core/tools";
import { z } from "zod";
import type { ChatToolDefinition } from "../tool-registry";

const datetimeSchema = z.object({
  format: z.string().optional().describe("输出格式，如: YYYY-MM-DD HH:mm:ss"),
});

export const datetimeTool: ChatToolDefinition<z.infer<typeof datetimeSchema>> = {
  name: "datetime",
  tool: langchainTool(
    async ({ format }) => {
      const now = new Date();
      const formatMap: Record<string, string> = {
        "YYYY-MM-DD": now.toISOString().split("T")[0],
        "HH:mm:ss": now.toTimeString().split(" ")[0],
        "YYYY-MM-DD HH:mm:ss": `${now.toISOString().split("T")[0]} ${now.toTimeString().split(" ")[0]}`,
        "YYYY年MM月DD日": `${now.getFullYear()}年${String(now.getMonth() + 1).padStart(2, "0")}月${String(now.getDate()).padStart(2, "0")}日`,
        "星期": ["日", "一", "二", "三", "四", "五", "六"][now.getDay()],
      };
      return {
        currentTime: formatMap[format || "YYYY-MM-DD HH:mm:ss"] || now.toISOString(),
        weekday: ["日", "一", "二", "三", "四", "五", "六"][now.getDay()],
      };
    },
    {
      name: "datetime",
      description: "获取当前日期和时间",
      schema: datetimeSchema,
    },
  ),
  schema: datetimeSchema,
  formatInput: ({ format }) => `获取时间${format ? `，格式: ${format}` : ""}`,
  formatOutput: (result) => JSON.stringify(result),
  getDisplayConfig: () => ({ title: "日期时间", description: "获取当前时间", category: "time" }),
  resultIsAuthoritative: true,
  planningCategory: 'information',
  decisionWeight: 0.8,
  keywords: ["时间", "日期", "现在", "星期", "几点"],
};