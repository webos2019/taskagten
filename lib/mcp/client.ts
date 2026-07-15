import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { MCP_CLIENT_INFO, MCP_CLIENT_CAPABILITIES } from './types';
import { withTimeout } from '@/lib/ai/debug/timeout-detector';

export interface MCPClientConfig {
  serverId: string;
  command: string;
  args: string[];
}

export class MCPClient {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private isConnected = false;
  private startTime = 0;

  constructor(private config: MCPClientConfig) {}

  async connect(): Promise<void> {
    if (this.isConnected) {
      console.log(`[DEBUG-MCP] [${this.config.serverId}] Already connected, skipping`);
      return;
    }

    console.log(`[DEBUG-MCP] [${this.config.serverId}] Starting connect...`);
    console.log(`[DEBUG-MCP] [${this.config.serverId}] Command: ${this.config.command}`);
    console.log(`[DEBUG-MCP] [${this.config.serverId}] Args: ${JSON.stringify(this.config.args)}`);

    const start = Date.now();
    try {
      this.transport = new StdioClientTransport({
        command: this.config.command,
        args: this.config.args,
      });

      console.log(`[DEBUG-MCP] [${this.config.serverId}] Transport created, creating client...`);

      this.client = new Client(MCP_CLIENT_INFO, {
        capabilities: MCP_CLIENT_CAPABILITIES,
      });

      console.log(`[DEBUG-MCP] [${this.config.serverId}] Client created, connecting...`);

      await withTimeout(`MCP connect [${this.config.serverId}]`, this.client.connect(this.transport), { timeoutMs: 15000 });
      this.isConnected = true;
      this.startTime = Date.now();

      const elapsed = Date.now() - start;
      console.log(`[DEBUG-MCP] [${this.config.serverId}] Connected successfully! Elapsed: ${elapsed}ms`);
    } catch (err) {
      const elapsed = Date.now() - start;
      console.error(`[DEBUG-MCP] [${this.config.serverId}] Connect failed! Elapsed: ${elapsed}ms`);
      console.error(`[DEBUG-MCP] [${this.config.serverId}] Error:`, err);
      throw err;
    }
  }

  async callTool(toolName: string, arguments_: Record<string, unknown>): Promise<ReturnType<Client['callTool']>> {
    if (!this.client) {
      throw new Error('MCP client not connected');
    }

    console.log(`[DEBUG-MCP] [${this.config.serverId}] Calling tool: ${toolName}`);
    console.log(`[DEBUG-MCP] [${this.config.serverId}] Arguments: ${JSON.stringify(arguments_)}`);

    const start = Date.now();
    try {
      const result = await withTimeout(`MCP callTool [${this.config.serverId}].${toolName}`, this.client.callTool({ name: toolName, arguments: arguments_ }), { timeoutMs: 30000 });
      const elapsed = Date.now() - start;
      console.log(`[DEBUG-MCP] [${this.config.serverId}] Tool call completed! Elapsed: ${elapsed}ms`);
      console.log(`[DEBUG-MCP] [${this.config.serverId}] Result type: ${result.type}`);
      console.log(`[DEBUG-MCP] [${this.config.serverId}] Is error: ${result.isError}`);
      if (result.content) {
        const contentStr = typeof result.content === 'string' ? result.content : JSON.stringify(result.content).slice(0, 200);
        console.log(`[DEBUG-MCP] [${this.config.serverId}] Result content: ${contentStr}...`);
      }
      return result;
    } catch (err) {
      const elapsed = Date.now() - start;
      console.error(`[DEBUG-MCP] [${this.config.serverId}] Tool call failed! Elapsed: ${elapsed}ms`);
      console.error(`[DEBUG-MCP] [${this.config.serverId}] Error:`, err);
      throw err;
    }
  }

  async getPrompt(name: string, args?: Record<string, unknown>): Promise<ReturnType<Client['getPrompt']>> {
    if (!this.client) {
      throw new Error('MCP client not connected');
    }

    console.log(`[DEBUG-MCP] [${this.config.serverId}] Getting prompt: ${name}`);
    console.log(`[DEBUG-MCP] [${this.config.serverId}] Args: ${JSON.stringify(args || {})}`);

    const start = Date.now();
    try {
      const result = await withTimeout(
        `MCP getPrompt [${this.config.serverId}].${name}`,
        this.client.getPrompt({ name, arguments: args || {} }),
        { timeoutMs: 30000 }
      );
      const elapsed = Date.now() - start;
      console.log(`[DEBUG-MCP] [${this.config.serverId}] Prompt completed! Elapsed: ${elapsed}ms`);
      console.log(`[DEBUG-MCP] [${this.config.serverId}] Messages count: ${result.messages?.length || 0}`);
      return result;
    } catch (err) {
      const elapsed = Date.now() - start;
      console.error(`[DEBUG-MCP] [${this.config.serverId}] Prompt failed! Elapsed: ${elapsed}ms`);
      console.error(`[DEBUG-MCP] [${this.config.serverId}] Error:`, err);
      throw err;
    }
  }

  async readResource(uri: string): Promise<ReturnType<Client['readResource']>> {
    if (!this.client) {
      throw new Error('MCP client not connected');
    }

    console.log(`[DEBUG-MCP] [${this.config.serverId}] Reading resource: ${uri}`);

    const start = Date.now();
    try {
      const result = await this.client.readResource({ uri });
      const elapsed = Date.now() - start;
      console.log(`[DEBUG-MCP] [${this.config.serverId}] Resource read completed! Elapsed: ${elapsed}ms`);
      return result;
    } catch (err) {
      const elapsed = Date.now() - start;
      console.error(`[DEBUG-MCP] [${this.config.serverId}] Resource read failed! Elapsed: ${elapsed}ms`);
      console.error(`[DEBUG-MCP] [${this.config.serverId}] Error:`, err);
      throw err;
    }
  }

  async shutdown(): Promise<void> {
    console.log(`[DEBUG-MCP] [${this.config.serverId}] Shutting down...`);
    if (this.transport) {
      await this.transport.close();
    }
    this.isConnected = false;
    this.client = null;
    this.transport = null;
    console.log(`[DEBUG-MCP] [${this.config.serverId}] Shutdown completed`);
  }

  getServerId(): string {
    return this.config.serverId;
  }

  isAlive(): boolean {
    return this.isConnected;
  }
}