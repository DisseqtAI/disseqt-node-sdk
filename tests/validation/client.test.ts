import { describe, expect, it, vi } from 'vitest';

import {
  AgenticBehavior,
  AgenticBehaviourRequest,
  Client,
  ClassifyValidator,
  CompositeScoreEvaluator,
  InputValidation,
  InputValidationRequest,
  InputValidator,
  OutputValidation,
  OutputValidator,
  SDKConfigInput,
  ThemesClassifierRequest,
  ValidatorDomain,
  buildValidatorUrl,
} from '../../src/index.js';

const jsonResponse = (body: unknown, init: ResponseInit = {}): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });

describe('buildValidatorUrl', () => {
  it('matches Python URL construction for default validator paths', () => {
    expect(
      buildValidatorUrl(
        'https://test-api.disseqt.ai/',
        ValidatorDomain.InputValidation,
        InputValidation.Toxicity,
        '/api/v1/sdk/validators/{domain}/{validator}',
      ),
    ).toBe('https://test-api.disseqt.ai/api/v1/sdk/validators/input-validation/toxicity');
  });

  it('matches Python URL construction for composite paths', () => {
    expect(
      buildValidatorUrl(
        'https://api.test.com',
        ValidatorDomain.Composite,
        'evaluate',
        '/api/v1/validators/{domain}/{validator}',
      ),
    ).toBe('https://api.test.com/api/v1/validators/composite/evaluate');
  });
});

