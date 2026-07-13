import { ChatOpenAI } from "@langchain/openai";

const API_KEY = process.env.DEEPSEEK_API_KEY || "";
const API_BASE = process.env.DEEPSEEK_API_BASE || "https://api.deepseek.com";
const MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat";

let modelInstance: ChatOpenAI | null = null;

export function getDeepSeekModel(): ChatOpenAI {
  if (!API_KEY || API_KEY === "your_deepseek_api_key_here") {
    throw new Error(
      "DEEPSEEK_API_KEY 未配置。请在 .env.local 文件中设置有效的 DEEPSEEK_API_KEY。"
    );
  }

  if (!modelInstance) {
    modelInstance = new ChatOpenAI({
      apiKey: API_KEY,
      model: MODEL,
      temperature: 0.1,
      maxTokens: 4096,
      configuration: {
        baseURL: API_BASE,
      },
      // DeepSeek 特有参数透传
      modelKwargs: {
        // 对 deepseek-reasoner 禁用思考模式（如需）
        // thinking: { type: "disabled" },
      },
    });
  }

  return modelInstance;
}

export function resetModelInstance(): void {
  modelInstance = null;
}

export { API_KEY, API_BASE, MODEL };