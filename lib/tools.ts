import { tool as langchainTool } from "@langchain/core/tools";
import { z } from "zod";
import { toolRegistry, type ChatToolDefinition } from "./tool-registry";
import { skillRegistry } from "./skill-registry";

const calculatorSchema = z.object({
  expression: z.string().describe("数学表达式，如: 1+2*3"),
});

const calculatorTool: ChatToolDefinition<z.infer<typeof calculatorSchema>> = {
  name: "calculator",
  tool: langchainTool(
    async ({ expression }) => {
      try {
        const result = eval(expression);
        return { expression, result };
      } catch {
        return { expression, result: "表达式错误" };
      }
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
};

const datetimeSchema = z.object({
  action: z.enum(["current_time", "add_days", "subtract_days", "get_weekday", "format_date"]).describe("时间操作类型"),
  date: z.string().optional().describe("日期，格式 YYYY-MM-DD，不填则使用当前日期"),
  days: z.number().optional().describe("要加减的天数"),
});

const datetimeTool: ChatToolDefinition<z.infer<typeof datetimeSchema>> = {
  name: "datetime",
  tool: langchainTool(
    async ({ action, date, days }) => {
      const now = date ? new Date(date) : new Date();
      
      switch (action) {
        case "current_time":
          return {
            action,
            currentTime: now.toLocaleString("zh-CN"),
            timestamp: now.getTime(),
          };
        case "add_days":
          now.setDate(now.getDate() + (days || 0));
          return { action, originalDate: date || "今天", days: days || 0, resultDate: now.toLocaleDateString("zh-CN") };
        case "subtract_days":
          now.setDate(now.getDate() - (days || 0));
          return { action, originalDate: date || "今天", days: days || 0, resultDate: now.toLocaleDateString("zh-CN") };
        case "get_weekday":
          const weekdays = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
          return { action, date: now.toLocaleDateString("zh-CN"), weekday: weekdays[now.getDay()] };
        case "format_date":
          return { action, originalDate: date || "今天", formatted: now.toLocaleString("zh-CN") };
        default:
          return { action, error: "未知操作" };
      }
    },
    {
      name: "datetime",
      description: "获取当前时间、日期加减、判断星期、格式化日期",
      schema: datetimeSchema,
    },
  ),
  schema: datetimeSchema,
  formatInput: ({ action, date, days }) => {
    if (action === "current_time") return "获取当前时间";
    if (action === "add_days") return `${date || "今天"} + ${days}天`;
    if (action === "subtract_days") return `${date || "今天"} - ${days}天`;
    if (action === "get_weekday") return `${date || "今天"} 是星期几`;
    return `格式化日期: ${date || "今天"}`;
  },
  formatOutput: (result) => JSON.stringify(result),
  getDisplayConfig: () => ({ title: "日期时间", description: "时间处理", category: "time" }),
  resultIsAuthoritative: true,
};

const textTransformSchema = z.object({
  action: z.enum(["markdown_to_text", "extract_links", "extract_code_blocks", "json_pretty"]).describe("文本转换操作"),
  content: z.string().describe("要转换的文本内容"),
});

const textTransformTool: ChatToolDefinition<z.infer<typeof textTransformSchema>> = {
  name: "text_transform",
  tool: langchainTool(
    async ({ action, content }) => {
      switch (action) {
        case "markdown_to_text":
          return { action, result: content.replace(/[#*`~\[\]()>-]/g, "").replace(/\n+/g, "\n").trim() };
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
};

const supportedUnits = [
  "m", "km", "cm", "mm", "inch", "foot", "yard", "mile",
  "kg", "g", "mg", "lb", "oz",
  "celsius", "fahrenheit", "kelvin",
] as const;

const unitConvertSchema = z.object({
  value: z.number().finite().describe("要转换的数值"),
  from: z.enum(supportedUnits).describe("源单位"),
  to: z.enum(supportedUnits).describe("目标单位"),
});

const unitConvertTool: ChatToolDefinition<z.infer<typeof unitConvertSchema>> = {
  name: "unit_convert",
  tool: langchainTool(
    async ({ value, from, to }) => {
      if (from === to) {
        return { value, from, to, result: value, message: "源单位和目标单位相同" };
      }

      let meters: number;
      switch (from) {
        case "m": meters = value; break;
        case "km": meters = value * 1000; break;
        case "cm": meters = value / 100; break;
        case "mm": meters = value / 1000; break;
        case "inch": meters = value * 0.0254; break;
        case "foot": meters = value * 0.3048; break;
        case "yard": meters = value * 0.9144; break;
        case "mile": meters = value * 1609.344; break;
        default: meters = value;
      }

      let kilograms: number;
      switch (from) {
        case "kg": kilograms = value; break;
        case "g": kilograms = value / 1000; break;
        case "mg": kilograms = value / 1000000; break;
        case "lb": kilograms = value * 0.453592; break;
        case "oz": kilograms = value * 0.0283495; break;
        default: kilograms = value;
      }

      let celsius: number;
      switch (from) {
        case "celsius": celsius = value; break;
        case "fahrenheit": celsius = (value - 32) * 5 / 9; break;
        case "kelvin": celsius = value - 273.15; break;
        default: celsius = value;
      }

      let result: number;
      switch (to) {
        case "m": result = meters; break;
        case "km": result = meters / 1000; break;
        case "cm": result = meters * 100; break;
        case "mm": result = meters * 1000; break;
        case "inch": result = meters / 0.0254; break;
        case "foot": result = meters / 0.3048; break;
        case "yard": result = meters / 0.9144; break;
        case "mile": result = meters / 1609.344; break;
        case "kg": result = kilograms; break;
        case "g": result = kilograms * 1000; break;
        case "mg": result = kilograms * 1000000; break;
        case "lb": result = kilograms / 0.453592; break;
        case "oz": result = kilograms / 0.0283495; break;
        case "celsius": result = celsius; break;
        case "fahrenheit": result = celsius * 9 / 5 + 32; break;
        case "kelvin": result = celsius + 273.15; break;
        default: result = value;
      }

      const unitNames: Record<string, string> = {
        m: "米", km: "千米", cm: "厘米", mm: "毫米",
        inch: "英寸", foot: "英尺", yard: "码", mile: "英里",
        kg: "千克", g: "克", mg: "毫克", lb: "磅", oz: "盎司",
        celsius: "摄氏度", fahrenheit: "华氏度", kelvin: "开尔文",
      };

      return {
        value,
        from,
        fromName: unitNames[from] || from,
        to,
        toName: unitNames[to] || to,
        result: Number(result.toFixed(6)),
        message: `${value} ${unitNames[from] || from} = ${Number(result.toFixed(6))} ${unitNames[to] || to}`,
      };
    },
    {
      name: "unit_convert",
      description: "单位换算：支持长度、重量、温度单位之间的转换",
      schema: unitConvertSchema,
    },
  ),
  schema: unitConvertSchema,
  formatInput: ({ value, from, to }) => `${value} ${from} -> ${to}`,
  formatOutput: (result) => JSON.stringify(result),
  getDisplayConfig: () => ({ title: "单位换算", description: "单位转换", category: "utility" }),
  resultIsAuthoritative: true,
};

const textFileExtensions = [
  ".ts", ".tsx", ".js", ".jsx", ".json", ".md", ".txt", ".yaml", ".yml", ".html", ".css", ".jsonc",
];

const readFileSchema = z.object({
  filename: z.string().describe("项目根目录下的文件名，仅支持直接文件，不支持子目录"),
});

const readFileTool: ChatToolDefinition<z.infer<typeof readFileSchema>> = {
  name: "read_file",
  tool: langchainTool(
    async ({ filename }) => {
      const fs = await import("fs");
      const path = await import("path");

      if (filename.includes("/") || filename.includes("\\")) {
        return { error: "访问被拒绝：仅支持读取项目根目录下的直接文件，不支持子目录路径" };
      }

      if (filename.startsWith(".") && !filename.startsWith(".")) {
        return { error: "访问被拒绝：文件名不能以 . 开头（隐藏文件）" };
      }

      if (filename.includes("..")) {
        return { error: "访问被拒绝：不允许路径遍历" };
      }

      if (path.isAbsolute(filename)) {
        return { error: "访问被拒绝：不允许绝对路径" };
      }

      const ext = path.extname(filename).toLowerCase();
      if (!textFileExtensions.includes(ext)) {
        return { error: `访问被拒绝：仅支持文本类文件，当前文件类型: ${ext}` };
      }

      const fullPath = path.resolve(process.cwd(), filename);
      if (!fs.existsSync(fullPath)) {
        return { error: `文件不存在: ${filename}` };
      }

      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        return { error: `访问被拒绝：${filename} 是目录，不是文件` };
      }

      const content = fs.readFileSync(fullPath, "utf-8");
      return { filename, content: content.slice(0, 10000) };
    },
    {
      name: "read_file",
      description: "读取项目根目录下的文本文件内容",
      schema: readFileSchema,
    },
  ),
  schema: readFileSchema,
  formatInput: ({ filename }) => `读取文件: ${filename}`,
  formatOutput: (result) => JSON.stringify(result),
  getDisplayConfig: () => ({ title: "文件读取", description: "读取根目录文本文件", category: "file" }),
};

const listDirectorySchema = z.object({
  dir_path: z.string().optional().describe("目录路径，仅支持项目根目录（.），不支持子目录"),
});

const listDirectoryTool: ChatToolDefinition<z.infer<typeof listDirectorySchema>> = {
  name: "list_directory",
  tool: langchainTool(
    async ({ dir_path = "." }) => {
      const fs = await import("fs");
      const path = await import("path");

      if (dir_path !== "." && dir_path !== "") {
        return { error: "访问被拒绝：仅支持浏览项目根目录，不支持子目录" };
      }

      const fullPath = path.resolve(process.cwd(), ".");
      if (!fs.existsSync(fullPath)) {
        return { error: "目录不存在" };
      }

      const entries = fs.readdirSync(fullPath, { withFileTypes: true })
        .filter((entry) => !entry.name.startsWith("."))
        .map((entry) => ({
          name: entry.name,
          type: entry.isDirectory() ? "directory" : "file",
          extension: entry.isFile() ? path.extname(entry.name) : "",
        }));

      return { dir_path: ".", entries };
    },
    {
      name: "list_directory",
      description: "列出项目根目录内容",
      schema: listDirectorySchema,
    },
  ),
  schema: listDirectorySchema,
  formatInput: ({ dir_path }) => `列出目录: ${dir_path || "."}`,
  formatOutput: (result) => JSON.stringify(result),
  getDisplayConfig: () => ({ title: "目录浏览", description: "查看项目根目录", category: "file" }),
};

const getLocationSchema = z.object({
  ip: z.string().optional().describe("用户IP地址"),
});

const getLocationTool: ChatToolDefinition<z.infer<typeof getLocationSchema>> = {
  name: "get_location",
  tool: langchainTool(
    async ({ ip }) => {
      if (!ip) {
        return { error: "未提供 IP 地址，请询问用户所在城市", hint: "请用户提供城市名称" };
      }
      const localhostIPs = ["127.0.0.1", "localhost", "::1", "user_ip"];
      if (localhostIPs.includes(ip.toLowerCase())) {
        return { error: "无法通过本地 IP 获取位置信息，请询问用户所在城市", hint: "请用户提供城市名称" };
      }
      try {
        const response = await fetch(`http://ip-api.com/json/${ip}?lang=zh-CN`);
        const data = await response.json();
        if (data.status !== "success") {
          return { error: "无法获取位置信息，请询问用户所在城市", hint: "请用户提供城市名称" };
        }
        return {
          city: data.city,
          regionName: data.regionName,
          country: data.country,
          latitude: data.lat,
          longitude: data.lon,
          zip: data.zip,
        };
      } catch (e) {
        return { error: "定位失败，请询问用户所在城市", hint: "请用户提供城市名称" };
      }
    },
    {
      name: "get_location",
      description: "通过IP获取用户位置信息",
      schema: getLocationSchema,
    },
  ),
  schema: getLocationSchema,
  formatInput: ({ ip }) => `定位 IP: ${ip || "自动"}`,
  formatOutput: (result) => JSON.stringify(result),
  getDisplayConfig: () => ({ title: "地理位置", description: "IP定位", category: "web" }),
};

const getWeatherSchema = z.object({
  city: z.string().describe("城市名称，如：北京、上海、广州"),
});

const getWeatherTool: ChatToolDefinition<z.infer<typeof getWeatherSchema>> = {
  name: "get_weather",
  tool: langchainTool(
    async ({ city }) => {
      if (!city) {
        return { error: "必须提供城市名称" };
      }

      try {
        const response = await fetch(
          `https://wttr.in/${encodeURIComponent(city)}?format=j1`,
        );
        const data = await response.json();

        if (!data.current_condition || data.current_condition.length === 0) {
          return { error: `无法获取城市 "${city}" 的天气信息` };
        }

        const condition = data.current_condition[0];
        const nearestArea = data.nearest_area && data.nearest_area[0];
        const forecast = data.weather && data.weather[0];

        return {
          city: nearestArea?.areaName?.[0]?.value || city,
          region: nearestArea?.region?.[0]?.value || "",
          country: nearestArea?.country?.[0]?.value || "",
          temperature: parseFloat(condition.temp_C),
          feelsLike: parseFloat(condition.FeelsLikeC),
          humidity: parseInt(condition.humidity),
          weather: condition.weatherDesc?.[0]?.value || "未知",
          windSpeed: parseFloat(condition.windspeedKmph),
          windDirection: condition.winddir16Point || "",
          visibility: parseFloat(condition.visibility),
          uvIndex: parseInt(condition.uvIndex),
          temperatureMax: forecast?.maxtempC ? parseInt(forecast.maxtempC) : undefined,
          temperatureMin: forecast?.mintempC ? parseInt(forecast.mintempC) : undefined,
          source: "wttr.in",
        };
      } catch (e) {
        return { error: `获取天气失败: ${(e as Error).message}` };
      }
    },
    {
      name: "get_weather",
      description: "查询指定城市的实时天气",
      schema: getWeatherSchema,
    },
  ),
  schema: getWeatherSchema,
  formatInput: ({ city }) => `查询天气: ${city}`,
  formatOutput: (result) => JSON.stringify(result),
  getDisplayConfig: () => ({ title: "实时天气", description: "查询城市天气", category: "web" }),
};

toolRegistry.register(calculatorTool);
toolRegistry.register(datetimeTool);
toolRegistry.register(textTransformTool);
toolRegistry.register(unitConvertTool);
toolRegistry.register(readFileTool);
toolRegistry.register(listDirectoryTool);
toolRegistry.register(getLocationTool);
toolRegistry.register(getWeatherTool);

skillRegistry.register({
  id: "utility-skill",
  name: "实用工具",
  description: "处理日常确定性实用任务的稳定能力层",
  systemPrompt: `你是一个实用工具专家。当用户提问时，根据问题类型选择合适的工具：

可用工具：
- calculator: 执行数学计算
- datetime: 获取当前时间、日期加减、判断星期、格式化日期
- text_transform: Markdown转文本、提取链接、提取代码块、JSON美化
- unit_convert: 单位换算（长度、重量、温度）

规则：
- 涉及数学计算时，必须调用 calculator
- 涉及时间日期时，必须调用 datetime
- 涉及文本转换时，可以调用 text_transform
- 涉及单位换算时，必须调用 unit_convert
- 如果不需要工具，直接回答用户
- 使用工具返回的数据进行总结
- 输出保持简洁实用，结果优先`,
  toolNames: ["calculator", "datetime", "text_transform", "unit_convert"],
  outputPolicy: "concise-utility",
  resultPolicy: "tool-first",
  routingHints: ["math", "calculation", "date", "time", "weekday", "convert", "unit", "markdown", "link", "json"],
  tags: ["utility", "math", "time", "text"],
});

skillRegistry.register({
  id: "reader-skill",
  name: "文件与天气",
  description: "外部上下文获取：文件读取与实时天气查询",
  systemPrompt: `你是一个外部上下文获取专家，负责接入模型无法直接访问的信息来源。

可用工具：
- list_directory: 列出项目根目录内容（仅支持根目录）
- read_file: 读取项目根目录下的直接文本文件（仅支持直接文件，不支持子目录）
- get_location: 通过 IP 获取用户所在城市
- get_weather: 查询指定城市的实时天气（必须提供城市名称）

文件操作规则：
- 仅支持读取项目根目录下的直接文件，不支持子目录路径
- 文件名不能包含路径分隔符（/ 或 \\）
- 文件名不能包含 ..（路径遍历）
- 文件名不能以 . 开头（隐藏文件）
- 不允许绝对路径
- 只支持文本类文件（.ts, .tsx, .js, .jsx, .json, .md, .txt, .yaml, .yml, .html, .css）
- 使用 list_directory 查看项目根目录结构
- 使用 read_file 读取具体文件内容

天气查询流程：
1. 如果用户问"今天天气怎么样"且未提供城市名，先调用 get_location 获取城市
2. 获取城市后，调用 get_weather 查询该城市天气
3. 如果用户直接提供城市名（如"北京今天天气"），直接调用 get_weather
4. 根据工具结果用自然语言总结给用户

重要原则：
- 这些工具提供的是模型无法自行获取的信息，必须通过工具调用才能获得
- 没有天气工具，就拿不到实时天气；没有文件工具，就看不到项目文件
- 工具是能力成立的前提，不是可选增强`,
  toolNames: ["read_file", "list_directory", "get_location", "get_weather"],
  outputPolicy: "detailed-explanation",
  resultPolicy: "summary-first",
  routingHints: ["file", "read", "directory", "weather", "location", "city", "文件", "天气", "目录", "读取"],
  tags: ["file", "weather", "location"],
  capabilitySelectors: [
    { providerKind: "mcp", location: "local", capabilityType: "tool", names: ["get_weather"] },
    { providerKind: "mcp", location: "local", capabilityType: "resource", names: ["local-text-read"] },
    { providerKind: "mcp", location: "local", capabilityType: "prompt", names: ["local-file-summary"] },
    { providerKind: "mcp", location: "remote", serverId: "project-assistant-service", capabilityType: "resource" },
    { providerKind: "mcp", location: "remote", serverId: "project-assistant-service", capabilityType: "prompt" },
    { providerKind: "mcp", location: "remote", serverId: "project-assistant-service", capabilityType: "tool" },
  ],
  fallbackPolicy: "direct-answer",
});

export { toolRegistry, skillRegistry };
