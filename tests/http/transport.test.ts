import { describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_TIMEOUT_MS,
  DisseqtHttpTransport,
  DisseqtJsonError,
  buildUrl,
} from '../../src/index.js';

const jsonResponse = (body: unknown, init: ResponseInit = {}): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });

describe('DisseqtHttpTransport', () => {
  it('builds Python-compatible auth headers', () => {
    const transport = new DisseqtHttpTransport({
      apiKey: 'api-key',
      projectId: 'project-id',
    });

    expect(transport.timeoutMs).toBe(DEFAULT_TIMEOUT_MS);
    expect(transport.buildHeaders()).toEqual({
      'X-API-Key': 'api-key',
      'X-Project-Id': 'project-id',
      'Content-Type': 'application/json',
    });
    expect(transport.buildHeaders({ includeContentType: false })).toEqual({
      'X-API-Key': 'api-key',
      'X-Project-Id': 'project-id',
    });
  });

  it('sends JSON payloads with auth headers', async () => {
    const fetcher = vi.fn(async () => jsonResponse({ ok: true }));
    const transport = new DisseqtHttpTransport({
      apiKey: 'api-key',
      projectId: 'project-id',
      fetch: fetcher,
    });

    const result = await transport.requestJson({
      method: 'POST',
      url: 'https://example.test/validate',
      json: { input_data: { llm_input_query: 'hello' } },
    });

    expect(result).toEqual({ ok: true });
    expect(fetcher).toHaveBeenCalledWith(
      'https://example.test/validate',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'X-API-Key': 'api-key',
          'X-Project-Id': 'project-id',
          'Content-Type': 'application/json',
        },
        body: '{"input_data":{"llm_input_query":"hello"}}',
      }),
    );
  });

  it('appends query parameters and skips nullish values', async () => {
    const fetcher = vi.fn(async (...args: [string | URL | Request, RequestInit?]) => {
      void args;
      return jsonResponse({ ok: true });
    });
    const transport = new DisseqtHttpTransport({
      apiKey: 'api-key',
      projectId: 'project-id',
      fetch: fetcher,
    });

    await transport.requestJson({
      method: 'GET',
      url: 'https://example.test/items',
      params: { page: 2, limit: 10, archived: false, empty: null, missing: undefined },
    });

    const firstCall = fetcher.mock.calls[0];
    expect(firstCall).toBeDefined();
    expect(firstCall?.[0]).toBe('https://example.test/items?page=2&limit=10&archived=false');
  });

  it('returns deleted status for 204 responses', async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 204 }));
    const transport = new DisseqtHttpTransport({
      apiKey: 'api-key',
      projectId: 'project-id',
      fetch: fetcher,
    });

    await expect(
      transport.requestJson({
        method: 'DELETE',
        url: 'https://example.test/items/item-1',
      }),
    ).resolves.toEqual({ status: 'deleted' });
  });

  it('raises HTTP errors with a 512-character body preview', async () => {
    const body = 'x'.repeat(600);
    const fetcher = vi.fn(async () => new Response(body, { status: 500 }));
    const transport = new DisseqtHttpTransport({
      apiKey: 'api-key',
      projectId: 'project-id',
      fetch: fetcher,
    });

    await expect(
      transport.requestJson({
        method: 'POST',
        url: 'https://example.test/fail',
        json: {},
      }),
    ).rejects.toMatchObject({
      name: 'DisseqtHttpError',
      statusCode: 500,
      message: 'HTTP 500: API request failed',
      responseBody: 'x'.repeat(512),
      method: 'POST',
      url: 'https://example.test/fail',
    });
  });

  it('wraps network failures as HTTP status 0', async () => {
    const fetcher = vi.fn(async () => {
      throw new Error('socket closed');
    });
    const transport = new DisseqtHttpTransport({
      apiKey: 'api-key',
      projectId: 'project-id',
      fetch: fetcher,
    });

    await expect(
      transport.requestJson({
        method: 'GET',
        url: 'https://example.test/network',
      }),
    ).rejects.toMatchObject({
      name: 'DisseqtHttpError',
      statusCode: 0,
      message: 'HTTP 0: Network error: socket closed',
    });
  });

  it('raises JSON errors for null and invalid JSON responses', async () => {
    const nullTransport = new DisseqtHttpTransport({
      apiKey: 'api-key',
      projectId: 'project-id',
      fetch: vi.fn(async () => new Response('null', { status: 200 })),
    });
    const invalidTransport = new DisseqtHttpTransport({
      apiKey: 'api-key',
      projectId: 'project-id',
      fetch: vi.fn(async () => new Response('not-json', { status: 200 })),
    });

    await expect(
      nullTransport.requestJson({ method: 'GET', url: 'https://example.test/null' }),
    ).rejects.toBeInstanceOf(DisseqtJsonError);
    await expect(
      invalidTransport.requestJson({ method: 'GET', url: 'https://example.test/invalid' }),
    ).rejects.toMatchObject({
      name: 'DisseqtJsonError',
      responseText: 'not-json',
    });
  });

  it('returns raw text without content-type for CSV-style downloads', async () => {
    const fetcher = vi.fn(async (...args: [string | URL | Request, RequestInit?]) => {
      void args;
      return new Response('a,b\n1,2\n', { status: 200 });
    });
    const transport = new DisseqtHttpTransport({
      apiKey: 'api-key',
      projectId: 'project-id',
      fetch: fetcher,
    });

    const response = await transport.requestRaw({
      method: 'GET',
      url: 'https://example.test/download',
      includeContentType: false,
    });

    expect(response.text).toBe('a,b\n1,2\n');
    const firstCall = fetcher.mock.calls[0];
    expect(firstCall).toBeDefined();
    expect(firstCall?.[1]).toEqual(
      expect.objectContaining({
        headers: {
          'X-API-Key': 'api-key',
          'X-Project-Id': 'project-id',
        },
      }),
    );
  });
});

describe('buildUrl', () => {
  it('preserves URLs when no query params are provided', () => {
    expect(buildUrl('https://example.test/path')).toBe('https://example.test/path');
  });

  it('merges query params into existing URLs', () => {
    expect(buildUrl('https://example.test/path?existing=true', { page: 1 })).toBe(
      'https://example.test/path?existing=true&page=1',
    );
  });
});
