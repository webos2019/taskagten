import { MCPClient, type MCPClientConfig } from './client';

export class MCPClientManager {
  private clients = new Map<string, MCPClient>();
  private configs = new Map<string, MCPClientConfig>();

  register(serverId: string, config: MCPClientConfig): void {
    this.configs.set(serverId, config);
  }

  async getClient(serverId: string): Promise<MCPClient> {
    let client = this.clients.get(serverId);

    if (!client) {
      const config = this.configs.get(serverId);
      if (!config) {
        throw new Error(`MCP server ${serverId} not registered`);
      }

      client = new MCPClient(config);
      await client.connect();
      this.clients.set(serverId, client);
    }

    if (!client.isAlive()) {
      await client.shutdown();
      const config = this.configs.get(serverId);
      if (!config) {
        throw new Error(`MCP server ${serverId} not registered`);
      }
      client = new MCPClient(config);
      await client.connect();
      this.clients.set(serverId, client);
    }

    return client;
  }

  async callTool(serverId: string, toolName: string, arguments_: Record<string, unknown>): Promise<ReturnType<MCPClient['callTool']>> {
    const client = await this.getClient(serverId);
    return client.callTool(toolName, arguments_);
  }

  async readResource(serverId: string, uri: string): Promise<ReturnType<MCPClient['readResource']>> {
    const client = await this.getClient(serverId);
    return client.readResource(uri);
  }

  async shutdown(): Promise<void> {
    const clientsArray = Array.from(this.clients.values());
    for (let i = 0; i < clientsArray.length; i++) {
      await clientsArray[i].shutdown();
    }
    this.clients.clear();
  }

  shutdownServer(serverId: string): void {
    const client = this.clients.get(serverId);
    if (client) {
      client.shutdown();
      this.clients.delete(serverId);
    }
  }
}

export const mcpClientManager = new MCPClientManager();