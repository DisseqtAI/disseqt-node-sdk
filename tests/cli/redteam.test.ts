import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const CLI = new URL('../../dist/cli/index.js', import.meta.url).pathname;

interface Recorded {
  method: string | undefined;
  url: string | undefined;
  body: string;
  contentType: string;
}

let server: Server;
let baseUrl = '';
const requests: Recorded[] = [];

const APP = '11111111-1111-4111-8111-111111111111';
const INT = '22222222-2222-4222-8222-222222222222';

// Route → response body. Non-matching paths get `{id, status: completed}`.
const responseMap: Record<string, unknown> = {
  '/api/v1/testing/attack-techniques': [{ id: 'jb-1', name: 'JailbreakLike' }],
  '/api/v1/mr-jailbreak/techniques': [{ id: 'mt-1', name: 'MultiTurnLike' }],
  '/api/v1/mr-jailbreak/agents': [
    { id: 'a1', attack_type: 'jailbreak' },
    { id: 'a2', attack_type: 'toxicity' },
  ],
  '/api/v1/mr-jailbreak/batch-automate': {
    total_target_prompts: 2,
    successful_jobs: 2,
    failed_jobs: 0,
    results: [
      { target_prompt: 'obj-1', job_id: 'job-1', is_successful: true },
      { target_prompt: 'obj-2', job_id: 'job-2', is_successful: false },
    ],
  },
  '/api/v1/jailbreak/analytics/summary': { total_prompts: 42, blocked: 3 },
  '/api/v1/jailbreak/analytics/prompts-stats': { avg_length: 55 },
  '/api/v1/applications': { applications: [{ id: APP, name: 'support-bot' }], count: 1 },
  '/api/v1/llm/application-links': {
    application_id: APP,
    app_integrations: [{ id: 'link-1', app_integration_id: INT }],
    llm_integrations: [],
    rag_integrations: [],
    mcp_integrations: [],
  },
};

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk: Buffer) => (body += chunk.toString('utf-8')));
    req.on('end', () => {
      requests.push({
        method: req.method,
        url: req.url,
        body,
        contentType: String(req.headers['content-type'] ?? ''),
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      // Match query-stripped path against the map, then fall back.
      const path = (req.url ?? '').split('?')[0] ?? '';
      // Two-page {items, pagination} list (api/testing_types.go TestingSessionsListResponse).
      if (req.method === 'GET' && path === '/api/v1/testing/sessions') {
        const page = Number(new URL(req.url ?? '', 'http://x').searchParams.get('page') ?? '1');
        res.end(
          JSON.stringify({
            status: 'success',
            data: {
              items: [{ id: `s-${page}` }],
              pagination: { page, page_size: 1, total: 2, total_pages: 2, has_next: page < 2 },
            },
          }),
        );
        return;
      }
      // Real backend envelope (api/response.go): the SDK unwraps `data`.
      const mapped = responseMap[path];
      if (mapped !== undefined) {
        res.end(JSON.stringify({ status: 'success', data: mapped }));
        return;
      }
      // Runs polling: return a completed run then results.
      res.end(
        JSON.stringify({
          status: 'success',
          data: {
            id: 'test-id',
            session_id: 'session-1',
            run_id: 'run-1',
            job_id: 'job-1',
            status: 'completed',
          },
        }),
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('no server address');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error !== undefined ? reject(error) : resolve())),
  );
});

interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

const runCli = (args: string[], env: Record<string, string> = {}): Promise<RunResult> =>
  new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI, ...args], {
      env: {
        ...process.env,
        DISSEQT_API_KEY: 'k',
        DISSEQT_PROJECT_ID: 'p',
        DISSEQT_BASE_URL: baseUrl,
        ...env,
      },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c: Buffer) => (stdout += c.toString('utf-8')));
    child.stderr.on('data', (c: Buffer) => (stderr += c.toString('utf-8')));
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });

const findLast = (predicate: (r: Recorded) => boolean): Recorded | undefined =>
  [...requests].reverse().find(predicate);

