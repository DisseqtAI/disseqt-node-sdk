import { describe, expect, it, vi } from 'vitest';

import { DisseqtResourceClient, RESOURCES_DEFAULT_BASE_URL } from '../../src/index.js';

const okJson = (body: unknown = { ok: true }, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const okEmpty = (): Response => new Response(null, { status: 204 });

const makeClient = (respond: (url: string, init?: RequestInit) => Response = () => okJson()) => {
  const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) =>
    respond(String(input), init),
  );
  const client = new DisseqtResourceClient({
    projectId: 'proj_1',
    apiKey: 'key_1',
    fetch: fetcher,
  });
  return { client, fetcher };
};

const lastCall = (fetcher: ReturnType<typeof vi.fn>) => {
  const call = fetcher.mock.calls.at(-1);
  if (call === undefined) throw new Error('fetch not called');
  return call as [string, RequestInit?];
};

describe('DisseqtResourceClient', () => {
  it('mounts every resource client', () => {
    const { client } = makeClient();
    expect(client.baseUrl).toBe(RESOURCES_DEFAULT_BASE_URL);
    expect(client.targets).toBeDefined();
    expect(client.packs).toBeDefined();
    expect(client.runs).toBeDefined();
    expect(client.validations).toBeDefined();
    expect(client.ragValidations).toBeDefined();
    expect(client.sessions).toBeDefined();
    expect(client.customValidators).toBeDefined();
    expect(client.ragTargets).toBeDefined();
    expect(client.mcpTargets).toBeDefined();
    expect(client.vulnerabilities).toBeDefined();
    expect(client.mr).toBeDefined();
    expect(client.plans).toBeDefined();
    expect(client.planRuns).toBeDefined();
  });

  it('sends X-API-Key + X-Project-Id headers', async () => {
    const { client, fetcher } = makeClient();
    await client.targets.list();
    const [, init] = lastCall(fetcher);
    const headers = init?.headers as Record<string, string>;
    expect(headers['X-API-Key']).toBe('key_1');
    expect(headers['X-Project-Id']).toBe('proj_1');
  });
});

describe('TargetsClient', () => {
  it('lists at /api/v1/llm/app-integrations', async () => {
    const { client, fetcher } = makeClient();
    await client.targets.list();
    expect(lastCall(fetcher)[0]).toBe(`${RESOURCES_DEFAULT_BASE_URL}/api/v1/llm/app-integrations`);
    expect(lastCall(fetcher)[1]?.method).toBe('GET');
  });

  it('gets a single target by id', async () => {
    const { client, fetcher } = makeClient();
    await client.targets.get('t1');
    expect(lastCall(fetcher)[0]).toBe(
      `${RESOURCES_DEFAULT_BASE_URL}/api/v1/llm/app-integrations/t1`,
    );
  });

  it('creates with POST body', async () => {
    const { client, fetcher } = makeClient();
    await client.targets.create({ name: 'x' });
    const [url, init] = lastCall(fetcher);
    expect(url).toBe(`${RESOURCES_DEFAULT_BASE_URL}/api/v1/llm/app-integrations`);
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({ name: 'x' });
  });

  it('patches with update', async () => {
    const { client, fetcher } = makeClient();
    await client.targets.update('t1', { name: 'y' });
    expect(lastCall(fetcher)[1]?.method).toBe('PATCH');
  });

  it('deletes and handles 204', async () => {
    const { client } = makeClient(() => okEmpty());
    const res = await client.targets.delete('t1');
    expect(res).toEqual({ status: 'deleted' });
  });

  it('hits test-connection and parse-curl', async () => {
    const { client, fetcher } = makeClient();
    await client.targets.testConnection({ curl: 'x' });
    expect(lastCall(fetcher)[0]).toContain('/test-connection');
    await client.targets.parseCurl({ curl: 'x' });
    expect(lastCall(fetcher)[0]).toContain('/parse-curl');
  });
});

describe('PacksClient', () => {
  it('CRUD hits /api/v1/prompt-packs', async () => {
    const { client, fetcher } = makeClient();
    await client.packs.list();
    expect(lastCall(fetcher)[0]).toBe(`${RESOURCES_DEFAULT_BASE_URL}/api/v1/prompt-packs`);
    await client.packs.get('p1');
    expect(lastCall(fetcher)[0]).toContain('/prompt-packs/p1');
    await client.packs.publish('p1');
    expect(lastCall(fetcher)[0]).toContain('/prompt-packs/p1/publish');
  });
});

