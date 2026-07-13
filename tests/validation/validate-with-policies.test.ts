// validate(request, { policies: [...] }) — validator optional, policies
// optional, stable {validation, policies} envelope when policies are passed.
// Port of the Python SDK's tests/unit/test_validate_with_policies.py.

import { describe, expect, it, vi } from 'vitest';

import {
  AgenticBehaviourRequest,
  ClassifyValidator,
  Client,
  CompositeScoreRequest,
  InputValidation,
  InputValidationRequest,
  InputValidator,
  OutputValidation,
  OutputValidationRequest,
  OutputValidator,
  ThemesClassifierRequest,
  anyBlocking,
  isBlocking,
  parsePolicy,
} from '../../src/index.js';

const BASE = 'https://policies.test';
const P1 = '11111111-1111-4111-8111-111111111111';
const P2 = '22222222-2222-4222-8222-222222222222';

const TOX_URL = `${BASE}/api/v1/sdk/validators/input-validation/toxicity`;
const P1_URL = `${BASE}/api/v1/sdk/policies/${P1}/evaluate`;
const P2_URL = `${BASE}/api/v1/sdk/policies/${P2}/evaluate`;

const VALIDATOR_RESPONSE = {
  success: true,
  result: { data: { metric_name: 'toxicity_evaluation' } },
};
const P1_BLOCK = {
  status: 'success',
  code: 'DSQ-2000',
  data: { policy_id: P1, decision: 'BLOCK', enforcement: 'sync' },
};
const P2_PASS = {
  status: 'success',
  code: 'DSQ-2000',
  data: { policy_id: P2, decision: 'PASS', enforcement: 'sync' },
};

interface Route {
  status?: number;
  json?: unknown;
  text?: string;
}

interface RecordedCall {
  url: string;
  body: Record<string, unknown>;
}

interface Harness {
  fetcher: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
  calls: RecordedCall[];
  callsTo(url: string): RecordedCall[];
}

