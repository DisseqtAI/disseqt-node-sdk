import {
  DisseqtHttpTransport,
  type DisseqtHttpTransportConfig,
  stripTrailingSlashes,
} from '../http/index.js';
import type {
  DisseqtRequestOptions,
  HttpMethod,
  JsonObject,
  JsonValue,
  QueryParams,
} from '../http/types.js';

export const RESOURCES_DEFAULT_BASE_URL = 'https://api.disseqt.ai';

export interface ResourceClientConfig extends DisseqtHttpTransportConfig {
  baseUrl?: string;
  timeout?: number;
}

/**
 * Thin per-resource client — direct-to-backend calls under raw /api/v1/...
 * Kept separate from `DisseqtAPIClient` (which lives on the SDK-only
 * /sdk/prompt-packs prefix). One transport, one baseUrl, no path prefix.
 */
export class ResourceBase {
  readonly baseUrl: string;
  protected readonly transport: DisseqtHttpTransport;

  constructor(config: ResourceClientConfig | { transport: DisseqtHttpTransport; baseUrl: string }) {
    if ('transport' in config) {
      this.transport = config.transport;
      this.baseUrl = stripTrailingSlashes(config.baseUrl);
      return;
    }
    this.baseUrl = stripTrailingSlashes(config.baseUrl ?? RESOURCES_DEFAULT_BASE_URL);
    const timeoutMs =
      config.timeoutMs ?? (config.timeout === undefined ? 30_000 : config.timeout * 1000);
    const transportConfig: DisseqtHttpTransportConfig = {
      apiKey: config.apiKey,
      projectId: config.projectId,
      timeoutMs,
    };
    if (config.fetch !== undefined) {
      transportConfig.fetch = config.fetch;
    }
    this.transport = new DisseqtHttpTransport(transportConfig);
  }

  protected _url(path: string): string {
    return `${this.baseUrl}${path}`;
  }

  protected async _request<T extends JsonObject = JsonObject>(
    method: HttpMethod,
    path: string,
    options: { json?: JsonValue; params?: QueryParams } = {},
  ): Promise<T> {
    const req: DisseqtRequestOptions = { method, url: this._url(path) };
    if (options.json !== undefined) req.json = options.json;
    if (options.params !== undefined) req.params = options.params;
    return this.transport.requestJson<T>(req);
  }

  protected async _requestRaw(
    method: HttpMethod,
    path: string,
    options: { params?: QueryParams } = {},
  ): Promise<{ status: number; headers: Headers; text: string }> {
    const req: DisseqtRequestOptions = {
      method,
      url: this._url(path),
      includeContentType: false,
    };
    if (options.params !== undefined) req.params = options.params;
    return this.transport.requestRaw(req);
  }

  /**
   * Request an endpoint that may return any JSON shape (array, object,
   * primitive). Used by resources whose backend returns list literals
   * (e.g. Python-parity `/attack-techniques`). Callers narrow the type.
   */
  protected async _requestAny(
    method: HttpMethod,
    path: string,
    options: { json?: JsonValue; params?: QueryParams } = {},
  ): Promise<unknown> {
    const req: DisseqtRequestOptions = { method, url: this._url(path) };
    if (options.json !== undefined) req.json = options.json;
    if (options.params !== undefined) req.params = options.params;
    return this.transport.requestJsonAny(req);
  }
}
