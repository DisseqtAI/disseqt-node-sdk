import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DisseqtHttpError,
  DisseqtHttpTransport,
  SDKVersionBlockedError,
  SDK_VERSION,
  _resetVersionNoticeState,
} from '../../src/index.js';
import type { FetchLike } from '../../src/index.js';

const OK_BODY = { data: {}, status: { code: '200' } };

// The DSQ error envelope production-monitoring's enforcement tier returns
// with HTTP 426, plus the headers stamped alongside it.
const BLOCK_ENVELOPE = {
  status: 'error',
  error: {
    external:
      '@disseqt-ai/sdk 0.2.0 is no longer supported (minimum 0.3.0, latest 9.9.9). ' +
      'Upgrade with: npm install @disseqt-ai/sdk@latest.',
    code: 'UpgradeRequired',
    details: [],
  },
  code: 'DSQ-4260',
};
const BLOCK_HEADERS = {
  'X-SDK-Latest-Version': '9.9.9',
  'X-SDK-Notice': 'versions below 0.3.0 stop working after 2026-10-01',
  Sunset: 'Thu, 01 Oct 2026 00:00:00 GMT',
};

const jsonResponse = (
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });

type FetchArgs = [string | URL | Request, RequestInit?];

const makeTransport = (fetcher: FetchLike): DisseqtHttpTransport =>
  new DisseqtHttpTransport({ apiKey: 'api-key', projectId: 'project-id', fetch: fetcher });

const sentHeaders = (fetcher: { mock: { calls: FetchArgs[] } }): Record<string, string> =>
  (fetcher.mock.calls[0]?.[1]?.headers ?? {}) as Record<string, string>;

let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  _resetVersionNoticeState();
  warnSpy = vi.spyOn(globalThis.console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  warnSpy.mockRestore();
  vi.unstubAllEnvs();
  _resetVersionNoticeState();
});

describe('identity headers', () => {
  it('every request carries X-SDK-Version, X-SDK-Lang, and User-Agent', async () => {
    const fetcher = vi.fn(async (...args: FetchArgs) => {
      void args;
      return jsonResponse(OK_BODY);
    });
    await makeTransport(fetcher).requestJson({ method: 'POST', url: 'https://api.test/x' });

    const headers = sentHeaders(fetcher);
    expect(headers['X-SDK-Version']).toBe(SDK_VERSION);
    expect(headers['X-SDK-Lang']).toBe('node');
    expect(headers['User-Agent']).toBe(`disseqt-node-sdk/${SDK_VERSION}`);
  });
});

