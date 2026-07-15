import type { OrchestrationState, NodeId, RouteEntry } from "./orchestration-state";
import { createRoute } from "./orchestration-state";
import { END, StateGraph } from "@langchain/langgraph";
import type { GraphState } from "./orchestration-state";

interface RouteRule {
  fromNode: NodeId;
  condition: (state: OrchestrationState) => boolean;
  toNode: NodeId;
  conditionName: string;
}

interface DefaultRoute {
  fromNode: NodeId;
  toNode: NodeId;
}

const MAX_TOOL_CALLS = 5;

const conditionalRoutes: RouteRule[] = [
  {
    fromNode: "START",
    condition: () => true,
    toNode: "CONSUME_REMOTE_CAPABILITY",
    conditionName: "always",
  },
  
  {
    fromNode: "CONSUME_REMOTE_CAPABILITY",
    condition: () => true,
    toNode: "LLM_INVOKE",
    conditionName: "always",
  },
  
  {
    fromNode: "LLM_INVOKE",
    condition: (state) => state.hasToolCalls && state.toolCallCount < MAX_TOOL_CALLS,
    toNode: "TOOL_CALL_EXECUTION",
    conditionName: "has_tool_calls_and_not_exceed_limit",
  },
  
  {
    fromNode: "LLM_INVOKE",
    condition: (state) => !state.hasToolCalls && state.chunks.length > 0,
    toNode: "DIRECT_ANSWER",
    conditionName: "no_tool_calls_with_direct_answer",
  },
  
  {
    fromNode: "LLM_INVOKE",
    condition: (state) => !state.hasToolCalls && state.chunks.length === 0,
    toNode: "DONE",
    conditionName: "no_tool_calls_no_content",
  },
  
  {
    fromNode: "TOOL_CALL_EXECUTION",
    condition: () => true,
    toNode: "CHECK_TOOL_RESULTS",
    conditionName: "always",
  },
  
  {
    fromNode: "CHECK_TOOL_RESULTS",
    condition: (state) => !state.roundFailed && state.toolResults.length > 0,
    toNode: "GENERATE_SUMMARY",
    conditionName: "success_has_results",
  },
  
  {
    fromNode: "CHECK_TOOL_RESULTS",
    condition: (state) => !state.roundFailed && state.toolResults.length === 0 && state.toolCallCount < MAX_TOOL_CALLS,
    toNode: "LLM_INVOKE",
    conditionName: "success_no_results_continue",
  },
  
  {
    fromNode: "CHECK_TOOL_RESULTS",
    condition: (state) => state.roundFailed || state.toolCallCount >= MAX_TOOL_CALLS,
    toNode: "CONSUME_LOCAL_CAPABILITY",
    conditionName: "failed_or_exceed_limit",
  },
  
  {
    fromNode: "CONSUME_LOCAL_CAPABILITY",
    condition: (state) => state.hasToolCalls && state.toolResults.length > 0,
    toNode: "GENERATE_SUMMARY",
    conditionName: "has_tool_results",
  },
  
  {
    fromNode: "CONSUME_LOCAL_CAPABILITY",
    condition: (state) => state.hasToolCalls && state.toolResults.length === 0,
    toNode: "DONE",
    conditionName: "tool_calls_failed_no_results",
  },
  
  {
    fromNode: "CONSUME_LOCAL_CAPABILITY",
    condition: (state) => !state.hasToolCalls,
    toNode: "DONE",
    conditionName: "no_tool_calls",
  },
  
  {
    fromNode: "GENERATE_SUMMARY",
    condition: () => true,
    toNode: "DONE",
    conditionName: "always",
  },
  
  {
    fromNode: "DIRECT_ANSWER",
    condition: () => true,
    toNode: "DONE",
    conditionName: "always",
  },
  
  {
    fromNode: "FALLBACK",
    condition: () => true,
    toNode: "DONE",
    conditionName: "always",
  },
  
  {
    fromNode: "DONE",
    condition: () => true,
    toNode: "DONE",
    conditionName: "terminal",
  },
];

const defaultRoutes: DefaultRoute[] = [
  { fromNode: "START", toNode: "CONSUME_REMOTE_CAPABILITY" },
  { fromNode: "CONSUME_REMOTE_CAPABILITY", toNode: "LLM_INVOKE" },
  { fromNode: "LLM_INVOKE", toNode: "DONE" },
  { fromNode: "TOOL_CALL_EXECUTION", toNode: "CHECK_TOOL_RESULTS" },
  { fromNode: "CHECK_TOOL_RESULTS", toNode: "CONSUME_LOCAL_CAPABILITY" },
  { fromNode: "CONSUME_LOCAL_CAPABILITY", toNode: "DONE" },
  { fromNode: "GENERATE_SUMMARY", toNode: "DONE" },
  { fromNode: "DIRECT_ANSWER", toNode: "DONE" },
  { fromNode: "FALLBACK", toNode: "DONE" },
  { fromNode: "DONE", toNode: "DONE" },
];

