export const capabilityTypes = ['prompt', 'resource', 'tool'] as const;
export type CapabilityType = (typeof capabilityTypes)[number];

export const capabilityProviderKinds = ['internal', 'mcp'] as const;
export type CapabilityProviderKind = (typeof capabilityProviderKinds)[number];

export const capabilityLocations = ['local', 'remote'] as const;
export type CapabilityLocation = (typeof capabilityLocations)[number];

export interface CapabilityIdentity {
  name: string;
  capabilityType: CapabilityType;
  providerKind: CapabilityProviderKind;
  location: CapabilityLocation;
  serverId?: string;
}

export const capabilityAvailabilities = ['available', 'unavailable', 'limited'] as const;
export type CapabilityAvailability = (typeof capabilityAvailabilities)[number];

export interface CapabilityDefinition extends CapabilityIdentity {
  capabilityId: string;
  title: string;
  description: string;
  availability: CapabilityAvailability;
  metadata?: Record<string, unknown>;
}

export interface CapabilitySelector {
  providerKind?: CapabilityProviderKind;
  location?: CapabilityLocation;
  capabilityType?: CapabilityType;
  serverId?: string;
  names?: string[];
}

export type SkillFallbackPolicy = 'direct-answer' | 'skip-capability' | 'retry';

export interface SkillDefinition {
  skillId: string;
  name: string;
  description?: string;
  systemPrompt?: string;
  allowedTools?: string[];
  sourceKinds?: CapabilityProviderKind[];
  capabilitySelectors: CapabilitySelector[];
  fallbackPolicy: SkillFallbackPolicy;
}

export interface RemoteCapabilityInvocation {
  capabilityType: CapabilityType;
  capabilityId: string;
  name: string;
  serverId: string;
  input: string;
  execute: (options?: { writer?: unknown; lifecycle?: unknown }) => Promise<CapabilityExecutionResult>;
}

export interface CapabilityExecutionResult {
  success: boolean;
  content?: string;
  messageCount?: number;
  error?: string;
  metadata?: Record<string, unknown>;
}