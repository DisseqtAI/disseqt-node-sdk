// Tests for realtime-policy base-URL routing + response parsing.
// Port of the Python SDK's tests/unit/test_policy_response.py.

import { describe, expect, it, vi } from 'vitest';

import {
  Client,
  DECISION_BLOCK,
  DECISION_PASS,
  ENFORCEMENT_ASYNC,
  ENFORCEMENT_SYNC,
  InputValidationRequest,
  isAsync,
  isBlocking,
  parsePolicy,
} from '../../src/index.js';

// Test URLs — kept short here so the assertions stay readable.
const TEST_VALIDATORS_URL = 'https://test-api.disseqt.ai/realtime-validations';
const TEST_POLICIES_URL = 'https://test-api.disseqt.ai/realtime-policies';

interface RecordedCall {
  url: string;
  body: Record<string, unknown>;
  headers: Record<string, string>;
}

function makeFetcher(handler: (url: string) => { status?: number; json: unknown }): {
  fetcher: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({
      url,
      body:
        init?.body === undefined ? {} : (JSON.parse(String(init.body)) as Record<string, unknown>),
      headers: (init?.headers ?? {}) as Record<string, string>,
    });
    const route = handler(url);
    return new Response(JSON.stringify(route.json), {
      status: route.status ?? 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  return { fetcher, calls };
}

describe('realtimePolicyBaseUrl', () => {
  // realtimePolicyBaseUrl is the URL used for policy evaluation
  // (validate(..., { policies: [...] })) and is separate from baseUrl
  // (which is the validators endpoint).

  it('defaults to the managed realtime-validations gateway', () => {
    const c = new Client({ projectId: 'p', apiKey: 'k' });
    // Default points at the realtime-validations gateway: the evaluate
    // endpoint is served by production-monitoring alongside the
    // validators (the /realtime-policies gateway is the policy CRUD
    // dashboard and exposes no SDK routes).
    expect(c.realtimePolicyBaseUrl).toBe('https://api.disseqt.ai/realtime-validations');
  });

  it('uses realtimePolicyBaseUrl for policies, not baseUrl', async () => {
    const { fetcher, calls } = makeFetcher(() => ({ json: { success: true, decision: 'PASS' } }));
    const c = new Client({
      projectId: 'p',
      apiKey: 'k',
      baseUrl: 'https://validators.example.com',
      realtimePolicyBaseUrl: 'http://localhost:9010',
      applicationName: 't',
      fetch: fetcher,
    });

    await c.validate(new InputValidationRequest({ prompt: 'hi' }), { policies: ['p1'] });

    // Only the policy URL is hit — the validators URL never is.
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('http://localhost:9010/api/v1/sdk/policies/p1/evaluate');
  });

  it('accepts the snake_case config aliases', () => {
    const c = new Client({
      projectId: 'p',
      apiKey: 'k',
      realtime_policy_base_url: 'http://localhost:9010',
      application_name: 'snake-app',
    });
    expect(c.realtimePolicyBaseUrl).toBe('http://localhost:9010');
    expect(c.applicationName).toBe('snake-app');
  });

  it('strips a trailing slash on the policy base URL', async () => {
    const { fetcher, calls } = makeFetcher(() => ({ json: { success: true, decision: 'PASS' } }));
    const c = new Client({
      projectId: 'p',
      apiKey: 'k',
      realtimePolicyBaseUrl: 'http://localhost:9010/', // trailing slash
      applicationName: 't',
      fetch: fetcher,
    });

    await c.validate(new InputValidationRequest({ prompt: 'hi' }), { policies: ['p1'] });

    // If the slash weren't stripped we'd get a double slash before /api.
    expect(calls[0]?.url).toBe('http://localhost:9010/api/v1/sdk/policies/p1/evaluate');
  });

  it('sends auth headers and application_name', async () => {
    const { fetcher, calls } = makeFetcher(() => ({ json: { success: true, decision: 'PASS' } }));
    const client = new Client({
      projectId: 'test_project_123',
      apiKey: 'test_key_xyz',
      baseUrl: TEST_VALIDATORS_URL,
      realtimePolicyBaseUrl: TEST_POLICIES_URL,
      applicationName: 'test-app',
      fetch: fetcher,
    });

    await client.validate(new InputValidationRequest({ prompt: 'hi' }), { policies: ['x'] });

    expect(calls[0]?.url).toBe(`${TEST_POLICIES_URL}/api/v1/sdk/policies/x/evaluate`);
    expect(calls[0]?.headers['X-API-Key']).toBe('test_key_xyz');
    expect(calls[0]?.headers['X-Project-Id']).toBe('test_project_123');
    expect(calls[0]?.body['input_data']).toEqual({ llm_input_query: 'hi' });
    expect(calls[0]?.body['application_name']).toBe('test-app');
  });
});

describe('parsePolicy', () => {
  // parsePolicy turns the server response into typed objects.

  it('returns null when there is no policy_id', () => {
    // The server's response field is still `policy_id` — that's the
    // canonical wire shape, distinct from the SDK property name.
    expect(parsePolicy({ success: false, error: 'auth failed' })).toBeNull();
  });

  it('parses a blocking decision with rulesets and rules', () => {
    const response = {
      success: true,
      policy_id: 'abc',
      policy_name: 'PII Guard',
      policy_version: 3,
      decision: DECISION_BLOCK,
      enforcement: ENFORCEMENT_SYNC,
      rulesets: [
        {
          ruleset_id: 'rs1',
          ruleset_name: 'Safety',
          required: true,
          rules: [
            {
              validator: 'toxicity',
              validator_type: 'input-validation',
              status: 'fail',
              score: 0.91,
              has_score: true,
              threshold: 0.8,
              polarity: 'risk',
              is_decider: true,
            },
          ],
        },
      ],
    };

    const d = parsePolicy(response);
    expect(d).not.toBeNull();
    expect(d?.policyId).toBe('abc');
    expect(d?.policyVersion).toBe(3);
    expect(d?.decision).toBe(DECISION_BLOCK);
    expect(d?.enforcement).toBe(ENFORCEMENT_SYNC);
    expect(d?.rulesets).toHaveLength(1);
    const rs = d?.rulesets[0];
    expect(rs?.rulesetId).toBe('rs1');
    expect(rs?.required).toBe(true);
    expect(rs?.rules).toHaveLength(1);
    const rule = rs?.rules[0];
    expect(rule?.validator).toBe('toxicity');
    expect(rule?.validatorType).toBe('input-validation');
    expect(rule?.status).toBe('fail');
    expect(rule?.score).toBe(0.91);
    expect(rule?.threshold).toBe(0.8);
    expect(rule?.polarity).toBe('risk');
    expect(rule?.isDecider).toBe(true);
  });

  it('leaves score null when has_score is false', () => {
    const response = {
      policy_id: 'x',
      policy_name: 'X',
      policy_version: 1,
      decision: 'PASS',
      rulesets: [
        {
          ruleset_id: 'rs',
          ruleset_name: 'rs',
          rules: [{ validator: 'foo', status: 'skipped', has_score: false, threshold: 0.5 }],
        },
      ],
    };
    const d = parsePolicy(response);
    expect(d).not.toBeNull();
    expect(d?.rulesets[0]?.rules[0]?.score).toBeNull();
  });

  it('parses the aggregation fields', () => {
    const response = {
      policy_id: 'w',
      policy_name: 'Weighted',
      policy_version: 2,
      decision: DECISION_BLOCK,
      enforcement: ENFORCEMENT_SYNC,
      aggregation: 'weighted',
      aggregate_score: 0.74,
      aggregate_threshold: 0.7,
      rulesets: [],
    };
    const d = parsePolicy(response);
    expect(d).not.toBeNull();
    expect(d?.aggregation).toBe('weighted');
    expect(d?.aggregateScore).toBe(0.74);
    expect(d?.aggregateThreshold).toBe(0.7);
  });

  it('defaults the aggregation fields when absent', () => {
    // Servers that predate aggregation enforcement (or non-weighted
    // strategies, which omit the score) must parse cleanly.
    const response = {
      policy_id: 'old',
      policy_name: 'Legacy',
      policy_version: 1,
      decision: 'PASS',
    };
    const d = parsePolicy(response);
    expect(d).not.toBeNull();
    expect(d?.aggregation).toBe('');
    expect(d?.aggregateScore).toBeNull();
    expect(d?.aggregateThreshold).toBeNull();
  });

  it('treats blank-string and non-numeric placeholders as absent numbers', () => {
    // Python's float('') raises (→ None); Number('') would coerce to a
    // very present-looking 0 and flip `=== null` gates. Blank strings,
    // arrays, and objects must all parse as "absent".
    const response = {
      policy_id: 'x',
      policy_name: 'X',
      policy_version: 1,
      decision: 'PASS',
      aggregate_score: '',
      aggregate_threshold: '   ',
      rulesets: [
        {
          ruleset_id: 'rs',
          ruleset_name: 'rs',
          rules: [{ validator: 'foo', status: 'pass', has_score: true, score: '', threshold: [1] }],
        },
      ],
    };
    const d = parsePolicy(response);
    expect(d?.aggregateScore).toBeNull();
    expect(d?.aggregateThreshold).toBeNull();
    expect(d?.rulesets[0]?.rules[0]?.score).toBeNull();
    expect(d?.rulesets[0]?.rules[0]?.threshold).toBeNull();
  });

  it('still parses numeric strings and numbers', () => {
    const response = {
      policy_id: 'x',
      policy_name: 'X',
      policy_version: 1,
      decision: 'PASS',
      aggregate_score: '0.74',
      aggregate_threshold: 0.7,
    };
    const d = parsePolicy(response);
    expect(d?.aggregateScore).toBe(0.74);
    expect(d?.aggregateThreshold).toBe(0.7);
  });
});

describe('python-flavored aliases', () => {
  it('exports parse_policy / is_blocking / is_async / any_blocking', async () => {
    const mod = await import('../../src/index.js');
    expect(mod.parse_policy).toBe(parsePolicy);
    expect(mod.is_blocking).toBe(isBlocking);
    expect(mod.is_async).toBe(isAsync);
    expect(mod.any_blocking).toBeTypeOf('function');
  });
});

describe('isBlocking', () => {
  // isBlocking() is the convenience caller-check on decision only —
  // independent of sync/async mode.

  it('is true when decision is BLOCK', () => {
    expect(isBlocking({ decision: DECISION_BLOCK })).toBe(true);
  });

  it('is false when decision is PASS', () => {
    expect(isBlocking({ decision: DECISION_PASS })).toBe(false);
  });

  it('is false when there is no decision', () => {
    expect(isBlocking({ success: true })).toBe(false);
  });
});

describe('isAsync', () => {
  // isAsync() reads `enforcement`, which mirrors the policy's
  // strategy.executionMode 1:1.

  it('is true when enforcement is async', () => {
    expect(isAsync({ enforcement: ENFORCEMENT_ASYNC })).toBe(true);
  });

  it('is false when enforcement is sync', () => {
    expect(isAsync({ enforcement: ENFORCEMENT_SYNC })).toBe(false);
  });

  it('is false when there is no enforcement', () => {
    expect(isAsync({ success: true })).toBe(false);
  });

  it('isBlocking and isAsync are independent', () => {
    // A sync policy can BLOCK; an async policy could in principle also
    // carry a decision (today the server returns no decision for async,
    // but the helpers shouldn't get confused if it does).
    const response = { decision: DECISION_BLOCK, enforcement: ENFORCEMENT_SYNC };
    expect(isBlocking(response)).toBe(true);
    expect(isAsync(response)).toBe(false);
  });
});

describe('DSQ envelope unwrapping', () => {
  // The helpers accept either the raw payload OR the full
  // {status, data, messages, code, ...} DSQ envelope that
  // prod-monitoring's /policies/:id/evaluate returns.

  const wrap = (data: Record<string, unknown>): Record<string, unknown> => ({
    status: 'success',
    data,
    messages: [],
    code: 'DSQ-2000',
    standard_code: 'OK',
    request_id: 'req_abc',
    timestamp: '2026-06-27T15:30:18Z',
  });

  it('isBlocking reads through the envelope', () => {
    const wrapped = wrap({ decision: DECISION_BLOCK, enforcement: ENFORCEMENT_SYNC });
    expect(isBlocking(wrapped)).toBe(true);
  });

  it('isBlocking is false when the envelope decision is PASS', () => {
    const wrapped = wrap({ decision: DECISION_PASS, enforcement: ENFORCEMENT_SYNC });
    expect(isBlocking(wrapped)).toBe(false);
  });

  it('isAsync reads through the envelope', () => {
    const wrapped = wrap({ enforcement: ENFORCEMENT_ASYNC, status: 'accepted' });
    expect(isAsync(wrapped)).toBe(true);
  });

  it('parsePolicy reads through the envelope', () => {
    const wrapped = wrap({
      policy_id: 'abc',
      policy_name: 'Safety Guard',
      policy_version: 3,
      status: 'completed',
      decision: DECISION_BLOCK,
      enforcement: ENFORCEMENT_SYNC,
      rulesets: [],
    });
    const d = parsePolicy(wrapped);
    expect(d).not.toBeNull();
    expect(d?.policyId).toBe('abc');
    expect(d?.decision).toBe(DECISION_BLOCK);
    expect(d?.enforcement).toBe(ENFORCEMENT_SYNC);
  });

  it('still accepts the raw payload for backward compat', () => {
    // Pre-envelope wire shape — must keep working so existing callers
    // that already have the payload don't break.
    const raw = { decision: DECISION_BLOCK, enforcement: ENFORCEMENT_SYNC };
    expect(isBlocking(raw)).toBe(true);
  });

  it('does not unwrap an error envelope', () => {
    // An envelope whose status isn't "success" (or whose data isn't an
    // object) shouldn't be treated as the payload — falls through.
    const err = { status: 'error', error: { external: 'nope' }, code: 'DSQ-4000' };
    // No "decision" anywhere → isBlocking false, parse returns null.
    expect(isBlocking(err)).toBe(false);
    expect(parsePolicy(err)).toBeNull();
  });
});
