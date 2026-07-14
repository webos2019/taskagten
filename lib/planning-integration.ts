// 规划决策系统与现有技能系统的集成

import { skillRegistry } from "./skill-registry";
import { planningRuntime } from "./tools";
import { planningEngine } from "./planning-decision";

export interface IntegratedPlanningContext {
  userInput: string;
  skillContext: any;
  planningContext: any;
  combinedResult: any;
}

export class SkillPlanningIntegrator {
  private planningEngine = planningEngine;
  private planningRuntime = planningRuntime;

  constructor() {
    this.registerPlanningSkills();
  }

  private registerPlanningSkills(): void {
    // 注册规划决策技能
    skillRegistry.register({
      id: "planning-skill",
      name: "受控规划决策",
      description: "基于受控规划决策的文章分析能力，实现智能任务规划和工具选择",
      systemPrompt: `你是一个受控规划决策专家，负责分析用户请求并制定最优的处理策略。

核心原则（基于"受控规划决策的文章分析"）：
1. 采用白名单机制：只允许预先定义的5类动作
2. 避免无限循环：设置最大处理深度限制
3. 基于置信度的决策：每个决策都有明确的置信度和理由
4. 条件触发机制：根据上下文状态智能选择动作

可用规划动作：
- CONTINUE_PROCESSING: 继续当前处理流程
- REQUEST_MORE_INFO: 请求更多信息或澄清
- SWITCH_TOOL: 切换到更适合的工具
- DECOMPOSE_TASK: 将复杂任务分解为子任务
- TERMINATE_PROCESSING: 终止当前处理并返回结果

决策流程：
1. 分析用户输入的复杂度
2. 评估当前可用工具和约束条件
3. 根据置信度排序选择最佳动作
4. 执行动作并记录结果
5. 基于结果更新上下文并重复

特殊场景处理：
- 当任务复杂度高时，优先考虑分解任务
- 当信息不足时，主动请求澄清
- 当工具不适用时，推荐更好的工具
- 当处理步骤超过限制时，及时终止避免无限循环

给出的建议要体现"一次受控规划决策"的设计思想：
- 明确：告诉用户为什么选择特定方案
- 可预测：基于规则而不是随机决策
- 安全：有明确的终止条件和约束`,
      toolNames: ["calculator", "datetime", "text_transform", "unit_convert", "get_weather", "web_browse"],
      outputPolicy: "detailed-explanation",
      resultPolicy: "summary-first",
      routingHints: ["规划", "决策", "分析", "智能", "策略", "优化", "选择", "处理", "自动化"],
      tags: ["planning", "decision-making", "intelligent", "analysis"],
      sourceKinds: ["internal"],
      capabilitySelectors: [
        { providerKind: "internal", location: "local", capabilityType: "tool", names: ["calculator"] },
        { providerKind: "internal", location: "local", capabilityType: "tool", names: ["datetime"] },
        { providerKind: "internal", location: "local", capabilityType: "tool", names: ["text_transform"] },
        { providerKind: "internal", location: "local", capabilityType: "tool", names: ["unit_convert"] },
        { providerKind: "internal", location: "local", capabilityType: "tool", names: ["get_weather"] },
        { providerKind: "internal", location: "local", capabilityType: "tool", names: ["web_browse"] },
      ],
      fallbackPolicy: "direct-answer",
    });

    // 注册智能工具推荐技能
    skillRegistry.register({
      id: "tool-recommendation-skill",
      name: "智能工具推荐",
      description: "基于内容识别和置信度评估，智能推荐最适合的工具",
      systemPrompt: `你是一个智能工具推荐专家，能够分析用户请求并推荐最合适的工具。

推荐原则（基于"受控规划决策"）：
1. 分类推荐：根据工具类别（information/action/analysis/generation/utility）进行分类
2. 权重排序：考虑工具的决策权重和适用性
3. 条件约束：检查工具的先决条件是否满足
4. 降权处理：对不适用工具进行置信度降权

工具分类系统：
- information: 信息获取类工具（web_browse, datetime）
- action: 执行操作类工具（calculator, text_transform）
- analysis: 分析处理类工具
- generation: 内容生成类工具
- utility: 通用辅助工具

推荐流程：
1. 解析用户意图和关键词
2. 匹配备选工具集
3. 评估每个工具的适用度
4. 按权重排序并返回最佳工具

决策特征：
- 不会盲目推荐工具，基于实际需求
- 可以识别多步骤任务的子工具需求
- 考虑工具使用的上下文和先决条件
- 提供推荐理由和预期效果说明

对于复杂任务，会建议工具使用顺序和流程规划。`,
      toolNames: ["calculator", "datetime", "text_transform", "unit_convert", "get_weather", "web_browse"],
      outputPolicy: "concise-utility",
      resultPolicy: "tool-first",
      routingHints: ["推荐", "工具", "适合", "最佳", "选择", "建议"],
      tags: ["recommendation", "tool-selection", "intelligent"],
      sourceKinds: ["internal"],
      capabilitySelectors: [
        { providerKind: "internal", location: "local", capabilityType: "tool", names: ["web_browse"] },
      ],
      fallbackPolicy: "direct-answer",
    });
  }

