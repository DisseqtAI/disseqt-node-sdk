/**
 * Helpers for the realtime-policy evaluation response.
 *
 * The server-side endpoint POST /api/v1/sdk/policies/{policy_id}/evaluate
 * returns a structured response with a per-rule breakdown. These helpers
 * parse it into typed objects and answer the common "should I block?" and
 * "is this sync or async?" checks without callers poking at raw keys.
 *
 * Wire shape
 * ----------
 * prod-monitoring wraps the verdict in the standard Disseqt DSQ envelope:
 *
 *     {
 *       "status":        "success",
 *       "data":          { "policy_id": "...", "decision": "BLOCK", ... },
 *       "messages":      [],
 *       "code":          "DSQ-2000",
 *       "standard_code": "OK",
 *       "request_id":    "req_abc",
 *       "timestamp":     "2026-06-27T15:30:18Z"
 *     }
 *
 * The helpers in this module accept either the full envelope OR the `data`
 * payload directly — unwrapEnvelope() handles both, so caller code is the
 * same whether you pass an entry from `client.validate(...).policies` or
 * its `response.data`.
 *
 * Response fields inside `data`
 * -----------------------------
 * - `decision` — "BLOCK" | "PASS" — the policy's verdict.
 * - `enforcement` — "sync" | "async" — mirrors the policy's
 *   `strategy.executionMode`. Tells you whether the decision in this
 *   response is final, or whether the result will land later on the
 *   realtime-validations dashboard.
 *
 * For sync policies you usually only check `isBlocking()`. For async
 * policies the server will return without a final `decision` and the
 * caller just records the request id and moves on.
 */

// decision values
export const DECISION_BLOCK = 'BLOCK';
export const DECISION_PASS = 'PASS';

// enforcement values — these mirror the policy's strategy.executionMode
export const ENFORCEMENT_SYNC = 'sync';
export const ENFORCEMENT_ASYNC = 'async';

/** One validator's outcome within a policy. */
export interface PolicyRule {
  readonly validator: string;
  readonly validatorType: string;
  /** pass | fail | skipped | error */
  readonly status: string;
  readonly score: number | null;
  readonly threshold: number | null;
  /** quality | risk */
  readonly polarity: string;
  readonly isDecider: boolean;
  readonly skippedReason: string;
}

/** One ruleset (named group of validators) inside the policy. */
export interface PolicyRuleset {
  readonly rulesetId: string;
  readonly rulesetName: string;
  readonly required: boolean;
  readonly rules: readonly PolicyRule[];
}

