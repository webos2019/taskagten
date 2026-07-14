import { tool as langchainTool } from "@langchain/core/tools";
import { z } from "zod";
import type { ChatToolDefinition } from "../tool-registry";

const unitConvertSchema = z.object({
  value: z.number().describe("要转换的值"),
  fromName: z.string().describe("源单位，如: meter, kilogram, celsius"),
  toName: z.string().describe("目标单位，如: kilometer, pound, fahrenheit"),
});

function convertUnit(value: number, fromName: string, toName: string): number | string {
  const conversions: Record<string, Record<string, (v: number) => number>> = {
    meter: { kilometer: (v) => v / 1000, centimeter: (v) => v * 100, mile: (v) => v * 0.000621371 },
    kilometer: { meter: (v) => v * 1000, mile: (v) => v * 0.621371 },
    kilogram: { gram: (v) => v * 1000, pound: (v) => v * 2.20462 },
    pound: { kilogram: (v) => v * 0.453592 },
    celsius: { fahrenheit: (v) => (v * 9) / 5 + 32, kelvin: (v) => v + 273.15 },
    fahrenheit: { celsius: (v) => ((v - 32) * 5) / 9 },
  };

  if (!conversions[fromName] || !conversions[fromName][toName]) {
    return "不支持的单位转换";
  }

  return conversions[fromName][toName](value);
}

export const unitConvertTool: ChatToolDefinition<z.infer<typeof unitConvertSchema>> = {
  name: "unit_convert",
  tool: langchainTool(
    async ({ value, fromName, toName }) => {
      const result = convertUnit(value, fromName, toName);
      return { value, fromName, toName, result };
    },
    {
      name: "unit_convert",
      description: "单位换算，支持长度、重量、温度等",
      schema: unitConvertSchema,
    },
  ),
  schema: unitConvertSchema,
  formatInput: ({ value, fromName, toName }) => `${value} ${fromName} → ${toName}`,
  formatOutput: (result) => JSON.stringify(result),
  getDisplayConfig: () => ({ title: "单位换算", description: "单位转换", category: "math" }),
  resultIsAuthoritative: true,
  planningCategory: 'action',
  decisionWeight: 0.85,
  keywords: ["换算", "单位", "转换", "公里", "米", "千克", "磅", "度"],
};