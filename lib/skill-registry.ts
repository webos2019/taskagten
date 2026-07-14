import { toolRegistry, type ChatToolDefinition } from "./tool-registry";
import type { StructuredToolInterface } from "@langchain/core/tools";
import type { SkillDefinition as CapabilitySkillDefinition, CapabilitySelector, CapabilityIdentity, CapabilityType, CapabilityProviderKind, CapabilityLocation } from "./capability/types";
import { createCapabilityId } from "./capability/registry";

export type SkillOutputPolicy = "concise-utility" | "detailed-explanation" | "creative";
export type SkillResultPolicy = "tool-first" | "summary-first" | "auto";
export type SkillFallbackPolicy = "direct-answer" | "skip-capability" | "retry";

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
  fallbackPolicy?: SkillFallbackPolicy;
  sourceKinds?: CapabilityProviderKind[];
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
  getFallbackPolicy(): SkillFallbackPolicy;
  getSourceKinds(): CapabilityProviderKind[];
  toCapabilityDefinition(): CapabilitySkillDefinition;
  isCapabilityAllowed(identity: CapabilityIdentity): boolean;
  listAllowedCapabilities(): CapabilitySelector[];
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
      getSourceKinds() {
        return meta.sourceKinds || [];
      },
      toCapabilityDefinition(): CapabilitySkillDefinition {
        return {
          skillId: meta.id,
          name: meta.name,
          description: meta.description,
          systemPrompt: meta.systemPrompt,
          allowedTools: meta.toolNames,
          sourceKinds: meta.sourceKinds || ["internal", "mcp"],
          capabilitySelectors: meta.capabilitySelectors || [],
          fallbackPolicy: meta.fallbackPolicy || "direct-answer",
        };
      },
      isCapabilityAllowed(identity: CapabilityIdentity): boolean {
        const capabilityId = createCapabilityId(identity);
        const selectors = meta.capabilitySelectors || [];
        
        for (const selector of selectors) {
          if (selector.providerKind && identity.providerKind !== selector.providerKind) {
            continue;
          }
          if (selector.location && identity.location !== selector.location) {
            continue;
          }
          if (selector.capabilityType && identity.capabilityType !== selector.capabilityType) {
            continue;
          }
          if (selector.serverId && identity.serverId !== selector.serverId) {
            continue;
          }
          if (selector.names && !selector.names.includes(identity.name)) {
            continue;
          }
          return true;
        }
        
        return false;
      },
      listAllowedCapabilities(): CapabilitySelector[] {
        return meta.capabilitySelectors || [];
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