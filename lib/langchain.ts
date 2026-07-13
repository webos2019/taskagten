import { skillRegistry } from "./skill-registry";

export type SkillId = "utility-skill" | "reader-skill";

export function getSkill(skillId: SkillId) {
  return skillRegistry.get(skillId);
}

export function getSystemPrompt(skillId: SkillId): string {
  const skill = skillRegistry.get(skillId);
  return skill?.getSystemPrompt() || "";
}
