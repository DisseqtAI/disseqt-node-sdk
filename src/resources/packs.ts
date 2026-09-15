import type { JsonObject, JsonValue, QueryParams } from '../http/types.js';
import { ResourceBase } from './base.js';

const ROOT = '/api/v1/prompt-packs';

/** Prompt-pack CRUD + related actions (publish, duplicate, download, etc). */
export class PacksClient extends ResourceBase {
  list(params?: QueryParams): Promise<JsonObject> {
    return this._request('GET', ROOT, params ? { params } : {});
  }

  get(id: string): Promise<JsonObject> {
    return this._request('GET', `${ROOT}/${id}`);
  }

  create(payload: JsonValue): Promise<JsonObject> {
    return this._request('POST', ROOT, { json: payload });
  }

  update(id: string, payload: JsonValue): Promise<JsonObject> {
    return this._request('PATCH', `${ROOT}/${id}`, { json: payload });
  }

  delete(id: string): Promise<JsonObject> {
    return this._request('DELETE', `${ROOT}/${id}`);
  }

  duplicate(id: string, payload?: JsonValue): Promise<JsonObject> {
    return this._request(
      'POST',
      `${ROOT}/${id}/duplicate`,
      payload !== undefined ? { json: payload } : {},
    );
  }

  publish(id: string): Promise<JsonObject> {
    return this._request('POST', `${ROOT}/${id}/publish`);
  }

  unpublish(id: string): Promise<JsonObject> {
    return this._request('POST', `${ROOT}/${id}/unpublish`);
  }

  restore(id: string): Promise<JsonObject> {
    return this._request('POST', `${ROOT}/${id}/restore`);
  }

  importStatus(id: string): Promise<JsonObject> {
    return this._request('GET', `${ROOT}/${id}/import-status`);
  }

  download(id: string): Promise<{ status: number; headers: Headers; text: string }> {
    return this._requestRaw('GET', `${ROOT}/${id}/download`);
  }

  listPrompts(id: string, params?: QueryParams): Promise<JsonObject> {
    return this._request('GET', `${ROOT}/${id}/prompts`, params ? { params } : {});
  }

  listReviews(id: string, params?: QueryParams): Promise<JsonObject> {
    return this._request('GET', `${ROOT}/${id}/reviews`, params ? { params } : {});
  }

  submitReview(id: string, payload: JsonValue): Promise<JsonObject> {
    return this._request('POST', `${ROOT}/${id}/reviews`, { json: payload });
  }

  rate(id: string, payload: JsonValue): Promise<JsonObject> {
    return this._request('POST', `${ROOT}/${id}/ratings`, { json: payload });
  }
}