describe('disseqt redteam CLI', () => {
  it('prints top-level redteam help and exits 0', async () => {
    const result = await runCli(['redteam', '--help']);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('run red-team attacks');
    for (const verb of [
      'list-attacks',
      'list-techniques',
      'list-personas',
      'attack',
      'session',
      'vuln-test',
      'run',
      'validate',
      'status',
      'cancel',
      'results',
      'report',
      'analytics',
      'recommend',
      'parse-curl',
      'test-connection',
    ]) {
      expect(result.stdout).toContain(verb);
    }
    for (const verb of ['eval-csv', 'eval-single-turn']) {
      expect(result.stdout).not.toContain(verb);
    }
  });

  it('list-attacks kind=all hits three endpoints', async () => {
    const before = requests.length;
    const result = await runCli(['redteam', 'list-attacks']);
    expect(result.code).toBe(0);
    const seen = requests.slice(before).map((r) => r.url);
    expect(seen).toContain('/api/v1/testing/attack-techniques');
    expect(seen).toContain('/api/v1/mr-jailbreak/techniques');
    expect(seen).toContain('/api/v1/mr-jailbreak/agents?page_id=1&page-size=100');
    const parsed: unknown = JSON.parse(result.stdout);
    expect(parsed).toHaveProperty('single_turn');
    expect(parsed).toHaveProperty('multi_turn');
    expect(parsed).toHaveProperty('agents');
  });

  it('list-attacks kind=single fetches only single-turn', async () => {
    const before = requests.length;
    const result = await runCli(['redteam', 'list-attacks', '--kind', 'single']);
    expect(result.code).toBe(0);
    const seen = requests.slice(before).map((r) => r.url);
    expect(seen).toEqual(['/api/v1/testing/attack-techniques']);
  });

  it('list-personas filters by attack_type client-side', async () => {
    const result = await runCli(['redteam', 'list-personas', '--attack-type', 'jailbreak']);
    expect(result.code).toBe(0);
    expect(requests.at(-1)?.url).toBe(
      '/api/v1/mr-jailbreak/agents?page_id=1&page-size=100&attack_type=jailbreak',
    );
    const parsed = JSON.parse(result.stdout) as { attack_type?: string }[];
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.attack_type).toBe('jailbreak');
  });

  it('list-techniques --single-turn hits only single-turn', async () => {
    const before = requests.length;
    const result = await runCli(['redteam', 'list-techniques', '--single-turn']);
    expect(result.code).toBe(0);
    const seen = requests.slice(before).map((r) => r.url);
    expect(seen).toEqual(['/api/v1/testing/attack-techniques']);
  });

  it('list-techniques with both flags exits 2', async () => {
    const result = await runCli(['redteam', 'list-techniques', '--single-turn', '--multi-turn']);
    expect(result.code).toBe(2);
    expect(result.stderr).toMatch(/at most one/);
  });

  it('attack --multi-turn POSTs a BatchAutomateJailbreakRequest and polls each job', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'disseqt-tpl-'));
    const tplPath = join(dir, 'template.json');
    const template = {
      name: 'my-app',
      description: 'support bot',
      base_url: 'https://target.example',
      integration_type: 'single-step',
      send_step: {
        step_order: 1,
        step_name: 'send',
        step_type: 'send',
        api_endpoint: 'https://target.example/chat',
        http_method: 'POST',
      },
    };
    writeFileSync(tplPath, JSON.stringify(template), 'utf-8');
    const before = requests.length;
    const result = await runCli([
      'redteam',
      'attack',
      '--multi-turn',
      '--technique',
      't1',
      '--target',
      tplPath,
      '--prompt',
      'obj-1',
      '--prompt',
      'obj-2',
      '--poll-interval',
      '0.01',
    ]);
    expect(result.code).toBe(0);
    const req = findLast((r) => r.url === '/api/v1/mr-jailbreak/batch-automate');
    expect(req?.method).toBe('POST');
    expect(JSON.parse(req?.body ?? '{}')).toEqual({
      target_prompts: ['obj-1', 'obj-2'],
      app_integration_template: template,
      jailbreak_config: {
        project_id: 'p',
        job_name_prefix: 'cli',
        app_name: 'my-app',
        app_description_short: 'my-app (disseqt CLI)',
        app_type: 'chatbot',
        max_depth: 5,
        orchestration_mode: 'single',
        technique_id: 't1',
      },
      ecid_prefix: 'cli',
      ecid_start_number: 1,
    });
    const seen = requests.slice(before).map((r) => r.url);
    expect(seen).toContain('/api/v1/mr-jailbreak/jobs/job-1');
    expect(seen).toContain('/api/v1/mr-jailbreak/jobs/job-2');
    const out = JSON.parse(result.stdout) as { batch: unknown; jobs: { status: string }[] };
    expect(out.batch).toHaveProperty('total_target_prompts', 2);
    expect(out.jobs.map((j) => j.status)).toEqual(['completed', 'completed']);
    expect(result.stderr).toContain('--target is deprecated');
  });

  it('attack --multi-turn rejects more than 10 prompts', async () => {
    const prompts = Array.from({ length: 11 }, (_, i) => ['--prompt', `p${i}`]).flat();
    const result = await runCli([
      'redteam',
      'attack',
      '--multi-turn',
      '--technique',
      't1',
      '--target',
      'x.json',
      ...prompts,
    ]);
    expect(result.code).toBe(2);
    expect(result.stderr).toMatch(/1\.\.10/);
  });

  it('attack rejects missing single-turn/multi-turn selection', async () => {
    const result = await runCli(['redteam', 'attack', '--technique', 't1', '--target', 'tg1']);
    expect(result.code).toBe(2);
    expect(result.stderr).toMatch(/exactly one/);
  });

  it('attack --single-turn sends CreateTestingSessionRequest + CreateTestingRunRequest', async () => {
    const before = requests.length;
    const result = await runCli([
      'redteam',
      'attack',
      '--single-turn',
      '--technique',
      't1',
      '--app',
      APP,
      '--pack',
      'pack-1',
      '--validator',
      'toxicity',
      '--poll-interval',
      '0.01',
      '--max-wait',
      '5',
    ]);
    expect(result.code).toBe(0);
    const seen = requests.slice(before);
    const session = seen.find((r) => r.url === '/api/v1/testing/sessions');
    expect(session?.method).toBe('POST');
    const sessionBody = JSON.parse(session?.body ?? '{}') as Record<string, unknown>;
    expect(Object.keys(sessionBody).sort()).toEqual([
      'application_context',
      'name',
      'target_config',
      'testing_plan',
    ]);
    expect(sessionBody['target_config']).toEqual({ application_id: APP });
    // name + type keep the session out of `draft` (determineSessionStatus).
    expect(sessionBody['application_context']).toEqual({
      name: sessionBody['name'],
      type: 'web',
    });
    expect(sessionBody['testing_plan']).toEqual({
      prompt_sources: [{ type: 'prompt_pack', config: { pack_ids: ['pack-1'] } }],
      attack_strategies: [
        { type: 'single_turn_jailbreak', techniques: ['t1'], config: { techniques: ['t1'] } },
      ],
      validators: ['toxicity'],
      execution: { mode: 'sequential', stop_on_first_breach: false, max_total_prompts: 0 },
    });
    const run = seen.find((r) => r.url === '/api/v1/testing/sessions/test-id/runs');
    expect(run?.method).toBe('POST');
    expect(JSON.parse(run?.body ?? '{}')).toEqual({
      run_name: sessionBody['name'],
      trigger_metadata: { source: 'disseqt-cli' },
    });
    const urls = seen.map((r) => `${r.method ?? ''} ${r.url ?? ''}`);
    expect(urls).toContain('GET /api/v1/testing/runs/test-id');
    expect(urls).toContain('GET /api/v1/testing/runs/test-id/results');
  });

  it('session list hits /testing/sessions', async () => {
    const result = await runCli(['redteam', 'session', 'list']);
    expect(result.code).toBe(0);
    expect(requests.at(-1)?.url).toBe('/api/v1/testing/sessions');
  });

  it('session get <id> hits the resource', async () => {
    const result = await runCli(['redteam', 'session', 'get', 's99']);
    expect(result.code).toBe(0);
    expect(requests.at(-1)?.url).toBe('/api/v1/testing/sessions/s99');
  });

  it('vuln-test POSTs app_integration_id with project/org query params', async () => {
    const result = await runCli(
      ['redteam', 'vuln-test', '--vulnerability', 'v1', '--target', 'int-1'],
      { DISSEQT_ORGANIZATION_ID: 'org-1' },
    );
    expect(result.code).toBe(0);
    const req = requests.at(-1);
    expect(req?.url).toBe(
      '/api/v1/vulnerabilities/v1/test/poll?project_id=p&organization_id=org-1',
    );
    expect(req?.method).toBe('POST');
    expect(JSON.parse(req?.body ?? '{}')).toEqual({ app_integration_id: 'int-1' });
  });

  it('vuln-test without an organization id omits it (the gateway scopes the org)', async () => {
    const result = await runCli(
      ['redteam', 'vuln-test', '--vulnerability', 'v1', '--integration', INT],
      { DISSEQT_ORGANIZATION_ID: '' },
    );
    expect(result.code).toBe(0);
    expect(requests.at(-1)?.url).toBe('/api/v1/vulnerabilities/v1/test/poll?project_id=p');
  });

  it('validate POSTs the standard body shape', async () => {
    const result = await runCli([
      'redteam',
      'validate',
      '--input',
      'hello',
      '--output',
      'world',
      '--validator',
      'toxicity',
      '--validator',
      'pii',
      '--input-context',
      'ctx',
      '--threshold',
      '0.5',
    ]);
    expect(result.code).toBe(0);
    const req = requests.at(-1);
    expect(req?.url).toBe('/api/v1/testing/validate');
    expect(JSON.parse(req?.body ?? '{}')).toEqual({
      input: 'hello',
      output: 'world',
      validators: ['toxicity', 'pii'],
      input_context: 'ctx',
      threshold: 0.5,
    });
  });

  it('validate --threshold=1.5 rejected with exit 2', async () => {
    const result = await runCli([
      'redteam',
      'validate',
      '--input',
      'h',
      '--validator',
      't',
      '--threshold',
      '1.5',
    ]);
    expect(result.code).toBe(2);
  });

  it('status falls through to mr-jailbreak on 404', async () => {
    // Baseline server returns 200 on both paths — verify testing/runs is tried first.
    const before = requests.length;
    const result = await runCli(['redteam', 'status', 'r1']);
    expect(result.code).toBe(0);
    const seen = requests.slice(before).map((r) => r.url);
    expect(seen[0]).toBe('/api/v1/testing/runs/r1');
  });

  it('cancel POSTs to /testing/runs/{id}/cancel', async () => {
    const result = await runCli(['redteam', 'cancel', 'r1']);
    expect(result.code).toBe(0);
    expect(requests.at(-1)?.method).toBe('POST');
    expect(requests.at(-1)?.url).toBe('/api/v1/testing/runs/r1/cancel');
  });

  it('results GETs the results endpoint', async () => {
    const result = await runCli(['redteam', 'results', 'r1']);
    expect(result.code).toBe(0);
    expect(requests.at(-1)?.url).toBe('/api/v1/testing/runs/r1/results');
  });

  it('report --format=json GETs every results page', async () => {
    const result = await runCli(['redteam', 'report', 'r1', '--format', 'json']);
    expect(result.code).toBe(0);
    expect(requests.at(-1)?.url).toBe('/api/v1/testing/runs/r1/results?page=1&page-size=100');
  });

  it('report --format=markdown renders {items} rows', async () => {
    responseMap['/api/v1/testing/runs/r-items/results'] = {
      items: [{ id: 'x1', breach_detected: true }],
      pagination: { page: 1, page_size: 100, total: 1, total_pages: 1, has_next: false },
    };
    const result = await runCli(['redteam', 'report', 'r-items', '--format', 'markdown']);
    delete responseMap['/api/v1/testing/runs/r-items/results'];
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('| id | breach_detected |');
    expect(result.stdout).toContain('| x1 | true |');
  });

  it('session list --page/--page-size forwards query params', async () => {
    const result = await runCli(['redteam', 'session', 'list', '--page', '2', '--page-size', '1']);
    expect(result.code).toBe(0);
    expect(requests.at(-1)?.url).toBe('/api/v1/testing/sessions?page=2&page-size=1');
  });

  it('session list --all follows has_next and concatenates items', async () => {
    const before = requests.length;
    const result = await runCli(['redteam', 'session', 'list', '--all']);
    expect(result.code).toBe(0);
    expect(requests.slice(before).map((r) => r.url)).toEqual([
      '/api/v1/testing/sessions?page=1',
      '/api/v1/testing/sessions?page=2',
    ]);
    expect(JSON.parse(result.stdout)).toEqual({ items: [{ id: 's-1' }, { id: 's-2' }] });
  });

  it('report --format=csv --session hits the server CSV endpoint', async () => {
    const result = await runCli(['redteam', 'report', '--format', 'csv', '--session', 's1']);
    expect(result.code).toBe(0);
    expect(requests.at(-1)?.url).toBe('/api/v1/testing/sessions/s1/report/csv');
  });

  it('report --format=csv without --session exits 2', async () => {
    const result = await runCli(['redteam', 'report', 'r1', '--format', 'csv']);
    expect(result.code).toBe(2);
  });

  it('analytics --summary hits only the summary endpoint', async () => {
    const before = requests.length;
    const result = await runCli(['redteam', 'analytics', '--summary', '--format', 'json']);
    expect(result.code).toBe(0);
    const seen = requests.slice(before).map((r) => r.url);
    expect(seen).toEqual(['/api/v1/jailbreak/analytics/summary']);
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(parsed).toHaveProperty('total_prompts', 42);
  });

  it('analytics with both flags exits 2', async () => {
    const result = await runCli(['redteam', 'analytics', '--summary', '--prompts-stats']);
    expect(result.code).toBe(2);
  });

  it('recommend packs POSTs {app_name, app_description}', async () => {
    const result = await runCli([
      'redteam',
      'recommend',
      'packs',
      '--app-name',
      'bank-bot',
      '--app-description',
      'financial assistant',
    ]);
    expect(result.code).toBe(0);
    const req = requests.at(-1);
    expect(req?.url).toBe('/api/v1/testing/bot/recommend-packs');
    expect(JSON.parse(req?.body ?? '{}')).toEqual({
      app_name: 'bank-bot',
      app_description: 'financial assistant',
    });
  });

  it('recommend attacks POSTs {app_description} only', async () => {
    const result = await runCli([
      'redteam',
      'recommend',
      'attacks',
      '--app-description',
      'financial assistant',
    ]);
    expect(result.code).toBe(0);
    expect(JSON.parse(requests.at(-1)?.body ?? '{}')).toEqual({
      app_description: 'financial assistant',
    });
  });

  it('recommend packs without --app-name exits 2', async () => {
    const result = await runCli(['redteam', 'recommend', 'packs', '--app-description', 'x']);
    expect(result.code).toBe(2);
  });

  it('recommend without --app-description or --config exits 2', async () => {
    const result = await runCli(['redteam', 'recommend', 'attacks']);
    expect(result.code).toBe(2);
  });

  it('parse-curl reads from a file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'disseqt-curl-'));
    const path = join(dir, 'curl.txt');
    writeFileSync(path, 'curl -X POST https://api.example.com', 'utf-8');
    const result = await runCli(['redteam', 'parse-curl', path]);
    expect(result.code).toBe(0);
    const req = requests.at(-1);
    expect(req?.url).toBe('/api/v1/testing/bot/parse-curl');
    expect(JSON.parse(req?.body ?? '{}')).toEqual({
      curl_command: 'curl -X POST https://api.example.com',
    });
  });

  it('test-connection sends the flat body with api_key from --api-key-env', async () => {
    const result = await runCli(
      [
        'redteam',
        'test-connection',
        '--endpoint',
        'https://t.example/v1',
        '--provider',
        'openai',
        '--model',
        'gpt-4o',
        '--api-key-env',
        'TARGET_KEY',
      ],
      { TARGET_KEY: 'sk-target' },
    );
    expect(result.code).toBe(0);
    const req = requests.at(-1);
    expect(req?.url).toBe('/api/v1/testing/bot/test-connection');
    expect(JSON.parse(req?.body ?? '{}')).toEqual({
      api_key: 'sk-target',
      endpoint: 'https://t.example/v1',
      provider: 'openai',
      model: 'gpt-4o',
    });
  });

  it('test-connection without an api key exits 2', async () => {
    const result = await runCli(['redteam', 'test-connection', '--provider', 'openai']);
    expect(result.code).toBe(2);
  });

  it('run <config.yaml> POSTs CreateTestingSessionRequest then CreateTestingRunRequest', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'disseqt-yaml-'));
    const path = join(dir, 'run.yaml');
    writeFileSync(
      path,
      [
        'name: nightly',
        'run_name: nightly-1',
        'application:',
        '  name: support-bot',
        'target:',
        '  application_id: app-9',
        'prompt_packs:',
        '  - pack-9',
        'techniques:',
        '  - t1',
        'validators:',
        '  - v1',
        '',
      ].join('\n'),
      'utf-8',
    );
    const before = requests.length;
    const result = await runCli(['redteam', 'run', path, '--json']);
    expect(result.code).toBe(0);
    const seen = requests.slice(before);
    expect(seen[0]?.url).toBe('/api/v1/testing/sessions');
    const sessionBody = JSON.parse(seen[0]?.body ?? '{}') as Record<string, unknown>;
    expect(sessionBody['name']).toBe('nightly');
    expect(sessionBody['application_context']).toEqual({ name: 'support-bot', type: 'web' });
    expect(sessionBody['target_config']).toEqual({ application_id: 'app-9' });
    expect(sessionBody['testing_plan']).toMatchObject({
      prompt_sources: [{ type: 'prompt_pack', config: { pack_ids: ['pack-9'] } }],
      attack_strategies: [{ type: 'single_turn_jailbreak', techniques: ['t1'] }],
      validators: ['v1'],
      execution: { max_total_prompts: 0 },
    });
    expect(seen[1]?.url).toBe('/api/v1/testing/sessions/test-id/runs');
    expect(JSON.parse(seen[1]?.body ?? '{}')).toEqual({
      run_name: 'nightly-1',
      trigger_metadata: { source: 'disseqt-cli' },
    });
    expect(result.stderr).not.toContain('deprecated');
  });

  it('run <config.yaml> still accepts the old packs/application_context/target_config keys', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'disseqt-yaml-'));
    const path = join(dir, 'old.yaml');
    writeFileSync(
      path,
      [
        'name: old',
        'application_context:',
        '  name: legacy-bot',
        'target_config:',
        '  application_id: app-7',
        'packs: [pack-7]',
        'techniques: [t1]',
        'validators: [v1]',
        '',
      ].join('\n'),
      'utf-8',
    );
    const before = requests.length;
    const result = await runCli(['redteam', 'run', path, '--json']);
    expect(result.code).toBe(0);
    const body = JSON.parse(requests[before]?.body ?? '{}') as Record<string, unknown>;
    expect(body['application_context']).toEqual({ name: 'legacy-bot', type: 'web' });
    expect(body['target_config']).toEqual({ application_id: 'app-7' });
    expect(body['testing_plan']).toMatchObject({
      prompt_sources: [{ type: 'prompt_pack', config: { pack_ids: ['pack-7'] } }],
    });
    expect(result.stderr).toMatch(/deprecated/);
  });

  it('vulnerability test <id> --target sends app_integration_id + scope query', async () => {
    const result = await runCli([
      'vulnerability',
      'test',
      'v1',
      '--target',
      'int-1',
      '--organization-id',
      'org-1',
    ]);
    expect(result.code).toBe(0);
    const req = requests.at(-1);
    expect(req?.url).toBe('/api/v1/vulnerabilities/v1/test?project_id=p&organization_id=org-1');
    expect(req?.method).toBe('POST');
    expect(JSON.parse(req?.body ?? '{}')).toEqual({ app_integration_id: 'int-1' });
  });
});