  async processIntegratedPlanning(userInput: string, skillContext?: any): Promise<IntegratedPlanningContext> {
    // 步骤1：使用规划运行时处理用户请求
    const planningResult = await this.planningRuntime.processUserRequest(userInput);

    // 步骤2：基于规划决策选择合适的技能
    const selectedSkill = this.selectBestSkill(userInput, planningResult.decision);

    // 步骤3：集成技能上下文
    const integratedContext: IntegratedPlanningContext = {
      userInput,
      skillContext: skillContext || {},
      planningContext: planningResult.finalContext,
      combinedResult: {
        decision: planningResult.decision,
        execution: planningResult.executionResult,
        recommendedSkill: selectedSkill,
        confidence: planningResult.decision.confidence,
        reasoning: planningResult.decision.reasoning
      }
    };

    return integratedContext;
  }

  private selectBestSkill(userInput: string, decision: any): string {
    // 基于规划决策和用户输入选择合适的技能
    const input = userInput.toLowerCase();
    const chosenAction = decision.chosenAction;

    // 根据规划动作类型选择技能
    switch (chosenAction) {
      case 'REQUEST_MORE_INFO':
        return 'planning-skill'; // 需要更多信息时使用规划技能
      
      case 'DECOMPOSE_TASK':
        return 'planning-skill'; // 复杂任务分解需要规划技能
      
      case 'SWITCH_TOOL':
        return 'tool-recommendation-skill'; // 工具切换需要推荐技能
      
      case 'TERMINATE_PROCESSING':
        return 'planning-skill'; // 终止决策通常由规划技能处理
      
      default:
        // 基于用户输入内容选择技能
        if (input.includes('规划') || input.includes('决策') || input.includes('分析') || input.includes('策略')) {
          return 'planning-skill';
        }
        
        if (input.includes('推荐') || input.includes('建议') || input.includes('工具')) {
          return 'tool-recommendation-skill';
        }
        
        // 默认为规划技能
        return 'planning-skill';
    }
  }

