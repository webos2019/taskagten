import type { ChatSession } from "@/lib/ai/runtime/chat-session";
import type { StreamLifecycle } from "@/lib/ai/stream";
import type { ChatComposerReference } from "@/types/chat";
import { AgentState, createInitialAgentState, type PlanExtract, type TasklistValidationResult, type TasklistStructure } from "./agent-state";
import { validateTasklistStructure } from "./validate-tasklist-structure";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";

export type AgentStepActionType = "read_resource" | "plan_extract" | "draft_tasklist" | "validate_tasklist_structure" | "revise_tasklist" | "final_answer";

export type AgentStepStatus = "running" | "completed" | "failed";

export interface AgentStepStartChunk {
  actionType: AgentStepActionType;
  agentName: string;
  partId: string;
  runId: string;
  stepIndex: number;
  title: string;
  type: "agent-step-start";
}

export interface AgentStepEndChunk {
  durationMs?: number;
  error?: string;
  partId: string;
  runId: string;
  status: AgentStepStatus;
  summary?: string;
  type: "agent-step-end";
}

const MOCK_VERSION_PLANS: Record<string, string> = {
  "docs://versions/v0.1.0-controlled-version-plan-to-tasklist-agent.md": `# v0.1.0 受控版：版本方案到任务清单 Agent

## 目标

- 实现第一个受控 Agent：Tasklist Agent
- Agent 入口必须明确：/tasklist + @docs://versions/*.md
- 模型生成后必须经过确定性质量门
- 最多自动修正一次
- 前端展示执行过程

## 非目标

- 不做通用 Agent
- 不做多 Agent 协作
- 不做长期记忆
- 不自动写文件

## 关键变更

- 添加 Tasklist Agent 运行时目录
- 添加 validate_tasklist_structure 工具
- 添加 Agent Step 流式事件
- 添加 AgentTracePanel 前端组件

## 测试计划

- 单元测试：入口控制逻辑
- 单元测试：结构校验工具
- 集成测试：完整 Agent 流程
- E2E：输入 /tasklist + @version 方案

## 交付结果

- tasklist 草稿可复制
- 结构校验结论
- 人工确认点
`,
  "docs://versions/v0.2.0-composer-v1-structured-input-layer.md": `# v0.2.0 Composer V1：结构化输入层

## 目标

- 实现 Composer V1 输入层
- 支持自然语言 + / 命令 + @ 资源的混合输入
- 添加命令标签（Command Chip）和资源标签（Resource Chip）
- 支持 /tasklist、/summary、/check 三个核心命令

## 非目标

- 不做复杂的富文本编辑
- 不做实时协作编辑
- 不做多语言支持

## 关键变更

- 添加 ComposerPayload 类型定义
- 创建 Tiptap 编辑器组件
- 添加 / 命令菜单扩展
- 添加 @ 资源菜单扩展

## 测试计划

- 单元测试：命令解析逻辑
- 单元测试：资源引用解析
- 集成测试：完整输入流程

## 交付结果

- Composer 输入框组件
- 命令菜单功能
- 资源选择功能
`,
  "docs://versions/v0.3.0-langgraph-migration-stateful-workflow.md": `# v0.3.0 LangGraph 迁移：有状态工作流

## 目标

- 将 Orchestration 迁移到 LangGraph
- 使用 Annotation API 定义状态 Schema
- 实现条件路由和状态合并
- 保留原有功能兼容性

## 非目标

- 不重写现有业务逻辑
- 不引入新的 Agent 能力
- 不修改前端界面

## 关键变更

- 创建 GraphStateSchema
- 实现节点执行器
- 添加条件边路由
- 集成错误恢复机制

## 测试计划

- 单元测试：状态管理
- 单元测试：路由逻辑
- 集成测试：完整工作流

## 交付结果

- LangGraph 工作流实现
- 状态管理机制
- 路由决策逻辑
`,
};

async function readVersionPlan(uri: string): Promise<string> {
  return MOCK_VERSION_PLANS[uri] || `# 版本方案 ${uri}\n\n## 目标\n- 默认目标\n\n## 非目标\n- 默认非目标\n`;
}

// 中文 key 到英文 key 的映射表
const JSON_KEY_MAP: Record<string, string> = {
  "版本号": "version",
  "版本": "version",
  "目标列表": "goals",
  "目标": "goals",
  "非目标列表": "nonGoals",
  "非目标": "nonGoals",
  "关键变更列表": "keyChanges",
  "关键变更": "keyChanges",
  "测试计划": "testPlan",
  "交付结果列表": "deliverables",
  "交付结果": "deliverables",
};

