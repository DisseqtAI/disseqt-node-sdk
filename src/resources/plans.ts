import type { JsonObject, JsonValue, QueryParams } from '../http/types.js';
import { ResourceBase } from './base.js';

const ROOT = '/api/v1/test-plans';

/**
 * Test Plans (T3). Versioned, shareable red-team plan templates.
 * Endpoint list mirrors dataset-backend `api/test_plans_routes.go` on stage.
 * Gated server-side by `ff_test-plans_enabled_global`.
 */
export class PlansClient extends ResourceBase {
  create(payload: JsonValue): Promise<JsonObject> {
    return this._request('POST', ROOT, { json: payload });
  }

  list(params?: QueryParams): Promise<JsonObject> {
    return this._request('GET', ROOT, params ? { params } : {});
  }

  gallery(params?: QueryParams): Promise<JsonObject> {
    return this._request('GET', `${ROOT}/gallery`, params ? { params } : {});
  }

  listDeleted(): Promise<JsonObject> {
    return this._request('GET', `${ROOT}/deleted`);
  }

  options(ref: string): Promise<JsonObject> {
    return this._request('GET', `${ROOT}/options/${ref}`);
  }

  get(id: string): Promise<JsonObject> {
    return this._request('GET', `${ROOT}/${id}`);
  }

  summary(id: string): Promise<JsonObject> {
    return this._request('GET', `${ROOT}/${id}/summary`);
  }

  update(id: string, payload: JsonValue): Promise<JsonObject> {
    return this._request('PATCH', `${ROOT}/${id}`, { json: payload });
  }

  delete(id: string): Promise<JsonObject> {
    return this._request('DELETE', `${ROOT}/${id}`);
  }

  restore(id: string): Promise<JsonObject> {
    return this._request('POST', `${ROOT}/${id}/restore`);
  }

  copy(id: string, payload?: JsonValue): Promise<JsonObject> {
    return this._request(
      'POST',
      `${ROOT}/${id}/copy`,
      payload !== undefined ? { json: payload } : {},
    );
  }

  listVersions(id: string): Promise<JsonObject> {
    return this._request('GET', `${ROOT}/${id}/versions`);
  }

  createVersion(id: string, payload: JsonValue): Promise<JsonObject> {
    return this._request('POST', `${ROOT}/${id}/versions`, { json: payload });
  }

  publish(id: string, payload: JsonValue): Promise<JsonObject> {
    return this._request('POST', `${ROOT}/${id}/publish`, { json: payload });
  }

  /** POST /api/v1/test-plans/generate-inputs — TP-2244 description-based generation. */
  generateInputs(payload: JsonValue): Promise<JsonObject> {
    return this._request('POST', `${ROOT}/generate-inputs`, { json: payload });
  }

  getGenerateInputsJob(jobId: string): Promise<JsonObject> {
    return this._request('GET', `${ROOT}/generate-inputs/${jobId}`);
  }
}