describe('target selection (--app / --integration / --endpoint)', () => {
  const single = ['redteam', 'attack', '--single-turn', '--technique', 't1', '--pack', 'p1'];
  const singleTail = ['--validator', 'v1', '--poll-interval', '0.01', '--max-wait', '5'];
  const sessionBody = (before: number): Record<string, unknown> =>
    JSON.parse(
      requests.slice(before).find((r) => r.url === '/api/v1/testing/sessions')?.body ?? '{}',
    ) as Record<string, unknown>;

  it('single-turn --integration → target_config.app_integration_id', async () => {
    const before = requests.length;
    const result = await runCli([...single, '--integration', INT, ...singleTail]);
    expect(result.code).toBe(0);
    expect(sessionBody(before)['target_config']).toEqual({ app_integration_id: INT });
  });

  it('single-turn --endpoint → target_config.endpoint_url', async () => {
    const before = requests.length;
    const result = await runCli([...single, '--endpoint', 'https://t.example/chat', ...singleTail]);
    expect(result.code).toBe(0);
    expect(sessionBody(before)['target_config']).toEqual({
      endpoint_url: 'https://t.example/chat',
    });
  });

  it('single-turn --target <uuid> is a deprecated alias for --app', async () => {
    const before = requests.length;
    const result = await runCli([...single, '--target', APP, ...singleTail]);
    expect(result.code).toBe(0);
    expect(sessionBody(before)['target_config']).toEqual({ application_id: APP });
    expect(result.stderr).toContain('--target is deprecated');
  });

  it('no target, or two targets, exits 2', async () => {
    expect((await runCli([...single, ...singleTail])).code).toBe(2);
    const two = await runCli([...single, '--app', APP, '--integration', INT, ...singleTail]);
    expect(two.code).toBe(2);
    expect(two.stderr).toMatch(/exactly one of --app, --integration, --endpoint/);
  });

  it('--app must be a UUID (exit 2)', async () => {
    expect((await runCli([...single, '--app', 'not-a-uuid', ...singleTail])).code).toBe(2);
  });

  it('single-turn needs at least one --pack and --validator (exit 2)', async () => {
    const r = await runCli([
      'redteam',
      'attack',
      '--single-turn',
      '--technique',
      't1',
      '--app',
      APP,
    ]);
    expect(r.code).toBe(2);
  });

  const multi = ['redteam', 'attack', '--multi-turn', '--technique', 't1', '--prompt', 'obj-1'];
  const batchBody = (): Record<string, unknown> =>
    JSON.parse(
      findLast((r) => r.url === '/api/v1/mr-jailbreak/batch-automate')?.body ?? '{}',
    ) as Record<string, unknown>;

  it('multi-turn --integration sends top-level app_integration_id and no template', async () => {
    const result = await runCli([...multi, '--integration', INT, '--poll-interval', '0.01']);
    expect(result.code).toBe(0);
    const body = batchBody();
    expect(body['app_integration_id']).toBe(INT);
    expect(body).not.toHaveProperty('app_integration_template');
    expect(body['jailbreak_config']).not.toHaveProperty('application_id');
  });

  it('multi-turn --app sends jailbreak_config.application_id and no template', async () => {
    const result = await runCli([...multi, '--app', APP, '--poll-interval', '0.01']);
    expect(result.code).toBe(0);
    const body = batchBody();
    expect(body).not.toHaveProperty('app_integration_template');
    expect(body).not.toHaveProperty('app_integration_id');
    expect(body['jailbreak_config']).toMatchObject({ application_id: APP, max_depth: 5 });
  });

  it('multi-turn --endpoint takes the legacy template as a JSON literal', async () => {
    const tpl = {
      name: 'lit',
      base_url: 'https://t.example',
      integration_type: 'single-step',
      send_step: { api_endpoint: 'https://t.example/chat' },
    };
    const result = await runCli([
      ...multi,
      '--endpoint',
      JSON.stringify(tpl),
      '--poll-interval',
      '0.01',
    ]);
    expect(result.code).toBe(0);
    expect(batchBody()['app_integration_template']).toEqual(tpl);
  });

  it('multi-turn --target @file loads the template', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'disseqt-tpl-'));
    const path = join(dir, 't.json');
    const tpl = { name: 'f', base_url: 'b', integration_type: 'i', send_step: {} };
    writeFileSync(path, JSON.stringify(tpl), 'utf-8');
    const result = await runCli([...multi, '--target', `@${path}`, '--poll-interval', '0.01']);
    expect(result.code).toBe(0);
    expect(batchBody()['app_integration_template']).toEqual(tpl);
  });

  it('multi-turn template missing required keys exits 2', async () => {
    const result = await runCli([...multi, '--endpoint', '{"name":"x"}']);
    expect(result.code).toBe(2);
    expect(result.stderr).toMatch(/missing/);
  });

  it('vuln-test --app sends application_id', async () => {
    const result = await runCli(['redteam', 'vuln-test', '--vulnerability', 'v1', '--app', APP], {
      DISSEQT_ORGANIZATION_ID: 'org-1',
    });
    expect(result.code).toBe(0);
    expect(JSON.parse(requests.at(-1)?.body ?? '{}')).toEqual({ application_id: APP });
  });

  it('vuln-test --endpoint is not supported (exit 2)', async () => {
    const result = await runCli([
      'redteam',
      'vuln-test',
      '--vulnerability',
      'v1',
      '--endpoint',
      'https://t.example',
    ]);
    expect(result.code).toBe(2);
  });

  it('run create <packId> --app merges application_id into the body', async () => {
    const result = await runCli(['run', 'create', 'pk1', '--app', APP]);
    expect(result.code).toBe(0);
    const req = requests.at(-1);
    expect(req?.url).toBe('/api/v1/sdk/prompt-packs/pk1/runs');
    expect(JSON.parse(req?.body ?? '{}')).toEqual({ application_id: APP });
  });

  it('run create <packId> --integration + --body merges into the body', async () => {
    const result = await runCli([
      'run',
      'create',
      'pk1',
      '--integration',
      INT,
      '--body',
      '{"prompt_pack_run_name":"n"}',
    ]);
    expect(result.code).toBe(0);
    expect(JSON.parse(requests.at(-1)?.body ?? '{}')).toEqual({
      prompt_pack_run_name: 'n',
      app_integration_id: INT,
    });
  });

  it('run create <packId> with neither --body nor a target exits 2', async () => {
    expect((await runCli(['run', 'create', 'pk1'])).code).toBe(2);
  });

  it('plan-run create --integration builds an app_integration target', async () => {
    const result = await runCli(['plan-run', 'create', 'pl1', '--integration', INT]);
    expect(result.code).toBe(0);
    expect(JSON.parse(requests.at(-1)?.body ?? '{}')).toEqual({
      target: { execution_mode: 'app_integration', app_integration_id: INT },
    });
  });

  it('plan-run create --endpoint builds a direct target', async () => {
    const result = await runCli(['plan-run', 'create', 'pl1', '--endpoint', 'https://t.example']);
    expect(result.code).toBe(0);
    expect(JSON.parse(requests.at(-1)?.body ?? '{}')).toEqual({
      target: { execution_mode: 'direct', endpoint_url: 'https://t.example' },
    });
  });

  it('plan-run create --app sends target.application_id', async () => {
    const result = await runCli(['plan-run', 'create', 'pl1', '--app', APP]);
    expect(result.code).toBe(0);
    expect(JSON.parse(requests.at(-1)?.body ?? '{}')).toEqual({
      target: { execution_mode: 'app_integration', application_id: APP },
    });
  });
});