describe('RunsClient', () => {
  it('create nests under packId', async () => {
    const { client, fetcher } = makeClient();
    await client.runs.create('p1', { target_id: 't1' });
    expect(lastCall(fetcher)[0]).toBe(`${RESOURCES_DEFAULT_BASE_URL}/api/v1/prompt-packs/p1/runs`);
  });

  it('get/cancel/report key off runId', async () => {
    const { client, fetcher } = makeClient();
    await client.runs.get('r1');
    expect(lastCall(fetcher)[0]).toContain('/prompt-packs/runs/r1');
    await client.runs.cancel('r1');
    expect(lastCall(fetcher)[0]).toContain('/runs/r1/cancel');
    await client.runs.report('r1');
    expect(lastCall(fetcher)[0]).toContain('/runs/r1/report');
  });
});

describe('ValidationsClient', () => {
  it('create routes under run, others under output-validations', async () => {
    const { client, fetcher } = makeClient();
    await client.validations.create('r1', { validator: 'x' });
    expect(lastCall(fetcher)[0]).toContain('/prompt-packs/runs/r1/validate-outputs');
    await client.validations.get('v1');
    expect(lastCall(fetcher)[0]).toContain('/output-validations/v1');
    await client.validations.cancel('v1');
    expect(lastCall(fetcher)[0]).toContain('/output-validations/v1/cancel');
  });
});

describe('RagValidationsClient', () => {
  it('creates against a run and gets by id', async () => {
    const { client, fetcher } = makeClient();
    await client.ragValidations.create('r1', {});
    expect(lastCall(fetcher)[0]).toContain('/prompt-packs/runs/r1/rag-validate');
    await client.ragValidations.get('rv1');
    expect(lastCall(fetcher)[0]).toContain('/rag-validations/rv1');
  });
});

describe('SessionsClient', () => {
  it('routes sessions vs runs correctly', async () => {
    const { client, fetcher } = makeClient();
    await client.sessions.list();
    expect(lastCall(fetcher)[0]).toContain('/testing/sessions');
    await client.sessions.getRun('r1');
    expect(lastCall(fetcher)[0]).toContain('/testing/runs/r1');
    await client.sessions.runBreaches('r1');
    expect(lastCall(fetcher)[0]).toContain('/testing/runs/r1/results/breaches');
  });
});

describe('CustomValidatorsClient', () => {
  it('CRUD under /api/v1/llm/custom-validators', async () => {
    const { client, fetcher } = makeClient();
    await client.customValidators.list();
    expect(lastCall(fetcher)[0]).toContain('/llm/custom-validators');
    await client.customValidators.create({ name: 'v' });
    expect(lastCall(fetcher)[1]?.method).toBe('POST');
    await client.customValidators.testConnection({ url: 'x' });
    expect(lastCall(fetcher)[0]).toContain('/custom-validators/test-connection');
  });
});

describe('Bonus resource clients', () => {
  it('rag/mcp/vulnerabilities/mr hit expected roots', async () => {
    const { client, fetcher } = makeClient();
    await client.ragTargets.list();
    expect(lastCall(fetcher)[0]).toContain('/api/v1/llm/rag-integrations');
    await client.mcpTargets.list();
    expect(lastCall(fetcher)[0]).toContain('/api/v1/llm/mcp-integrations');
    await client.vulnerabilities.list();
    expect(lastCall(fetcher)[0]).toContain('/api/v1/vulnerabilities');
    await client.mr.list();
    expect(lastCall(fetcher)[0]).toContain('/api/v1/mr');
  });
});

