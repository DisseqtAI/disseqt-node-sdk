import { describe, expect, it, vi } from 'vitest';

import { DisseqtResourceClient, RESOURCES_DEFAULT_BASE_URL } from '../../src/index.js';

const okJson = (body: unknown = { ok: true }, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

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

const BASE = RESOURCES_DEFAULT_BASE_URL;

describe('RedteamClient — catalog', () => {
  it('lists single-turn techniques', async () => {
    const { client, fetcher } = makeClient();
    await client.redteam.listSingleTurnTechniques();
    expect(lastCall(fetcher)[0]).toBe(`${BASE}/api/v1/testing/attack-techniques`);
    expect(lastCall(fetcher)[1]?.method).toBe('GET');
  });

  it('lists multi-turn techniques', async () => {
    const { client, fetcher } = makeClient();
    await client.redteam.listMultiTurnTechniques();
    expect(lastCall(fetcher)[0]).toBe(`${BASE}/api/v1/mr-jailbreak/techniques`);
  });

  // Backend requires page_id + kebab-case page-size (jailbreak_agents_handlers.go:52-54).
  it('lists agents with the required paging params', async () => {
    const { client, fetcher } = makeClient();
    await client.redteam.listAgents();
    expect(lastCall(fetcher)[0]).toBe(`${BASE}/api/v1/mr-jailbreak/agents?page_id=1&page-size=100`);
    await client.redteam.listAgents({ page_id: 2, 'page-size': 5, attack_type: 'jailbreak' });
    expect(lastCall(fetcher)[0]).toBe(
      `${BASE}/api/v1/mr-jailbreak/agents?page_id=2&page-size=5&attack_type=jailbreak`,
    );
  });

  it('list-attacks kind=all fetches three endpoints', async () => {
    const { client, fetcher } = makeClient();
    await client.redteam.listAttacks('all');
    const urls = fetcher.mock.calls.map((c) => String(c[0]));
    expect(urls).toContain(`${BASE}/api/v1/testing/attack-techniques`);
    expect(urls).toContain(`${BASE}/api/v1/mr-jailbreak/techniques`);
    expect(urls).toContain(`${BASE}/api/v1/mr-jailbreak/agents?page_id=1&page-size=100`);
  });

  it('list-attacks kind=single hits only single-turn', async () => {
    const { client, fetcher } = makeClient();
    await client.redteam.listAttacks('single');
    expect(fetcher.mock.calls).toHaveLength(1);
    expect(lastCall(fetcher)[0]).toBe(`${BASE}/api/v1/testing/attack-techniques`);
  });

  it('list-attacks kind=agents hits only agents', async () => {
    const { client, fetcher } = makeClient();
    await client.redteam.listAttacks('agents');
    expect(fetcher.mock.calls).toHaveLength(1);
    expect(lastCall(fetcher)[0]).toBe(`${BASE}/api/v1/mr-jailbreak/agents?page_id=1&page-size=100`);
  });
});

describe('RedteamClient — sessions and runs', () => {
  it('createSession POSTs to /testing/sessions with body', async () => {
    const { client, fetcher } = makeClient();
    await client.redteam.createSession({ target: 't1' });
    const [url, init] = lastCall(fetcher);
    expect(url).toBe(`${BASE}/api/v1/testing/sessions`);
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({ target: 't1' });
  });

  it('listSessions GETs the collection', async () => {
    const { client, fetcher } = makeClient();
    await client.redteam.listSessions();
    expect(lastCall(fetcher)[0]).toBe(`${BASE}/api/v1/testing/sessions`);
  });

  it('getSession GETs the resource', async () => {
    const { client, fetcher } = makeClient();
    await client.redteam.getSession('s1');
    expect(lastCall(fetcher)[0]).toBe(`${BASE}/api/v1/testing/sessions/s1`);
  });

  it('createRun POSTs under sessions/{id}/runs', async () => {
    const { client, fetcher } = makeClient();
    await client.redteam.createRun('s1', { technique: 'jb-1', prompt: 'hi' });
    const [url, init] = lastCall(fetcher);
    expect(url).toBe(`${BASE}/api/v1/testing/sessions/s1/runs`);
    expect(init?.method).toBe('POST');
  });

  it('getRun / getRunResults / cancelRun target testing runs', async () => {
    const { client, fetcher } = makeClient();
    await client.redteam.getRun('r1');
    expect(lastCall(fetcher)[0]).toBe(`${BASE}/api/v1/testing/runs/r1`);
    await client.redteam.getRunResults('r1');
    expect(lastCall(fetcher)[0]).toBe(`${BASE}/api/v1/testing/runs/r1/results`);
    await client.redteam.cancelRun('r1');
    expect(lastCall(fetcher)[0]).toBe(`${BASE}/api/v1/testing/runs/r1/cancel`);
    expect(lastCall(fetcher)[1]?.method).toBe('POST');
  });
});

describe('RedteamClient — multi-turn', () => {
  it('batchAutomate POSTs to mr-jailbreak', async () => {
    const { client, fetcher } = makeClient();
    await client.redteam.batchAutomate({ technique: 'x', target: 't', objective: 'obj' });
    expect(lastCall(fetcher)[0]).toBe(`${BASE}/api/v1/mr-jailbreak/batch-automate`);
    expect(lastCall(fetcher)[1]?.method).toBe('POST');
  });

  it('mr job/interactions GETs', async () => {
    const { client, fetcher } = makeClient();
    await client.redteam.getMrJob('j1');
    expect(lastCall(fetcher)[0]).toBe(`${BASE}/api/v1/mr-jailbreak/jobs/j1`);
    await client.redteam.getMrJobInteractions('j1');
    expect(lastCall(fetcher)[0]).toBe(`${BASE}/api/v1/mr-jailbreak/jobs/j1/interactions`);
  });
});

describe('RedteamClient — validate', () => {
  it('validate POSTs the standard body shape', async () => {
    const { client, fetcher } = makeClient();
    await client.redteam.validate({
      input: 'prompt',
      output: 'response',
      validators: ['toxicity'],
      input_context: '',
      threshold: 0.5,
    });
    const [url, init] = lastCall(fetcher);
    expect(url).toBe(`${BASE}/api/v1/testing/validate`);
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({
      input: 'prompt',
      output: 'response',
      validators: ['toxicity'],
      input_context: '',
      threshold: 0.5,
    });
  });
});

describe('RedteamClient — analytics + bot', () => {
  // G3 regression: /analytics/ prefixes only /analytics/summary. The
  // prompts-stats endpoint sits at the bare /prompts-stats path
  // (jailbreak_routes.go:57).
  it('analyticsSummary hits /analytics/summary; analyticsPromptsStats hits /prompts-stats', async () => {
    const { client, fetcher } = makeClient();
    await client.redteam.analyticsSummary();
    expect(lastCall(fetcher)[0]).toBe(`${BASE}/api/v1/jailbreak/analytics/summary`);
    await client.redteam.analyticsPromptsStats();
    expect(lastCall(fetcher)[0]).toBe(`${BASE}/api/v1/jailbreak/prompts-stats`);
    expect(lastCall(fetcher)[1]?.method).toBe('GET');
  });

  it('recommend/parseCurl/testConnection POST under /testing/bot', async () => {
    const { client, fetcher } = makeClient();
    await client.redteam.recommend('packs', { context: 'x' });
    expect(lastCall(fetcher)[0]).toBe(`${BASE}/api/v1/testing/bot/recommend-packs`);
    await client.redteam.recommend('attacks', { context: 'x' });
    expect(lastCall(fetcher)[0]).toBe(`${BASE}/api/v1/testing/bot/recommend-attacks`);
    await client.redteam.recommend('validators', { context: 'x' });
    expect(lastCall(fetcher)[0]).toBe(`${BASE}/api/v1/testing/bot/recommend-validators`);
    await client.redteam.parseCurl('curl https://x');
    expect(lastCall(fetcher)[0]).toBe(`${BASE}/api/v1/testing/bot/parse-curl`);
    expect(JSON.parse(String(lastCall(fetcher)[1]?.body))).toEqual({
      curl_command: 'curl https://x',
    });
    await client.redteam.testConnection({ provider: 'openai', model: 'gpt-4o', api_key: 'k' });
    expect(lastCall(fetcher)[0]).toBe(`${BASE}/api/v1/testing/bot/test-connection`);
  });
});

describe('RedteamClient — reports', () => {
  it('sessionReportCsv passes through raw text', async () => {
    const { client } = makeClient(
      () =>
        new Response('col1,col2\na,b\n', {
          status: 200,
          headers: { 'Content-Type': 'text/csv' },
        }),
    );
    const raw = await client.redteam.sessionReportCsv('s1');
    expect(raw.text).toBe('col1,col2\na,b\n');
    expect(raw.status).toBe(200);
  });
});

describe('VulnerabilitiesClient — test methods (Python parity)', () => {
  it('test hits /vulnerabilities/{id}/test with body + scope query', async () => {
    const { client, fetcher } = makeClient();
    await client.vulnerabilities.test(
      'v1',
      { app_integration_id: 'int-1' },
      { project_id: 'proj_1', organization_id: 'org_1' },
    );
    const [url, init] = lastCall(fetcher);
    expect(url).toBe(
      `${BASE}/api/v1/vulnerabilities/v1/test?project_id=proj_1&organization_id=org_1`,
    );
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({ app_integration_id: 'int-1' });
  });

  it('testPoll hits /vulnerabilities/{id}/test/poll', async () => {
    const { client, fetcher } = makeClient();
    await client.vulnerabilities.testPoll('v1', { app_integration_id: 'int-1' });
    expect(lastCall(fetcher)[0]).toBe(`${BASE}/api/v1/vulnerabilities/v1/test/poll`);
  });
});
