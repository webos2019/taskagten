import type { ChatToolDefinition } from "./tool-registry";

export interface PlanningContext {
  userInput: string;
  currentState: 'INIT' | 'PROCESSING' | 'DECISION_NEEDED' | 'COMPLETED' | 'FAILED';
  availableTools: string[];
  resources: Record<string, any>;
  constraints: {
    maxDepth?: number;
    timeout?: number;
    allowedActions?: string[];
  };
  history: Array<{
    action: string;
    result: any;
    timestamp: number;
  }>;
  toolResults?: Array<{ toolName: string; result: string; isAuthoritative: boolean }>;
}

export interface PlanningAction {
  type: string;
  description: string;
  execute: (context: PlanningContext) => Promise<any>;
  isAvailable?: (context: PlanningContext) => boolean;
  priority?: number;
}

export interface DecisionResult {
  chosenAction: string;
  confidence: number;
  reasoning: string;
  nextContext: PlanningContext;
}

type ActionType = 'CONTINUE_PROCESSING' | 'REQUEST_MORE_INFO' | 'SWITCH_TOOL' | 'DECOMPOSE_TASK' | 'TERMINATE_PROCESSING';

const DEFAULT_MAX_DEPTH = 5;
const DEFAULT_TIMEOUT = 30000;

export class PlanningDecisionEngine {
  private actions = new Map<string, PlanningAction>();
  private maxDepth: number;
  private timeout: number;

  constructor(options: { maxDepth?: number; timeout?: number } = {}) {
    this.maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
    this.timeout = options.timeout ?? DEFAULT_TIMEOUT;
    this.registerDefaultActions();
  }

  private registerDefaultActions(): void {
    this.registerAction({
      type: 'CONTINUE_PROCESSING',
      description: '继续当前处理流程',
      priority: 1,
      execute: async (context) => {
        return { status: 'continued', next: 'process' };
      },
      isAvailable: () => true,
    });

    this.registerAction({
      type: 'REQUEST_MORE_INFO',
      description: '请求更多信息或澄清',
      priority: 2,
      execute: async (context) => {
        return { status: 'need_info', message: '请提供更多详细信息' };
      },
      isAvailable: (context) => {
        return context.history.length > 0 && this.detectInsufficientInfo(context);
      },
    });

    this.registerAction({
      type: 'SWITCH_TOOL',
      description: '切换到更适合的工具',
      priority: 3,
      execute: async (context) => {
        const bestTool = this.selectBestTool(context);
        return { status: 'tool_switched', tool: bestTool };
      },
      isAvailable: (context) => {
        return context.availableTools.length > 1 && this.shouldSwitchTool(context);
      },
    });

    this.registerAction({
      type: 'DECOMPOSE_TASK',
      description: '将复杂任务分解为子任务',
      priority: 4,
      execute: async (context) => {
        const subtasks = this.decomposeTask(context.userInput);
        return { status: 'decomposed', subtasks };
      },
      isAvailable: (context) => {
        return this.isComplexTask(context.userInput) && context.history.length < this.maxDepth;
      },
    });

    this.registerAction({
      type: 'TERMINATE_PROCESSING',
      description: '终止当前处理并返回结果',
      priority: 5,
      execute: async (context) => {
        return { status: 'terminated', reason: '决策终止', result: context.history };
      },
      isAvailable: () => true,
    });
  }

  registerAction(action: PlanningAction): void {
    this.actions.set(action.type, action);
  }

  async makeDecision(context: PlanningContext): Promise<DecisionResult> {
    if (context.history.length >= this.maxDepth) {
      return this.createTerminateResult(context, '达到最大处理深度', 1.0);
    }

    const availableActions = this.getAvailableActions(context);
    
    if (availableActions.length === 0) {
      return this.createTerminateResult(context, '没有可用动作', 1.0);
    }

    if (availableActions.length === 1) {
      return {
        chosenAction: availableActions[0].type,
        confidence: 0.8,
        reasoning: '唯一可用动作',
        nextContext: context,
      };
    }

    const decision = await this.selectBestAction(context, availableActions);
    
    return {
      chosenAction: decision.action.type,
      confidence: decision.confidence,
      reasoning: decision.reasoning,
      nextContext: this.updateContext(context, decision.action.type),
    };
  }

  private createTerminateResult(context: PlanningContext, reasoning: string, confidence: number): DecisionResult {
    return {
      chosenAction: 'TERMINATE_PROCESSING',
      confidence,
      reasoning,
      nextContext: { ...context, currentState: 'COMPLETED' },
    };
  }

  private getAvailableActions(context: PlanningContext): PlanningAction[] {
    const allowedActions = context.constraints.allowedActions;
    
    return Array.from(this.actions.values())
      .filter(action => {
        if (allowedActions && !allowedActions.includes(action.type)) {
          return false;
        }
        return !action.isAvailable || action.isAvailable(context);
      })
      .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
  }

