import type { JsonObject, JsonValue, QueryParams } from '../http/types.js';
import { ResourceBase } from './base.js';

// Python `disseqt redteam` parity: /testing (single-turn), /mr-jailbreak (multi-turn),
// /jailbreak (analytics), /testing/bot (helpers).

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

/** api/testing_types.go TestingRunResponse; `stopped` is terminal and carries `stop_reason`. */
export interface RedteamRun {
  id?: string;
  run_id?: string;
  session_id?: string;
  status?: string;
  stop_reason?: string;
  state?: string;
  technique?: string;
  [k: string]: unknown;
}

/** api/testing_validate_handler.go TestingValidatorResult. */
export interface RedteamValidatorResult {
  validator_name: string;
  score: number;
  failed: boolean;
  explanation?: string;
  rule_status: 'pass' | 'fail' | 'error' | string;
  error?: string;
}

/** api/testing_validate_handler.go TestingValidateResponse. */
export interface RedteamValidateResponse {
  results: RedteamValidatorResult[];
  aggregate_decision: 'PASS' | 'BORDERLINE' | 'BLOCK' | string;
  processed_at: string;
}

/** api/prompt_packs_types.go PaginationResponse. */
export interface RedteamPagination {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
  has_next: boolean;
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
  // --- Catalog ---

  /** GET /testing/attack-techniques → `{items, pagination}`; server default page size is 20. */
  listSingleTurnTechniques(params?: QueryParams): Promise<unknown> {
    return this._requestAny('GET', `${TESTING}/attack-techniques`, {
      params: { page: 1, 'page-size': 100, ...params },
    });
  }

  /** GET /mr-jailbreak/techniques → `{techniques, total_count}`; server default page size is 20. */
  listMultiTurnTechniques(params?: QueryParams): Promise<unknown> {
    return this._requestAny('GET', `${MR}/techniques`, {
      params: { page_id: 1, 'page-size': 100, ...params },
    });
  }

  /** GET /mr-jailbreak/agents → `{agents, total_count}`; `page_id` and kebab-case `page-size` (5..100) are required
   *  (ListJailbreakAgentsRequest), so default to the first full page. */
  listAgents(params?: QueryParams): Promise<unknown> {
    return this._requestAny('GET', `${MR}/agents`, {
      params: { page_id: 1, 'page-size': 100, ...params },
    });
  }

  /** `list-attacks --kind`: catalogs combined with alphabetical keys (Python `sort_keys=True`). */
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

  // --- Sessions + runs (single-turn attack path) ---

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

  /** GET /api/v1/testing/runs/{id}/results → `{items, pagination}` (`page`, `page-size` ≤ 100). */
  getRunResults(runId: string, params?: QueryParams): Promise<unknown> {
    return this._requestAny('GET', `${TESTING}/runs/${runId}/results`, params ? { params } : {});
  }

  /** POST /api/v1/testing/runs/{id}/cancel */
  cancelRun(runId: string): Promise<JsonObject> {
    return this._request('POST', `${TESTING}/runs/${runId}/cancel`);
  }

  // --- Multi-turn (mr-jailbreak) ---

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

  // --- Validation ---

  /** POST /api/v1/testing/validate — one-shot single-turn validator run. */
  async validate(payload: RedteamValidateRequest): Promise<RedteamValidateResponse> {
    const out = await this._request('POST', `${TESTING}/validate`, {
      json: payload as unknown as JsonValue,
    });
    return out as unknown as RedteamValidateResponse;
  }

  // --- Reports ---

  /** GET /api/v1/testing/sessions/{id}/report/csv — raw CSV text passthrough. */
  sessionReportCsv(sessionId: string): Promise<{ status: number; headers: Headers; text: string }> {
    return this._requestRaw('GET', `${TESTING}/sessions/${sessionId}/report/csv`);
  }

  // --- Analytics ---

  /** GET /api/v1/jailbreak/analytics/summary */
  analyticsSummary(): Promise<JsonObject> {
    return this._request('GET', `${JB}/analytics/summary`);
  }

  /** GET /api/v1/jailbreak/prompts-stats (no /analytics/ prefix, unlike summary). */
  analyticsPromptsStats(): Promise<JsonObject> {
    return this._request('GET', `${JB}/prompts-stats`);
  }

  // --- Bot helpers ---

  /** POST /api/v1/testing/bot/recommend-{kind} */
  recommend(kind: RecommendKind, payload: JsonValue): Promise<JsonObject> {
    return this._request('POST', `${BOT}/recommend-${kind}`, { json: payload });
  }

  /** POST /api/v1/testing/bot/parse-curl — `{curl_command}` (testing_bot_handlers.go). */
  parseCurl(curl: string): Promise<JsonObject> {
    return this._request('POST', `${BOT}/parse-curl`, { json: { curl_command: curl } });
  }

  /** POST /api/v1/testing/bot/test-connection */
  testConnection(payload: JsonValue): Promise<JsonObject> {
    return this._request('POST', `${BOT}/test-connection`, { json: payload });
  }
}
