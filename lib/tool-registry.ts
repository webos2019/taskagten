import { StructuredToolInterface } from "@langchain/core/tools";
import { z, type ZodType } from "zod";
import { PlanningDecisionEngine, type PlanningContext } from "./planning-decision";

export interface ToolDisplayConfig {
  title: string;
  description: string;
  category: "math" | "time" | "text" | "file" | "web" | "utility";
}

export type PlanningCategory = 'information' | 'action' | 'analysis' | 'generation' | 'utility';

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
  planningCategory?: PlanningCategory;
  decisionWeight?: number;
  prerequisites?: string[];
  keywords?: string[];
}

type AnyToolDefinition = ChatToolDefinition<unknown>;

const DEFAULT_PLANNING_CATEGORY: PlanningCategory = 'utility';
const DEFAULT_DECISION_WEIGHT = 0.5;

interface ToolValidationResult {
  valid: boolean;
  errors?: Array<{ field: string; message: string }>;
  data?: unknown;
}

interface ToolExecutionResult {
  success: boolean;
  result?: string;
  error?: string;
}

export class ToolRegistry {
  private tools = new Map<string, AnyToolDefinition>();
  private planningEngine?: PlanningDecisionEngine;

  register<TArgs>(toolDefinition: ChatToolDefinition<TArgs>): this {
    if (this.tools.has(toolDefinition.name)) {
      throw new Error(`工具 "${toolDefinition.name}" 已注册`);
    }
    
    const enhancedDefinition = {
      ...toolDefinition,
      planningCategory: toolDefinition.planningCategory || DEFAULT_PLANNING_CATEGORY,
      decisionWeight: toolDefinition.decisionWeight ?? DEFAULT_DECISION_WEIGHT,
      prerequisites: toolDefinition.prerequisites || [],
      keywords: toolDefinition.keywords || [],
    } as AnyToolDefinition;
    
    this.tools.set(toolDefinition.name, enhancedDefinition);
    return this;
  }

  setPlanningEngine(engine: PlanningDecisionEngine): this {
    this.planningEngine = engine;
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

  private normalizeAndValidate(name: string, args: unknown): ToolValidationResult {
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

  validate(name: string, args: unknown): ToolValidationResult {
    return this.normalizeAndValidate(name, args);
  }

  async execute(name: string, args: unknown, context?: { clientIP?: string }): Promise<string> {
    const validation = this.normalizeAndValidate(name, args);
    
    if (!validation.valid) {
      return JSON.stringify({
        error: `参数校验失败: ${JSON.stringify(validation.errors)}`,
        details: validation.errors,
      });
    }

    const toolDefinition = this.get(name);
    if (!toolDefinition) {
      return JSON.stringify({ error: `未知工具: "${name}"` });
    }

    try {
      const processedArgs = { ...(validation.data as Record<string, unknown>) };
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

  getToolsByCategory(category: PlanningCategory): AnyToolDefinition[] {
    return this.listActive().filter(tool => tool.planningCategory === category);
  }

  getToolsByWeight(minWeight: number = 0): AnyToolDefinition[] {
    return this.listActive()
      .filter(tool => (tool.decisionWeight ?? 0) >= minWeight)
      .sort((a, b) => (b.decisionWeight ?? 0) - (a.decisionWeight ?? 0));
  }

  getAvailableTools(context: PlanningContext): AnyToolDefinition[] {
    return this.listActive().filter(tool => {
      const prerequisites = tool.prerequisites || [];
      return prerequisites.every((prereq: string) => 
        context.history.some(h => h.action.includes(prereq))
      );
    });
  }

  recommendTool(userInput: string, planningContext?: PlanningContext): AnyToolDefinition | null {
    const tools = planningContext && this.planningEngine
      ? this.getAvailableTools(planningContext)
      : this.listActive();

    if (tools.length === 0) {
      return null;
    }

    const inputLower = userInput.toLowerCase();
    
    const scoredTools = tools.map(tool => {
      const keywords = tool.keywords || [];
      let score = keywords.filter(k => inputLower.includes(k.toLowerCase())).length;
      
      if (score > 0) {
        score += (tool.decisionWeight ?? 0) * 0.5;
      }
      
      return { tool, score };
    });

    scoredTools.sort((a, b) => b.score - a.score);

    return scoredTools[0]?.score > 0 ? scoredTools[0].tool : null;
  }
}

export const toolRegistry = new ToolRegistry();