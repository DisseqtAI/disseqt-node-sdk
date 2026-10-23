import type { JsonObject, JsonValue, QueryParams } from '../http/types.js';
import { ResourceBase } from './base.js';

const ROOT = '/api/v1/llm/custom-validators';

/** Bring-your-own validator (BYOV). */
export class CustomValidatorsClient extends ResourceBase {
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

  test(id: string, payload?: JsonValue): Promise<JsonObject> {
    return this._request(
      'POST',
      `${ROOT}/${id}/test`,
      payload !== undefined ? { json: payload } : {},
    );
  }

  testConnection(payload: JsonValue): Promise<JsonObject> {
    return this._request('POST', `${ROOT}/test-connection`, { json: payload });
  }
}
