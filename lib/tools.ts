import { tool as langchainTool } from "@langchain/core/tools";
import { z } from "zod";
import { ToolRegistry, type ChatToolDefinition } from "./tool-registry";
import { skillRegistry } from "./skill-registry";
import { initCapabilities } from "./capability";
import { planningEngine, PlanningDecisionEngine, PlanningContext, DecisionResult } from "./planning-decision";

export const toolRegistry = new ToolRegistry();

toolRegistry.setPlanningEngine(planningEngine);

const calculatorSchema = z.object({
  expression: z.string().describe("数学表达式，如: 1+2*3"),
});

function safeMathEval(expression: string): number | string {
  const sanitized = expression.replace(/[^0-9+\-*/().\s]/g, '');
  
  if (!sanitized.trim()) {
    return "无效表达式";
  }

  try {
    const func = new Function(`return ${sanitized}`);
    const result = func();
    
    if (typeof result !== 'number' || !isFinite(result)) {
      return "计算结果无效";
    }
    
    return result;
  } catch {
    return "表达式错误";
  }
}

const calculatorTool: ChatToolDefinition<z.infer<typeof calculatorSchema>> = {
  name: "calculator",
  tool: langchainTool(
    async ({ expression }) => {
      const result = safeMathEval(expression);
      return { expression, result };
    },
    {
      name: "calculator",
      description: "执行数学计算，支持加减乘除等运算",
      schema: calculatorSchema,
    },
  ),
  schema: calculatorSchema,
  formatInput: ({ expression }) => `计算: ${expression}`,
  formatOutput: (result) => JSON.stringify(result),
  getDisplayConfig: () => ({ title: "计算器", description: "数学计算", category: "math" }),
  resultIsAuthoritative: true,
  planningCategory: 'action',
  decisionWeight: 0.9,
  keywords: ["计算", "数学", "加减乘除", "表达式", "公式"],
};

toolRegistry.register(calculatorTool);

const datetimeSchema = z.object({
  format: z.string().optional().describe("输出格式，如: YYYY-MM-DD HH:mm:ss"),
});

