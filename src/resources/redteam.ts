import type { DisseqtRequestOptions, JsonObject, JsonValue, QueryParams } from '../http/types.js';
import { ResourceBase } from './base.js';

// Mirrors the Python SDK's `disseqt redteam` surface (src/disseqt_sdk/cli/redteam.py).
// Endpoints span two backends fronted by the same host:
//   /api/v1/testing/*         — single-turn sessions/runs/validation
//   /api/v1/mr-jailbreak/*    — multi-turn (batch-automate + agents)
//   /api/v1/jailbreak/*       — analytics + CSV eval + single-turn scorer
//   /api/v1/testing/bot/*     — bot helpers (recommend/parse-curl/test-connection)
// Every method here maps 1:1 to a Python `_http.request` call — no invention.

const TESTING = '/api/v1/testing';
const MR = '/api/v1/mr-jailbreak';
const JB = '/api/v1/jailbreak';
const BOT = '/api/v1/testing/bot';

/** One row from `/api/v1/testing/attack-techniques` or `/api/v1/mr-jailbreak/techniques`. */
export interface RedteamTechnique {
  id?: string;
  name?: string;
  kind?: 'single-turn' | 'multi-turn' | string;
  [k: string]: unknown;
}

/** One row from `/api/v1/mr-jailbreak/agents`. */
export interface RedteamPersona {
  id?: string;
  name?: string;
  attack_type?: string;
  [k: string]: unknown;
}

/** Combined payload from `list-attacks --kind all`. */
export interface RedteamAttackCatalog {
  single_turn?: JsonValue;
  multi_turn?: JsonValue;
  agents?: JsonValue;
}

/** Testing session row (single-turn). */
export interface RedteamSession {
  id?: string;
  session_id?: string;
  target?: JsonValue;
  status?: string;
  [k: string]: unknown;
}

/** Testing run row (single-turn). */
export interface RedteamRun {
  id?: string;
  run_id?: string;
  session_id?: string;
  status?: string;
  state?: string;
  technique?: string;
  [k: string]: unknown;
}

/** Response from `/api/v1/testing/validate`. */
export interface RedteamValidateResponse {
  input?: string;
  output?: string;
  results?: JsonValue;
  overall_verdict?: string;
  [k: string]: unknown;
}

/** Analytics summary payload. */
export interface RedteamAnalytics {
  summary?: JsonValue;
  prompts_stats?: JsonValue;
  [k: string]: unknown;
}

/** POST body for `validate`. */
export interface RedteamValidateRequest {
  input: string;
  output: string;
  validators: string[];
  input_context: string;
  threshold?: number;
}

/** Kinds accepted by `list-attacks --kind`. */
export type AttackKind = 'single' | 'multi' | 'agents' | 'all';

/** Kinds accepted by `recommend {kind}`. */
export type RecommendKind = 'packs' | 'attacks' | 'validators';

/** Formats accepted by `report --format`. */
export type ReportFormat = 'json' | 'csv' | 'markdown';

export class RedteamClient extends ResourceBase {
  // ---------------------------------------------------------------------
  // Catalog
  // ---------------------------------------------------------------------

  /** GET /api/v1/testing/attack-techniques — array response. */
  listSingleTurnTechniques(): Promise<unknown> {
    return this._requestAny('GET', `${TESTING}/attack-techniques`);
  }

  /** GET /api/v1/mr-jailbreak/techniques — array response. */
  listMultiTurnTechniques(): Promise<unknown> {
    return this._requestAny('GET', `${MR}/techniques`);
  }

  /** GET /api/v1/mr-jailbreak/agents — array response. */
  listAgents(): Promise<unknown> {
    return this._requestAny('GET', `${MR}/agents`);
  }

  /**
   * `list-attacks --kind {single,multi,agents,all}` — server returns each
   * catalog independently; combined here to match Python's JSON shape.
   * Keys are emitted alphabetically so the byte output matches Python's
   * `json.dumps(..., sort_keys=True)` for parity diffs.
   */
  async listAttacks(kind: AttackKind = 'all'): Promise<RedteamAttackCatalog> {
    const agents =
      kind === 'agents' || kind === 'all' ? ((await this.listAgents()) as JsonValue) : undefined;
    const multi =
      kind === 'multi' || kind === 'all'
        ? ((await this.listMultiTurnTechniques()) as JsonValue)
        : undefined;
    const single =
      kind === 'single' || kind === 'all'
        ? ((await this.listSingleTurnTechniques()) as JsonValue)
        : undefined;
    const out: RedteamAttackCatalog = {};
    if (agents !== undefined) out.agents = agents;
    if (multi !== undefined) out.multi_turn = multi;
    if (single !== undefined) out.single_turn = single;
    return out;
  }

  // ---------------------------------------------------------------------
  // Sessions + runs (single-turn attack path)
  // ---------------------------------------------------------------------

  /** POST /api/v1/testing/sessions */
  createSession(payload: JsonValue): Promise<JsonObject> {
    return this._request('POST', `${TESTING}/sessions`, { json: payload });
  }

  /** GET /api/v1/testing/sessions — array response. */
  listSessions(params?: QueryParams): Promise<unknown> {
    return this._requestAny('GET', `${TESTING}/sessions`, params ? { params } : {});
  }

  /** GET /api/v1/testing/sessions/{id} */
  getSession(id: string): Promise<JsonObject> {
    return this._request('GET', `${TESTING}/sessions/${id}`);
  }

  /** POST /api/v1/testing/sessions/{id}/runs */
  createRun(sessionId: string, payload: JsonValue): Promise<JsonObject> {
    return this._request('POST', `${TESTING}/sessions/${sessionId}/runs`, { json: payload });
  }

