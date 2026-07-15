export interface PlanExtract {
  version: string;
  goals: string[];
  nonGoals: string[];
  keyChanges: string[];
  testPlan: string[];
  deliverables: string[];
}

export interface TasklistStructure {
  title: string;
  sourcePlanUri: string;
  steps: Array<{
    title: string;
    description?: string;
    acceptance?: string;
    verification?: string;
  }>;
  checklistItems: string[];
  hasAnyVerificationContent: boolean;
  nonGoals: string[];
  risks: string[];
  pausePoints: string[];
}

export interface TasklistValidationResult {
  isValid: boolean;
  blockingIssues: string[];
  warnings: string[];
  structure: TasklistStructure;
}

export interface AgentState {
  tasklistDraft: string;
  planExtract: PlanExtract | null;
  validationResult: TasklistValidationResult | null;
  revisionCount: number;
  finalOutput: string;
  versionPlanContent: string;
  versionPlanUri: string;
}

export function createInitialAgentState(versionPlanUri: string): AgentState {
  return {
    tasklistDraft: "",
    planExtract: null,
    validationResult: null,
    revisionCount: 0,
    finalOutput: "",
    versionPlanContent: "",
    versionPlanUri,
  };
}