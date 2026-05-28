import { clearTimeout, setTimeout } from 'node:timers';
import { setTimeout as delay } from 'node:timers/promises';

import type { FetchLike, JsonObject } from '../http/types.js';
import type { EnrichedSpan } from './models.js';

export interface AgenticHTTPTransportConfig {
  endpoint: string;
  apiKey?: string | null;
  timeoutMs?: number;
  maxRetries?: number;
  fetch?: FetchLike;
}

export interface CustomTracePayload extends JsonObject {
  resource: {
    attributes: Record<string, unknown>;
  };
  traces: {
    traceId: string;
    spans: Record<string, unknown>[];
  }[];
}

export class AgenticHTTPTransport {
  readonly endpoint: string;
  readonly apiKey: string | null;
  readonly timeoutMs: number;
  readonly maxRetries: number;

  private readonly fetcher: FetchLike;

  constructor(config: AgenticHTTPTransportConfig) {
    assertNonEmpty('endpoint', config.endpoint);
    this.endpoint = config.endpoint.replace(/\/+$/, '');
    this.apiKey = config.apiKey ?? null;
    this.timeoutMs = config.timeoutMs ?? 10_000;
    this.maxRetries = config.maxRetries ?? 3;
    this.fetcher = config.fetch ?? globalThis.fetch.bind(globalThis);
  }

  async sendSpans(spans: EnrichedSpan[]): Promise<boolean> {
    if (spans.length === 0) {
      return true;
    }

    const payload = buildCustomTracePayload(spans, this.endpoint, this.apiKey);
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      try {
        const response = await this.postPayload(payload);
        if (response.ok) {
          return true;
        }
        if (!isRetryableStatus(response.status) || attempt === this.maxRetries) {
          return false;
        }
      } catch {
        if (attempt === this.maxRetries) {
          return false;
        }
      }
      await delay(500 * 2 ** attempt);
    }

    return false;
  }

  send_spans(spans: EnrichedSpan[]): Promise<boolean> {
    return this.sendSpans(spans);
  }

  sendTrace(traceSpans: EnrichedSpan[]): Promise<boolean> {
    return this.sendSpans(traceSpans);
  }

  send_trace(traceSpans: EnrichedSpan[]): Promise<boolean> {
    return this.sendTrace(traceSpans);
  }

  private async postPayload(payload: CustomTracePayload): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await this.fetcher(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function buildCustomTracePayload(
  spans: EnrichedSpan[],
  endpoint: string,
  apiKey?: string | null,
): CustomTracePayload {
  const traces = new Map<string, Record<string, unknown>[]>();
  let resourceAttributes: Record<string, unknown> = {};

  for (const span of spans) {
    const spanDict = span.toDict();
    const traceSpans = traces.get(spanDict.trace_id) ?? [];
    traceSpans.push({
      traceId: spanDict.trace_id,
      spanId: spanDict.span_id,
      parentSpanId: spanDict.parent_span_id || '',
      name: spanDict.name,
      spanKind: spanDict.kind,
      startTimeMs: Math.floor(spanDict.start_time_unix_nano / 1_000_000),
      endTimeMs: Math.floor(spanDict.end_time_unix_nano / 1_000_000),
      status: spanDict.status_code,
      ...(spanDict.attributes_json !== '{}'
        ? { attributes: parseAttributes(spanDict.attributes_json) }
        : {}),
    });
    traces.set(spanDict.trace_id, traceSpans);

    if (Object.keys(resourceAttributes).length === 0) {
      resourceAttributes = {
        'service.name': spanDict.service_name,
        'service.version': spanDict.service_version,
        'deployment.environment': spanDict.environment,
        'project.id': spanDict.project_id,
        ingestion_url: endpoint,
        'api.key': apiKey ?? '',
      };
    }
  }

  return {
    resource: { attributes: resourceAttributes },
    traces: Array.from(traces.entries()).map(([traceId, traceSpans]) => ({
      traceId,
      spans: traceSpans,
    })),
  };
}

function parseAttributes(attributesJson: string): unknown {
  try {
    return JSON.parse(attributesJson) as unknown;
  } catch {
    return {};
  }
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

function assertNonEmpty(name: string, value: string): void {
  if (value.trim().length === 0) {
    throw new ValueError(`${name} is required and cannot be empty`);
  }
}

class ValueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValueError';
  }
}
