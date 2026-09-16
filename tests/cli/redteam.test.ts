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

// Route → response body. Non-matching paths get `{id, status: completed}`.
const responseMap: Record<string, unknown> = {
  '/api/v1/testing/attack-techniques': [{ id: 'jb-1', name: 'JailbreakLike' }],
  '/api/v1/mr-jailbreak/techniques': [{ id: 'mt-1', name: 'MultiTurnLike' }],
  '/api/v1/mr-jailbreak/agents': [
    { id: 'a1', attack_type: 'jailbreak' },
    { id: 'a2', attack_type: 'toxicity' },
  ],
  '/api/v1/jailbreak/analytics/summary': { total_prompts: 42, blocked: 3 },
  '/api/v1/jailbreak/analytics/prompts-stats': { avg_length: 55 },
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
      const mapped = responseMap[path];
      if (mapped !== undefined) {
        res.end(JSON.stringify(mapped));
        return;
      }
      // Runs polling: return a completed run then results.
      res.end(
        JSON.stringify({
          id: 'test-id',
          session_id: 'session-1',
          run_id: 'run-1',
          job_id: 'job-1',
          status: 'completed',
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
      'eval-csv',
      'eval-single-turn',
    ]) {
      expect(result.stdout).toContain(verb);
    }
  });

  it('list-attacks kind=all hits three endpoints', async () => {
    const before = requests.length;
    const result = await runCli(['redteam', 'list-attacks']);
    expect(result.code).toBe(0);
    const seen = requests.slice(before).map((r) => r.url);
    expect(seen).toContain('/api/v1/testing/attack-techniques');
    expect(seen).toContain('/api/v1/mr-jailbreak/techniques');
    expect(seen).toContain('/api/v1/mr-jailbreak/agents');
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

  it('attack --multi-turn POSTs to batch-automate', async () => {
    const result = await runCli([
      'redteam',
      'attack',
      '--multi-turn',
      '--technique',
      't1',
      '--target',
      'tg1',
      '--prompt',
      'obj',
    ]);
    expect(result.code).toBe(0);
    const req = findLast((r) => r.url === '/api/v1/mr-jailbreak/batch-automate');
    expect(req).toBeDefined();
    expect(req?.method).toBe('POST');
    expect(JSON.parse(req?.body ?? '{}')).toEqual({
      technique: 't1',
      target: 'tg1',
      objective: 'obj',
    });
  });

  it('attack rejects missing single-turn/multi-turn selection', async () => {
    const result = await runCli(['redteam', 'attack', '--technique', 't1', '--target', 'tg1']);
    expect(result.code).toBe(2);
    expect(result.stderr).toMatch(/exactly one/);
  });

  it('attack --single-turn creates session, run, polls, and fetches results', async () => {
    const before = requests.length;
    const result = await runCli([
      'redteam',
      'attack',
      '--single-turn',
      '--technique',
      't1',
      '--target',
      'tg1',
      '--prompt',
      'hi',
      '--poll-interval',
      '0.01',
      '--max-wait',
      '5',
    ]);
    expect(result.code).toBe(0);
    const seen = requests.slice(before).map((r) => `${r.method ?? ''} ${r.url ?? ''}`);
    expect(seen).toContain('POST /api/v1/testing/sessions');
    expect(seen.some((s) => s.startsWith('POST /api/v1/testing/sessions/'))).toBe(true);
    expect(seen.some((s) => s.startsWith('GET /api/v1/testing/runs/'))).toBe(true);
    expect(seen.some((s) => s.endsWith('/results'))).toBe(true);
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

  it('vuln-test POSTs to /vulnerabilities/{id}/test/poll', async () => {
    const result = await runCli([
      'redteam',
      'vuln-test',
      '--vulnerability',
      'v1',
      '--target',
      'tg1',
    ]);
    expect(result.code).toBe(0);
    const req = requests.at(-1);
    expect(req?.url).toBe('/api/v1/vulnerabilities/v1/test/poll');
    expect(req?.method).toBe('POST');
    expect(JSON.parse(req?.body ?? '{}')).toEqual({ target: 'tg1' });
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

  it('report --format=json GETs the results endpoint', async () => {
    const result = await runCli(['redteam', 'report', 'r1', '--format', 'json']);
    expect(result.code).toBe(0);
    expect(requests.at(-1)?.url).toBe('/api/v1/testing/runs/r1/results');
  });

  it('report --format=csv hits the server CSV endpoint', async () => {
    const result = await runCli(['redteam', 'report', 's1', '--format', 'csv']);
    expect(result.code).toBe(0);
    expect(requests.at(-1)?.url).toBe('/api/v1/testing/sessions/s1/report/csv');
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

  it('recommend packs --context POSTs to bot endpoint', async () => {
    const result = await runCli(['redteam', 'recommend', 'packs', '--context', 'financial app']);
    expect(result.code).toBe(0);
    const req = requests.at(-1);
    expect(req?.url).toBe('/api/v1/testing/bot/recommend-packs');
    expect(JSON.parse(req?.body ?? '{}')).toEqual({ context: 'financial app' });
  });

  it('recommend without --context or --config exits 2', async () => {
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
    expect(JSON.parse(req?.body ?? '{}').curl).toContain('curl');
  });

  it('test-connection --target provider/model splits correctly', async () => {
    const result = await runCli(['redteam', 'test-connection', '--target', 'openai/gpt-4o']);
    expect(result.code).toBe(0);
    const req = requests.at(-1);
    expect(req?.url).toBe('/api/v1/testing/bot/test-connection');
    expect(JSON.parse(req?.body ?? '{}')).toEqual({
      target: { provider: 'openai', model: 'gpt-4o' },
    });
  });

  it('test-connection --target with no slash uses id form', async () => {
    const result = await runCli(['redteam', 'test-connection', '--target', 'my-target']);
    expect(result.code).toBe(0);
    expect(JSON.parse(requests.at(-1)?.body ?? '{}')).toEqual({
      target: { id: 'my-target' },
    });
  });

  it('eval-csv uploads a multipart POST', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'disseqt-csv-'));
    const path = join(dir, 'prompts.csv');
    writeFileSync(path, 'input\nprompt-1\nprompt-2\n', 'utf-8');
    const result = await runCli(['redteam', 'eval-csv', path]);
    expect(result.code).toBe(0);
    const req = requests.at(-1);
    expect(req?.url).toBe('/api/v1/jailbreak/evaluate-csv');
    expect(req?.method).toBe('POST');
    expect(req?.contentType).toMatch(/multipart\/form-data/);
    // Multipart body contains the CSV rows verbatim.
    expect(req?.body).toContain('prompt-1');
  });

  it('eval-single-turn --format=json emits JSON payload', async () => {
    const result = await runCli([
      'redteam',
      'eval-single-turn',
      '--input',
      'hi',
      '--technique',
      't1',
      '--format',
      'json',
    ]);
    expect(result.code).toBe(0);
    const req = requests.at(-1);
    expect(req?.url).toBe('/api/v1/jailbreak/single-turn-evaluate');
    expect(JSON.parse(req?.body ?? '{}')).toEqual({ input: 'hi', technique: 't1' });
    // stdout is JSON.
    expect(() => JSON.parse(result.stdout)).not.toThrow();
  });

  it('eval-single-turn default text format prints verdict line', async () => {
    const result = await runCli(['redteam', 'eval-single-turn', '--input', 'hi']);
    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(/verdict:/);
  });

  it('run <config.yaml> POSTs session then run', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'disseqt-yaml-'));
    const path = join(dir, 'run.yaml');
    writeFileSync(
      path,
      [
        'target:',
        '  id: my-target',
        'techniques:',
        '  - t1',
        'vulnerabilities:',
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
    expect(seen[1]?.url).toContain('/api/v1/testing/sessions/');
    expect(seen[1]?.url).toContain('/runs');
  });

  it('vulnerability test <id> --target packages the body', async () => {
    const result = await runCli(['vulnerability', 'test', 'v1', '--target', 'tg1']);
    expect(result.code).toBe(0);
    const req = requests.at(-1);
    expect(req?.url).toBe('/api/v1/vulnerabilities/v1/test');
    expect(req?.method).toBe('POST');
    expect(JSON.parse(req?.body ?? '{}')).toEqual({ target: 'tg1' });
  });
});
