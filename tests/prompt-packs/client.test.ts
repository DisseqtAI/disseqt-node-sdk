import { describe, expect, it, vi } from 'vitest';

import {
  DisseqtAPIClient,
  DisseqtHttpError,
  GeneratePromptPackRequest,
  MetricEvaluation,
  OutputValidationMetric,
  PaginationParams,
  PROMPT_PACKS_DEFAULT_BASE_URL,
  PROMPT_PACKS_PATH_PREFIX,
  PromptPackCategory,
  PromptPackOutputValidationCategory,
  PromptPackOutputValidationRequest,
} from '../../src/index.js';

const PREFIX = `${PROMPT_PACKS_DEFAULT_BASE_URL}${PROMPT_PACKS_PATH_PREFIX}`;

const jsonResponse = (body: unknown, init: ResponseInit = {}): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });

const createClient = () => {
  const fetcher = vi.fn(async (...args: [string | URL | Request, RequestInit?]) => {
    void args;
    return jsonResponse({ ok: true });
  });
  const client = new DisseqtAPIClient({
    projectId: 'test_project_123',
    apiKey: 'test_key_xyz',
    baseUrl: PROMPT_PACKS_DEFAULT_BASE_URL,
    timeout: 10,
    fetch: fetcher,
  });

  return { client, fetcher };
};

const lastCall = (fetcher: ReturnType<typeof vi.fn>) => {
  const call = fetcher.mock.calls.at(-1);
  if (call === undefined) {
    throw new Error('fetch was not called');
  }
  return call as [string | URL | Request, RequestInit?];
};

const lastUrl = (fetcher: ReturnType<typeof vi.fn>) => String(lastCall(fetcher)[0]);
const lastBody = (fetcher: ReturnType<typeof vi.fn>) =>
  JSON.parse(String(lastCall(fetcher)[1]?.body));

describe('DisseqtAPIClient construction', () => {
  it('strips trailing slash from baseUrl and composes URLs via the path prefix', () => {
    const client = new DisseqtAPIClient({
      projectId: 'p',
      apiKey: 'k',
      baseUrl: `${PROMPT_PACKS_DEFAULT_BASE_URL}/`,
    });

    expect(client.baseUrl).toBe(PROMPT_PACKS_DEFAULT_BASE_URL);
    expect(client.timeoutMs).toBe(30_000);
    expect(client._url('/generate')).toBe(`${PREFIX}/generate`);
  });

  it('builds Python-compatible headers without X-Request-Id', () => {
    const { client } = createClient();

    expect(client._buildHeaders()).toEqual({
      'X-API-Key': 'test_key_xyz',
      'X-Project-Id': 'test_project_123',
      'Content-Type': 'application/json',
    });
    expect(client._buildHeaders()).not.toHaveProperty('X-Request-Id');
  });
});

