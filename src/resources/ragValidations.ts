import type { JsonObject, JsonValue } from '../http/types.js';
import { ResourceBase } from './base.js';

const PACKS = '/api/v1/prompt-packs';
const RV = '/api/v1/prompt-packs/rag-validations';

/** RAG-validations. */
export class RagValidationsClient extends ResourceBase {
  create(runId: string, payload: JsonValue): Promise<JsonObject> {
    return this._request('POST', `${PACKS}/runs/${runId}/rag-validate`, { json: payload });
  }

  listForRun(runId: string): Promise<JsonObject> {
    return this._request('GET', `${PACKS}/runs/${runId}/rag-validations`);
  }

  get(validationId: string): Promise<JsonObject> {
    return this._request('GET', `${RV}/${validationId}`);
  }

  cancel(validationId: string): Promise<JsonObject> {
    return this._request('POST', `${RV}/${validationId}/cancel`);
  }
}
