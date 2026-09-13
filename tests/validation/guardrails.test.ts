import { describe, expect, it, vi } from 'vitest';

import {
  BlockedError,
  Client,
  DECISION_BLOCK,
  DECISION_PASS,
  ENFORCEMENT_SYNC,
  Guardrails,
} from '../../src/index.js';

const INPUT_POLICY = 'aaaa1111-1111-1111-1111-111111111111';
const OUTPUT_POLICY = 'bbbb2222-2222-2222-2222-222222222222';

interface RecordedCall {
  url: string;
  body: Record<string, unknown>;
}

function envelope(decision: string, policyId: string): Record<string, unknown> {
  return {
    status: 'success',
    data: {
      policy_id: policyId,
      policy_name: 'p',
      policy_version: 1,
      decision,
      enforcement: ENFORCEMENT_SYNC,
    },
  };
}

function makeClient(routes: Record<string, string>): { client: Client; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({
      url,
      body:
        init?.body === undefined ? {} : (JSON.parse(String(init.body)) as Record<string, unknown>),
    });
    for (const [policyId, decision] of Object.entries(routes)) {
      if (url.includes(policyId)) {
        return new Response(JSON.stringify(envelope(decision, policyId)), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }
    return new Response('{}', { status: 200 });
  });
  const client = new Client({
    projectId: 'p',
    apiKey: 'k',
    applicationName: 'test-app',
    fetch: fetcher,
  });
  return { client, calls };
}