describe('disseqt app', () => {
  it('app list GETs policy-mgmt /api/v1/applications on DISSEQT_POLICIES_BASE_URL', async () => {
    const result = await runCli(['app', 'list', '--json'], { DISSEQT_POLICIES_BASE_URL: baseUrl });
    expect(result.code).toBe(0);
    expect(requests.at(-1)?.method).toBe('GET');
    expect(requests.at(-1)?.url).toBe('/api/v1/applications');
    expect(JSON.parse(result.stdout)).toEqual({
      applications: [{ id: APP, name: 'support-bot' }],
      count: 1,
    });
  });

  it('app link POSTs an app_integration link', async () => {
    const result = await runCli(['app', 'link', APP, '--integration', INT]);
    expect(result.code).toBe(0);
    const req = requests.at(-1);
    expect(req?.method).toBe('POST');
    expect(req?.url).toBe('/api/v1/llm/application-links');
    expect(JSON.parse(req?.body ?? '{}')).toEqual({
      application_id: APP,
      integration_type: 'app_integration',
      integration_id: INT,
    });
  });

  it('app link without --integration exits 2', async () => {
    expect((await runCli(['app', 'link', APP])).code).toBe(2);
  });

  it('app unlink lists the links then DELETEs each', async () => {
    const before = requests.length;
    const result = await runCli(['app', 'unlink', APP]);
    expect(result.code).toBe(0);
    const seen = requests.slice(before).map((r) => `${r.method ?? ''} ${r.url ?? ''}`);
    expect(seen).toEqual([
      `GET /api/v1/llm/application-links?application_id=${APP}`,
      'DELETE /api/v1/llm/application-links/link-1',
    ]);
  });
});

