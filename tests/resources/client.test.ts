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
    expect(lastCall(fetcher)[0]).toContain('/api/v1/rag-integrations');
    await client.mcpTargets.list();
    expect(lastCall(fetcher)[0]).toContain('/api/v1/mcp-integrations');
    await client.vulnerabilities.list();
    expect(lastCall(fetcher)[0]).toContain('/api/v1/vulnerabilities');
    await client.mr.list();
    expect(lastCall(fetcher)[0]).toContain('/api/v1/mr');
  });
});
