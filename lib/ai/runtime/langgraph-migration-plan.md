# LangGraph 迁移方案文档

## 概述

本方案将原有的 Orchestrator 状态机迁移至 LangGraph 框架，实现有状态、可配置的多步骤 LLM 应用工作流。

### 迁移策略

采用**并行迁移**策略，保留原有 `orchestrateChat()` 函数，新增 `orchestrateChatWithLangGraph()` 作为并行入口，确保新旧逻辑共存且互不影响。

### LangGraph 职责范围

- **节点编排**: 定义工作流中的各个节点及其执行顺序
- **边路由**: 控制节点间的条件路由和静态路由
- **状态更新**: 通过 reducer 函数控制状态合并策略
- **事件输出**: 通过 `app.invoke()` 返回最终状态

### LangGraph 非职责范围

- **Agent 边界**: 不改变 Agent 的能力范围和安全边界
- **资源白名单**: 不修改工具权限检查逻辑
- **工具权限**: 复用现有 `skill.isCapabilityAllowed()` 检查

---

## 文件改动说明

### 1. package.json

**文件路径**: [package.json](file:///C:/newaitask/code-assistant/package.json#L20)

**改动内容**: 添加 `@langchain/langgraph` 依赖

**关键代码**:
```json
"dependencies": {
  "@langchain/core": "^0.3.58",
  "@langchain/openai": "^0.5.18",
  "@langchain/langgraph": ">=0.2.3 <0.3",
  ...
}
```

**版本说明**: 使用 `>=0.2.3 <0.3` 版本以兼容 `@langchain/core@0.3.x`，避免版本冲突。

---

### 2. orchestration-state.ts

**文件路径**: [orchestration-state.ts](file:///C:/newaitask/code-assistant/lib/ai/runtime/orchestration-state.ts)

**改动内容**: 添加 LangGraph 状态 Schema 定义

**新增内容**:

| 组件 | 说明 | 代码位置 |
|------|------|----------|
| `messagesAnnotation` | 消息数组注解，使用 reducer 合并 | L175-L178 |
| `toolResultsAnnotation` | 工具结果数组注解 | L180-L187 |
| `executedToolResultsAnnotation` | 已执行工具结果数组注解 | L189-L192 |
| `chunksAnnotation` | 输出块数组注解 | L194-L197 |
| `GraphStateSchema` | 根状态 Schema，定义所有状态字段 | L199-L219 |
| `GraphState` | 状态类型导出 | L221 |
| `createOrchestrationGraph()` | 创建 StateGraph 实例的工厂函数 | L223-L226 |

**状态字段定义**:

| 字段名 | 类型 | 默认值 | Reducer | 说明 |
|--------|------|--------|---------|------|
| `messages` | BaseMessage[] | [] | 数组追加 | 消息历史 |
| `toolCallCount` | number | 0 | 值覆盖 | 工具调用次数 |
| `hasToolCalls` | boolean | false | 值覆盖 | 是否有待执行工具调用 |
| `hasAuthoritativeResult` | boolean | false | 值覆盖 | 是否有权威结果 |
| `toolResults` | ToolResult[] | [] | 数组追加 | 工具执行结果 |
| `executedToolResults` | ExecutedToolResult[] | [] | 数组追加 | 已执行工具结果 |
| `roundFailed` | boolean | false | 值覆盖 | 当前轮次是否失败 |
| `chunks` | ChatStreamChunk[] | [] | 数组追加 | 输出块 |
| `recoveryAttempts` | number | 0 | 值覆盖 | 恢复尝试次数 |

**核心设计**: 使用 `Annotation` API 定义状态字段的 schema 和 reducer，确保状态合并策略符合业务逻辑。

---

### 3. orchestration-steps.ts

**文件路径**: [orchestration-steps.ts](file:///C:/newaitask/code-assistant/lib/ai/runtime/orchestration-steps.ts)

**改动内容**: 添加 `graphNodeExecutors` 对象，适配原有步骤执行器为 LangGraph 节点

**新增类型**:
```typescript
export type GraphNodeExecutor = (state: GraphState, config: { configurable?: { stepOptions?: StepOperationOptions } }) => Promise<Partial<GraphState>>;
```

**节点执行器映射**:

| 节点 ID | 执行器 | 调用的原有步骤 | 状态更新字段 |
|---------|--------|----------------|--------------|
| `LLM_INVOKE` | graphNodeExecutors["LLM_INVOKE"] | executeLLMInvokeStep | messages, hasToolCalls, chunks, toolResults, roundFailed |
| `TOOL_CALL_EXECUTION` | graphNodeExecutors["TOOL_CALL_EXECUTION"] | executeToolCallExecutionStep | messages, toolResults, executedToolResults, chunks, toolCallCount, hasAuthoritativeResult, roundFailed |
| `CHECK_TOOL_RESULTS` | graphNodeExecutors["CHECK_TOOL_RESULTS"] | - (状态传递) | messages, toolResults, toolCallCount, roundFailed, hasToolCalls, chunks |
| `GENERATE_SUMMARY` | graphNodeExecutors["GENERATE_SUMMARY"] | executeGenerateSummaryStep | chunks |
| `DIRECT_ANSWER` | graphNodeExecutors["DIRECT_ANSWER"] | - (空操作) | - |
| `CONSUME_LOCAL_CAPABILITY` | graphNodeExecutors["CONSUME_LOCAL_CAPABILITY"] | executeConsumeLocalCapabilityStep | - |
| `CONSUME_REMOTE_CAPABILITY` | graphNodeExecutors["CONSUME_REMOTE_CAPABILITY"] | executeConsumeRemoteCapabilityStep | messages, toolCallCount, hasToolCalls, toolResults, chunks |
| `FALLBACK` | graphNodeExecutors["FALLBACK"] | executeFallbackStep | chunks, recoveryAttempts |

**核心设计**: 每个节点执行器将 LangGraph 状态转换为原有 `OrchestrationState`，调用原有步骤函数，然后将返回的 `StatePatch` 转换回 LangGraph 状态格式。

---

### 4. orchestration-router.ts

**文件路径**: [orchestration-router.ts](file:///C:/newaitask/code-assistant/lib/ai/runtime/orchestration-router.ts)

**改动内容**: 添加 `configureGraphWithRoutes()` 函数，配置 LangGraph 条件边和静态边

> **注意**: 该函数已定义但当前未被使用，路由配置直接在 `runLangGraphOrchestration()` 中内联完成。

**条件路由定义**:

| 源节点 | 条件 | 目标节点 | 代码位置 |
|--------|------|----------|----------|
| `LLM_INVOKE` | hasToolCalls && toolCallCount < 5 | TOOL_CALL_EXECUTION | L187-L188 |
| `LLM_INVOKE` | !hasToolCalls && chunks.length > 0 | DIRECT_ANSWER | L190-L191 |
| `LLM_INVOKE` | !hasToolCalls && chunks.length === 0 | END | L193-L194 |
| `CHECK_TOOL_RESULTS` | !roundFailed && toolResults.length > 0 | GENERATE_SUMMARY | L208-L209 |
| `CHECK_TOOL_RESULTS` | !roundFailed && toolResults.length === 0 && toolCallCount < 5 | LLM_INVOKE | L211-L212 |
| `CHECK_TOOL_RESULTS` | roundFailed \|\| toolCallCount >= 5 | CONSUME_LOCAL_CAPABILITY | L214-L215 |
| `CONSUME_LOCAL_CAPABILITY` | hasToolCalls && toolResults.length > 0 | GENERATE_SUMMARY | L230-L231 |
| `CONSUME_LOCAL_CAPABILITY` | hasToolCalls && toolResults.length === 0 | END | L233-L234 |
| `CONSUME_LOCAL_CAPABILITY` | !hasToolCalls | END | L236-L237 |

**静态边定义**:

| 源节点 | 目标节点 | 说明 |
|--------|----------|------|
| `CONSUME_REMOTE_CAPABILITY` | `LLM_INVOKE` | 远程能力消费后调用 LLM |
| `TOOL_CALL_EXECUTION` | `CHECK_TOOL_RESULTS` | 工具执行后检查结果 |
| `GENERATE_SUMMARY` | `END` | 生成总结后结束 |
| `DIRECT_ANSWER` | `END` | 直接回答后结束 |
| `FALLBACK` | `END` | 降级后结束 |

---

### 5. chat-orchestrator.ts

**文件路径**: [chat-orchestrator.ts](file:///C:/newaitask/code-assistant/lib/ai/runtime/chat-orchestrator.ts)

**改动内容**: 添加 LangGraph 编排入口函数

**新增函数**:

| 函数名 | 说明 | 代码位置 |
|--------|------|----------|
| `orchestrateChatWithLangGraph()` | LangGraph 版本的编排入口，与原有 `orchestrateChat()` 并行 | L125-L163 |
| `runLangGraphOrchestration()` | LangGraph 图执行核心逻辑 | L165-L248 |

**执行流程**:

```
1. 创建 StreamLifecycle 和 messageId
2. 进入重试循环 (最多 MAX_RETRY_ATTEMPTS = 3 次)
   a. 调用 runLangGraphOrchestration()
   b. 成功则关闭 lifecycle 并返回
   c. 失败则写恢复提示，延迟后重试
   d. 耗尽重试后执行 fallback
3. 关闭 lifecycle
```

**图初始化流程**:

```typescript
const { graph, START, END } = createOrchestrationGraph();

// 注册节点
graph.addNode("LLM_INVOKE", graphNodeExecutors["LLM_INVOKE"]);
graph.addNode("TOOL_CALL_EXECUTION", graphNodeExecutors["TOOL_CALL_EXECUTION"]);
graph.addNode("CHECK_TOOL_RESULTS", graphNodeExecutors["CHECK_TOOL_RESULTS"]);
graph.addNode("GENERATE_SUMMARY", graphNodeExecutors["GENERATE_SUMMARY"]);
graph.addNode("DIRECT_ANSWER", graphNodeExecutors["DIRECT_ANSWER"]);
graph.addNode("CONSUME_LOCAL_CAPABILITY", graphNodeExecutors["CONSUME_LOCAL_CAPABILITY"]);
graph.addNode("FALLBACK", graphNodeExecutors["FALLBACK"]);

// 配置路由 (内联配置，未使用 configureGraphWithRoutes())
graph.addEdge(START, "LLM_INVOKE");
graph.addConditionalEdges("LLM_INVOKE", ...);
graph.addEdge("TOOL_CALL_EXECUTION", "CHECK_TOOL_RESULTS");
graph.addConditionalEdges("CHECK_TOOL_RESULTS", ...);
graph.addEdge("GENERATE_SUMMARY", END);
graph.addEdge("DIRECT_ANSWER", END);
graph.addEdge("CONSUME_LOCAL_CAPABILITY", END);
graph.addEdge("FALLBACK", END);

// 编译图
const app = graph.compile();

// 执行
await app.invoke(initialState, { configurable: { stepOptions } });
```

> **重要**: 当前 LangGraph 实现跳过了 `CONSUME_REMOTE_CAPABILITY` 节点，直接从 START 路由到 `LLM_INVOKE`。`CONSUME_REMOTE_CAPABILITY` 节点执行器已定义但未注册到图中。

---

### 6. chat-orchestrator.test.ts

**文件路径**: [chat-orchestrator.test.ts](file:///C:/newaitask/code-assistant/lib/ai/runtime/chat-orchestrator.test.ts)

**改动内容**: 添加 LangGraph 专用测试用例

**测试用例覆盖**:

| 测试用例 | 覆盖场景 | 验证点 |
|----------|----------|--------|
| `should complete LangGraph orchestration successfully with direct answer` | 直接回答场景 | writer.writeChunk 和 writer.close 被调用 |
| `should handle tool calls in response with LangGraph` | 工具调用场景 | executeTool 被调用，writer 被调用 |
| `should complete weather query flow with LangGraph` | 天气查询完整流程 | 模拟用户提问→LLM工具调用→工具执行→结果输出 |

---

## 工作流路由图

```
START
  │
  ▼
LLM_INVOKE ──────────────────────────────────────────────────┐
  │                                                          │
  ├─ hasToolCalls && toolCallCount < 5                       │
  │   ▼                                                       │
  │ TOOL_CALL_EXECUTION                                       │
  │   │                                                       │
  │   ▼                                                       │
  │ CHECK_TOOL_RESULTS                                        │
  │   │                                                       │
  │   ├─ !roundFailed && toolResults.length > 0               │
  │   │   ▼                                                   │
  │   │ GENERATE_SUMMARY ──► END                              │
  │   │                                                       │
  │   ├─ !roundFailed && toolResults.length === 0 && toolCallCount < 5
  │   │   ▼                                                   │
  │   │ ◄──────────────────────────────────────────────────────┘
  │   │
  │   └─ roundFailed || toolCallCount >= 5
  │       ▼
  │ CONSUME_LOCAL_CAPABILITY ──► END
  │
  ├─ !hasToolCalls && chunks.length > 0
  │   ▼
  │ DIRECT_ANSWER ──► END
  │
  └─ !hasToolCalls && chunks.length === 0
      ▼
    END
```

> **说明**: 当前实现跳过了 `CONSUME_REMOTE_CAPABILITY` 和 `CONSUME_LOCAL_CAPABILITY` → `GENERATE_SUMMARY` 的路由。如需启用完整能力消费流程，需修改路由配置。

---

## 状态流转说明

### 初始状态

```typescript
{
  messages: [...],           // 用户消息
  toolCallCount: 0,          // 初始工具调用次数为 0
  hasToolCalls: false,       // 初始无工具调用
  hasAuthoritativeResult: false,
  toolResults: [],           // 初始无工具结果
  executedToolResults: [],
  roundFailed: false,        // 初始无失败
  chunks: [],                // 初始无输出
  recoveryAttempts: 0,
}
```

### LLM_INVOKE 节点输出

```typescript
{
  messages: [...]?,          // 追加 LLM 返回消息
  hasToolCalls: boolean,     // 是否有工具调用
  chunks: [...]?,            // 直接回答内容
  toolResults: [],
  roundFailed: false,
}
```

### TOOL_CALL_EXECUTION 节点输出

```typescript
{
  messages: [...]?,          // 追加工具消息
  toolResults: [...],        // 追加工具结果
  executedToolResults: [...],
  chunks: [...]?,            // 工具执行输出
  toolCallCount: number,     // 累加工具调用次数
  hasAuthoritativeResult: boolean,
  roundFailed: boolean,      // 是否失败
}
```

---

## 测试验证

### 运行测试命令

```bash
npx vitest run lib/ai/runtime/chat-orchestrator.test.ts
```

### 测试结果

```
✓ lib/ai/runtime/chat-orchestrator.test.ts (10 tests)
  ✓ should complete orchestration successfully with direct answer (原逻辑)
  ✓ should retry once and then succeed (原逻辑)
  ✓ should exhaust retries and execute fallback (原逻辑)
  ✓ should handle fallback execution failure (原逻辑)
  ✓ should handle clientIP in context (原逻辑)
  ✓ should handle multiple retry attempts correctly (原逻辑)
  ✓ should complete with no content response (原逻辑)
  ✓ should complete LangGraph orchestration successfully with direct answer (LangGraph)
  ✓ should handle tool calls in response with LangGraph (LangGraph)
  ✓ should complete weather query flow with LangGraph (LangGraph)
```

---

## 关键修复记录

### 修复 1: 包名错误

**问题**: 使用 `langgraph` 包名导致安装失败

**解决方案**: 使用正确包名 `@langchain/langgraph`

### 修复 2: 版本冲突

**问题**: `@langchain/langgraph@1.x` 需要 `@langchain/core@1.x`

**解决方案**: 使用 `@langchain/langgraph@>=0.2.3 <0.3` 兼容 `@langchain/core@0.3.x`

### 修复 3: ReducedValue 构造函数

**问题**: `ReducedValue is not a constructor`

**解决方案**: 使用 LangGraph `Annotation` API 替代 `ReducedValue`

### 修复 4: CHECK_TOOL_RESULTS 状态丢失

**问题**: `CHECK_TOOL_RESULTS` 节点返回空对象导致状态丢失，路由逻辑无法正确判断

**解决方案**: 修改节点返回所有必要状态字段

### 修复 5: LLM_INVOKE 状态更新

**问题**: `LLM_INVOKE` 节点未正确返回 `toolResults` 和 `roundFailed` 字段

**解决方案**: 确保返回所有关键状态字段

### 修复 6: 调试日志清理

**问题**: 代码中存在大量 console.log 调试语句

**解决方案**: 移除 chat-orchestrator.ts 和 orchestration-router.ts 中的调试日志

---

## 当前实现限制

1. **跳过 CONSUME_REMOTE_CAPABILITY**: 当前 LangGraph 实现直接从 START 路由到 `LLM_INVOKE`，跳过了远程能力消费节点
2. **configureGraphWithRoutes() 未使用**: 路由配置直接在 `runLangGraphOrchestration()` 中内联完成
3. **CONSUME_LOCAL_CAPABILITY 直接结束**: 工具调用失败后直接结束，未路由到 `GENERATE_SUMMARY`
4. **测试执行时间较长**: LangGraph 测试执行时间约 12 秒，接近测试超时边界

---

## 后续优化建议

1. **启用 CONSUME_REMOTE_CAPABILITY**: 在图中注册并路由到该节点，完成完整的能力消费流程
2. **使用 configureGraphWithRoutes()**: 将路由配置逻辑抽取到专用函数中，提高代码可维护性
3. **添加断点调试**: 利用 LangGraph 的 `interrupt_before`/`interrupt_after` 功能添加调试断点
4. **可视化工作流**: 使用 LangGraph 的可视化工具展示工作流图
5. **状态持久化**: 利用 LangGraph 的 `checkpointer` 功能实现状态持久化和恢复
6. **并发工具调用**: 优化工具调用逻辑，支持并行执行多个工具调用
7. **移除旧逻辑**: 在确认 LangGraph 版本稳定后，移除 `orchestrateChat()` 和相关旧代码