describe('polling interrupts', () => {
  const RUN = '/api/v1/testing/runs/test-id';
  const attack = [
    'redteam',
    'attack',
    '--single-turn',
    '--technique',
    't1',
    '--app',
    APP,
    '--pack',
    'p1',
    '--validator',
    'v1',
    '--poll-interval',
    '0.02',
  ];
  const cancelled = (before: number): boolean =>
    requests.slice(before).some((r) => r.method === 'POST' && r.url === `${RUN}/cancel`);

  it('a --max-wait timeout cancels the run, prints a hint and exits 1', async () => {
    responseMap[RUN] = { id: 'test-id', status: 'running' };
    const before = requests.length;
    const result = await runCli([...attack, '--max-wait', '0.1']);
    Reflect.deleteProperty(responseMap, RUN);
    expect(result.code).toBe(1);
    expect(cancelled(before)).toBe(true);
    expect(result.stderr).toContain('cancelled test-id');
    expect(result.stderr).toContain('disseqt redteam status test-id');
  });

  it('Ctrl-C (SIGINT) while polling cancels the run and exits 1', async () => {
    responseMap[RUN] = { id: 'test-id', status: 'running' };
    const before = requests.length;
    const child = spawn(process.execPath, [CLI, ...attack, '--max-wait', '30'], {
      env: {
        ...process.env,
        DISSEQT_API_KEY: 'k',
        DISSEQT_PROJECT_ID: 'p',
        DISSEQT_BASE_URL: baseUrl,
      },
    });
    let stderr = '';
    child.stderr.on('data', (c: Buffer) => (stderr += c.toString('utf-8')));
    const code = await new Promise<number | null>((resolve) => {
      const timer = globalThis.setInterval(() => {
        if (requests.slice(before).some((r) => r.url === RUN)) {
          globalThis.clearInterval(timer);
          child.kill('SIGINT');
        }
      }, 10);
      child.on('close', (c) => resolve(c));
    });
    Reflect.deleteProperty(responseMap, RUN);
    expect(code).toBe(1);
    expect(cancelled(before)).toBe(true);
    expect(stderr).toContain('interrupted');
    expect(stderr).toContain('disseqt redteam status test-id');
  });
});