const datetimeTool: ChatToolDefinition<z.infer<typeof datetimeSchema>> = {
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

toolRegistry.register(datetimeTool);

const textTransformSchema = z.object({
  content: z.string().describe("要转换的文本内容"),
  action: z.enum(["markdown_to_text", "extract_links", "extract_code_blocks", "json_pretty"]).describe("转换操作"),
});

const textTransformTool: ChatToolDefinition<z.infer<typeof textTransformSchema>> = {
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

toolRegistry.register(textTransformTool);

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

const unitConvertTool: ChatToolDefinition<z.infer<typeof unitConvertSchema>> = {
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

toolRegistry.register(unitConvertTool);

const getLocationSchema = z.object({
  ip: z.string().optional().describe("IP地址，可选，默认使用客户端IP"),
});

const getLocationTool: ChatToolDefinition<z.infer<typeof getLocationSchema>> = {
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

toolRegistry.register(getLocationTool);

const getWeatherSchema = z.object({
  city: z.string().describe("城市名称，如: 北京"),
});

const getWeatherTool: ChatToolDefinition<z.infer<typeof getWeatherSchema>> = {
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

toolRegistry.register(getWeatherTool);

const webBrowseSchema = z.object({
  url: z.string().describe("要浏览的网页URL"),
  maxChars: z.number().optional().describe("最大返回字符数，默认2000"),
});

const webBrowseTool: ChatToolDefinition<z.infer<typeof webBrowseSchema>> = {
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

toolRegistry.register(webBrowseTool);

const localTextReadSchema = z.object({
  filename: z.string().describe("要读取的文件名"),
});

const localTextReadTool: ChatToolDefinition<z.infer<typeof localTextReadSchema>> = {
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

toolRegistry.register(localTextReadTool);

const listFilesSchema = z.object({});

const listFilesTool: ChatToolDefinition<z.infer<typeof listFilesSchema>> = {
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

toolRegistry.register(listFilesTool);

skillRegistry.register({
  id: "utility-skill",
  name: "实用工具",
  description: "提供计算器、日期时间、单位换算等实用工具能力",
  systemPrompt: "你是一个实用工具助手，擅长使用各种工具解决用户问题。对于数学计算、日期查询、单位换算等问题，请使用相应工具获取准确结果。",
  toolNames: ["calculator", "datetime", "unit_convert", "get_location", "get_weather"],
  outputPolicy: "concise-utility",
  resultPolicy: "tool-first",
  routingHints: ["计算", "时间", "换算", "天气", "位置"],
  tags: ["utility", "calculator", "datetime", "weather"],
  sourceKinds: ["internal", "mcp"],
  capabilitySelectors: [
    { providerKind: "internal", location: "local", capabilityType: "tool", names: ["calculator"] },
    { providerKind: "internal", location: "local", capabilityType: "tool", names: ["datetime"] },
    { providerKind: "internal", location: "local", capabilityType: "tool", names: ["unit_convert"] },
    { providerKind: "mcp", location: "local", capabilityType: "tool", names: ["get_weather"] },
    { providerKind: "internal", location: "local", capabilityType: "tool", names: ["get_location"] },
  ],
  fallbackPolicy: "direct-answer",
  default: true,
});

skillRegistry.register({
  id: "reader-skill",
  name: "信息读取",
  description: "提供本地文件读取、网页浏览等信息获取能力",
  systemPrompt: "你是一个信息读取助手，擅长读取本地文件和浏览网页。对于需要查看文件内容或获取实时信息的请求，请使用相应工具。",
  toolNames: ["local-text-read", "list_files", "web_browse", "get_weather", "get_location"],
  outputPolicy: "detailed-explanation",
  resultPolicy: "summary-first",
  routingHints: ["文件", "读取", "浏览", "查看", "内容"],
  tags: ["reader", "file", "web", "information"],
  sourceKinds: ["internal", "mcp"],
  capabilitySelectors: [
    { providerKind: "mcp", location: "local", capabilityType: "resource", names: ["project-files"] },
    { providerKind: "mcp", location: "local", capabilityType: "prompt", names: ["local-file-summary"] },
    { providerKind: "internal", location: "local", capabilityType: "tool", names: ["local-text-read"] },
    { providerKind: "internal", location: "local", capabilityType: "tool", names: ["list_files"] },
    { providerKind: "internal", location: "local", capabilityType: "tool", names: ["web_browse"] },
    { providerKind: "mcp", location: "local", capabilityType: "tool", names: ["get_weather"] },
    { providerKind: "mcp", location: "remote", capabilityType: "resource", names: ["project://latest-context"] },
    { providerKind: "mcp", location: "remote", capabilityType: "prompt", names: ["tasklist-draft"] },
    { providerKind: "mcp", location: "remote", capabilityType: "tool", names: ["check_doc_consistency"] },
  ],
  fallbackPolicy: "skip-capability",
});

export class ControlledPlanningRuntime {
  private planningEngine: PlanningDecisionEngine;
  private toolRegistry: typeof toolRegistry;

  constructor() {
    this.planningEngine = planningEngine;
    this.toolRegistry = toolRegistry;
  }

  async processUserRequest(userInput: string): Promise<{
    decision: DecisionResult;
    executionResult: any;
    finalContext: PlanningContext;
  }> {
    const initialContext: PlanningContext = {
      userInput,
      currentState: 'INIT',
      availableTools: toolRegistry.listActive().map(tool => tool.name),
      resources: {},
      constraints: {
        maxDepth: 5,
        timeout: 30000,
        allowedActions: ['CONTINUE_PROCESSING', 'REQUEST_MORE_INFO', 'SWITCH_TOOL', 'DECOMPOSE_TASK', 'TERMINATE_PROCESSING']
      },
      history: []
    };

    const decision = await this.planningEngine.makeDecision(initialContext);
    
    const executionResult = await this.planningEngine.executeAction(
      decision.chosenAction, 
      decision.nextContext
    );

    const finalContext: PlanningContext = {
      ...decision.nextContext,
      currentState: executionResult.status === 'error' ? 'FAILED' : 'COMPLETED',
      history: [
        ...decision.nextContext.history,
        {
          action: decision.chosenAction,
          result: executionResult,
          timestamp: Date.now()
        }
      ]
    };

    return {
      decision,
      executionResult,
      finalContext
    };
  }

  recommendTool(userInput: string, context?: PlanningContext): ChatToolDefinition | null {
    return this.toolRegistry.recommendTool(userInput, context);
  }
}

export const planningRuntime = new ControlledPlanningRuntime();

initCapabilities();

export { skillRegistry };