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

async function testLangGraph() {
  console.log("Creating graph...");
  
  const graph = new StateGraph(GraphStateSchema);
  
  graph.addNode("LLM_INVOKE", async (state: GraphState) => {
    console.log("Executing LLM_INVOKE node");
    console.log("Current state:", {
      hasToolCalls: state.hasToolCalls,
      chunks: state.chunks,
      chunksLength: state.chunks?.length,
    });
    
    return {
      hasToolCalls: false,
      chunks: [{ type: "text", content: "hello world" }],
    };
  });
  
  graph.addNode("DIRECT_ANSWER", async () => {
    console.log("Executing DIRECT_ANSWER node");
    return {};
  });
  
  graph.addConditionalEdges(
    "LLM_INVOKE",
    (state: GraphState) => {
      console.log("Routing from LLM_INVOKE:", {
        hasToolCalls: state.hasToolCalls,
        chunksLength: state.chunks.length,
      });
      if (!state.hasToolCalls && state.chunks.length > 0) {
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
  
  const result = await app.invoke({
    messages: [{ content: "hello" }],
  });
  
  console.log("Result:", JSON.stringify(result, null, 2));
  console.log("Success!");
}

testLangGraph().catch(console.error);