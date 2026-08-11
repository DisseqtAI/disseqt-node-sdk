import { describe, expect, it, vi } from 'vitest';

import { Client, InputValidation, InputValidator, SDKConfigInput } from '../../src/index.js';

// Per-request LLM-as-a-judge: `llmAsAJudge` + the MANDATORY `llmId`
// (the LLM Integration's id, copied from Dashboard -> AI Inventory ->
// LLM Integrations -> ID column). Mirrors the Python SDK's
// tests/unit/test_llm_judge_flag.py so the two SDKs cannot drift.

const jsonResponse = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

describe('SDKConfigInput judge serialization', () => {
  it('defaults omit the flag and judge block', () => {
    const out = new SDKConfigInput({ threshold: 0.5 }).toDict();
    expect(out).toEqual({ threshold: 0.5 });
  });

  it('the flag REQUIRES llmId — fails at construction, not server-side', () => {
    expect(() => new SDKConfigInput({ threshold: 0.5, llmAsAJudge: true })).toThrow(
      /requires llmId/,
    );
  });

  it('llmId requires the flag — a silent no-op is refused', () => {
    expect(() => new SDKConfigInput({ threshold: 0.5, llmId: 'cllm-1' })).toThrow(
      /only used with llmAsAJudge/,
    );
  });

  it('serializes the flag and nests llmId as judge.custom_llm_id', () => {
    const out = new SDKConfigInput({
      threshold: 0.5,
      llmAsAJudge: true,
      llmId: 'cllm-1',
    }).toDict();
    expect(out.llm_as_a_judge).toBe(true);
    expect(out.judge).toEqual({ custom_llm_id: 'cllm-1' });
  });

  it('accepts snake_case aliases (llm_as_a_judge / llm_id)', () => {
    const out = new SDKConfigInput({
      threshold: 0.5,
      llm_as_a_judge: true,
      llm_id: 'cllm-1',
    }).toDict();
    expect(out.llm_as_a_judge).toBe(true);
    expect(out.judge).toEqual({ custom_llm_id: 'cllm-1' });
  });

  it('a judge object custom_llm_id satisfies the requirement (power-user path)', () => {
    const judge = { custom_llm_id: 'cllm-1', model: 'gpt-4o', criteria: 'be strict' };
    const out = new SDKConfigInput({ threshold: 0.5, llmAsAJudge: true, judge }).toDict();
    expect(out.judge).toEqual(judge);
  });

  it('llmId merges with the judge object and wins on conflict', () => {
    const out = new SDKConfigInput({
      threshold: 0.5,
      llmAsAJudge: true,
      llmId: 'flat-wins',
      judge: { custom_llm_id: 'object-loses', model: 'gpt-5' },
    }).toDict();
    expect(out.judge).toEqual({ custom_llm_id: 'flat-wins', model: 'gpt-5' });
  });

  it('never mutates the caller judge object', () => {
    const judge = { model: 'gpt-5' };
    new SDKConfigInput({
      threshold: 0.5,
      llmAsAJudge: true,
      llmId: 'cllm-1',
      judge,
    }).toDict();
    expect(judge).toEqual({ model: 'gpt-5' });
  });

  it('composes with custom labels', () => {
    const out = new SDKConfigInput({
      threshold: 0.5,
      customLabels: ['OK', 'Bad', 'Awful', 'Severe'],
      labelThresholds: [0.1, 0.5, 0.9],
      llmAsAJudge: true,
      llmId: 'cllm-1',
    }).toDict();
    expect(out).toEqual({
      threshold: 0.5,
      custom_labels: ['OK', 'Bad', 'Awful', 'Severe'],
      label_thresholds: [0.1, 0.5, 0.9],
      llm_as_a_judge: true,
      judge: { custom_llm_id: 'cllm-1' },
    });
  });
});

describe('judge wire payload', () => {
  it('carries the flag and judge block to the validator endpoint verbatim', async () => {
    const fetcher = vi.fn(async (...args: [string | URL | Request, RequestInit?]) => {
      void args;
      return jsonResponse({ success: true, result: { data: {} } });
    });
    const client = new Client({
      projectId: 'proj',
      apiKey: 'key',
      baseUrl: 'https://judge-flag.test',
      fetch: fetcher,
    });

    await client.validate(
      new InputValidator({
        slug: InputValidation.Toxicity,
        data: { prompt: 'hello' },
        config: { threshold: 0.5, llmAsAJudge: true, llmId: 'cllm-1' },
      }),
    );

    const body = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
    expect(body.config_input.llm_as_a_judge).toBe(true);
    expect(body.config_input.judge).toEqual({ custom_llm_id: 'cllm-1' });
  });
});

describe('judge response passthrough', () => {
  // The chain returns judge-specific fields this SDK does not model:
  // top-level `origin_validator` (the reroute renamed the run) and
  // `others.scoring_path` (which scoring formula ran). The client returns
  // the server object verbatim — this pins that property so a future typed
  // response can't silently drop them.
  const REROUTED = {
    success: true,
    validator_type: 'input-validation',
    validator_name: 'llm-judge-toxicity',
    origin_validator: 'toxicity',
    score: 0.0082,
    threshold_validated_result: 'Pass',
    result: {
      data: {
        metric_name: 'llm-judge-toxicity',
        actual_value: 0.0082,
        metric_labels: ['Not Toxic'],
        others: {
          engine: 'llm-judge',
          model: 'gpt-5',
          rubric_version: 'v17',
          severity: 1,
          scoring_path: 'rating_fallback',
          reasoning: 'Benign greeting.',
        },
      },
      status: { code: '200', message: 'success' },
    },
    request_id: 'req_test',
  };

  it('rerouted judge fields reach the caller verbatim', async () => {
    const fetcher = vi.fn(async (...args: [string | URL | Request, RequestInit?]) => {
      void args;
      return jsonResponse(REROUTED);
    });
    const client = new Client({
      projectId: 'proj',
      apiKey: 'key',
      baseUrl: 'https://judge-flag.test',
      fetch: fetcher,
    });

    const resp = (await client.validate(
      new InputValidator({
        slug: InputValidation.Toxicity,
        data: { prompt: 'have a lovely day' },
        config: { threshold: 0.5, llmAsAJudge: true, llmId: 'cllm-1' },
      }),
    )) as typeof REROUTED;

    expect(resp.origin_validator).toBe('toxicity');
    expect(resp.validator_name).toBe('llm-judge-toxicity');
    expect(resp.result.data.others.model).toBe('gpt-5');
    expect(resp.result.data.others.scoring_path).toBe('rating_fallback');
    expect(resp).toEqual(REROUTED);
  });
});
