import { clearTimeout, setTimeout } from 'node:timers';

import { DisseqtHttpError, DisseqtJsonError } from './errors.js';
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
    };

    if (includeContentType) {
      headers['Content-Type'] = 'application/json';
    }

    return headers;
  }

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

    try {
      const parsed: unknown = JSON.parse(response.text);
      if (parsed === null) {
        throw new DisseqtJsonError('Server returned null/empty JSON response', response.text);
      }
      if (!isJsonObject(parsed)) {
        throw new DisseqtJsonError('Server returned non-object JSON response', response.text);
      }
      return parsed as TResponse;
    } catch (error) {
      if (error instanceof DisseqtJsonError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new DisseqtJsonError(
        `Failed to decode JSON response: ${message}. Response text: ${response.text.slice(0, 200)}`,
        response.text,
        { cause: error },
      );
    }
  }

  async requestRaw(options: DisseqtRequestOptions): Promise<RawResponse> {
    const url = buildUrl(options.url, options.params);
    const includeContentType = options.includeContentType ?? options.json !== undefined;
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

      if (options.json !== undefined) {
        requestInit.body = JSON.stringify(options.json);
      }

      const response = await this.fetcher(url, requestInit);
      const text = await response.text();

      if (!response.ok) {
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
