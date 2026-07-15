import { Annotation, StateGraph, START, END } from "@langchain/langgraph";
import * as z from "zod";

const messagesAnnotation = Annotation({
  schema: z.array(z.any()).default(() => []),
  reducer: (left: any[], right: any[]) => [...left, ...right],
});

const hasToolCallsAnnotation = Annotation({
  schema: z.boolean().default(false),
});

const chunksAnnotation = Annotation({
  schema: z.array(z.any()).default(() => []),
  reducer: (left: any[], right: any[]) => [...left, ...right],
});

const GraphStateSchema = Annotation.Root({
  messages: messagesAnnotation,
  hasToolCalls: hasToolCallsAnnotation,
  chunks: chunksAnnotation,
});

type GraphState = typeof GraphStateSchema.State;

async function testFullFlow() {
  console.log("=== Test Full Flow ===");
  
  const graph = new StateGraph(GraphStateSchema);
  
  graph.addNode("LLM_INVOKE", async (state: GraphState) => {
    console.log("LLM_INVOKE executed");
    console.log("  Input state:", {
      hasToolCalls: state.hasToolCalls,
      chunksLength: state.chunks?.length,
    });
    
    return {
      hasToolCalls: false,
      chunks: [{ type: "text", content: "hello world" }],
    };
  });
  
  graph.addNode("DIRECT_ANSWER", async () => {
    console.log("DIRECT_ANSWER executed");
    return {};
  });
  
  graph.addConditionalEdges(
    "LLM_INVOKE",
    (state: GraphState) => {
      console.log("Routing from LLM_INVOKE:", {
        hasToolCalls: state.hasToolCalls,
        chunksLength: state.chunks?.length,
      });
      if (!state.hasToolCalls && (state.chunks?.length ?? 0) > 0) {
        return "DIRECT_ANSWER";
      }
      return END;
    },
    {
      "DIRECT_ANSWER": "DIRECT_ANSWER",
      [END]: END,
    }
  );
  
  graph.addEdge(START, "LLM_INVOKE");
  graph.addEdge("DIRECT_ANSWER", END);
  
  const app = graph.compile();
  
  console.log("Graph compiled, invoking...");
  
  const initialState: GraphState = {
    messages: [{ content: "hello" }],
    hasToolCalls: false,
    chunks: [],
  };
  
  try {
    const result = await app.invoke(initialState);
    console.log("Result:", JSON.stringify(result, null, 2));
    console.log("SUCCESS!");
  } catch (error) {
    console.error("ERROR:", error);
    process.exit(1);
  }
}

testFullFlow();