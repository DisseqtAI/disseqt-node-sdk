import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AgenticHTTPTransport,
  DisseqtAgenticClient,
  DisseqtTrace,
  EnrichedSpan,
  type FetchLike,
  SpanKind,
  TraceBuffer,
  buildCustomTracePayload,
} from '../../src/index.js';

const makeSpan = (overrides: Partial<ConstructorParameters<typeof EnrichedSpan>[0]> = {}) =>
  new EnrichedSpan({
    trace_id: 'trace-1',
    span_id: 'span-1',
    parent_span_id: null,
    name: 'llm_call',
    kind: 'MODEL_EXEC',
    root: true,
    start_time_unix_nano: 1_000_000_000,
    end_time_unix_nano: 2_000_000_000,
    duration_ns: 1_000_000_000,
    status_code: 'OK',
    project_id: 'project',
    service_name: 'svc',
    service_version: '1.0.0',
    environment: 'production',
    attributes_json: JSON.stringify({ 'agentic.request.model': 'gpt-4' }),
    ...overrides,
  });

describe('AgenticHTTPTransport', () => {
  it('builds the Python custom trace payload format', () => {
    const payload = buildCustomTracePayload(
      [
        makeSpan(),
        makeSpan({
          span_id: 'span-2',
          parent_span_id: 'span-1',
          name: 'tool',
          kind: 'TOOL_EXEC',
        }),
      ],
      'https://api.example.test/traces',
      'api-key',
    );

    expect(payload).toEqual({
      resource: {
        attributes: {
          'service.name': 'svc',
          'service.version': '1.0.0',
          'deployment.environment': 'production',
          'project.id': 'project',
          ingestion_url: 'https://api.example.test/traces',
          'api.key': 'api-key',
        },
      },
      traces: [
        {
          traceId: 'trace-1',
          spans: [
            {
              traceId: 'trace-1',
              spanId: 'span-1',
              parentSpanId: '',
              name: 'llm_call',
              spanKind: 'MODEL_EXEC',
              startTimeMs: 1000,
              endTimeMs: 2000,
              status: 'OK',
              attributes: { 'agentic.request.model': 'gpt-4' },
            },
            {
              traceId: 'trace-1',
              spanId: 'span-2',
              parentSpanId: 'span-1',
              name: 'tool',
              spanKind: 'TOOL_EXEC',
              startTimeMs: 1000,
              endTimeMs: 2000,
              status: 'OK',
              attributes: { 'agentic.request.model': 'gpt-4' },
            },
          ],
        },
      ],
    });
  });

  it('posts spans and retries retryable failures', async () => {
    const fetcher = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(new Response('busy', { status: 503 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const transport = new AgenticHTTPTransport({
      endpoint: 'https://api.example.test/traces',
      apiKey: 'api-key',
      maxRetries: 1,
      fetch: fetcher,
    });

    await expect(transport.send_spans([makeSpan()])).resolves.toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1]?.[0]).toBe('https://api.example.test/traces');
    expect(fetcher.mock.calls[1]?.[1]).toEqual(
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      }),
    );
  });

  it('returns false for non-retryable failures and true for empty batches', async () => {
    const fetcher = vi.fn<FetchLike>().mockResolvedValue(new Response('bad', { status: 400 }));
    const transport = new AgenticHTTPTransport({
      endpoint: 'https://api.example.test/traces',
      maxRetries: 2,
      fetch: fetcher,
    });

    await expect(transport.sendSpans([])).resolves.toBe(true);
    await expect(transport.sendSpans([makeSpan()])).resolves.toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe('TraceBuffer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('flushes when max batch size is reached', async () => {
    const transport = {
      sendSpans: vi.fn(async () => true),
    } as unknown as AgenticHTTPTransport;
    const buffer = new TraceBuffer({
      transport,
      maxBatchSize: 2,
      flushIntervalMs: 1000,
    });

    buffer.addSpan(makeSpan({ span_id: 'one' }));
    expect(transport.sendSpans).not.toHaveBeenCalled();
    buffer.add_span(makeSpan({ span_id: 'two' }));
    await vi.runAllTimersAsync();

    expect(transport.sendSpans).toHaveBeenCalledWith([
      expect.objectContaining({ spanId: 'one' }),
      expect.objectContaining({ spanId: 'two' }),
    ]);
    await buffer.stop();
  });

  it('flushes on interval and stop flushes remaining spans', async () => {
    const transport = {
      sendSpans: vi.fn(async () => true),
    } as unknown as AgenticHTTPTransport;
    const buffer = new TraceBuffer({
      transport,
      maxBatchSize: 100,
      flushIntervalMs: 1000,
    });

    buffer.addSpans([makeSpan({ span_id: 'interval' })]);
    vi.setSystemTime(Date.now() + 1000);
    expect(buffer.shouldFlush()).toBe(true);
    await buffer.flush();
    expect(transport.sendSpans).toHaveBeenCalledTimes(1);

    buffer.addSpan(makeSpan({ span_id: 'stop' }));
    await buffer.stop();
    expect(transport.sendSpans).toHaveBeenCalledTimes(2);
  });
});

describe('DisseqtAgenticClient', () => {
  it('validates required fields like Python', () => {
    expect(
      () =>
        new DisseqtAgenticClient({
          apiKey: '',
          projectId: 'project',
          serviceName: 'svc',
        }),
    ).toThrow('api_key is required and cannot be empty');
    expect(
      () =>
        new DisseqtAgenticClient({
          apiKey: 'key',
          projectId: 'project',
          serviceName: '',
        }),
    ).toThrow('service_name is required and cannot be empty');
  });

  it('sends trace spans to the buffer and flushes them through transport', async () => {
    const fetcher = vi.fn<FetchLike>().mockResolvedValue(new Response('{}', { status: 200 }));
    const client = new DisseqtAgenticClient({
      apiKey: 'key',
      projectId: 'project',
      serviceName: 'svc',
      endpoint: 'https://api.example.test/traces',
      maxBatchSize: 100,
      flushIntervalMs: 60_000,
      fetch: fetcher,
    });
    const trace = new DisseqtTrace({
      name: 'workflow',
      trace_id: 'trace-1',
      project_id: 'project',
      service_name: 'svc',
    });
    trace.startSpan('agent', SpanKind.AgentExec).end();

    client.send_trace(trace);
    expect(client.buffer.buffer).toHaveLength(1);

    await client.flush();
    expect(client.buffer.buffer).toHaveLength(0);
    expect(fetcher).toHaveBeenCalledTimes(1);

    await client.shutdown();
  });
});
