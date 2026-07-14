import { tool as langchainTool } from "@langchain/core/tools";
import { z } from "zod";
import type { ChatToolDefinition } from "../tool-registry";

const getLocationSchema = z.object({
  ip: z.string().optional().describe("IP地址，可选，默认使用客户端IP"),
});

export const getLocationTool: ChatToolDefinition<z.infer<typeof getLocationSchema>> = {
  name: "get_location",
  tool: langchainTool(
    async ({ ip }) => {
      if (!ip) {
        return { city: "北京", country: "中国", ip: "127.0.0.1", timezone: "Asia/Shanghai" };
      }
      return { city: "北京", country: "中国", ip, timezone: "Asia/Shanghai" };
    },
    {
      name: "get_location",
      description: "获取IP地址对应的地理位置",
      schema: getLocationSchema,
    },
  ),
  schema: getLocationSchema,
  formatInput: ({ ip }) => `获取位置${ip ? `，IP: ${ip}` : ""}`,
  formatOutput: (result) => JSON.stringify(result),
  getDisplayConfig: () => ({ title: "获取位置", description: "IP地理位置", category: "web" }),
  planningCategory: 'information',
  decisionWeight: 0.7,
  keywords: ["位置", "IP", "城市", "地区", "定位"],
};