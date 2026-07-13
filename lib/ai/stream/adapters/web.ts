import { ChatStreamChunk } from "../protocol";
import { StreamWriter } from "../lifecycle";

export class NDJSONWebWriter implements StreamWriter {
  private readonly controller: ReadableStreamDefaultController<Uint8Array>;
  private readonly encoder = new TextEncoder();

  constructor(controller: ReadableStreamDefaultController<Uint8Array>) {
    this.controller = controller;
  }

  writeChunk(chunk: ChatStreamChunk): void {
    const line = JSON.stringify(chunk) + "\n";
    this.controller.enqueue(this.encoder.encode(line));
  }

  close(): void {
    this.controller.close();
  }
}

export interface StreamResult {
  body: ReadableStream;
  headers: Headers;
}

export function createNDJSONStream(
  onStart: (writer: StreamWriter) => Promise<void>
): StreamResult {
  const stream = new ReadableStream({
    async start(controller) {
      const writer = new NDJSONWebWriter(controller);
      try {
        await onStart(writer);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "未知错误";
        writer.writeChunk({ type: "error", error: errorMessage });
        writer.close();
      }
    },
  });

  const headers = new Headers({
    "Content-Type": "application/x-ndjson",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  return { body: stream, headers };
}