describe('Client', () => {
  it('builds Python-compatible headers without X-Request-Id', () => {
    const client = new Client({
      projectId: 'test_project_123',
      apiKey: 'test_key_xyz',
    });

    expect(client._buildHeaders()).toEqual({
      'X-API-Key': 'test_key_xyz',
      'X-Project-Id': 'test_project_123',
      'Content-Type': 'application/json',
    });
    expect(client._buildHeaders()).not.toHaveProperty('X-Request-Id');
  });

  it('validates a Python-style validator instance', async () => {
    const fetcher = vi.fn(async (...args: [string | URL | Request, RequestInit?]) => {
      void args;
      return jsonResponse({ data: {}, status: { code: '200' } });
    });
    const client = new Client({
      projectId: 'test_project_123',
      apiKey: 'test_key_xyz',
      baseUrl: 'https://test-api.disseqt.ai',
      fetch: fetcher,
    });
    const validator = new InputValidator({
      slug: InputValidation.Toxicity,
      data: new InputValidationRequest({
        prompt: 'What do you think about politics?',
        context: 'This is a political discussion',
        response: 'I think politics is complex',
      }),
      config: new SDKConfigInput({
        threshold: 0.8,
        customLabels: ['Low', 'Medium', 'High'],
        labelThresholds: [0.3, 0.7],
      }),
    });

    const result = await client.validate(validator);

    expect(result).toEqual({ data: {}, status: { code: '200' } });
    expect(fetcher).toHaveBeenCalledWith(
      'https://test-api.disseqt.ai/api/v1/sdk/validators/input-validation/toxicity',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'X-API-Key': 'test_key_xyz',
          'X-Project-Id': 'test_project_123',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          input_data: {
            llm_input_query: 'What do you think about politics?',
            llm_input_context: 'This is a political discussion',
            llm_output: 'I think politics is complex',
          },
          config_input: {
            threshold: 0.8,
            custom_labels: ['Low', 'Medium', 'High'],
            label_thresholds: [0.3, 0.7],
          },
        }),
      }),
    );
  });

  it('validates generic request objects for standard validators', async () => {
    const fetcher = vi.fn(async (...args: [string | URL | Request, RequestInit?]) => {
      void args;
      return jsonResponse({ ok: true });
    });
    const client = new Client({
      projectId: 'project',
      apiKey: 'key',
      baseUrl: 'https://test-api.disseqt.ai',
      fetch: fetcher,
    });

    await client.validate({
      domain: ValidatorDomain.OutputValidation,
      slug: OutputValidation.FactualConsistency,
      data: { llm_output: 'The Eiffel Tower was built in 1889.' },
      config: { threshold: 0.6 },
    });

    expect(fetcher.mock.calls[0]?.[0]).toBe(
      'https://test-api.disseqt.ai/api/v1/sdk/validators/output-validation/factual-consistency',
    );
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({
      input_data: {
        llm_output: 'The Eiffel Tower was built in 1889.',
      },
      config_input: {
        threshold: 0.6,
      },
    });
  });

  it('uses the composite path and payload shape without config_input', async () => {
    const fetcher = vi.fn(async (...args: [string | URL | Request, RequestInit?]) => {
      void args;
      return jsonResponse({
        overall_confidence: { score: 0.85, label: 'High Confidence' },
        success: true,
      });
    });
    const client = new Client({
      projectId: 'test_project',
      apiKey: 'test_key',
      baseUrl: 'https://api.test.com',
      fetch: fetcher,
    });

    const result = await client.validate(
      new CompositeScoreEvaluator({
        data: {
          llm_input_query: 'Test query',
          llm_output: 'Test output',
        },
      }),
    );

    expect(result).toEqual({
      overall_confidence: { score: 0.85, label: 'High Confidence' },
      success: true,
    });
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      'https://api.test.com/api/v1/validators/composite/evaluate',
    );
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({
      input_data: {
        llm_input_query: 'Test query',
        llm_output: 'Test output',
      },
      options: {
        evaluation_mode: 'binary_threshold',
      },
    });
  });

  it('uses the themes classifier direct payload shape without config_input', async () => {
    const fetcher = vi.fn(async (...args: [string | URL | Request, RequestInit?]) => {
      void args;
      return jsonResponse({ themes: ['security'], confidence: 0.9 });
    });
    const client = new Client({
      projectId: 'test_project',
      apiKey: 'test_key',
      baseUrl: 'https://api.test.com',
      fetch: fetcher,
    });

    await client.validate(
      new ClassifyValidator({
        data: new ThemesClassifierRequest({
          text: 'This is about security testing.',
          returnSubthemes: false,
          maxThemes: 5,
        }),
      }),
    );

    expect(fetcher.mock.calls[0]?.[0]).toBe(
      'https://api.test.com/api/v1/sdk/validators/themes-classifier/classify',
    );
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({
      text: 'This is about security testing.',
      return_subthemes: false,
      max_themes: 5,
    });
  });

  it('constructs paths for all standard validator domains', async () => {
    const urls: string[] = [];
    const fetcher = vi.fn(async (...args: [string | URL | Request, RequestInit?]) => {
      urls.push(String(args[0]));
      return jsonResponse({ ok: true });
    });
    const client = new Client({
      projectId: 'project',
      apiKey: 'key',
      baseUrl: 'https://test-api.disseqt.ai',
      fetch: fetcher,
    });

    await client.validate(
      new OutputValidator({
        slug: OutputValidation.FactualConsistency,
        data: { response: 'Output' },
        config: { threshold: 0.5 },
      }),
    );
    await client.validate({
      domain: ValidatorDomain.AgenticBehavior,
      slug: AgenticBehavior.TopicAdherence,
      data: new AgenticBehaviourRequest({
        conversationHistory: ['user: Hello', 'agent: Hi there'],
      }),
      config: { threshold: 0.5 },
    });

    expect(urls).toEqual([
      'https://test-api.disseqt.ai/api/v1/sdk/validators/output-validation/factual-consistency',
      'https://test-api.disseqt.ai/api/v1/sdk/validators/agentic-behavior/topic-adherence',
    ]);
  });

  it('raises if a standard generic request omits config', async () => {
    const client = new Client({
      projectId: 'project',
      apiKey: 'key',
      fetch: vi.fn(),
    });

    await expect(
      client.validate({
        domain: ValidatorDomain.InputValidation,
        slug: InputValidation.Toxicity,
        data: { llm_input_query: 'Test' },
      }),
    ).rejects.toMatchObject({
      name: 'ValueError',
      message: 'config is required for standard validators',
    });
  });
});
