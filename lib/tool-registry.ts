import { StructuredToolInterface } from "@langchain/core/tools";
import { z, type ZodType } from "zod";

export interface ToolDisplayConfig {
  title: string;
  description: string;
  category: "math" | "time" | "text" | "file" | "web" | "utility";
}

export interface ChatToolDefinition<TArgs = unknown> {
  name: string;
  tool: StructuredToolInterface;
  schema: ZodType<TArgs>;
  normalizeArgs?: (args: unknown) => unknown;
  formatInput?: (args: TArgs) => string;
  formatOutput?: (result: unknown) => string;
  getDisplayConfig?: (args: TArgs) => ToolDisplayConfig;
  resultIsAuthoritative?: boolean;
  isAvailable?: () => boolean;
}

type AnyToolDefinition = ChatToolDefinition<unknown>;

export class ToolRegistry {
  private tools = new Map<string, AnyToolDefinition>();

  register<TArgs>(toolDefinition: ChatToolDefinition<TArgs>): this {
    if (this.tools.has(toolDefinition.name)) {
      throw new Error(`工具 "${toolDefinition.name}" 已注册`);
    }
    this.tools.set(toolDefinition.name, toolDefinition as AnyToolDefinition);
    return this;
  }

  get(name: string): AnyToolDefinition | undefined {
    return this.tools.get(name);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  list(): AnyToolDefinition[] {
    return Array.from(this.tools.values());
  }

  listActive(): AnyToolDefinition[] {
    return this.list().filter((tool) => !tool.isAvailable || tool.isAvailable());
  }

  getToolDefinitions(): StructuredToolInterface[] {
    return this.listActive().map((tool) => tool.tool);
  }

  async execute(name: string, args: unknown, context?: { clientIP?: string }): Promise<string> {
    const toolDefinition = this.get(name);
    if (!toolDefinition) {
      return JSON.stringify({ error: `未知工具: "${name}"` });
    }

    try {
      let normalizedArgs = args;
      if (toolDefinition.normalizeArgs) {
        normalizedArgs = toolDefinition.normalizeArgs(args);
      }

      const parsedArgs = toolDefinition.schema.safeParse(normalizedArgs);
      if (!parsedArgs.success) {
        const errors = parsedArgs.error.errors.map((e) => ({
          field: e.path.join("."),
          message: e.message,
        }));
        return JSON.stringify({
          error: `参数校验失败: ${JSON.stringify(errors)}`,
          details: errors,
        });
      }

      const processedArgs = { ...(parsedArgs.data as Record<string, unknown>) };
      if (name === "get_location" && !processedArgs.ip && context?.clientIP) {
        processedArgs.ip = context.clientIP;
      }

      const result = await toolDefinition.tool.invoke(processedArgs);

      if (toolDefinition.formatOutput) {
        return toolDefinition.formatOutput(result);
      }

      return typeof result === "string" ? result : JSON.stringify(result);
    } catch (e) {
      return JSON.stringify({ error: (e as Error).message });
    }
  }

  validate(name: string, args: unknown): { valid: boolean; errors?: Array<{ field: string; message: string }>; data?: unknown } {
    const toolDefinition = this.get(name);
    if (!toolDefinition) {
      return { valid: false, errors: [{ field: "name", message: `未知工具: "${name}"` }] };
    }

    let normalizedArgs = args;
    if (toolDefinition.normalizeArgs) {
      normalizedArgs = toolDefinition.normalizeArgs(args);
    }

    const parsedArgs = toolDefinition.schema.safeParse(normalizedArgs);
    if (!parsedArgs.success) {
      const errors = parsedArgs.error.errors.map((e) => ({
        field: e.path.join("."),
        message: e.message,
      }));
      return { valid: false, errors };
    }

    return { valid: true, data: parsedArgs.data };
  }
}

export const toolRegistry = new ToolRegistry();