function mockRoutes(routes: Record<string, Route>): Harness {
  const calls: RecordedCall[] = [];
  const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({
      url,
      body:
        init?.body === undefined ? {} : (JSON.parse(String(init.body)) as Record<string, unknown>),
    });
    const route = routes[url];
    if (route === undefined) {
      throw new Error(`Unmocked URL: ${url}`);
    }
    const text = route.text ?? JSON.stringify(route.json);
    return new Response(text, {
      status: route.status ?? 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  return {
    fetcher,
    calls,
    callsTo: (url: string) => calls.filter((c) => c.url === url),
  };
}

function client(
  harness: Harness,
  options: { appName?: string | null; defaultPolicies?: readonly string[] } = {},
): Client {
  const appName = options.appName === undefined ? 'policies-test' : options.appName;
  const config: ConstructorParameters<typeof Client>[0] = {
    projectId: 'proj',
    apiKey: 'key',
    baseUrl: BASE,
    realtimePolicyBaseUrl: BASE,
    fetch: harness.fetcher,
  };
  if (appName !== null) {
    config.applicationName = appName;
  }
  if (options.defaultPolicies !== undefined) {
    config.policies = options.defaultPolicies;
  }
  return new Client(config);
}

function toxicity(): InputValidator {
  return new InputValidator({
    slug: InputValidation.Toxicity,
    data: new InputValidationRequest({ prompt: 'hello' }),
    config: { threshold: 0.5 },
  });
}

describe('shape 1: classic, unchanged', () => {
  it('validator only returns the plain response', async () => {
    const harness = mockRoutes({ [TOX_URL]: { json: VALIDATOR_RESPONSE } });
    const result = await client(harness).validate(toxicity());
    expect(harness.callsTo(TOX_URL)).toHaveLength(1);
    expect(result).toEqual(VALIDATOR_RESPONSE); // no envelope, no extra keys
    expect(result).not.toHaveProperty('policies');
  });

  it('a bare request without policies throws', async () => {
    const harness = mockRoutes({});
    await expect(
      client(harness).validate(new InputValidationRequest({ prompt: 'hello' })),
    ).rejects.toMatchObject({ name: 'ValueError', message: expect.stringContaining('policies') });
  });
});

describe('shape 2: validator + policies', () => {
  it('runs the validator and each policy in order', async () => {
    const harness = mockRoutes({
      [TOX_URL]: { json: VALIDATOR_RESPONSE },
      [P1_URL]: { json: P1_BLOCK },
      [P2_URL]: { json: P2_PASS },
    });

    const result = await client(harness).validate(toxicity(), { policies: [P1, P2] });

    expect(harness.callsTo(TOX_URL)).toHaveLength(1);
    expect(harness.callsTo(P1_URL)).toHaveLength(1);
    expect(harness.callsTo(P2_URL)).toHaveLength(1);
    expect(result['validation']).toEqual(VALIDATOR_RESPONSE);
    const policies = result['policies'] as Record<string, unknown>[];
    expect(policies.map((p) => parsePolicy(p)?.policyId)).toEqual([P1, P2]);
    // Policy calls carry the SAME input as the validator's data, in wire
    // shape, plus the client's application_name.
    const sent = harness.callsTo(P1_URL)[0]?.body;
    expect(sent?.['input_data']).toEqual({ llm_input_query: 'hello' });
    expect(sent?.['application_name']).toBe('policies-test');
  });

  it('anyBlocking works over the envelope', async () => {
    const harness = mockRoutes({
      [TOX_URL]: { json: VALIDATOR_RESPONSE },
      [P1_URL]: { json: P1_BLOCK },
      [P2_URL]: { json: P2_PASS },
    });
    const result = await client(harness).validate(toxicity(), { policies: [P1, P2] });
    expect(anyBlocking(result)).toBe(true);
    const policies = result['policies'] as Record<string, unknown>[];
    expect(isBlocking(policies[0])).toBe(true);
    expect(isBlocking(policies[1])).toBe(false);
  });

  it('is not blocking when all policies pass', async () => {
    const harness = mockRoutes({
      [TOX_URL]: { json: VALIDATOR_RESPONSE },
      [P2_URL]: { json: P2_PASS },
    });
    const result = await client(harness).validate(toxicity(), { policies: [P2] });
    expect(anyBlocking(result)).toBe(false);
  });
});

describe('shape 3: policies only', () => {
  it('evaluates policies from a bare request with no validator call', async () => {
    const harness = mockRoutes({ [P1_URL]: { json: P1_BLOCK } });
    const result = await client(harness).validate(
      new InputValidationRequest({ prompt: 'hi', response: 'out' }),
      { policies: [P1] },
    );
    expect(result['validation']).toBeNull();
    const policies = result['policies'] as Record<string, unknown>[];
    expect(parsePolicy(policies[0])?.decision).toBe('BLOCK');
    // Only the policy endpoint was hit — no validator POST.
    expect(harness.calls.every((c) => c.url.includes('policies'))).toBe(true);
    expect(harness.callsTo(P1_URL)[0]?.body['input_data']).toEqual({
      llm_input_query: 'hi',
      llm_output: 'out',
    });
  });

  it('an agentic request carries the agentic fields', async () => {
    const harness = mockRoutes({ [P1_URL]: { json: P1_BLOCK } });
    await client(harness).validate(
      new AgenticBehaviourRequest({
        conversationHistory: ['a', 'b'],
        toolCalls: [{ name: 't' }],
      }),
      { policies: [P1] },
    );
    const sent = harness.callsTo(P1_URL)[0]?.body['input_data'] as Record<string, unknown>;
    expect(sent['conversation_history']).toEqual(['a', 'b']);
    expect(sent['tool_calls']).toEqual([{ name: 't' }]);
  });

  it('an empty input throws', async () => {
    const harness = mockRoutes({});
    await expect(
      client(harness).validate(new OutputValidationRequest({}), { policies: [P1] }),
    ).rejects.toMatchObject({ message: expect.stringContaining('no input fields') });
  });
});

describe('validation rules', () => {
  it('an empty policies list throws', async () => {
    const harness = mockRoutes({});
    await expect(client(harness).validate(toxicity(), { policies: [] })).rejects.toMatchObject({
      message: expect.stringContaining('non-empty list'),
    });
  });

  it('a non-string policy throws', async () => {
    const harness = mockRoutes({});
    await expect(
      client(harness).validate(toxicity(), { policies: [P1, 42] as never }),
    ).rejects.toMatchObject({ message: expect.stringContaining('non-empty list') });
  });

  it('a blank policy id throws', async () => {
    const harness = mockRoutes({});
    await expect(client(harness).validate(toxicity(), { policies: ['  '] })).rejects.toMatchObject({
      message: expect.stringContaining('non-empty list'),
    });
  });

  it('a missing applicationName throws', async () => {
    const harness = mockRoutes({});
    await expect(
      client(harness, { appName: null }).validate(toxicity(), { policies: [P1] }),
    ).rejects.toMatchObject({ message: expect.stringContaining('applicationName') });
  });

  it('themes with policies throws', async () => {
    const harness = mockRoutes({});
    await expect(
      client(harness).validate(new ClassifyValidator({ data: { text: 'x' } }), {
        policies: [P1],
      }),
    ).rejects.toMatchObject({ message: expect.stringContaining('not supported') });
  });
});

describe('error propagation', () => {
  it('an unknown policy 404 propagates', async () => {
    const harness = mockRoutes({
      [TOX_URL]: { json: VALIDATOR_RESPONSE },
      [P1_URL]: { status: 404, json: { code: 'DSQ-4040' } },
    });
    await expect(client(harness).validate(toxicity(), { policies: [P1] })).rejects.toMatchObject({
      name: 'DisseqtHttpError',
      statusCode: 404,
    });
    // The validator ran before the policy error surfaced.
    expect(harness.callsTo(TOX_URL)).toHaveLength(1);
  });

  it('a second-policy failure surfaces after the first succeeds', async () => {
    const harness = mockRoutes({
      [TOX_URL]: { json: VALIDATOR_RESPONSE },
      [P1_URL]: { json: P1_BLOCK },
      [P2_URL]: { status: 500, text: 'boom' },
    });
    await expect(
      client(harness).validate(toxicity(), { policies: [P1, P2] }),
    ).rejects.toMatchObject({ statusCode: 500 });
  });
});

describe('client default policies', () => {
  // Client({ policies: [...] }) is a default; per-call policies override it.

  it('the constructor requires applicationName', () => {
    const harness = mockRoutes({});
    expect(() => client(harness, { appName: null, defaultPolicies: [P1] })).toThrowError(
      /applicationName is required/,
    );
  });

  it('the constructor rejects blank ids', () => {
    const harness = mockRoutes({});
    expect(() => client(harness, { defaultPolicies: [P1, '  '] })).toThrowError(
      /policy-id strings/,
    );
  });

  it('an empty constructor list means no default', async () => {
    const harness = mockRoutes({ [TOX_URL]: { json: VALIDATOR_RESPONSE } });
    const c = client(harness, { defaultPolicies: [] });
    expect(c.policies).toBeNull();
    const result = await c.validate(toxicity()); // classic shape 1, no envelope
    expect(harness.callsTo(TOX_URL)).toHaveLength(1);
    expect(result).not.toHaveProperty('policies');
  });

  it('copies the list defensively', () => {
    const harness = mockRoutes({});
    const ids = [P1];
    const c = client(harness, { defaultPolicies: ids });
    ids.push('mutated-after-construction');
    expect(c.policies).toEqual([P1]);
  });

  it('a Set of default policies is normalized and enforced', async () => {
    // `.length` is undefined on a Set — the constructor must normalize
    // the iterable (as Python's list(policies) does), never silently
    // ungate the client.
    const harness = mockRoutes({ [P1_URL]: { json: P1_BLOCK } });
    const c = client(harness, { defaultPolicies: new Set([P1]) as never });
    expect(c.policies).toEqual([P1]);
    const result = await c.validate(new InputValidationRequest({ prompt: 'hello' }));
    expect(harness.callsTo(P1_URL)).toHaveLength(1);
    expect(anyBlocking(result)).toBe(true);
  });

  it('a non-iterable default throws at construction', () => {
    const harness = mockRoutes({});
    expect(() => client(harness, { defaultPolicies: 42 as never })).toThrowError(
      /policy-id strings/,
    );
  });

  it('the default applies to validator calls', async () => {
    const harness = mockRoutes({
      [TOX_URL]: { json: VALIDATOR_RESPONSE },
      [P1_URL]: { json: P1_BLOCK },
    });
    const result = await client(harness, { defaultPolicies: [P1] }).validate(toxicity());
    expect(harness.callsTo(TOX_URL)).toHaveLength(1);
    expect(harness.callsTo(P1_URL)).toHaveLength(1);
    expect(result['validation']).not.toBeNull();
    const policies = result['policies'] as Record<string, unknown>[];
    expect(parsePolicy(policies[0])?.decision).toBe('BLOCK');
  });

  it('the default applies to bare requests', async () => {
    const harness = mockRoutes({ [P1_URL]: { json: P1_BLOCK } });
    const result = await client(harness, { defaultPolicies: [P1] }).validate(
      new InputValidationRequest({ prompt: 'hello' }),
    );
    expect(harness.callsTo(P1_URL)).toHaveLength(1);
    expect(result['validation']).toBeNull();
    expect(anyBlocking(result)).toBe(true);
  });

  it('a per-call list overrides the default', async () => {
    const harness = mockRoutes({
      [P1_URL]: { json: P1_BLOCK },
      [P2_URL]: { json: P2_PASS },
    });
    const result = await client(harness, { defaultPolicies: [P1] }).validate(
      new InputValidationRequest({ prompt: 'hello' }),
      { policies: [P2] },
    );
    // Override wins, default untouched.
    expect(harness.callsTo(P2_URL)).toHaveLength(1);
    expect(harness.callsTo(P1_URL)).toHaveLength(0);
    const policies = result['policies'] as Record<string, unknown>[];
    expect(parsePolicy(policies[0])?.policyId).toBe(P2);
  });

  it('an explicit empty list still throws despite the default', async () => {
    // An accidentally-empty per-call list must fail loudly, never
    // silently fall back to the default (or ungate the call).
    const harness = mockRoutes({});
    await expect(
      client(harness, { defaultPolicies: [P1] }).validate(
        new InputValidationRequest({ prompt: 'hello' }),
        { policies: [] },
      ),
    ).rejects.toMatchObject({ message: expect.stringContaining('non-empty') });
  });

  it('the default steps aside for the themes wrapper', async () => {
    const classify = new ClassifyValidator({
      data: new ThemesClassifierRequest({ text: 'hello' }),
    });
    const themesUrl = `${BASE}/api/v1/sdk/validators/${classify.domain}/${classify.slug}`;
    const harness = mockRoutes({
      [themesUrl]: { json: { success: true } },
      [P1_URL]: { json: P1_BLOCK },
    });
    const c = client(harness, { defaultPolicies: [P1] });
    await c.validate(classify);
    expect(harness.callsTo(themesUrl)).toHaveLength(1);
    // Incompatible request: the default is not applied.
    expect(harness.callsTo(P1_URL)).toHaveLength(0);
  });

  it('a bare themes request with a default still throws', async () => {
    // The default steps aside for themes/composite, after which a bare
    // request has no policies to run under — same loud error as ever.
    const harness = mockRoutes({});
    await expect(
      client(harness, { defaultPolicies: [P1] }).validate(
        new ThemesClassifierRequest({ text: 'x' }),
      ),
    ).rejects.toMatchObject({ message: expect.stringMatching(/bare request|policies/) });
  });

  it('no default and no per-call list is classic', async () => {
    const harness = mockRoutes({ [TOX_URL]: { json: VALIDATOR_RESPONSE } });
    const result = await client(harness).validate(toxicity());
    expect(harness.callsTo(TOX_URL)).toHaveLength(1);
    expect(result).not.toHaveProperty('policies');
  });
});

describe('typed overload', () => {
  it('a per-call policies option returns the typed envelope, no casts needed', async () => {
    const harness = mockRoutes({ [P1_URL]: { json: P1_BLOCK } });
    const result = await client(harness).validate(new InputValidationRequest({ prompt: 'hi' }), {
      policies: [P1],
    });
    // The overload types result as PolicyValidationResult — .validation
    // and .policies are directly accessible (this is what the README
    // samples rely on).
    expect(result.validation).toBeNull();
    expect(result.policies).toHaveLength(1);
    expect(parsePolicy(result.policies[0])?.policyId).toBe(P1);
  });
});

describe('anyBlocking helper', () => {
  it('accepts all supported shapes', () => {
    const envBlock = { status: 'success', data: { policy_id: 'x', decision: 'BLOCK' } };
    const envPass = { status: 'success', data: { policy_id: 'x', decision: 'PASS' } };
    expect(anyBlocking({ validation: null, policies: [envPass, envBlock] })).toBe(true);
    expect(anyBlocking({ validation: null, policies: [envPass] })).toBe(false);
    expect(anyBlocking([envBlock])).toBe(true);
    expect(anyBlocking(envBlock)).toBe(true);
    expect(anyBlocking(envPass)).toBe(false);
    expect(anyBlocking(VALIDATOR_RESPONSE)).toBe(false); // classic result -> false
    expect(anyBlocking(null)).toBe(false);
    expect(anyBlocking(undefined)).toBe(false);
    expect(anyBlocking({ policies: 'not-a-list' })).toBe(false);
  });
});

describe('review findings regressions', () => {
  // Regression tests for the adversarially-verified review findings from
  // the Python SDK's policy feature review.

  it('an empty input throws before any network call', async () => {
    // Shape 2 with empty input must throw BEFORE the validator POST — no
    // billing for a doomed call.
    const harness = mockRoutes({});
    await expect(
      client(harness).validate(
        new OutputValidator({
          slug: OutputValidation.Toxicity,
          data: new OutputValidationRequest({}), // serializes to {}
          config: { threshold: 0.5 },
        }),
        { policies: [P1] },
      ),
    ).rejects.toMatchObject({ message: expect.stringContaining('no input fields') });
    expect(harness.calls).toHaveLength(0); // nothing hit the wire
  });

  it('a bare composite request is rejected', async () => {
    const harness = mockRoutes({});
    await expect(
      client(harness).validate(
        new CompositeScoreRequest({ llm_input_query: 'q', llm_output: 'o' }),
        { policies: [P1] },
      ),
    ).rejects.toMatchObject({ message: expect.stringContaining('not supported') });
  });

  it('a bare themes request is rejected', async () => {
    const harness = mockRoutes({});
    await expect(
      client(harness).validate(new ThemesClassifierRequest({ text: 'x' }), { policies: [P1] }),
    ).rejects.toMatchObject({ message: expect.stringContaining('not supported') });
  });

  it('a one-shot iterable of policies evaluates them all', async () => {
    // A one-shot iterable must be normalized, not silently exhausted.
    const harness = mockRoutes({
      [P1_URL]: { json: P1_BLOCK },
      [P2_URL]: { json: P2_PASS },
    });
    function* gen(): Generator<string> {
      yield P1;
      yield P2;
    }
    const result = await client(harness).validate(new InputValidationRequest({ prompt: 'hi' }), {
      policies: gen() as never,
    });
    expect(harness.callsTo(P1_URL)).toHaveLength(1);
    expect(harness.callsTo(P2_URL)).toHaveLength(1);
    expect(result['policies']).toHaveLength(2);
  });

  it('a non-iterable policies value throws ValueError', async () => {
    const harness = mockRoutes({});
    await expect(
      client(harness).validate(new InputValidationRequest({ prompt: 'hi' }), {
        policies: 42 as never,
      }),
    ).rejects.toMatchObject({
      name: 'ValueError',
      message: expect.stringContaining('policy-id strings'),
    });
  });

  it('an unsupported request object throws ValueError', async () => {
    // A plain object must throw ValueError, not something opaque.
    const harness = mockRoutes({});
    await expect(
      client(harness).validate({ llm_input_query: 'hi' } as never, { policies: [P1] }),
    ).rejects.toMatchObject({
      name: 'ValueError',
      message: expect.stringContaining('request must be a validator'),
    });
  });
});
