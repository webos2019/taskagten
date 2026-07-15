import type { ChatSession } from "@/lib/ai/runtime/chat-session";
import type { StreamLifecycle } from "@/lib/ai/stream";
import type { ChatComposerPayload, ChatComposerReference } from "@/types/chat";
import { executeTasklistAgent } from "./agent-steps";

const VERSION_PLAN_RESOURCE_URI_PATTERN = /^docs:\/\/versions\/[^/\\]+\.md$/i;

export interface TasklistAgentInvocation {
  kind: "ready" | "missing-version-plan";
  versionPlanReference?: ChatComposerReference;
}

export function isVersionPlanReference(ref: ChatComposerReference): boolean {
  if (!ref || typeof ref.uri !== 'string') {
    return false;
  }
  return VERSION_PLAN_RESOURCE_URI_PATTERN.test(ref.uri);
}

export function resolveVersionPlanTasklistAgentInvocation(
  request: { messages: unknown[]; composer?: ChatComposerPayload }
): TasklistAgentInvocation | null {
  if (request.composer?.command?.name !== "tasklist") {
    return null;
  }

  const versionPlanReference = request.composer.references?.find(isVersionPlanReference);

  if (!versionPlanReference) {
    return { kind: "missing-version-plan" };
  }

  return {
    kind: "ready",
    versionPlanReference,
  };
}

export async function runVersionPlanTasklistAgentEntryStage(
  session: ChatSession,
  lifecycle: StreamLifecycle
): Promise<boolean> {
  const composerPayload = (session as any).getComposerPayload?.();

  console.log('[tasklist-agent] composerPayload:', JSON.stringify(composerPayload, null, 2));

  if (!composerPayload) {
    return false;
  }

  const request = { messages: [], composer: composerPayload };
  const invocation = resolveVersionPlanTasklistAgentInvocation(request);

  if (!invocation) {
    return false;
  }

  if (invocation.kind === "missing-version-plan") {
    lifecycle.writeChunk({
      type: "text",
      content: "请先通过 @ 引用一个 `docs://versions/*.md` 版本方案，再生成 tasklist 草稿。本版不支持只根据目标直接生成 tasklist。",
    });
    return true;
  }

  if (invocation.kind === "ready" && invocation.versionPlanReference) {
    await executeTasklistAgent(session, lifecycle, invocation.versionPlanReference);
    return true;
  }

  return false;
}