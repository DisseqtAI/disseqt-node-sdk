import type { JsonObject, JsonValue, QueryParams } from '../http/types.js';
import { ResourceBase } from './base.js';

const PACKS = '/api/v1/prompt-packs';
const OV = '/api/v1/prompt-packs/output-validations';

/** Output-validations. */
export class ValidationsClient extends ResourceBase {
  create(runId: string, payload: JsonValue): Promise<JsonObject> {
    return this._request('POST', `${PACKS}/runs/${runId}/validate-outputs`, { json: payload });
  }

  listForPack(packId: string, params?: QueryParams): Promise<JsonObject> {
    return this._request('GET', `${PACKS}/${packId}/output-validations`, params ? { params } : {});
  }

  get(validationId: string): Promise<JsonObject> {
    return this._request('GET', `${OV}/${validationId}`);
  }

  summary(validationId: string): Promise<JsonObject> {
    return this._request('GET', `${OV}/${validationId}/summary`);
  }

  rcaStatus(validationId: string): Promise<JsonObject> {
    return this._request('GET', `${OV}/${validationId}/rca-status`);
  }

  compare(packId: string, params?: QueryParams): Promise<JsonObject> {
    return this._request('GET', `${PACKS}/${packId}/validations/compare`, params ? { params } : {});
  }

  delete(validationId: string): Promise<JsonObject> {
    return this._request('DELETE', `${OV}/${validationId}`);
  }

  cancel(validationId: string): Promise<JsonObject> {
    return this._request('POST', `${OV}/${validationId}/cancel`);
  }
}
