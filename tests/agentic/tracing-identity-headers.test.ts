import { describe, expect, it, vi } from 'vitest';

import {
  AgenticHTTPTransport,
  DisseqtAgenticClient,
  EnrichedSpan,
  type FetchLike,
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
    project_id: 'proj-456',
    service_name: 'svc',
    ...overrides,
  });

describe('agentic tracing identity headers (N2)', () => {
  it('sends X-Api-Key and X-Project-Id headers on every trace POST, matching Python main', async () => {
    const fetcher = vi.fn<FetchLike>().mockResolvedValue(new Response('{}', { status: 200 }));
    const transport = new AgenticHTTPTransport({
      endpoint: 'https://api.example.test/traces',
      apiKey: 'FAKE-KEY-FOR-TEST',
      fetch: fetcher,
    });

    await transport.sendSpans([makeSpan()]);

    const [, init] = fetcher.mock.calls[0] as [unknown, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['X-Api-Key']).toBe('FAKE-KEY-FOR-TEST');
    expect(headers['X-Project-Id']).toBe('proj-456');
    expect(headers['X-Application-Id']).toBeUndefined();

    // Body compatibility: resource.attributes still carries both, for a
    // Kong plugin version that only looks in the body (old-server /
    // new-client safety, see buildCustomTracePayload).
    const body = JSON.parse(init.body as string);
    expect(body.resource.attributes['api.key']).toBe('FAKE-KEY-FOR-TEST');
    expect(body.resource.attributes['project.id']).toBe('proj-456');
  });

  it('sends X-Application-Id only when configured (optional, compat with existing 0.3.0 callers)', async () => {
    const fetcher = vi.fn<FetchLike>().mockResolvedValue(new Response('{}', { status: 200 }));
    const transport = new AgenticHTTPTransport({
      endpoint: 'https://api.example.test/traces',
      apiKey: 'FAKE-KEY-FOR-TEST',
      applicationId: 'FAKE-APP-ID',
      fetch: fetcher,
    });

    await transport.sendSpans([makeSpan()]);

    const [, init] = fetcher.mock.calls[0] as [unknown, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['X-Application-Id']).toBe('FAKE-APP-ID');
  });

  it('DisseqtAgenticClient threads applicationId (and its snake_case alias) through to the transport headers', async () => {
    const fetcher = vi.fn<FetchLike>().mockResolvedValue(new Response('{}', { status: 200 }));
    const client = new DisseqtAgenticClient({
      apiKey: 'FAKE-KEY-FOR-TEST',
      projectId: 'proj-456',
      serviceName: 'svc',
      endpoint: 'https://api.example.test/traces',
      application_id: 'FAKE-APP-ID-SNAKE',
      fetch: fetcher,
    });
    expect(client.applicationId).toBe('FAKE-APP-ID-SNAKE');

    client.sendTrace({ toEnrichedSpans: () => [makeSpan()] } as never);
    await client.flush();

    const [, init] = fetcher.mock.calls[0] as [unknown, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['X-Application-Id']).toBe('FAKE-APP-ID-SNAKE');
    await client.shutdown();
  });

  it('an existing 0.3.0-style caller who never sets applicationId keeps working unchanged', async () => {
    const fetcher = vi.fn<FetchLike>().mockResolvedValue(new Response('{}', { status: 200 }));
    const client = new DisseqtAgenticClient({
      apiKey: 'FAKE-KEY-FOR-TEST',
      projectId: 'proj-456',
      serviceName: 'svc',
      endpoint: 'https://api.example.test/traces',
      fetch: fetcher,
    });
    expect(client.applicationId).toBeNull();

    client.sendTrace({ toEnrichedSpans: () => [makeSpan()] } as never);
    await client.flush();

    const [, init] = fetcher.mock.calls[0] as [unknown, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['X-Application-Id']).toBeUndefined();
    expect(headers['X-Api-Key']).toBe('FAKE-KEY-FOR-TEST');
    await client.shutdown();
  });
});
