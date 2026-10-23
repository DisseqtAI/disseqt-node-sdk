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

/** dataset-backend gateway prefix; every /api/v1/... resource route hangs off it. */
export const RESOURCES_DEFAULT_BASE_URL = 'https://api.disseqt.ai/dataset';

export interface ResourceClientConfig extends DisseqtHttpTransportConfig {
  baseUrl?: string;
  timeout?: number;
}

/** Thin per-resource client: one transport, one baseUrl, raw `/api/v1/...` paths. */
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
    const transportConfig: DisseqtHttpTransportConfig = { apiKey: config.apiKey, timeoutMs };
    if (config.projectId !== undefined) transportConfig.projectId = config.projectId;
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
    const req: DisseqtRequestOptions = { method, url: this._url(path), unwrapEnvelope: true };
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

  /** Any JSON shape (arrays included); callers narrow the type. */
  protected async _requestAny(
    method: HttpMethod,
    path: string,
    options: { json?: JsonValue; params?: QueryParams } = {},
  ): Promise<unknown> {
    const req: DisseqtRequestOptions = { method, url: this._url(path), unwrapEnvelope: true };
    if (options.json !== undefined) req.json = options.json;
    if (options.params !== undefined) req.params = options.params;
    return this.transport.requestJsonAny(req);
  }
}
