import type { JsonObject, JsonValue, QueryParams } from '../http/types.js';
import { ResourceBase } from './base.js';

const PACKS = '/api/v1/sdk/prompt-packs';

/**
 * Prompt-pack runs.
 * Create is pack-scoped (`/sdk/prompt-packs/:id/runs`);
 * everything else keys off `run_id` under `/sdk/prompt-packs/runs/:run_id`.
 */
export class RunsClient extends ResourceBase {
  create(packId: string, payload: JsonValue): Promise<JsonObject> {
    return this._request('POST', `${PACKS}/${packId}/runs`, { json: payload });
  }

  list(packId: string, params?: QueryParams): Promise<JsonObject> {
    return this._request('GET', `${PACKS}/${packId}/runs`, params ? { params } : {});
  }

  get(runId: string, params?: QueryParams): Promise<JsonObject> {
    return this._request('GET', `${PACKS}/runs/${runId}`, params ? { params } : {});
  }

  delete(runId: string): Promise<JsonObject> {
    return this._request('DELETE', `${PACKS}/runs/${runId}`);
  }

  outputs(runId: string, params?: QueryParams): Promise<JsonObject> {
    return this._request('GET', `${PACKS}/runs/${runId}/outputs`, params ? { params } : {});
  }

  compare(packId: string, params?: QueryParams): Promise<JsonObject> {
    return this._request('GET', `${PACKS}/${packId}/runs/compare`, params ? { params } : {});
  }

  cancel(runId: string): Promise<JsonObject> {
    return this._request('POST', `${PACKS}/runs/${runId}/cancel`);
  }

  trace(runId: string): Promise<JsonObject> {
    return this._request('GET', `${PACKS}/runs/${runId}/trace`);
  }

  report(runId: string, params?: QueryParams): Promise<JsonObject> {
    return this._request('GET', `${PACKS}/runs/${runId}/report`, params ? { params } : {});
  }
}
