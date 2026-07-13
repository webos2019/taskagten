import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { getDeepSeekModel } from "./deepseek";
import { skillRegistry } from "./tools";

export type SkillId = "utility-skill" | "reader-skill";

export function getSkill(skillId: SkillId) {
  return skillRegistry.get(skillId);
}

export function getSystemPrompt(skillId: SkillId): string {
  const skill = skillRegistry.get(skillId);
  return skill?.getSystemPrompt() || "";
}

export function createStreamingChatChain(skillId: SkillId = "utility-skill") {
  const skill = skillRegistry.get(skillId);
  if (!skill) {
    throw new Error(`未知的 Skill: "${skillId}"`);
  }

  const tools = skill.getTools();
  const model = tools.length > 0
    ? getDeepSeekModel().bindTools(tools)
    : getDeepSeekModel();

  const prompt = ChatPromptTemplate.fromMessages([
    ["system", skill.getSystemPrompt()],
    new MessagesPlaceholder("messages"),
  ]);

  return prompt.pipe(model);
}

export function createFallbackChatChain(skillId: SkillId = "utility-skill") {
  const skill = skillRegistry.get(skillId);
  if (!skill) {
    throw new Error(`未知的 Skill: "${skillId}"`);
  }

  const model = getDeepSeekModel();

  const prompt = ChatPromptTemplate.fromMessages([
    ["system", skill.getSystemPrompt()],
    new MessagesPlaceholder("messages"),
  ]);

  return prompt.pipe(model);
}