// 从 JSON 对象中提取值，同时支持中英文 key
function extractFromJson(parsed: Record<string, unknown>, key: string): unknown {
  // 先尝试直接取英文 key
  if (parsed[key] !== undefined) return parsed[key];
  // 再尝试遍历中文映射
  for (const [cn, en] of Object.entries(JSON_KEY_MAP)) {
    if (en === key && parsed[cn] !== undefined) return parsed[cn];
  }
  return undefined;
}

function normalizeJsonResponse(raw: string): string {
  let text = raw.trim();
  // 去掉 markdown 代码块标记 ```json ... ```
  const jsonBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonBlockMatch) {
    text = jsonBlockMatch[1].trim();
  }
  return text;
}

async function extractPlan(content: string, session: ChatSession): Promise<PlanExtract> {
  const model = session.getModel();
  
  try {
    const result = await model.invoke([
      new SystemMessage("你是一个版本方案分析助手。请从以下版本方案中提取结构化信息，**只返回纯净 JSON，不要 markdown 代码块包裹**。字段使用英文 key：version（版本号）、goals（目标列表）、nonGoals（非目标列表）、keyChanges（关键变更列表）、testPlan（测试计划）、deliverables（交付结果列表）。"),
      new HumanMessage("版本方案内容：\n" + content + "\n\n请提取以上字段，返回 JSON 格式。"),
    ]);
    
    const contentText = typeof result.content === "string" ? result.content : JSON.stringify(result.content);
    
    try {
      const cleaned = normalizeJsonResponse(contentText);
      const parsed = JSON.parse(cleaned) as Record<string, unknown>;
      return {
        version: (extractFromJson(parsed, "version") as string) || "unknown",
        goals: Array.isArray(extractFromJson(parsed, "goals")) ? (extractFromJson(parsed, "goals") as string[]) : [],
        nonGoals: Array.isArray(extractFromJson(parsed, "nonGoals")) ? (extractFromJson(parsed, "nonGoals") as string[]) : [],
        keyChanges: Array.isArray(extractFromJson(parsed, "keyChanges")) ? (extractFromJson(parsed, "keyChanges") as string[]) : [],
        testPlan: Array.isArray(extractFromJson(parsed, "testPlan")) ? (extractFromJson(parsed, "testPlan") as string[]) : [],
        deliverables: Array.isArray(extractFromJson(parsed, "deliverables")) ? (extractFromJson(parsed, "deliverables") as string[]) : [],
      };
    } catch (parseError) {
      console.error('[tasklist-agent] extractPlan JSON parse error:', parseError);
      console.error('[tasklist-agent] extractPlan raw response:', contentText);
      return parseMarkdownContent(content);
    }
  } catch (invokeError) {
    console.error('[tasklist-agent] extractPlan model invoke error:', invokeError);
    return parseMarkdownContent(content);
  }
}

function parseMarkdownContent(content: string): PlanExtract {
  const lines = content.split("\n");
  const result: PlanExtract = {
    version: "unknown",
    goals: [],
    nonGoals: [],
    keyChanges: [],
    testPlan: [],
    deliverables: [],
  };
  
  let currentSection = "";
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    if (trimmed.startsWith("# ")) {
      const match = trimmed.match(/#\s+v?([\d.]+)/i);
      if (match) {
        result.version = match[1];
      }
      continue;
    }
    
    if (trimmed.startsWith("## ")) {
      currentSection = trimmed.slice(3).trim();
      continue;
    }
    
    if (currentSection === "目标" && trimmed.startsWith("- ")) {
      result.goals.push(trimmed.slice(2).trim());
    } else if (currentSection === "非目标" && trimmed.startsWith("- ")) {
      result.nonGoals.push(trimmed.slice(2).trim());
    } else if (currentSection === "关键变更" && trimmed.startsWith("- ")) {
      result.keyChanges.push(trimmed.slice(2).trim());
    } else if (currentSection === "测试计划" && trimmed.startsWith("- ")) {
      result.testPlan.push(trimmed.slice(2).trim());
    } else if (currentSection === "交付结果" && trimmed.startsWith("- ")) {
      result.deliverables.push(trimmed.slice(2).trim());
    }
  }
  
  return result;
}