describe('Guardrails', () => {
  it('returns vacuous PASS when no guards are configured', async () => {
    const { client, calls } = makeClient({});
    const gr = new Guardrails({ client });
    const result = await gr.guardInput({ prompt: 'hi' });
    expect(result.breached).toBe(false);
    expect(result.decisions).toHaveLength(0);
    expect(calls).toHaveLength(0);
  });

  it('fans input through inputGuards and reports PASS', async () => {
    const { client, calls } = makeClient({ [INPUT_POLICY]: DECISION_PASS });
    const gr = new Guardrails({ client, inputGuards: [INPUT_POLICY] });
    const result = await gr.guardInput({ prompt: 'hello world' });
    expect(result.breached).toBe(false);
    expect(result.decisions).toHaveLength(1);
    expect(result.decisions[0]?.decision).toBe(DECISION_PASS);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toContain(INPUT_POLICY);
    expect(calls[0]?.body['input_data']).toEqual({ llm_input_query: 'hello world' });
    expect(calls[0]?.body['application_name']).toBe('test-app');
  });

  it('reports breach when any input guard says BLOCK', async () => {
    const { client } = makeClient({ [INPUT_POLICY]: DECISION_BLOCK });
    const gr = new Guardrails({ client, inputGuards: [INPUT_POLICY] });
    const result = await gr.guardInput({ prompt: 'attack' });
    expect(result.breached).toBe(true);
    expect(result.decisions[0]?.decision).toBe(DECISION_BLOCK);
  });

  it('raises BlockedError when raiseOnBlock is set and a guard breaches', async () => {
    const { client } = makeClient({ [INPUT_POLICY]: DECISION_BLOCK });
    const gr = new Guardrails({ client, inputGuards: [INPUT_POLICY] });
    await expect(
      gr.guardInput({ prompt: 'attack' }, { raiseOnBlock: true }),
    ).rejects.toBeInstanceOf(BlockedError);
  });

  it('runs outputGuards against prompt+response payload', async () => {
    const { client, calls } = makeClient({ [OUTPUT_POLICY]: DECISION_PASS });
    const gr = new Guardrails({ client, outputGuards: [OUTPUT_POLICY] });
    const result = await gr.guardOutput({ prompt: 'q', response: 'a' });
    expect(result.breached).toBe(false);
    expect(calls[0]?.body['input_data']).toEqual({
      llm_input_query: 'q',
      llm_output: 'a',
    });
  });

  it('exposes Python-style snake_case aliases', async () => {
    const { client } = makeClient({ [INPUT_POLICY]: DECISION_PASS });
    const gr = new Guardrails({ client, inputGuards: [INPUT_POLICY] });
    const result = await gr.guard_input({ prompt: 'hi' });
    expect(result.breached).toBe(false);
  });

  it('GuardResult exposes Python-parity field aliases (PASS)', async () => {
    const { client } = makeClient({ [INPUT_POLICY]: DECISION_PASS });
    const gr = new Guardrails({ client, inputGuards: [INPUT_POLICY] });
    const result = await gr.guardInput({ prompt: 'hi' });
    // Node primary names still work…
    expect(result.breached).toBe(false);
    expect(result.decisions).toHaveLength(1);
    // …and Python-flavored aliases mirror them.
    expect(result.blocked).toBe(false);
    expect(result.blocked).toBe(result.breached);
    expect(result.policy_envelopes).toBe(result.decisions);
  });

  it('GuardResult exposes Python-parity field aliases (BLOCK)', async () => {
    const { client } = makeClient({ [INPUT_POLICY]: DECISION_BLOCK });
    const gr = new Guardrails({ client, inputGuards: [INPUT_POLICY] });
    const result = await gr.guardInput({ prompt: 'attack' });
    expect(result.breached).toBe(true);
    expect(result.blocked).toBe(true);
    expect(result.policy_envelopes[0]?.decision).toBe(DECISION_BLOCK);
  });

  it('vacuous GuardResult also carries snake_case aliases', async () => {
    const { client } = makeClient({});
    const gr = new Guardrails({ client });
    const result = await gr.guardInput({ prompt: 'hi' });
    expect(result.blocked).toBe(false);
    expect(result.policy_envelopes).toEqual([]);
  });

  it('rejects blank guard ids at construction', () => {
    const { client } = makeClient({});
    expect(() => new Guardrails({ client, inputGuards: ['  '] })).toThrow(/non-blank strings/);
  });

  it('carries evaluationModel + sampleRate parity kwargs (default gpt-4.1 / 1.0)', () => {
    const { client } = makeClient({});
    const gr = new Guardrails({ client });
    expect(gr.evaluationModel).toBe('gpt-4.1');
    expect(gr.sampleRate).toBe(1.0);
  });

  it('accepts custom evaluationModel + sampleRate', () => {
    const { client } = makeClient({});
    const gr = new Guardrails({
      client,
      evaluationModel: 'gpt-4o-mini',
      sampleRate: 0.25,
    });
    expect(gr.evaluationModel).toBe('gpt-4o-mini');
    expect(gr.sampleRate).toBe(0.25);
  });

  it('rejects sampleRate outside (0, 1]', () => {
    const { client } = makeClient({});
    expect(() => new Guardrails({ client, sampleRate: 0 })).toThrow(/sampleRate/);
    expect(() => new Guardrails({ client, sampleRate: 1.5 })).toThrow(/sampleRate/);
    expect(() => new Guardrails({ client, sampleRate: Number.NaN })).toThrow(/sampleRate/);
  });

  it('propagates upstream 5xx as DisseqtHttpError (not BlockedError)', async () => {
    // Server error must surface intact — guardrails do not swallow it into a
    // fake PASS. Callers need to see 500s to page on-call, not silently
    // proceed thinking their content passed policy.
    const fetcher = vi.fn(
      async () => new Response('boom', { status: 500, headers: { 'Content-Type': 'text/plain' } }),
    );
    const client = new Client({
      projectId: 'p',
      apiKey: 'k',
      applicationName: 'test-app',
      fetch: fetcher,
    });
    const gr = new Guardrails({ client, inputGuards: [INPUT_POLICY] });
    await expect(gr.guardInput({ prompt: 'hi' })).rejects.toMatchObject({ statusCode: 500 });
    await expect(gr.guardInput({ prompt: 'hi' })).rejects.not.toBeInstanceOf(BlockedError);
  });

  it('propagates malformed JSON as DisseqtJsonError (not silent PASS)', async () => {
    // A truncated / non-JSON body must NOT be swallowed into a vacuous PASS
    // — a broken upstream must fail loud, not fail-open.
    const fetcher = vi.fn(
      async () =>
        new Response('not-json-at-all{', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    const client = new Client({
      projectId: 'p',
      apiKey: 'k',
      applicationName: 'test-app',
      fetch: fetcher,
    });
    const gr = new Guardrails({ client, inputGuards: [INPUT_POLICY] });
    await expect(gr.guardInput({ prompt: 'hi' })).rejects.toThrow();
    await expect(gr.guardInput({ prompt: 'hi' })).rejects.not.toBeInstanceOf(BlockedError);
  });
});