describe('Prompt Packs generation and download', () => {
  it('generates prompt packs with the Python request payload', async () => {
    const { client, fetcher } = createClient();
    const request = new GeneratePromptPackRequest({
      pack_name: 'Security Pack',
      pack_short_desc: 'AI-generated prompts for security testing',
      author: 'AI Generator',
      domain: 'Security',
      generation_type: 'AI',
      categories: [
        new PromptPackCategory({
          main_category: 'reliability_and_safety',
          subcategory: 'hate_speech',
          prompts_count: 5,
        }),
      ],
    });

    await client.generate_prompt_pack(request);

    expect(lastUrl(fetcher)).toBe(`${PREFIX}/generate`);
    expect(lastCall(fetcher)[1]).toEqual(
      expect.objectContaining({
        method: 'POST',
        headers: {
          'X-API-Key': 'test_key_xyz',
          'X-Project-Id': 'test_project_123',
          'Content-Type': 'application/json',
        },
      }),
    );
    expect(lastBody(fetcher)).toEqual({
      pack_name: 'Security Pack',
      pack_short_desc: 'AI-generated prompts for security testing',
      author: 'AI Generator',
      domain: 'Security',
      generation_type: 'AI',
      categories: [
        {
          main_category: 'reliability_and_safety',
          subcategory: 'hate_speech',
          prompts_count: 5,
        },
      ],
    });
  });

  it('downloads CSV strings without sending Content-Type', async () => {
    const fetcher = vi.fn(async (...args: [string | URL | Request, RequestInit?]) => {
      void args;
      return new Response('prompt_text,category\nTest,safety', {
        status: 200,
        headers: { 'Content-Type': 'text/csv' },
      });
    });
    const client = new DisseqtAPIClient({
      projectId: 'project',
      apiKey: 'key',
      fetch: fetcher,
    });

    await expect(client.download_pack_csv('pack-export-123')).resolves.toBe(
      'prompt_text,category\nTest,safety',
    );
    expect(lastUrl(fetcher)).toBe(`${PREFIX}/pack-export-123/download`);
    expect(lastCall(fetcher)[1]?.headers).toEqual({
      'X-API-Key': 'key',
      'X-Project-Id': 'project',
    });
  });

  it('returns JSON objects for JSON download responses', async () => {
    const fetcher = vi.fn(async (...args: [string | URL | Request, RequestInit?]) => {
      void args;
      return jsonResponse({ download_url: 'https://example.com/pack.csv' });
    });
    const client = new DisseqtAPIClient({
      projectId: 'project',
      apiKey: 'key',
      fetch: fetcher,
    });

    await expect(client.downloadPackCsv('pack-export-123')).resolves.toEqual({
      download_url: 'https://example.com/pack.csv',
    });
  });

  it('raises the Python-specific download error message on non-2xx CSV downloads', async () => {
    const fetcher = vi.fn(async (...args: [string | URL | Request, RequestInit?]) => {
      void args;
      return new Response('Pack not found', { status: 404 });
    });
    const client = new DisseqtAPIClient({
      projectId: 'project',
      apiKey: 'key',
      fetch: fetcher,
    });

    await expect(client.download_pack_csv('missing')).rejects.toMatchObject({
      name: 'DisseqtHttpError',
      statusCode: 404,
      message: 'HTTP 404: Download pack CSV failed',
      responseBody: 'Pack not found',
    });
  });
});

describe('Prompt Packs runs', () => {
  it('creates, lists, gets, deletes, and reads outputs for runs', async () => {
    const { client, fetcher } = createClient();

    await client.create_run('pack-abc-123', {
      run_name: 'Test Run',
      run_type: 'evaluation',
      api_key: 'llm-api-key',
      model_name: 'gpt-4',
      provider: 'openai',
    });
    expect(lastUrl(fetcher)).toBe(`${PREFIX}/pack-abc-123/runs`);
    expect(lastBody(fetcher)).toEqual({
      run_name: 'Test Run',
      run_type: 'evaluation',
      api_key: 'llm-api-key',
      model_name: 'gpt-4',
      provider: 'openai',
    });

    await client.listRuns('pack-abc-123', new PaginationParams({ limit: 25, offset: 50 }));
    expect(lastUrl(fetcher)).toBe(`${PREFIX}/pack-abc-123/runs?limit=25&offset=50`);

    await client.get_run('run-xyz-456', { include_outputs: false });
    expect(lastUrl(fetcher)).toBe(
      `${PREFIX}/runs/run-xyz-456?limit=10&offset=0&include_outputs=false`,
    );

    await client.getRunOutputs('run-xyz-456');
    expect(lastUrl(fetcher)).toBe(`${PREFIX}/runs/run-xyz-456/outputs?limit=10&offset=0`);

    await client.get_run_outputs_csv('run-xyz-456');
    expect(lastUrl(fetcher)).toBe(`${PREFIX}/runs/run-xyz-456/outputs/csv`);

    const deleteFetcher = vi.fn(async (...args: [string | URL | Request, RequestInit?]) => {
      void args;
      return new Response(null, { status: 204 });
    });
    const deleteClient = new DisseqtAPIClient({
      projectId: 'project',
      apiKey: 'key',
      fetch: deleteFetcher,
    });
    await expect(deleteClient.deleteRun('run-xyz-456')).resolves.toEqual({
      status: 'deleted',
    });
  });
});