/** Aggregated verdict from a /policies/:id/evaluate call. */
export interface PolicyDecision {
  readonly policyId: string;
  readonly policyName: string;
  readonly policyVersion: number;
  /** BLOCK | PASS */
  readonly decision: string;
  /** sync | async */
  readonly enforcement: string;
  /**
   * Strategy that decided the verdict: any | all | majority | weighted.
   * Empty on responses from servers that predate aggregation enforcement.
   */
  readonly aggregation: string;
  /**
   * Weighted-strategy policy confidence in [0, 1] — the ruleset-weighted
   * badness the verdict was compared against. Null for non-weighted
   * strategies and for vacuous decisions where no rule produced a score.
   */
  readonly aggregateScore: number | null;
  /**
   * The blocking line for the weighted strategy: the decision is BLOCK
   * when `aggregateScore >= aggregateThreshold`.
   */
  readonly aggregateThreshold: number | null;
  readonly rulesets: readonly PolicyRuleset[];
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Return `response.data` when the response is a DSQ envelope, else
 * `response` itself.
 *
 * A DSQ envelope is recognised by `status === "success"` together with an
 * object-valued `data` field — that's the shape prod-monitoring's
 * /policies/:id/evaluate returns. Anything else (a raw payload from a
 * legacy or non-prod-monitoring caller, or an error envelope where `data`
 * is missing/null) falls through unchanged, so existing callers that
 * already pass the unwrapped object keep working.
 */
function unwrapEnvelope(response: UnknownRecord): UnknownRecord {
  if (response['status'] === 'success') {
    const data = response['data'];
    if (isRecord(data)) {
      return data;
    }
  }
  return response;
}

/**
 * Turn a /policies/:id/evaluate response into a PolicyDecision.
 *
 * Accepts either the full DSQ envelope or the unwrapped `data` object.
 * Returns null when the response doesn't carry a policy verdict (e.g. the
 * server returned an error envelope with no policy_id).
 */
export function parsePolicy(response: unknown): PolicyDecision | null {
  if (!isRecord(response)) {
    return null;
  }
  const payload = unwrapEnvelope(response);
  if (!payload['policy_id']) {
    return null;
  }
  const rulesets: PolicyRuleset[] = [];
  const rawRulesets = payload['rulesets'];
  for (const rs of Array.isArray(rawRulesets) ? rawRulesets : []) {
    if (!isRecord(rs)) {
      continue;
    }
    const rules: PolicyRule[] = [];
    const rawRules = rs['rules'];
    for (const r of Array.isArray(rawRules) ? rawRules : []) {
      if (!isRecord(r)) {
        continue;
      }
      rules.push({
        validator: asString(r['validator']),
        validatorType: asString(r['validator_type']),
        status: asString(r['status']),
        score: r['has_score'] ? maybeNumber(r['score']) : null,
        threshold: maybeNumber(r['threshold']),
        polarity: asString(r['polarity']),
        isDecider: Boolean(r['is_decider']),
        skippedReason: asString(r['skipped_reason']),
      });
    }
    rulesets.push({
      rulesetId: asString(rs['ruleset_id']),
      rulesetName: asString(rs['ruleset_name']),
      required: Boolean(rs['required']),
      rules,
    });
  }
  return {
    policyId: asString(payload['policy_id']),
    policyName: asString(payload['policy_name']),
    policyVersion: asInteger(payload['policy_version']),
    decision: asString(payload['decision']),
    enforcement: asString(payload['enforcement']),
    aggregation: asString(payload['aggregation']),
    aggregateScore: maybeNumber(payload['aggregate_score']),
    aggregateThreshold: maybeNumber(payload['aggregate_threshold']),
    rulesets,
  };
}

/**
 * Return true when the policy verdict is BLOCK.
 *
 * Accepts either the full DSQ envelope or the unwrapped `data` object.
 * Convenience for the common "do not pass this output downstream" check.
 * Reads `decision`, which is the actual verdict — independent of
 * sync/async.
 */
export function isBlocking(response: unknown): boolean {
  if (!isRecord(response)) {
    return false;
  }
  const payload = unwrapEnvelope(response);
  return payload['decision'] === DECISION_BLOCK;
}

/**
 * Return true when the policy ran in async mode.
 *
 * Accepts either the full DSQ envelope or the unwrapped `data` object.
 * In async mode the decision in this response is not yet final — the real
 * result will land on the realtime-validations dashboard once background
 * processing completes. Callers usually log and move on instead of acting
 * on `isBlocking`.
 */
export function isAsync(response: unknown): boolean {
  if (!isRecord(response)) {
    return false;
  }
  const payload = unwrapEnvelope(response);
  return payload['enforcement'] === ENFORCEMENT_ASYNC;
}

/**
 * Return true when any policy decision in `result` is BLOCK.
 *
 * Accepts, in order of preference:
 *
 * - the object returned by `client.validate(..., { policies: [...] })`
 *   (reads its `policies` array),
 * - a plain array of policy envelopes,
 * - a single policy envelope (falls back to `isBlocking`).
 *
 * Anything else — including a classic validator response — returns false,
 * so it is always safe to gate on:
 *
 *     const result = await client.validate(req, { policies: [...] });
 *     if (anyBlocking(result)) {
 *       ...  // at least one policy said BLOCK
 *     }
 */
export function anyBlocking(result: unknown): boolean {
  if (isRecord(result) && Array.isArray(result['policies'])) {
    return result['policies'].some((p) => isRecord(p) && isBlocking(p));
  }
  if (Array.isArray(result)) {
    return result.some((p) => isRecord(p) && isBlocking(p));
  }
  if (isRecord(result)) {
    return isBlocking(result);
  }
  return false;
}

// Python-flavored aliases, mirroring the Python SDK's exported names.
export {
  anyBlocking as any_blocking,
  isAsync as is_async,
  isBlocking as is_blocking,
  parsePolicy as parse_policy,
};

function asString(value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }
  return String(value);
}

function asInteger(value: unknown): number {
  const parsed = maybeNumber(value);
  return parsed === null ? 0 : Math.trunc(parsed);
}

// Mirrors Python's float() acceptance: numbers, booleans, and non-blank
// numeric strings parse; blank strings, arrays, and objects are "absent"
// (Number('') would otherwise coerce to a very present-looking 0).
function maybeNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isNaN(value) ? null : value;
  }
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}
