import { tool as langchainTool } from "@langchain/core/tools";
import { z } from "zod";
import type { ChatToolDefinition } from "../tool-registry";

const getWeatherSchema = z.object({
  city: z.string().describe("城市名称，如: 北京"),
});

export const getWeatherTool: ChatToolDefinition<z.infer<typeof getWeatherSchema>> = {
  name: "get_weather",
  tool: langchainTool(
    async ({ city }) => {
      return { city, temperature: 25, condition: "晴朗", humidity: 60 };
    },
    {
      name: "get_weather",
      description: "获取指定城市的天气信息",
      schema: getWeatherSchema,
    },
  ),
  schema: getWeatherSchema,
  formatInput: ({ city }) => `查询天气：${city}`,
  formatOutput: (result) => JSON.stringify(result),
  getDisplayConfig: () => ({ title: "天气查询", description: "获取天气信息", category: "web" }),
  planningCategory: 'information',
  decisionWeight: 0.8,
  keywords: ["天气", "温度", "预报", "城市"],
};