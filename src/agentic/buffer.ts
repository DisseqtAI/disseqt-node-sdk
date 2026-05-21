import { clearInterval, setInterval } from 'node:timers';

import type { EnrichedSpan } from './models.js';
import type { AgenticHTTPTransport } from './transport.js';

export interface TraceBufferConfig {
  transport: AgenticHTTPTransport;
  maxBatchSize?: number;
  flushIntervalMs?: number;
}

export class TraceBuffer {
  readonly transport: AgenticHTTPTransport;
  readonly maxBatchSize: number;
  readonly flushIntervalMs: number;
  readonly buffer: EnrichedSpan[] = [];

  private readonly interval: ReturnType<typeof setInterval>;
  private stopped = false;
  private flushing: Promise<void> | null = null;
  private lastFlushTime = Date.now();

  constructor(config: TraceBufferConfig) {
    this.transport = config.transport;
    this.maxBatchSize = config.maxBatchSize ?? 100;
    this.flushIntervalMs = config.flushIntervalMs ?? 1_000;
    this.interval = setInterval(() => {
      void this.flushIfDue();
    }, this.flushIntervalMs);
    this.interval.unref();
  }

  addSpan(span: EnrichedSpan): void {
    if (this.stopped) {
      return;
    }
    this.buffer.push(span);
    if (this.buffer.length >= this.maxBatchSize) {
      void this.flush();
    }
  }

  add_span(span: EnrichedSpan): void {
    this.addSpan(span);
  }

  addSpans(spans: EnrichedSpan[]): void {
    if (this.stopped) {
      return;
    }
    this.buffer.push(...spans);
    if (this.buffer.length >= this.maxBatchSize) {
      void this.flush();
    }
  }

  add_spans(spans: EnrichedSpan[]): void {
    this.addSpans(spans);
  }

  shouldFlush(): boolean {
    return this.buffer.length > 0 && Date.now() - this.lastFlushTime >= this.flushIntervalMs;
  }

  should_flush(): boolean {
    return this.shouldFlush();
  }

  async flush(): Promise<void> {
    if (this.flushing !== null) {
      await this.flushing;
      return;
    }

    this.flushing = this.flushNow();
    try {
      await this.flushing;
    } finally {
      this.flushing = null;
    }
  }

  async stop(): Promise<void> {
    this.stopped = true;
    clearInterval(this.interval);
    await this.flush();
  }

  private async flushIfDue(): Promise<void> {
    if (this.shouldFlush()) {
      await this.flush();
    }
  }

  private async flushNow(): Promise<void> {
    if (this.buffer.length === 0) {
      return;
    }

    const spans = this.buffer.splice(0, this.buffer.length);
    this.lastFlushTime = Date.now();
    await this.transport.sendSpans(spans);
  }
}
