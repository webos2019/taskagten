import { toolRegistry, type ChatToolDefinition } from "./tool-registry";
import type { StructuredToolInterface } from "@langchain/core/tools";
import type { SkillDefinition as CapabilitySkillDefinition, CapabilitySelector } from "./capability/types";

export type SkillOutputPolicy = "concise-utility" | "detailed-explanation" | "creative";
export type SkillResultPolicy = "tool-first" | "summary-first" | "auto";

export interface SkillMeta {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  toolNames: string[];
  outputPolicy?: SkillOutputPolicy;
  resultPolicy?: SkillResultPolicy;
  routingHints?: string[];
  default?: boolean;
  tags?: string[];
  capabilitySelectors?: CapabilitySelector[];
  fallbackPolicy?: "direct-answer" | "skip-capability" | "retry";
}

export interface RegisteredSkill {
  meta: SkillMeta;
  getTools(): StructuredToolInterface[];
  getToolDefinitions(): ChatToolDefinition[];
  getSystemPrompt(): string;
  getOutputPolicy(): SkillOutputPolicy;
  getResultPolicy(): SkillResultPolicy;
  getRoutingHints(): string[];
  getCapabilitySelectors(): CapabilitySelector[];
  getFallbackPolicy(): "direct-answer" | "skip-capability" | "retry";
  toCapabilityDefinition(): CapabilitySkillDefinition;
}

export class SkillRegistry {
  private _skills = new Map<string, RegisteredSkill>();

  register(meta: SkillMeta): this {
    if (this._skills.has(meta.id)) {
      throw new Error(`Skill "${meta.id}" 已经注册，请勿重复注册`);
    }

    this._skills.set(meta.id, {
      meta,
      getTools() {
        return meta.toolNames
          .map((name) => {
            const tool = toolRegistry.get(name);
            return tool?.tool;
          })
          .filter((t): t is StructuredToolInterface => t !== undefined);
      },
      getToolDefinitions() {
        return meta.toolNames
          .map((name) => toolRegistry.get(name))
          .filter((t): t is ChatToolDefinition => t !== undefined);
      },
      getSystemPrompt() {
        return meta.systemPrompt;
      },
      getOutputPolicy() {
        return meta.outputPolicy || "concise-utility";
      },
      getResultPolicy() {
        return meta.resultPolicy || "auto";
      },
      getRoutingHints() {
        return meta.routingHints || [];
      },
      getCapabilitySelectors() {
        return meta.capabilitySelectors || [];
      },
      getFallbackPolicy() {
        return meta.fallbackPolicy || "direct-answer";
      },
      toCapabilityDefinition(): CapabilitySkillDefinition {
        return {
          skillId: meta.id,
          name: meta.name,
          description: meta.description,
          systemPrompt: meta.systemPrompt,
          allowedTools: meta.toolNames,
          sourceKinds: ["mcp"],
          capabilitySelectors: meta.capabilitySelectors || [],
          fallbackPolicy: meta.fallbackPolicy || "direct-answer",
        };
      },
    });

    return this;
  }

  get size(): number {
    return this._skills.size;
  }

  get(id: string): RegisteredSkill | undefined {
    return this._skills.get(id);
  }

  has(id: string): boolean {
    return this._skills.has(id);
  }

  listMeta(): SkillMeta[] {
    return Array.from(this._skills.values()).map((s) => s.meta);
  }

  list(): RegisteredSkill[] {
    return Array.from(this._skills.values());
  }

  getDefault(): RegisteredSkill | undefined {
    return Array.from(this._skills.values()).find((s) => s.meta.default);
  }

  clear(): void {
    this._skills.clear();
  }
}

export const skillRegistry = new SkillRegistry();