export function determineNextNode(state: OrchestrationState): { nextNode: NodeId; route: RouteEntry } {
  const currentNode = state.currentNode;
  
  const matchingRule = conditionalRoutes.find(
    (rule) => rule.fromNode === currentNode && rule.condition(state)
  );
  
  if (matchingRule) {
    const route = createRoute(currentNode, matchingRule.toNode, matchingRule.conditionName);
    return { nextNode: matchingRule.toNode, route };
  }
  
  const defaultRoute = defaultRoutes.find((route) => route.fromNode === currentNode);
  
  if (defaultRoute) {
    const route = createRoute(currentNode, defaultRoute.toNode, "default");
    return { nextNode: defaultRoute.toNode, route };
  }
  
  const route = createRoute(currentNode, "DONE", "fallback");
  return { nextNode: "DONE", route };
}

export function isTerminalNode(node: NodeId): boolean {
  return node === "DONE";
}

export function getAvailableRoutes(fromNode: NodeId): Array<{ toNode: NodeId; conditionName: string }> {
  return conditionalRoutes
    .filter((rule) => rule.fromNode === fromNode)
    .map((rule) => ({ toNode: rule.toNode, conditionName: rule.conditionName }));
}

export function configureGraphWithRoutes(graph: StateGraph<GraphState>) {
  graph.addConditionalEdges(
    "LLM_INVOKE",
    (state: GraphState) => {
      if (state.hasToolCalls && (state.toolCallCount ?? 0) < MAX_TOOL_CALLS) {
        return "TOOL_CALL_EXECUTION";
      }
      if (!state.hasToolCalls && (state.chunks?.length ?? 0) > 0) {
        return "DIRECT_ANSWER";
      }
      if (!state.hasToolCalls && (state.chunks?.length ?? 0) === 0) {
        return END;
      }
      return END;
    },
    {
      "TOOL_CALL_EXECUTION": "TOOL_CALL_EXECUTION",
      "DIRECT_ANSWER": "DIRECT_ANSWER",
      [END]: END,
    }
  );

  graph.addConditionalEdges(
    "CHECK_TOOL_RESULTS",
    (state: GraphState) => {
      if (!(state.roundFailed ?? false) && (state.toolResults?.length ?? 0) > 0) {
        return "GENERATE_SUMMARY";
      }
      if (!(state.roundFailed ?? false) && (state.toolResults?.length ?? 0) === 0 && (state.toolCallCount ?? 0) < MAX_TOOL_CALLS) {
        return "LLM_INVOKE";
      }
      if ((state.roundFailed ?? false) || (state.toolCallCount ?? 0) >= MAX_TOOL_CALLS) {
        return "CONSUME_LOCAL_CAPABILITY";
      }
      return "CONSUME_LOCAL_CAPABILITY";
    },
    {
      "GENERATE_SUMMARY": "GENERATE_SUMMARY",
      "LLM_INVOKE": "LLM_INVOKE",
      "CONSUME_LOCAL_CAPABILITY": "CONSUME_LOCAL_CAPABILITY",
      [END]: END,
    }
  );

  graph.addConditionalEdges(
    "CONSUME_LOCAL_CAPABILITY",
    (state: GraphState) => {
      if ((state.hasToolCalls ?? false) && (state.toolResults?.length ?? 0) > 0) {
        return "GENERATE_SUMMARY";
      }
      if ((state.hasToolCalls ?? false) && (state.toolResults?.length ?? 0) === 0) {
        return END;
      }
      if (!(state.hasToolCalls ?? false)) {
        return END;
      }
      return END;
    },
    {
      "GENERATE_SUMMARY": "GENERATE_SUMMARY",
      [END]: END,
    }
  );

  graph.addEdge("CONSUME_REMOTE_CAPABILITY", "LLM_INVOKE");
  graph.addEdge("TOOL_CALL_EXECUTION", "CHECK_TOOL_RESULTS");
  graph.addEdge("GENERATE_SUMMARY", END);
  graph.addEdge("DIRECT_ANSWER", END);
  graph.addEdge("FALLBACK", END);

  return graph;
}