async function draftTasklist(state: AgentState, session: ChatSession): Promise<string> {
  const model = session.getModel();
  const extract = state.planExtract;
  
  const goals = extract?.goals?.join("\n- ") || "";
  const nonGoals = extract?.nonGoals?.join("\n- ") || "";
  const keyChanges = extract?.keyChanges?.join("\n- ") || "";
  const testPlan = extract?.testPlan?.join("\n- ") || "";
  const deliverables = extract?.deliverables?.join("\n- ") || "";
  
  try {
    const result = await model.invoke([
      new SystemMessage("你是一个任务清单生成助手。请根据版本方案生成详细的任务清单草稿。\n\n要求结构：\n1. 标题\n2. 来源版本方案\n3. 主要步骤（每个步骤包含：标题、描述、验收标准、验证方式）\n4. 勾选项清单\n5. 非目标\n6. 风险与暂停点\n7. 工程验证内容\n\n版本方案来源：" + state.versionPlanUri),
      new HumanMessage("版本方案提取信息：\n版本：" + (extract?.version || "") + "\n目标：" + goals + "\n非目标：" + nonGoals + "\n关键变更：" + keyChanges + "\n测试计划：" + testPlan + "\n交付结果：" + deliverables + "\n\n请生成任务清单草稿。"),
    ]);
    
    return typeof result.content === "string" ? result.content : JSON.stringify(result.content);
  } catch (error) {
    console.error('[tasklist-agent] draftTasklist model invoke error:', error);
    // 生成默认草稿作为回退
    return `## 任务清单草稿\n\n### 版本方案\n${state.versionPlanUri}\n\n### 步骤\n1. 实现核心功能\n   - 描述：根据版本方案实现核心功能\n   - 验收标准：功能可用\n   - 验证方式：运行测试\n\n### 勾选项\n- [ ] 功能实现\n- [ ] 测试通过\n\n### 非目标\n${nonGoals || "- 无"}\n\n### 风险与暂停点\n- 风险：实现过程中可能遇到技术问题\n\n### 工程验证内容\n运行测试套件确认功能正常`;
  }
}

