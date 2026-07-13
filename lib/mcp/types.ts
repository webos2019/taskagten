export const MCP_CLIENT_INFO = {
  name: 'ai-mind-host',
  version: '0.0.9',
} as const;

export const MCP_CLIENT_CAPABILITIES = {
  elicitation: {
    form: {
      applyDefaults: true,
    },
  },
};

export interface MCPToolAdapterInput {
  [key: string]: unknown;
}

export interface MCPToolAdapterResult {
  action: 'current';
  inputText: string;
  outputText: string;
  serverId: string;
  source: 'mcp';
  title: string;
  toolName: string;
}

export interface MCPResourceAdapterInput {
  [key: string]: unknown;
}

export interface MCPResourceAdapterResult {
  content: string;
  contentPreview: string;
  previewChars: number;
  resourceName: string;
  serverId: string;
  status: 'completed';
  uri: string;
}

export class MCPHostError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'MCPHostError';
  }
}