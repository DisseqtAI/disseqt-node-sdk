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

  it('rejects blank guard ids at construction', () => {
    const { client } = makeClient({});
    expect(() => new Guardrails({ client, inputGuards: ['  '] })).toThrow(/non-blank strings/);
  });
});