  /** GET /api/v1/testing/runs/{id} */
  getRun(runId: string): Promise<JsonObject> {
    return this._request('GET', `${TESTING}/runs/${runId}`);
  }

  /** GET /api/v1/testing/runs/{id}/results — may be array or object. */
  getRunResults(runId: string): Promise<unknown> {
    return this._requestAny('GET', `${TESTING}/runs/${runId}/results`);
  }

  /** POST /api/v1/testing/runs/{id}/cancel */
  cancelRun(runId: string): Promise<JsonObject> {
    return this._request('POST', `${TESTING}/runs/${runId}/cancel`);
  }

  // ---------------------------------------------------------------------
  // Multi-turn (mr-jailbreak)
  // ---------------------------------------------------------------------

  /** POST /api/v1/mr-jailbreak/batch-automate — one-shot multi-turn attack. */
  batchAutomate(payload: JsonValue): Promise<JsonObject> {
    return this._request('POST', `${MR}/batch-automate`, { json: payload });
  }

  /** GET /api/v1/mr-jailbreak/jobs/{id} — status fallback for multi-turn. */
  getMrJob(jobId: string): Promise<JsonObject> {
    return this._request('GET', `${MR}/jobs/${jobId}`);
  }

  /** GET /api/v1/mr-jailbreak/jobs/{id}/interactions — results fallback for multi-turn. */
  getMrJobInteractions(jobId: string): Promise<unknown> {
    return this._requestAny('GET', `${MR}/jobs/${jobId}/interactions`);
  }

  // ---------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------

  /** POST /api/v1/testing/validate — one-shot single-turn validator run. */
  validate(payload: RedteamValidateRequest): Promise<JsonObject> {
    return this._request('POST', `${TESTING}/validate`, { json: payload as unknown as JsonValue });
  }

  // ---------------------------------------------------------------------
  // Reports
  // ---------------------------------------------------------------------

  /** GET /api/v1/testing/sessions/{id}/report/csv — raw CSV text passthrough. */
  sessionReportCsv(sessionId: string): Promise<{ status: number; headers: Headers; text: string }> {
    return this._requestRaw('GET', `${TESTING}/sessions/${sessionId}/report/csv`);
  }

  // ---------------------------------------------------------------------
  // Analytics
  // ---------------------------------------------------------------------

  /** GET /api/v1/jailbreak/analytics/summary */
  analyticsSummary(): Promise<JsonObject> {
    return this._request('GET', `${JB}/analytics/summary`);
  }

  /**
   * GET /api/v1/jailbreak/prompts-stats.
   *
   * Backend registers /prompts-stats at jailbreak_routes.go:57. The
   * /analytics/ prefix applies only to /analytics/summary
   * (jailbreak_routes.go:64) — /analytics/prompts-stats is a 404.
   */
  analyticsPromptsStats(): Promise<JsonObject> {
    return this._request('GET', `${JB}/prompts-stats`);
  }

  // ---------------------------------------------------------------------
  // Bot helpers
  // ---------------------------------------------------------------------

  /** POST /api/v1/testing/bot/recommend-{kind} */
  recommend(kind: RecommendKind, payload: JsonValue): Promise<JsonObject> {
    return this._request('POST', `${BOT}/recommend-${kind}`, { json: payload });
  }

  /** POST /api/v1/testing/bot/parse-curl */
  parseCurl(curl: string): Promise<JsonObject> {
    return this._request('POST', `${BOT}/parse-curl`, { json: { curl } });
  }

  /** POST /api/v1/testing/bot/test-connection */
  testConnection(payload: JsonValue): Promise<JsonObject> {
    return this._request('POST', `${BOT}/test-connection`, { json: payload });
  }

  // ---------------------------------------------------------------------
  // Bulk / single-turn eval
  // ---------------------------------------------------------------------

  /**
   * POST /api/v1/jailbreak/evaluate-csv — multipart CSV upload.
   * `filename` propagates to the multipart part; server uses it for the
   * job name. `content` is the CSV text.
   */
  evaluateCsv(filename: string, content: string): Promise<JsonObject> {
    const form = new FormData();
    // Blob binds Content-Type at the part level; server-side FastAPI reads
    // both the filename and mimetype.
    const blob = new Blob([content], { type: 'text/csv' });
    form.append('file', blob, filename);
    const req: DisseqtRequestOptions = {
      method: 'POST',
      url: `${this.baseUrl}${JB}/evaluate-csv`,
      body: form,
      includeContentType: false,
    };
    return this.transport.requestJson(req);
  }

  /**
   * GET /api/v1/jailbreak/evaluate-csv/{jobId} — poll status for evaluate-csv.
   *
   * Backend jailbreak_routes.go:55 registers the status GET on
   * /evaluate-csv/:generation_job_id. The prior /jobs/:id/process was a
   * method-and-path mismatch — /jobs/:id/process is a POST trigger
   * (jailbreak_routes.go:45), not a GET status probe.
   */
  evaluateCsvJob(jobId: string): Promise<JsonObject> {
    return this._request('GET', `${JB}/evaluate-csv/${jobId}`);
  }

  /** POST /api/v1/jailbreak/single-turn-evaluate — one-prompt scorer. */
  singleTurnEvaluate(payload: {
    input: string;
    technique?: string;
    vulnerability?: string;
  }): Promise<JsonObject> {
    const body: JsonObject = { input: payload.input };
    if (payload.technique !== undefined) body['technique'] = payload.technique;
    if (payload.vulnerability !== undefined) body['vulnerability'] = payload.vulnerability;
    return this._request('POST', `${JB}/single-turn-evaluate`, { json: body });
  }
}
