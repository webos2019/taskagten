import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { MCP_CLIENT_INFO, MCP_CLIENT_CAPABILITIES } from './types';

export interface MCPClientConfig {
  serverId: string;
  command: string;
  args: string[];
}

export class MCPClient {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private isConnected = false;

  constructor(private config: MCPClientConfig) {}

  async connect(): Promise<void> {
    if (this.isConnected) return;

    this.transport = new StdioClientTransport({
      command: this.config.command,
      args: this.config.args,
    });

    this.client = new Client(MCP_CLIENT_INFO, {
      capabilities: MCP_CLIENT_CAPABILITIES,
    });

    await this.client.connect(this.transport);
    this.isConnected = true;
  }

  async callTool(toolName: string, arguments_: Record<string, unknown>): Promise<ReturnType<Client['callTool']>> {
    if (!this.client) {
      throw new Error('MCP client not connected');
    }
    return this.client.callTool({ name: toolName, arguments: arguments_ });
  }

  async readResource(uri: string): Promise<ReturnType<Client['readResource']>> {
    if (!this.client) {
      throw new Error('MCP client not connected');
    }
    return this.client.readResource({ uri });
  }

  async shutdown(): Promise<void> {
    if (this.transport) {
      await this.transport.close();
    }
    this.isConnected = false;
    this.client = null;
    this.transport = null;
  }

  getServerId(): string {
    return this.config.serverId;
  }

  isAlive(): boolean {
    return this.isConnected;
  }
}