  // 智能工具推荐接口
  async recommendToolForTask(task: string): Promise<{
    recommendedTool: string;
    confidence: number;
    reasoning: string;
    alternatives: string[];
  }> {
    const planningResult = await this.planningRuntime.processUserRequest(task);
    const toolRecommendation = this.planningRuntime.recommendTool(task);

    // 分析备选工具
    const alternatives: string[] = [];
    const taskLower = task.toLowerCase();
    
    // 基于任务内容推荐备选工具
    if (taskLower.includes('计算') || taskLower.includes('数学')) {
      if (toolRecommendation?.name !== 'calculator') {
        alternatives.push('calculator');
      }
    }
    
    if (taskLower.includes('时间') || taskLower.includes('日期')) {
      if (toolRecommendation?.name !== 'datetime') {
        alternatives.push('datetime');
      }
    }
    
    if (taskLower.includes('网页') || taskLower.includes('浏览') || taskLower.includes('网址')) {
      if (toolRecommendation?.name !== 'web_browse') {
        alternatives.push('web_browse');
      }
    }
    
    if (taskLower.includes('天气')) {
      if (toolRecommendation?.name !== 'get_weather') {
        alternatives.push('get_weather');
      }
    }
    
    // 添加到备选列表，但避免重复
    const uniqueAlternatives: string[] = [...alternatives];
    if (toolRecommendation?.name && !uniqueAlternatives.includes(toolRecommendation.name)) {
      uniqueAlternatives.unshift(toolRecommendation.name);
    }

    return {
      recommendedTool: toolRecommendation?.name || 'unknown',
      confidence: planningResult.decision.confidence,
      reasoning: planningResult.decision.reasoning || `基于任务内容"${task}"的关键词匹配`,
      alternatives: uniqueAlternatives.slice(0, 3) // 限制备选工具数量
    };
  }

  // 复杂任务规划接口
  async planComplexTask(task: string): Promise<{
    taskAnalysis: string;
    recommendedActions: string[];
    requiredTools: string[];
    estimatedSteps: number;
    confidence: number;
  }> {
    const planningResult = await this.planningRuntime.processUserRequest(task);
    const decomposed = this.decomposeTaskRecursively(task, []);
    
    const requiredTools = new Set<string>();
    const recommendedActions: string[] = [];

    // 分析每个子任务需要的工具和动作
    for (const subtask of decomposed) {
      const toolRec = this.planningRuntime.recommendTool(subtask);
      if (toolRec) {
        requiredTools.add(toolRec.name);
      }
      
      // 根据子任务类型推荐动作
      if (subtask.length < 50) {
        recommendedActions.push('CONTINUE_PROCESSING');
      } else {
        recommendedActions.push('DECOMPOSE_TASK');
      }
    }

    return {
      taskAnalysis: decomposed.length > 1 ? 
        `任务可分解为${decomposed.length}个子任务` : 
        '任务比较简单，可以直接处理',
      recommendedActions: Array.from(new Set(recommendedActions)),
      requiredTools: Array.from(requiredTools),
      estimatedSteps: decomposed.length,
      confidence: planningResult.decision.confidence
    };
  }

  private decomposeTaskRecursively(task: string, seen: string[]): string[] {
    // 避免无限递归
    if (seen.includes(task) || task.length < 10) {
      return [task];
    }
    
    seen.push(task);
    
    // 简单的任务分解逻辑
    const taskLower = task.toLowerCase();
    
    // 基于连接词分解
    const connectors = ['然后', '接着', '最后', '以及', '并且', '同时', '第一步', '第二步', '第三步'];
    
    for (const connector of connectors) {
      if (taskLower.includes(connector)) {
        const parts = task.split(new RegExp(connector, 'ig'));
        const flattened: string[] = [];
        
        for (const part of parts) {
          if (part.trim()) {
            // 递归分解较长的部分
            if (part.length > 100 && !seen.includes(part)) {
              flattened.push(...this.decomposeTaskRecursively(part.trim(), seen));
            } else {
              flattened.push(part.trim());
            }
          }
        }
        return flattened;
      }
    }
    
    // 基于标点符号分解
    if (task.includes('。') || task.includes('.') || task.includes(';')) {
      const sentences = task.split(/[.。;；]/);
      return sentences
        .map(s => s.trim())
        .filter(s => s.length > 0)
        .slice(0, 5); // 限制句子数量
    }
    
    return [task];
  }
}

// 导出单例实例
export const skillPlanningIntegrator = new SkillPlanningIntegrator();

// 便捷函数
export async function processUserRequestWithPlanning(
  userInput: string, 
  context?: any
): Promise<IntegratedPlanningContext> {
  return skillPlanningIntegrator.processIntegratedPlanning(userInput, context);
}

export async function recommendTool(task: string) {
  return skillPlanningIntegrator.recommendToolForTask(task);
}

export async function planTask(task: string) {
  return skillPlanningIntegrator.planComplexTask(task);
}