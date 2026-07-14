// Simulate what happens when streaming chunks arrive

// This represents the current state of the useStreamTextBuffer logic
function simulateStreamBuffer() {
  const streamingBlocks = [
    // Example: what if the blocks are only reasoning or tool calls?
    { type: "reasoning", content: "Thinking about the problem..." },
    { type: "tool_call", toolName: "someTool", content: "" },
    { type: "tool_result", toolName: "someTool", content: "Tool result here" }
    // NOTE: No text type blocks!
  ];

  const streamingText = streamingBlocks
    .filter((b) => b.type === "text")
    .map((b) => b.content)
    .join("");

  console.log("Mock blocks:", streamingBlocks);
  console.log("Filter result (text blocks):", streamingBlocks.filter((b) => b.type === "text"));
  console.log("streamingText result:", JSON.stringify(streamingText));
  console.log("streamingText length:", streamingText.length);
  console.log("streamingText === empty string:", streamingText === "");
}

simulateStreamBuffer();