describe('Prompt Packs output validations', () => {
  it('covers output validation lifecycle endpoints', async () => {
    const { client, fetcher } = createClient();
    const validationRequest = new PromptPackOutputValidationRequest({
      prompt_pack_output_validation_run_name: 'SDK Test Validation',
      metric_evaluations: [
        new MetricEvaluation({
          metric_name: OutputValidationMetric.HateSpeech,
          category: PromptPackOutputValidationCategory.OutputValidation,
        }),
        new MetricEvaluation({
          metric_name: OutputValidationMetric.Toxicity,
          category: PromptPackOutputValidationCategory.OutputValidation,
        }),
      ],
    });

    await client.create_output_validation('run-xyz-456', validationRequest);
    expect(lastUrl(fetcher)).toBe(`${PREFIX}/runs/run-xyz-456/validate-outputs`);
    expect(lastBody(fetcher)).toEqual({
      prompt_pack_output_validation_run_name: 'SDK Test Validation',
      metric_evaluations: [
        { metric_name: 'hate-speech', category: 'output-validation' },
        { metric_name: 'toxicity', category: 'output-validation' },
      ],
    });

    await client.list_run_output_validations('run-xyz-456');
    expect(lastUrl(fetcher)).toBe(`${PREFIX}/runs/run-xyz-456/output-validations`);

    await client.getOutputValidation('val-def-789');
    expect(lastUrl(fetcher)).toBe(`${PREFIX}/output-validations/val-def-789`);

    await client.get_output_validation_summary('val-def-789');
    expect(lastUrl(fetcher)).toBe(`${PREFIX}/output-validations/val-def-789/summary`);

    await client.get_output_validation_results('val-def-789', { limit: 5, offset: 10 });
    expect(lastUrl(fetcher)).toBe(
      `${PREFIX}/output-validations/val-def-789/results?limit=5&offset=10`,
    );

    await client.get_output_validation_grouped_outputs('val-def-789');
    expect(lastUrl(fetcher)).toBe(
      `${PREFIX}/output-validations/val-def-789/outputs/grouped?limit=10&offset=0`,
    );

    await client.get_output_validation_results_csv('val-def-789');
    expect(lastUrl(fetcher)).toBe(`${PREFIX}/output-validations/val-def-789/results/csv`);

    await client.list_pack_output_validations('pack-abc-123');
    expect(lastUrl(fetcher)).toBe(`${PREFIX}/pack-abc-123/output-validations?limit=10&offset=0`);
  });

  it('supports deprecated output validation request payloads', async () => {
    const { client, fetcher } = createClient();

    await client.createOutputValidation('run-xyz-456', {
      validation_type: 'automated',
      metrics: ['toxicity', 'bias'],
    });

    expect(lastBody(fetcher)).toEqual({
      prompt_pack_output_validation_run_name: 'automated',
      metric_evaluations: [
        { metric_name: 'toxicity', category: 'output-validation' },
        { metric_name: 'bias', category: 'output-validation' },
      ],
    });
  });
});

describe('Prompt Packs errors', () => {
  it('uses shared HTTP and JSON error behavior', async () => {
    const badRequestClient = new DisseqtAPIClient({
      projectId: 'project',
      apiKey: 'key',
      fetch: vi.fn(async () => new Response('Bad Request', { status: 400 })),
    });
    const invalidJsonClient = new DisseqtAPIClient({
      projectId: 'project',
      apiKey: 'key',
      fetch: vi.fn(async () => new Response('Not JSON', { status: 200 })),
    });
    const networkClient = new DisseqtAPIClient({
      projectId: 'project',
      apiKey: 'key',
      fetch: vi.fn(async () => {
        throw new Error('Connection refused');
      }),
    });

    await expect(
      badRequestClient.generatePromptPack({
        pack_name: 'Pack',
        pack_short_desc: 'Desc',
        author: 'Author',
        domain: 'Security',
        generation_type: 'AI',
        categories: [],
      }),
    ).rejects.toMatchObject({
      name: 'DisseqtHttpError',
      statusCode: 400,
      responseBody: 'Bad Request',
    });

    await expect(invalidJsonClient.list_runs('pack-abc-123')).rejects.toMatchObject({
      name: 'DisseqtJsonError',
      responseText: 'Not JSON',
    });

    await expect(networkClient.list_runs('pack-abc-123')).rejects.toMatchObject({
      name: 'DisseqtHttpError',
      statusCode: 0,
      message: 'HTTP 0: Network error: Connection refused',
    });
  });

  it('truncates long error bodies to 512 characters', async () => {
    const client = new DisseqtAPIClient({
      projectId: 'project',
      apiKey: 'key',
      fetch: vi.fn(async () => new Response('X'.repeat(1000), { status: 500 })),
    });

    await expect(client.list_runs('pack-abc-123')).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(DisseqtHttpError);
      expect((error as DisseqtHttpError).responseBody).toBe('X'.repeat(512));
      return true;
    });
  });
});
