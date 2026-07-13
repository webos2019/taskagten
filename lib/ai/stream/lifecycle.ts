import { ChatStreamChunk, createStartChunk, createDoneChunk, createErrorChunk } from "./protocol";

export interface StreamWriter {
  writeChunk(chunk: ChatStreamChunk): void;
  close(): void;
}

export class StreamLifecycle {
  private started = false;
  private terminated = false;
  private closed = false;
  private readonly writer: StreamWriter;

  constructor(writer: StreamWriter) {
    this.writer = writer;
  }

  emitStartOnce(messageId: string): boolean {
    if (this.started || this.terminated || this.closed) {
      return false;
    }

    this.started = true;
    this.writer.writeChunk(createStartChunk(messageId));
    return true;
  }

  emitDoneOnce(): boolean {
    if (this.terminated || this.closed) {
      return false;
    }

    this.terminated = true;
    this.writer.writeChunk(createDoneChunk());
    return true;
  }

  emitErrorOnce(error: string): boolean {
    if (this.terminated || this.closed) {
      return false;
    }

    this.terminated = true;
    this.writer.writeChunk(createErrorChunk(error));
    return true;
  }

  isClosed(): boolean {
    return this.closed;
  }

  close(): void {
    this.closed = true;
    this.writer.close();
  }

  writeChunk(chunk: ChatStreamChunk): void {
    if (this.terminated || this.closed) {
      return;
    }
    this.writer.writeChunk(chunk);
  }
}

export function createId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
}