describe('PlansClient', () => {
  it('list hits /api/v1/test-plans', async () => {
    const { client, fetcher } = makeClient();
    await client.plans.list();
    expect(lastCall(fetcher)[0]).toBe(`${RESOURCES_DEFAULT_BASE_URL}/api/v1/test-plans`);
  });
  it('gallery + list-deleted + options', async () => {
    const { client, fetcher } = makeClient();
    await client.plans.gallery();
    expect(lastCall(fetcher)[0]).toContain('/api/v1/test-plans/gallery');
    await client.plans.listDeleted();
    expect(lastCall(fetcher)[0]).toContain('/api/v1/test-plans/deleted');
    await client.plans.options('categories');
    expect(lastCall(fetcher)[0]).toContain('/api/v1/test-plans/options/categories');
  });
  it('get / summary / update / delete / restore / copy', async () => {
    const { client, fetcher } = makeClient();
    await client.plans.get('p1');
    expect(lastCall(fetcher)[0]).toContain('/api/v1/test-plans/p1');
    await client.plans.summary('p1');
    expect(lastCall(fetcher)[0]).toContain('/api/v1/test-plans/p1/summary');
    await client.plans.update('p1', { name: 'n' });
    expect(lastCall(fetcher)[1]?.method).toBe('PATCH');
    await client.plans.delete('p1');
    expect(lastCall(fetcher)[1]?.method).toBe('DELETE');
    await client.plans.restore('p1');
    expect(lastCall(fetcher)[0]).toContain('/api/v1/test-plans/p1/restore');
    await client.plans.copy('p1');
    expect(lastCall(fetcher)[0]).toContain('/api/v1/test-plans/p1/copy');
  });
  it('versions + create-version + publish + generate-inputs', async () => {
    const { client, fetcher } = makeClient();
    await client.plans.listVersions('p1');
    expect(lastCall(fetcher)[0]).toContain('/api/v1/test-plans/p1/versions');
    await client.plans.createVersion('p1', { recipe: {} });
    expect(lastCall(fetcher)[1]?.method).toBe('POST');
    await client.plans.publish('p1', {
      sharing_scope: 'PROJECT',
      expected_sharing_scope: 'PRIVATE',
    });
    expect(lastCall(fetcher)[0]).toContain('/api/v1/test-plans/p1/publish');
    await client.plans.generateInputs({
      app_description: 'x'.repeat(20),
      subcategories: ['a'],
      organization_id: 'o',
    });
    expect(lastCall(fetcher)[0]).toContain('/api/v1/test-plans/generate-inputs');
    await client.plans.getGenerateInputsJob('j1');
    expect(lastCall(fetcher)[0]).toContain('/api/v1/test-plans/generate-inputs/j1');
  });
});

describe('PlanRunsClient', () => {
  it('create is plan-scoped, get is run-scoped', async () => {
    const { client, fetcher } = makeClient();
    await client.planRuns.create('p1', {
      target: { execution_mode: 'app_integration', app_integration_id: 'a1' },
    });
    expect(lastCall(fetcher)[0]).toContain('/api/v1/test-plans/p1/runs');
    await client.planRuns.listForPlan('p1');
    expect(lastCall(fetcher)[0]).toContain('/api/v1/test-plans/p1/runs');
    await client.planRuns.listDeleted();
    expect(lastCall(fetcher)[0]).toContain('/api/v1/test-plan-runs/deleted');
    await client.planRuns.get('r1');
    expect(lastCall(fetcher)[0]).toBe(`${RESOURCES_DEFAULT_BASE_URL}/api/v1/test-plan-runs/r1`);
  });
  it('stage / trace / report / prompts', async () => {
    const { client, fetcher } = makeClient();
    await client.planRuns.getStage('r1', 'baseline');
    expect(lastCall(fetcher)[0]).toContain('/api/v1/test-plan-runs/r1/stages/baseline');
    await client.planRuns.trace('r1', 'pr1');
    expect(lastCall(fetcher)[0]).toContain('prompt_ref=pr1');
    await client.planRuns.report('r1', { stage_key: 'baseline' });
    expect(lastCall(fetcher)[0]).toContain('/api/v1/test-plan-runs/r1/report');
    await client.planRuns.prompts('r1');
    expect(lastCall(fetcher)[0]).toContain('/api/v1/test-plan-runs/r1/prompts');
  });
  it('cancel / delete / restore / reveal', async () => {
    const { client, fetcher } = makeClient();
    await client.planRuns.cancel('r1');
    expect(lastCall(fetcher)[0]).toContain('/api/v1/test-plan-runs/r1/cancel');
    await client.planRuns.delete('r1');
    expect(lastCall(fetcher)[1]?.method).toBe('DELETE');
    await client.planRuns.restore('r1');
    expect(lastCall(fetcher)[0]).toContain('/api/v1/test-plan-runs/r1/restore');
    await client.planRuns.reveal('r1', 'res1');
    expect(lastCall(fetcher)[0]).toContain('/api/v1/test-plan-runs/r1/results/res1/reveal');
  });
});
