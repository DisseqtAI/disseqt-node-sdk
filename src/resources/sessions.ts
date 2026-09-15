import type { JsonObject, JsonValue, QueryParams } from '../http/types.js';
import { ResourceBase } from './base.js';

const S = '/api/v1/testing/sessions';
const R = '/api/v1/testing/runs';

/** Testing sessions + underlying testing-runs. */
export class SessionsClient extends ResourceBase {
  create(payload: JsonValue): Promise<JsonObject> {
    return this._request('POST', S, { json: payload });
  }

  list(params?: QueryParams): Promise<JsonObject> {
    return this._request('GET', S, params ? { params } : {});
  }

  get(id: string): Promise<JsonObject> {
    return this._request('GET', `${S}/${id}`);
  }

  delete(id: string): Promise<JsonObject> {
    return this._request('DELETE', `${S}/${id}`);
  }

  listRuns(id: string, params?: QueryParams): Promise<JsonObject> {
    return this._request('GET', `${S}/${id}/runs`, params ? { params } : {});
  }

  reportCsv(id: string): Promise<{ status: number; headers: Headers; text: string }> {
    return this._requestRaw('GET', `${S}/${id}/report/csv`);
  }

  getRun(runId: string): Promise<JsonObject> {
    return this._request('GET', `${R}/${runId}`);
  }

  runResults(runId: string, params?: QueryParams): Promise<JsonObject> {
    return this._request('GET', `${R}/${runId}/results`, params ? { params } : {});
  }

  runBreaches(runId: string, params?: QueryParams): Promise<JsonObject> {
    return this._request('GET', `${R}/${runId}/results/breaches`, params ? { params } : {});
  }

  cancelRun(runId: string): Promise<JsonObject> {
    return this._request('POST', `${R}/${runId}/cancel`);
  }
}
