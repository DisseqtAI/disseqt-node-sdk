import { clearTimeout, setTimeout } from 'node:timers';

import { DisseqtApiError, DisseqtHttpError, DisseqtJsonError } from './errors.js';
import { checkVersionNotice, sdkIdentityHeaders, versionBlockedError } from './versionNotice.js';
import type {
  DisseqtAuthConfig,
  DisseqtRequestOptions,
  FetchLike,
  JsonObject,
  RawResponse,
} from './types.js';

export const DEFAULT_TIMEOUT_MS = 30_000;
export const ERROR_BODY_PREVIEW_LENGTH = 512;

export interface DisseqtHttpTransportConfig extends DisseqtAuthConfig {
  timeoutMs?: number;
  fetch?: FetchLike;
}

export class DisseqtHttpTransport {
  readonly apiKey: string;
  readonly projectId: string;
  readonly timeoutMs: number;

  private readonly fetcher: FetchLike;

  constructor(config: DisseqtHttpTransportConfig) {
    assertNonEmpty('apiKey', config.apiKey);
    assertNonEmpty('projectId', config.projectId);

    this.apiKey = config.apiKey;
    this.projectId = config.projectId;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetcher = config.fetch ?? globalThis.fetch.bind(globalThis);
  }

  buildHeaders(options: { includeContentType?: boolean } = {}): Record<string, string> {
    const includeContentType = options.includeContentType ?? true;
    const headers: Record<string, string> = {
      'X-API-Key': this.apiKey,
      'X-Project-Id': this.projectId,
      ...sdkIdentityHeaders(),
    };

    if (includeContentType) {
      headers['Content-Type'] = 'application/json';
    }

    return headers;
  }

  /**
   * Strict JSON path: the backend's `{status:"success",data}` envelope is
   * unwrapped to `data`, which must be an object. A `{status:"error"}`
   * envelope throws {@link DisseqtApiError}. Bare (non-envelope) objects
   * pass through unchanged.
   */
  async requestJson<TResponse extends JsonObject = JsonObject>(
    options: DisseqtRequestOptions,
  ): Promise<TResponse> {
    const response = await this.requestRaw(options);

    if (response.status === 204) {
      return { status: 'deleted' } as unknown as TResponse;
    }

    if (response.text.length === 0) {
      throw new DisseqtJsonError('Server returned null/empty JSON response', response.text);
    }

    const data = unwrapEnvelope(parseJson(response.text), response.text);
    if (data === null) {
      throw new DisseqtJsonError('Server returned null/empty JSON response', response.text);
    }
    if (!isJsonObject(data)) {
      throw new DisseqtJsonError('Server returned non-object JSON response', response.text);
    }
    return data as TResponse;
  }

  /**
   * Parse arbitrary JSON (objects, arrays, primitives) with the same
   * envelope unwrapping as `requestJson`. Used by resource clients that hit
   * endpoints whose `data` is an array, e.g. `/mr-jailbreak/agents`.
   */
  async requestJsonAny(options: DisseqtRequestOptions): Promise<unknown> {
    const response = await this.requestRaw(options);
    if (response.status === 204) return null;
    if (response.text.length === 0) return null;
    return unwrapEnvelope(parseJson(response.text), response.text);
  }

  async requestRaw(options: DisseqtRequestOptions): Promise<RawResponse> {
    const url = buildUrl(options.url, options.params);
    // Raw body (FormData/Blob) skips application/json — fetch supplies the
    // right Content-Type + boundary itself.
    const defaultIncludeCT = options.body === undefined && options.json !== undefined;
    const includeContentType = options.includeContentType ?? defaultIncludeCT;
    const headers = {
      ...this.buildHeaders({ includeContentType }),
      ...options.headers,
    };
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), this.timeoutMs);
    const signal = composeSignals(abortController.signal, options.signal);

    try {
      const requestInit: RequestInit = {
        method: options.method,
        headers,
        signal,
      };

      if (options.body !== undefined) {
        requestInit.body = options.body;
      } else if (options.json !== undefined) {
        requestInit.body = JSON.stringify(options.json);
      }

      const response = await this.fetcher(url, requestInit);
      const text = await response.text();

      // Before the ok-check so error responses (426 included) still surface
      // the warn-once upgrade notice the server stamped on the headers.
      checkVersionNotice(response.headers);

      if (!response.ok) {
        const blocked = versionBlockedError(response.status, response.headers, text, {
          method: options.method,
          url,
        });
        if (blocked !== undefined) {
          throw blocked;
        }
        throw new DisseqtHttpError(
          response.status,
          options.errorMessage ?? 'API request failed',
          text.slice(0, ERROR_BODY_PREVIEW_LENGTH),
          { method: options.method, url },
        );
      }

      return {
        status: response.status,
        headers: response.headers,
        text,
      };
    } catch (error) {
      if (error instanceof DisseqtHttpError) {
        throw error;
      }

      const message = error instanceof Error ? error.message : String(error);
      throw new DisseqtHttpError(0, `Network error: ${message}`, '', {
        method: options.method,
        url,
        cause: error,
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function buildUrl(url: string, params?: DisseqtRequestOptions['params']): string {
  if (params === undefined) {
    return url;
  }

  const parsed = new URL(url);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      parsed.searchParams.set(key, String(value));
    }
  }
  return parsed.toString();
}

function assertNonEmpty(name: string, value: string): void {
  if (value.trim().length === 0) {
    throw new ValueError(`${name} is required and cannot be empty`);
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new DisseqtJsonError(
      `Failed to decode JSON response: ${message}. Response text: ${text.slice(0, 200)}`,
      text,
      { cause: error },
    );
  }
}

/** `{status:"success",data}` → data; `{status:"error",...}` → throw; anything else → as-is. */
function unwrapEnvelope(parsed: unknown, text: string): unknown {
  if (!isJsonObject(parsed)) return parsed;
  if (parsed['status'] === 'error') {
    const err = isJsonObject(parsed['error']) ? parsed['error'] : {};
    const external = typeof err['external'] === 'string' ? err['external'] : 'API request failed';
    const code = typeof parsed['code'] === 'string' ? parsed['code'] : String(err['code'] ?? '');
    const requestId = typeof parsed['request_id'] === 'string' ? parsed['request_id'] : undefined;
    throw new DisseqtApiError(external, code, text.slice(0, ERROR_BODY_PREVIEW_LENGTH), requestId);
  }
  if (parsed['status'] === 'success' && 'data' in parsed) return parsed['data'];
  return parsed;
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function composeSignals(timeoutSignal: AbortSignal, externalSignal?: AbortSignal): AbortSignal {
  if (externalSignal === undefined) {
    return timeoutSignal;
  }

  const controller = new AbortController();
  const abort = (): void => controller.abort();

  if (timeoutSignal.aborted || externalSignal.aborted) {
    controller.abort();
    return controller.signal;
  }

  timeoutSignal.addEventListener('abort', abort, { once: true });
  externalSignal.addEventListener('abort', abort, { once: true });

  return controller.signal;
}

class ValueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValueError';
  }
}