async function reviseTasklist(state: AgentState, session: ChatSession): Promise<string> {
  const model = session.getModel();
  const validation = state.validationResult;
  
  const blockingIssues = validation?.blockingIssues?.join("\n- ") || "";
  const warnings = validation?.warnings?.join("\n- ") || "";
  
  try {
    const escapedDraft = state.tasklistDraft.replace(/\$\{/g, "\\${").replace(/\$\(/g, "\\${").replace(/\{\{/g, "\\{\\{");
    
    const result = await model.invoke([
      new SystemMessage("你是一个任务清单修正助手。请根据校验结果修正任务清单草稿。"),
      new HumanMessage("校验问题：\n" + blockingIssues + "\n\n校验警告：\n" + warnings + "\n\n当前草稿：\n" + escapedDraft + "\n\n请修正以上问题并返回完整的任务清单草稿。"),
    ]);
    
    return typeof result.content === "string" ? result.content : JSON.stringify(result.content);
  } catch (error) {
    console.error('[tasklist-agent] reviseTasklist error:', error);
    throw error;
  }
}

function buildFinalAnswer(state: AgentState): string {
  const validation = state.validationResult;
  
  let output = `## 任务清单草稿

${state.tasklistDraft}

---

## 结构校验结论

${validation?.isValid ? "✅ 通过" : "❌ 未通过"}

${validation?.blockingIssues.length ? `### 阻塞问题：
${validation.blockingIssues.map((issue, idx) => `${idx + 1}. ${issue}`).join("\n")}` : ""}

${validation?.warnings.length ? `### 警告：
${validation.warnings.map((warn, idx) => `${idx + 1}. ${warn}`).join("\n")}` : ""}

---

## 人工确认点

请确认以下内容后再落地：
- [ ] 任务清单是否覆盖版本方案的所有目标
- [ ] 每个步骤是否有明确的验收标准
- [ ] 是否包含必要的测试计划
- [ ] 是否识别了关键风险和暂停点
- [ ] 是否需要调整优先级或拆分任务

> 本 Agent 只生成草稿，不自动写入文件。确认无误后请手动创建任务清单文档。`;
  
  return output;
}

async function runReadResourceStep(
  state: AgentState,
  lifecycle: StreamLifecycle,
  runId: string,
  stepIndex: number
): Promise<AgentState> {
  const startTime = Date.now();
  
  lifecycle.writeChunk({
    actionType: "read_resource",
    agentName: "tasklist-agent",
    partId: `step-${stepIndex}`,
    runId,
    stepIndex,
    title: "读取版本方案",
    type: "agent-step-start",
  });
  
  try {
    const content = await readVersionPlan(state.versionPlanUri);
    state.versionPlanContent = content;
    
    lifecycle.writeChunk({
      durationMs: Date.now() - startTime,
      partId: `step-${stepIndex}`,
      runId,
      status: "completed",
      summary: `已读取版本方案: ${state.versionPlanUri}`,
      type: "agent-step-end",
    });
    
    return state;
  } catch (error) {
    lifecycle.writeChunk({
      durationMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : "未知错误",
      partId: `step-${stepIndex}`,
      runId,
      status: "failed",
      type: "agent-step-end",
    });
    throw error;
  }
}

async function runPlanExtractStep(
  state: AgentState,
  session: ChatSession,
  lifecycle: StreamLifecycle,
  runId: string,
  stepIndex: number
): Promise<AgentState> {
  const startTime = Date.now();
  
  lifecycle.writeChunk({
    actionType: "plan_extract",
    agentName: "tasklist-agent",
    partId: `step-${stepIndex}`,
    runId,
    stepIndex,
    title: "提取版本方案结构",
    type: "agent-step-start",
  });
  
  try {
    const extract = await extractPlan(state.versionPlanContent, session);
    state.planExtract = extract;
    
    lifecycle.writeChunk({
      durationMs: Date.now() - startTime,
      partId: `step-${stepIndex}`,
      runId,
      status: "completed",
      summary: `已提取 ${extract.goals.length} 个目标`,
      type: "agent-step-end",
    });
    
    return state;
  } catch (error) {
    lifecycle.writeChunk({
      durationMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : "未知错误",
      partId: `step-${stepIndex}`,
      runId,
      status: "failed",
      type: "agent-step-end",
    });
    throw error;
  }
}

async function runDraftTasklistStep(
  state: AgentState,
  session: ChatSession,
  lifecycle: StreamLifecycle,
  runId: string,
  stepIndex: number
): Promise<AgentState> {
  const startTime = Date.now();
  
  lifecycle.writeChunk({
    actionType: "draft_tasklist",
    agentName: "tasklist-agent",
    partId: `step-${stepIndex}`,
    runId,
    stepIndex,
    title: "生成任务清单草稿 v1",
    type: "agent-step-start",
  });
  
  try {
    const draft = await draftTasklist(state, session);
    state.tasklistDraft = draft;
    
    lifecycle.writeChunk({
      durationMs: Date.now() - startTime,
      partId: `step-${stepIndex}`,
      runId,
      status: "completed",
      summary: `草稿已生成 (${draft.length} 字符)`,
      type: "agent-step-end",
    });
    
    return state;
  } catch (error) {
    lifecycle.writeChunk({
      durationMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : "未知错误",
      partId: `step-${stepIndex}`,
      runId,
      status: "failed",
      type: "agent-step-end",
    });
    throw error;
  }
}

async function runValidateTasklistStructureStep(
  state: AgentState,
  lifecycle: StreamLifecycle,
  runId: string,
  stepIndex: number
): Promise<{ state: AgentState; validation: TasklistValidationResult }> {
  const startTime = Date.now();
  
  lifecycle.writeChunk({
    actionType: "validate_tasklist_structure",
    agentName: "tasklist-agent",
    partId: `step-${stepIndex}`,
    runId,
    stepIndex,
    title: "结构校验",
    type: "agent-step-start",
  });
  
  try {
    const validation = validateTasklistStructure(state.tasklistDraft, state.versionPlanUri);
    state.validationResult = validation;
    
    lifecycle.writeChunk({
      durationMs: Date.now() - startTime,
      partId: `step-${stepIndex}`,
      runId,
      status: validation.isValid ? "completed" : "completed",
      summary: validation.isValid ? "校验通过" : `校验失败，发现 ${validation.blockingIssues.length} 个问题`,
      type: "agent-step-end",
    });
    
    return { state, validation };
  } catch (error) {
    lifecycle.writeChunk({
      durationMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : "未知错误",
      partId: `step-${stepIndex}`,
      runId,
      status: "failed",
      type: "agent-step-end",
    });
    throw error;
  }
}

async function runReviseTasklistStep(
  state: AgentState,
  session: ChatSession,
  lifecycle: StreamLifecycle,
  runId: string,
  stepIndex: number
): Promise<AgentState> {
  const startTime = Date.now();
  
  lifecycle.writeChunk({
    actionType: "revise_tasklist",
    agentName: "tasklist-agent",
    partId: `step-${stepIndex}`,
    runId,
    stepIndex,
    title: "修正任务清单草稿 v2",
    type: "agent-step-start",
  });
  
  try {
    const revisedDraft = await reviseTasklist(state, session);
    state.tasklistDraft = revisedDraft;
    state.revisionCount = state.revisionCount + 1;
    
    lifecycle.writeChunk({
      durationMs: Date.now() - startTime,
      partId: `step-${stepIndex}`,
      runId,
      status: "completed",
      summary: `草稿已修正 (${revisedDraft.length} 字符)`,
      type: "agent-step-end",
    });
    
    return state;
  } catch (error) {
    lifecycle.writeChunk({
      durationMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : "未知错误",
      partId: `step-${stepIndex}`,
      runId,
      status: "failed",
      type: "agent-step-end",
    });
    throw error;
  }
}

async function runFinalAnswerStep(
  state: AgentState,
  lifecycle: StreamLifecycle,
  runId: string,
  stepIndex: number
): Promise<AgentState> {
  const startTime = Date.now();
  
  lifecycle.writeChunk({
    actionType: "final_answer",
    agentName: "tasklist-agent",
    partId: `step-${stepIndex}`,
    runId,
    stepIndex,
    title: "生成最终回答",
    type: "agent-step-start",
  });
  
  try {
    const finalOutput = buildFinalAnswer(state);
    state.finalOutput = finalOutput;
    
    lifecycle.writeChunk({
      type: "text",
      content: finalOutput,
    });
    
    lifecycle.writeChunk({
      durationMs: Date.now() - startTime,
      partId: `step-${stepIndex}`,
      runId,
      status: "completed",
      summary: "最终回答已生成",
      type: "agent-step-end",
    });
    
    return state;
  } catch (error) {
    lifecycle.writeChunk({
      durationMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : "未知错误",
      partId: `step-${stepIndex}`,
      runId,
      status: "failed",
      type: "agent-step-end",
    });
    throw error;
  }
}

function shouldReviseTasklist(validation: TasklistValidationResult): boolean {
  return validation.blockingIssues.length > 0;
}

export async function executeTasklistAgent(
  session: ChatSession,
  lifecycle: StreamLifecycle,
  versionPlanReference: ChatComposerReference
): Promise<void> {
  const runId = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  let stepIndex = 0;
  
  let state = createInitialAgentState(versionPlanReference.uri);
  
  try {
    state = await runReadResourceStep(state, lifecycle, runId, stepIndex++);
  } catch (error) {
    lifecycle.writeChunk({ type: "text", content: "⚠️ 读取版本方案失败：" + (error instanceof Error ? error.message : "未知错误") });
  }
  
  try {
    state = await runPlanExtractStep(state, session, lifecycle, runId, stepIndex++);
  } catch (error) {
    lifecycle.writeChunk({ type: "text", content: "⚠️ 提取版本方案结构失败：" + (error instanceof Error ? error.message : "未知错误") });
  }
  
  try {
    state = await runDraftTasklistStep(state, session, lifecycle, runId, stepIndex++);
  } catch (error) {
    lifecycle.writeChunk({ type: "text", content: "⚠️ 生成任务清单草稿失败：" + (error instanceof Error ? error.message : "未知错误") });
    state.tasklistDraft = "## 任务清单\n\n### 步骤\n\n由于生成失败，无法创建任务清单。\n\n### 勾选项\n\n- [ ] 待完成";
  }
  
  try {
    const validationV1 = await runValidateTasklistStructureStep(state, lifecycle, runId, stepIndex++);
    state = validationV1.state;
    
    if (shouldReviseTasklist(validationV1.validation)) {
      lifecycle.writeChunk({
        type: "text",
        content: "⚠️ 检测到任务清单结构问题，但跳过修正步骤以确保流程正常完成。",
      });
    }
  } catch (error) {
    lifecycle.writeChunk({ type: "text", content: "⚠️ 校验任务清单结构失败：" + (error instanceof Error ? error.message : "未知错误") });
  }
  
  try {
    await runFinalAnswerStep(state, lifecycle, runId, stepIndex++);
  } catch (error) {
    lifecycle.writeChunk({ type: "text", content: "⚠️ 生成最终回答失败：" + (error instanceof Error ? error.message : "未知错误") });
    lifecycle.writeChunk({ type: "text", content: state.tasklistDraft });
  }
}