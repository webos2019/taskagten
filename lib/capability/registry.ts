import type { CapabilityDefinition, CapabilityIdentity, CapabilitySelector, CapabilityType, CapabilityProviderKind, CapabilityLocation } from './types';

export function createCapabilityId(identity: CapabilityIdentity): string {
  const { providerKind, location, capabilityType, serverId, name } = identity;
  return serverId 
    ? `${providerKind}:${location}:${capabilityType}:${serverId}:${name}`
    : `${providerKind}:${location}:${capabilityType}:${name}`;
}

export class CapabilityRegistry {
  private capabilities = new Map<string, CapabilityDefinition>();

  register(definition: CapabilityDefinition): this {
    this.capabilities.set(definition.capabilityId, definition);
    return this;
  }

  get(capabilityId: string): CapabilityDefinition | undefined {
    return this.capabilities.get(capabilityId);
  }

  has(capabilityId: string): boolean {
    return this.capabilities.has(capabilityId);
  }

  list(): CapabilityDefinition[] {
    return Array.from(this.capabilities.values());
  }

  listByType(capabilityType: CapabilityType): CapabilityDefinition[] {
    return this.list().filter((c) => c.capabilityType === capabilityType);
  }

  listByProvider(providerKind: CapabilityProviderKind): CapabilityDefinition[] {
    return this.list().filter((c) => c.providerKind === providerKind);
  }

  listByLocation(location: CapabilityLocation): CapabilityDefinition[] {
    return this.list().filter((c) => c.location === location);
  }

  listByServer(serverId: string): CapabilityDefinition[] {
    return this.list().filter((c) => c.serverId === serverId);
  }

  listAvailable(): CapabilityDefinition[] {
    return this.list().filter((c) => c.availability === 'available');
  }

  select(selector: CapabilitySelector): CapabilityDefinition[] {
    return this.list().filter((c) => {
      if (selector.providerKind && c.providerKind !== selector.providerKind) {
        return false;
      }
      if (selector.location && c.location !== selector.location) {
        return false;
      }
      if (selector.capabilityType && c.capabilityType !== selector.capabilityType) {
        return false;
      }
      if (selector.serverId && c.serverId !== selector.serverId) {
        return false;
      }
      if (selector.names && !selector.names.includes(c.name)) {
        return false;
      }
      return true;
    });
  }

  clear(): void {
    this.capabilities.clear();
  }
}

export const capabilityRegistry = new CapabilityRegistry();