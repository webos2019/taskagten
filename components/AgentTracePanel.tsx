"use client";

interface AgentStep {
  actionType?: string;
  agentName?: string;
  partId?: string;
  runId?: string;
  stepIndex?: number;
  title?: string;
  status?: string;
  durationMs?: number;
  error?: string;
  summary?: string;
}

interface AgentTracePanelProps {
  steps: AgentStep[];
}

const ACTION_TYPE_LABELS: Record<string, string> = {
  read_resource: "读取资源",
  plan_extract: "提取结构",
  draft_tasklist: "生成草稿",
  validate_tasklist_structure: "结构校验",
  revise_tasklist: "修正草稿",
  final_answer: "生成回答",
};

export default function AgentTracePanel({ steps }: AgentTracePanelProps) {
  if (steps.length === 0) return null;

  const sortedSteps = [...steps].sort((a, b) => (a.stepIndex || 0) - (b.stepIndex || 0));
  const completedSteps = sortedSteps.filter((s) => s.status === "completed").length;
  const totalSteps = sortedSteps.length;
  const progress = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0;

  return (
    <div className="rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-gray-100 dark:bg-gray-900 dark:ring-gray-800">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-purple-600 text-xs font-medium text-white shadow-sm">
            🤖
          </div>
          <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
            {sortedSteps[0]?.agentName || "Agent"} 执行过程
          </span>
        </div>
        <span className="text-xs text-gray-500 dark:text-gray-500">
          {completedSteps}/{totalSteps}
        </span>
      </div>

      <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
        <div 
          className="h-full rounded-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-300" 
          style={{ width: `${progress}%` }} 
        />
      </div>

      <div className="space-y-2">
        {sortedSteps.map((step) => {
          const isRunning = step.status === "running";
          const isFailed = step.status === "failed";
          const isCompleted = step.status === "completed";

          return (
            <div
              key={step.partId || step.stepIndex}
              className={`rounded-xl border px-3 py-2.5 transition-all ${
                isFailed
                  ? "border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-900/20"
                  : isRunning
                  ? "border-blue-200 bg-blue-50 dark:border-blue-900/50 dark:bg-blue-900/20"
                  : "border-gray-100 bg-gray-50/50 dark:border-gray-800 dark:bg-gray-800/50"
              }`}
            >
              <div className="flex items-center gap-3">
                <div 
                  className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-xs font-medium text-white ${
                    isRunning
                      ? "bg-blue-500"
                      : isCompleted
                      ? "bg-green-500"
                      : "bg-red-500"
                  }`}
                >
                  {step.stepIndex !== undefined ? step.stepIndex + 1 : "?"}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                      {step.title || ACTION_TYPE_LABELS[step.actionType || ""] || "未知步骤"}
                    </span>
                    <span className={`rounded-md px-1.5 py-0.5 text-xs font-medium ${
                      isRunning
                        ? "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-400"
                        : isCompleted
                        ? "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-400"
                        : "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-400"
                    }`}>
                      {isRunning ? "运行中" : isCompleted ? "已完成" : "失败"}
                    </span>
                  </div>

                  {step.summary && (
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-500">
                      {step.summary}
                    </p>
                  )}

                  {step.error && (
                    <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                      错误: {step.error}
                    </p>
                  )}
                </div>

                {step.durationMs !== undefined && (
                  <span className="flex-shrink-0 text-xs text-gray-500 dark:text-gray-500">
                    {step.durationMs < 1000 ? `${step.durationMs}ms` : `${(step.durationMs / 1000).toFixed(1)}s`}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}