import { MCPClient, type MCPClientConfig } from './client';

export class MCPClientManager {
  private clients = new Map<string, MCPClient>();
  private configs = new Map<string, MCPClientConfig>();

  register(serverId: string, config: MCPClientConfig): void {
    console.log(`[DEBUG-MCP-MGR] Registering server: ${serverId}`);
    console.log(`[DEBUG-MCP-MGR] Command: ${config.command}`);
    console.log(`[DEBUG-MCP-MGR] Args: ${JSON.stringify(config.args)}`);
    this.configs.set(serverId, config);
  }

  async getClient(serverId: string): Promise<MCPClient> {
    console.log(`[DEBUG-MCP-MGR] Getting client for: ${serverId}`);
    
    let client = this.clients.get(serverId);

    if (!client) {
      console.log(`[DEBUG-MCP-MGR] Client not found, creating new one...`);
      const config = this.configs.get(serverId);
      if (!config) {
        console.error(`[DEBUG-MCP-MGR] Server ${serverId} not registered!`);
        throw new Error(`MCP server ${serverId} not registered`);
      }

      client = new MCPClient(config);
      await client.connect();
      this.clients.set(serverId, client);
      console.log(`[DEBUG-MCP-MGR] Client created and connected for: ${serverId}`);
    } else {
      console.log(`[DEBUG-MCP-MGR] Found existing client for: ${serverId}`);
    }

    if (!client.isAlive()) {
      console.log(`[DEBUG-MCP-MGR] Client not alive, reconnecting...`);
      await client.shutdown();
      const config = this.configs.get(serverId);
      if (!config) {
        throw new Error(`MCP server ${serverId} not registered`);
      }
      client = new MCPClient(config);
      await client.connect();
      this.clients.set(serverId, client);
      console.log(`[DEBUG-MCP-MGR] Client reconnected for: ${serverId}`);
    }

    return client;
  }

  async callTool(serverId: string, toolName: string, arguments_: Record<string, unknown>): Promise<ReturnType<MCPClient['callTool']>> {
    console.log(`[DEBUG-MCP-MGR] callTool - serverId: ${serverId}, toolName: ${toolName}`);
    const client = await this.getClient(serverId);
    return client.callTool(toolName, arguments_);
  }

  async getPrompt(serverId: string, promptName: string, args?: Record<string, unknown>): Promise<ReturnType<MCPClient['getPrompt']>> {
    console.log(`[DEBUG-MCP-MGR] getPrompt - serverId: ${serverId}, promptName: ${promptName}`);
    const client = await this.getClient(serverId);
    return client.getPrompt(promptName, args);
  }

  async readResource(serverId: string, uri: string): Promise<ReturnType<MCPClient['readResource']>> {
    console.log(`[DEBUG-MCP-MGR] readResource - serverId: ${serverId}, uri: ${uri}`);
    const client = await this.getClient(serverId);
    return client.readResource(uri);
  }

  async shutdown(): Promise<void> {
    console.log(`[DEBUG-MCP-MGR] Shutting down all clients...`);
    const clientsArray = Array.from(this.clients.values());
    for (let i = 0; i < clientsArray.length; i++) {
      await clientsArray[i].shutdown();
    }
    this.clients.clear();
    console.log(`[DEBUG-MCP-MGR] All clients shut down`);
  }

  shutdownServer(serverId: string): void {
    console.log(`[DEBUG-MCP-MGR] Shutting down server: ${serverId}`);
    const client = this.clients.get(serverId);
    if (client) {
      client.shutdown();
      this.clients.delete(serverId);
    }
    console.log(`[DEBUG-MCP-MGR] Server ${serverId} shut down`);
  }
}

export const mcpClientManager = new MCPClientManager();