import { ToolRegistry } from "./tool-registry";
import { skillRegistry } from "./skill-registry";
import { initCapabilities } from "./capability";
import { planningEngine, PlanningDecisionEngine, PlanningContext, DecisionResult } from "./planning-decision";
import { calculatorTool } from "./tools/calculator";
import { datetimeTool } from "./tools/datetime";
import { textTransformTool } from "./tools/text-transform";
import { unitConvertTool } from "./tools/unit-convert";
import { getLocationTool } from "./tools/get-location";
import { getWeatherTool } from "./tools/get-weather";
import { webBrowseTool } from "./tools/web-browse";
import { localTextReadTool } from "./tools/local-text-read";
import { listFilesTool } from "./tools/list-files";

export const toolRegistry = new ToolRegistry();

toolRegistry.setPlanningEngine(planningEngine);

toolRegistry.register(calculatorTool);
toolRegistry.register(datetimeTool);
toolRegistry.register(textTransformTool);
toolRegistry.register(unitConvertTool);
toolRegistry.register(getLocationTool);
toolRegistry.register(getWeatherTool);
toolRegistry.register(webBrowseTool);
toolRegistry.register(localTextReadTool);
toolRegistry.register(listFilesTool);

skillRegistry.register({
  id: "utility-skill",
  name: "实用工具",
  description: "提供计算器、日期时间、单位换算等实用工具能力",
  systemPrompt: "你是一个实用工具助手，擅长使用各种工具解决用户问题。对于数学计算、日期查询、单位换算等问题，请使用相应工具获取准确结果。",
  toolNames: ["calculator", "datetime", "unit_convert", "get_location", "get_weather"],
  outputPolicy: "concise-utility",
  resultPolicy: "tool-first",
  routingHints: ["计算", "时间", "换算", "天气", "位置"],
  tags: ["utility", "calculator", "datetime", "weather"],
  sourceKinds: ["internal", "mcp"],
  capabilitySelectors: [
    { providerKind: "internal", location: "local", capabilityType: "tool", names: ["calculator"] },
    { providerKind: "internal", location: "local", capabilityType: "tool", names: ["datetime"] },
    { providerKind: "internal", location: "local", capabilityType: "tool", names: ["unit_convert"] },
    { providerKind: "mcp", location: "local", capabilityType: "tool", names: ["get_weather"] },
    { providerKind: "internal", location: "local", capabilityType: "tool", names: ["get_location"] },
  ],
  fallbackPolicy: "direct-answer",
  default: true,
});

skillRegistry.register({
  id: "reader-skill",
  name: "信息读取",
  description: "提供本地文件读取、网页浏览等信息获取能力",
  systemPrompt: "你是一个信息读取助手，擅长读取本地文件和浏览网页。对于需要查看文件内容或获取实时信息的请求，请使用相应工具。",
  toolNames: ["local-text-read", "list_files", "web_browse", "get_weather", "get_location"],
  outputPolicy: "detailed-explanation",
  resultPolicy: "summary-first",
  routingHints: ["文件", "读取", "浏览", "查看", "内容"],
  tags: ["reader", "file", "web", "information"],
  sourceKinds: ["internal", "mcp"],
  capabilitySelectors: [
    { providerKind: "mcp", location: "local", capabilityType: "resource", names: ["project-files"] },
    { providerKind: "mcp", location: "local", capabilityType: "prompt", names: ["local-file-summary"] },
    { providerKind: "internal", location: "local", capabilityType: "tool", names: ["local-text-read"] },
    { providerKind: "internal", location: "local", capabilityType: "tool", names: ["list_files"] },
    { providerKind: "internal", location: "local", capabilityType: "tool", names: ["web_browse"] },
    { providerKind: "mcp", location: "local", capabilityType: "tool", names: ["get_weather"] },
    { providerKind: "mcp", location: "remote", capabilityType: "resource", names: ["project://latest-context"] },
    { providerKind: "mcp", location: "remote", capabilityType: "prompt", names: ["tasklist-draft"] },
    { providerKind: "mcp", location: "remote", capabilityType: "tool", names: ["check_doc_consistency"] },
  ],
  fallbackPolicy: "skip-capability",
});

export class ControlledPlanningRuntime {
  private planningEngine: PlanningDecisionEngine;
  private toolRegistry: typeof toolRegistry;

  constructor() {
    this.planningEngine = planningEngine;
    this.toolRegistry = toolRegistry;
  }

  async processUserRequest(userInput: string): Promise<{
    decision: DecisionResult;
    executionResult: any;
    finalContext: PlanningContext;
  }> {
    const initialContext: PlanningContext = {
      userInput,
      currentState: 'INIT',
      availableTools: toolRegistry.listActive().map(tool => tool.name),
      resources: {},
      constraints: {
        maxDepth: 5,
        timeout: 30000,
        allowedActions: ['CONTINUE_PROCESSING', 'REQUEST_MORE_INFO', 'SWITCH_TOOL', 'DECOMPOSE_TASK', 'TERMINATE_PROCESSING']
      },
      history: []
    };

    const decision = await this.planningEngine.makeDecision(initialContext);
    
    const executionResult = await this.planningEngine.executeAction(
      decision.chosenAction, 
      decision.nextContext
    );

    const finalContext: PlanningContext = {
      ...decision.nextContext,
      currentState: executionResult.status === 'error' ? 'FAILED' : 'COMPLETED',
      history: [
        ...decision.nextContext.history,
        {
          action: decision.chosenAction,
          result: executionResult,
          timestamp: Date.now()
        }
      ]
    };

    return {
      decision,
      executionResult,
      finalContext
    };
  }

  recommendTool(userInput: string, context?: PlanningContext): any {
    return this.toolRegistry.recommendTool(userInput, context);
  }
}

export const planningRuntime = new ControlledPlanningRuntime();

initCapabilities();

export { skillRegistry };