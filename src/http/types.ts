export interface DisseqtAuthConfig {
  apiKey: string;
  projectId: string;
}

export interface DisseqtClientConfig extends DisseqtAuthConfig {
  baseUrl?: string;
  timeoutMs?: number;
  fetch?: FetchLike;
}

export type JsonPrimitive = string | number | boolean | null;
export type JsonObject = Record<string, unknown>;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type QueryParams = Record<string, string | number | boolean | null | undefined>;

export interface DisseqtRequestOptions {
  method: HttpMethod;
  url: string;
  json?: JsonValue;
  /** Pre-encoded body (FormData / Blob / string). Skips Content-Type header
   *  auto-population — the fetch runtime picks the correct boundary for
   *  FormData, and callers set Content-Type explicitly for anything else. */
  body?: BodyInit;
  params?: QueryParams;
  headers?: Record<string, string>;
  includeContentType?: boolean;
  errorMessage?: string;
  signal?: AbortSignal;
}

export interface RawResponse {
  status: number;
  headers: Headers;
  text: string;
}

export type FetchLike = (
  input: string | URL | globalThis.Request,
  init?: RequestInit,
) => Promise<Response>;
