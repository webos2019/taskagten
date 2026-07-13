import { AIMessage, HumanMessage, SystemMessage, ToolMessage, type BaseMessage } from "@langchain/core/messages";
import { skillRegistry } from "@/lib/skill-registry";
import { getDeepSeekModel } from "@/lib/deepseek";

export interface ChatSessionConfig {
  skillId: string;
  messages: Array<{ role: string; content: string; files?: { name: string; type: string; content: string }[] }>;
}

export interface ChatSession {
  getMessages(): BaseMessage[];
  getSkillId(): string;
  getSystemPrompt(): string;
  getModel(): ReturnType<typeof getDeepSeekModel>;
}

export function createChatSession(config: ChatSessionConfig): ChatSession {
  const skill = skillRegistry.get(config.skillId);
  if (!skill) {
    throw new Error(`未知的 Skill: "${config.skillId}"`);
  }

  const langchainMessages = toLangChainMessages(config.messages);

  return {
    getMessages() {
      return langchainMessages;
    },
    getSkillId() {
      return config.skillId;
    },
    getSystemPrompt() {
      return skill.getSystemPrompt();
    },
    getModel() {
      const tools = skill.getTools();
      return tools.length > 0
        ? getDeepSeekModel().bindTools(tools)
        : getDeepSeekModel();
    },
  };
}

function toLangChainMessages(messages: Array<{ role: string; content: string; files?: { name: string; type: string; content: string }[] }>): BaseMessage[] {
  return messages.map((msg) => {
    let content = msg.content;
    if (msg.role === "user" && (msg as any).files?.length) {
      const fileContext = (msg as any).files
        .map((f: any) => `\`\`\`\n文件: ${f.name}\n\`\`\`\n\`\`\`${f.type || "text"}\n${f.content}\n\`\`\``)
        .join("\n\n");
      content = content
        ? `${content}\n\n---\n以下是用户上传的代码文件：\n\n${fileContext}`
        : `用户上传了以下代码文件：\n\n${fileContext}`;
    }
    switch (msg.role) {
      case "system": return new SystemMessage(content);
      case "assistant": return new AIMessage(content);
      default: return new HumanMessage(content);
    }
  });
}