describe('warn-once upgrade notice', () => {
  it('warns once when the server advertises a newer version', async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse(OK_BODY, 200, { 'X-SDK-Latest-Version': '9.9.9' }),
    );
    const transport = makeTransport(fetcher);

    await transport.requestJson({ method: 'POST', url: 'https://api.test/x' });
    await transport.requestJson({ method: 'POST', url: 'https://api.test/x' });

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const message = String(warnSpy.mock.calls[0]?.[0]);
    expect(message).toContain(`@disseqt-ai/sdk ${SDK_VERSION} is outdated`);
    expect(message).toContain('9.9.9 is available');
    expect(message).toContain('npm install @disseqt-ai/sdk@latest');
  });

  it('a newly advertised version warns again', async () => {
    let latest = '9.9.9';
    const fetcher = vi.fn(async () =>
      jsonResponse(OK_BODY, 200, { 'X-SDK-Latest-Version': latest }),
    );
    const transport = makeTransport(fetcher);

    await transport.requestJson({ method: 'POST', url: 'https://api.test/x' });
    latest = '10.0.0';
    await transport.requestJson({ method: 'POST', url: 'https://api.test/x' });

    expect(warnSpy).toHaveBeenCalledTimes(2);
    expect(String(warnSpy.mock.calls[1]?.[0])).toContain('10.0.0 is available');
  });

  it('appends X-SDK-Notice verbatim', async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse(OK_BODY, 200, {
        'X-SDK-Latest-Version': '9.9.9',
        'X-SDK-Notice': '0.1.x is unsupported and will be blocked after 2026-09-01',
      }),
    );
    await makeTransport(fetcher).requestJson({ method: 'POST', url: 'https://api.test/x' });

    expect(String(warnSpy.mock.calls[0]?.[0])).toMatch(/blocked after 2026-09-01$/);
  });

  it('is silent without version headers', async () => {
    const fetcher = vi.fn(async () => jsonResponse(OK_BODY));
    await makeTransport(fetcher).requestJson({ method: 'POST', url: 'https://api.test/x' });

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('the opt-out env var suppresses the warning but keeps the headers', async () => {
    vi.stubEnv('DISSEQT_SDK_DISABLE_VERSION_NOTICE', '1');
    _resetVersionNoticeState(); // the env var is otherwise read once at module load

    const fetcher = vi.fn(async (...args: FetchArgs) => {
      void args;
      return jsonResponse(OK_BODY, 200, { 'X-SDK-Latest-Version': '9.9.9' });
    });
    await makeTransport(fetcher).requestJson({ method: 'POST', url: 'https://api.test/x' });

    expect(warnSpy).not.toHaveBeenCalled();
    expect(sentHeaders(fetcher)['X-SDK-Version']).toBe(SDK_VERSION); // telemetry keeps working
  });

  it('a failing warn channel never breaks the call', async () => {
    warnSpy.mockImplementation(() => {
      throw new Error('logging blew up');
    });
    const fetcher = vi.fn(async () =>
      jsonResponse(OK_BODY, 200, { 'X-SDK-Latest-Version': '9.9.9' }),
    );

    const result = await makeTransport(fetcher).requestJson({
      method: 'POST',
      url: 'https://api.test/x',
    });

    expect(result).toEqual(OK_BODY);
  });
});

describe('SDKVersionBlockedError on HTTP 426', () => {
  it('raises the typed error with parsed context', async () => {
    const fetcher = vi.fn(async () => jsonResponse(BLOCK_ENVELOPE, 426, BLOCK_HEADERS));

    const promise = makeTransport(fetcher).requestJson({
      method: 'POST',
      url: 'https://api.test/x',
    });

    await expect(promise).rejects.toThrowError(SDKVersionBlockedError);
    const error = await promise.catch((e: unknown) => e as SDKVersionBlockedError);
    expect(error).toBeInstanceOf(DisseqtHttpError); // existing handlers keep catching it
    expect(error.statusCode).toBe(426);
    expect(error.latest).toBe('9.9.9');
    expect(error.notice).toBe(BLOCK_HEADERS['X-SDK-Notice']);
    expect(error.sunset).toBe(BLOCK_HEADERS.Sunset);
    // The message is the server's self-explanatory refusal, not "API request failed".
    expect(error.message).toContain('no longer supported');
    expect(error.message).toContain('npm install @disseqt-ai/sdk@latest');
  });

  it('still fires the warn-once notice on the blocked call', async () => {
    const fetcher = vi.fn(async () => jsonResponse(BLOCK_ENVELOPE, 426, BLOCK_HEADERS));

    await expect(
      makeTransport(fetcher).requestJson({ method: 'POST', url: 'https://api.test/x' }),
    ).rejects.toThrowError(SDKVersionBlockedError);

    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('falls back to a generic message when the body is unreadable', async () => {
    const fetcher = vi.fn(
      async () => new Response('<html>bad gateway page</html>', { status: 426 }),
    );

    const error = await makeTransport(fetcher)
      .requestJson({ method: 'POST', url: 'https://api.test/x' })
      .catch((e: unknown) => e as SDKVersionBlockedError);

    expect(error).toBeInstanceOf(SDKVersionBlockedError);
    expect(error.message).toContain('npm install @disseqt-ai/sdk@latest');
    expect(error.latest).toBeUndefined();
  });

  it('other HTTP errors stay plain DisseqtHttpError', async () => {
    const fetcher = vi.fn(async () => new Response('Bad Request', { status: 400 }));

    const error = await makeTransport(fetcher)
      .requestJson({ method: 'POST', url: 'https://api.test/x' })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DisseqtHttpError);
    expect(error).not.toBeInstanceOf(SDKVersionBlockedError);
  });
});
