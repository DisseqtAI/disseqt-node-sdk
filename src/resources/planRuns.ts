import type { JsonObject, JsonValue, QueryParams } from '../http/types.js';
import { ResourceBase } from './base.js';

const RUNS = '/api/v1/test-plan-runs';
const PLANS = '/api/v1/test-plans';

/**
 * Test Plan Runs (T6). Creation is addressed by PLAN id
 * (`POST /test-plans/:id/runs`); everything else lives under
 * `/test-plan-runs/:id`. Mirrors dataset-backend
 * `api/test_plan_runs_routes.go` on stage.
 */
export class PlanRunsClient extends ResourceBase {
  create(planId: string, payload: JsonValue): Promise<JsonObject> {
    return this._request('POST', `${PLANS}/${planId}/runs`, { json: payload });
  }

  listForPlan(planId: string, params?: QueryParams): Promise<JsonObject> {
    return this._request('GET', `${PLANS}/${planId}/runs`, params ? { params } : {});
  }

  listDeleted(): Promise<JsonObject> {
    return this._request('GET', `${RUNS}/deleted`);
  }

  get(runId: string): Promise<JsonObject> {
    return this._request('GET', `${RUNS}/${runId}`);
  }

  getStage(runId: string, stageKey: string): Promise<JsonObject> {
    return this._request('GET', `${RUNS}/${runId}/stages/${stageKey}`);
  }

  trace(runId: string, promptRef: string): Promise<JsonObject> {
    return this._request('GET', `${RUNS}/${runId}/trace`, {
      params: { prompt_ref: promptRef },
    });
  }

  report(runId: string, params?: QueryParams): Promise<JsonObject> {
    return this._request('GET', `${RUNS}/${runId}/report`, params ? { params } : {});
  }

  prompts(runId: string, params?: QueryParams): Promise<JsonObject> {
    return this._request('GET', `${RUNS}/${runId}/prompts`, params ? { params } : {});
  }

  cancel(runId: string): Promise<JsonObject> {
    return this._request('POST', `${RUNS}/${runId}/cancel`);
  }

  delete(runId: string): Promise<JsonObject> {
    return this._request('DELETE', `${RUNS}/${runId}`);
  }

  restore(runId: string): Promise<JsonObject> {
    return this._request('POST', `${RUNS}/${runId}/restore`);
  }

  reveal(runId: string, resultId: string): Promise<JsonObject> {
    return this._request('POST', `${RUNS}/${runId}/results/${resultId}/reveal`);
  }
}
