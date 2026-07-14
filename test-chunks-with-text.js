// Test what happens when text chunks ARE included

function simulateStreamBufferWithText() {
  const streamingBlocks = [
    { type: "text", content: "Hello " },
    { type: "text", content: "world!" },
    { type: "reasoning", content: "That was my thinking" }
  ];

  const streamingText = streamingBlocks
    .filter((b) => b.type === "text")
    .map((b) => b.content)
    .join("");

  console.log("Blocks with text:", streamingBlocks);
  console.log("Text blocks:", streamingBlocks.filter((b) => b.type === "text"));
  console.log("streamingText result:", JSON.stringify(streamingText));
  console.log("streamingText length:", streamingText.length);
}

simulateStreamBufferWithText();