  private async selectBestAction(
    context: PlanningContext, 
    actions: PlanningAction[]
  ): Promise<{ action: PlanningAction; confidence: number; reasoning: string }> {
    const scores = actions.map(action => {
      const confidence = this.calculateActionScore(action, context);
      const reasoning = this.getActionReasoning(action, context, confidence);
      return { action, confidence, reasoning };
    });

    const best = scores.reduce((max, current) => 
      current.confidence > max.confidence ? current : max
    );

    return best;
  }

  private calculateActionScore(action: PlanningAction, context: PlanningContext): number {
    const type = action.type as ActionType;
    let score = 0.5;

    switch (type) {
      case 'CONTINUE_PROCESSING':
        score = context.history.length === 0 ? 0.9 : 0.3;
        break;
      case 'REQUEST_MORE_INFO':
        score = this.detectInsufficientInfo(context) ? 0.8 : 0.2;
        break;
      case 'SWITCH_TOOL':
        score = this.shouldSwitchTool(context) ? 0.7 : 0.3;
        break;
      case 'DECOMPOSE_TASK':
        score = this.isComplexTask(context.userInput) ? 0.8 : 0.1;
        break;
      case 'TERMINATE_PROCESSING':
        score = this.shouldTerminate(context) ? 0.7 : 0.1;
        break;
    }

    if (action.priority) {
      score += action.priority * 0.05;
    }

    return Math.min(1.0, Math.max(0, score));
  }

  private getActionReasoning(action: PlanningAction, context: PlanningContext, score: number): string {
    const type = action.type as ActionType;
    
    switch (type) {
      case 'CONTINUE_PROCESSING':
        return context.history.length === 0 ? '初始状态，适合继续处理' : '已有历史记录，可能需要其他动作';
      case 'REQUEST_MORE_INFO':
        return this.detectInsufficientInfo(context) ? '检测到信息不足' : '信息看起来充足';
      case 'SWITCH_TOOL':
        return this.shouldSwitchTool(context) ? '当前工具可能不合适' : '当前工具运行良好';
      case 'DECOMPOSE_TASK':
        return this.isComplexTask(context.userInput) ? '任务复杂度高，适合分解' : '任务简单，无需分解';
      case 'TERMINATE_PROCESSING':
        return this.shouldTerminate(context) ? '处理步骤较多或已获权威结果，考虑终止' : '刚开始处理，不应过早终止';
      default:
        return `选择动作 ${action.type}，评分: ${score}`;
    }
  }

  private shouldTerminate(context: PlanningContext): boolean {
    if (context.history.length > 3) return true;
    if (context.toolResults?.some(r => r.isAuthoritative)) return true;
    return false;
  }

  private updateContext(context: PlanningContext, actionType: string): PlanningContext {
    return {
      ...context,
      currentState: actionType === 'TERMINATE_PROCESSING' ? 'COMPLETED' : 'PROCESSING',
      history: [
        ...context.history,
        { action: actionType, result: {}, timestamp: Date.now() }
      ],
    };
  }

  private detectInsufficientInfo(context: PlanningContext): boolean {
    const input = context.userInput;
    return input.length < 10 || 
           input.includes('什么') || 
           input.includes('哪个') || 
           input.includes('哪里') || 
           input.includes('多少');
  }

  private shouldSwitchTool(context: PlanningContext): boolean {
    if (context.history.length === 0) return false;
    const lastAction = context.history[context.history.length - 1].action;
    return lastAction.includes('tool') && !lastAction.includes('success');
  }

  private isComplexTask(input: string): boolean {
    return input.length > 50 || 
           input.includes('和') || 
           input.includes('与') || 
           input.includes('以及') || 
           input.includes('然后') || 
           input.includes('先') || 
           input.includes('再');
  }

  private decomposeTask(task: string): string[] {
    const parts = task.split(/[和与以及然后先再]/).map(p => p.trim()).filter(p => p.length > 0);
    return parts.length > 1 ? parts : [task];
  }

  private selectBestTool(context: PlanningContext): string {
    const input = context.userInput.toLowerCase();
    
    if (input.includes('网页') || input.includes('网站') || input.includes('url')) {
      return 'web_browse';
    }
    if (input.includes('计算') || input.includes('数学') || input.includes('公式')) {
      return 'calculator';
    }
    if (input.includes('时间') || input.includes('日期') || input.includes('星期')) {
      return 'datetime';
    }
    
    return context.availableTools[0] || '';
  }

  async executeAction(actionType: string, context: PlanningContext): Promise<any> {
    const action = this.actions.get(actionType);
    if (!action) {
      throw new Error(`未知动作: ${actionType}`);
    }

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('动作执行超时')), this.timeout);
    });

    try {
      return await Promise.race([
        action.execute(context),
        timeoutPromise
      ]);
    } catch (error) {
      return {
        status: 'error',
        error: error instanceof Error ? error.message : '未知错误',
        action: actionType
      };
    }
  }
}

export const planningEngine = new PlanningDecisionEngine();