import { spawn } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const CLI = new URL('../../dist/cli/index.js', import.meta.url).pathname;

let server: Server;
let baseUrl = '';
const requests: { method: string | undefined; url: string | undefined; body: string }[] = [];

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk: Buffer) => (body += chunk.toString('utf-8')));
    req.on('end', () => {
      requests.push({ method: req.method, url: req.url, body });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id: 'test-id', status: 'completed', url: req.url }));
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

describe('disseqt CLI', () => {
  it('prints top-level help and exits 0', async () => {
    const result = await runCli(['--help']);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Disseqt CLI');
    expect(result.stdout).toContain('target');
    expect(result.stdout).toContain('run');
  });

  it('exits 2 when neither env vars nor login-config are available', async () => {
    // Point DISSEQT_CONFIG_HOME at an empty tmp dir so the resolver can't
    // find a stored auth blob — otherwise a prior `disseqt login` on the
    // developer's machine would satisfy the resolver and mask the failure.
    const { mkdtempSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const home = mkdtempSync(join(tmpdir(), 'disseqt-cli-empty-'));
    try {
      const result = await runCli(['target', 'list'], {
        DISSEQT_API_KEY: '',
        DISSEQT_PROJECT_ID: '',
        DISSEQT_CONFIG_HOME: home,
      });
      expect(result.code).toBe(2);
      expect(result.stderr).toMatch(/DISSEQT_API_KEY|disseqt login/);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it('lists targets against a mocked backend', async () => {
    const result = await runCli(['target', 'list', '--json']);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('test-id');
    const req = requests.at(-1);
    expect(req?.method).toBe('GET');
    expect(req?.url).toBe('/api/v1/llm/app-integrations');
  });

  it('creates a target with inline JSON body', async () => {
    const result = await runCli(['target', 'create', '--json', '--body', '{"name":"t"}']);
    expect(result.code).toBe(0);
    const req = requests.at(-1);
    expect(req?.method).toBe('POST');
    expect(req?.url).toBe('/api/v1/llm/app-integrations');
    expect(JSON.parse(req?.body ?? '{}')).toEqual({ name: 't' });
  });

  it('lists packs', async () => {
    const result = await runCli(['pack', 'list', '--json']);
    expect(result.code).toBe(0);
    expect(requests.at(-1)?.url).toBe('/api/v1/prompt-packs');
  });

  it('creates a run against a pack', async () => {
    const result = await runCli(['run', 'create', 'p1', '--body', '{"target_id":"t1"}']);
    expect(result.code).toBe(0);
    expect(requests.at(-1)?.url).toBe('/api/v1/prompt-packs/p1/runs');
  });

  it('watches a run and completes on terminal status', async () => {
    const result = await runCli(['run', 'watch', 'r1', '--json']);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('completed');
    expect(requests.at(-1)?.url).toBe('/api/v1/prompt-packs/runs/r1');
  });

  it('renders validation help', async () => {
    const result = await runCli(['validation', '--help']);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('output validations');
  });

  it('lists sessions', async () => {
    const result = await runCli(['session', 'list']);
    expect(result.code).toBe(0);
    expect(requests.at(-1)?.url).toBe('/api/v1/testing/sessions');
  });

  it('lists custom validators', async () => {
    const result = await runCli(['validator', 'list']);
    expect(result.code).toBe(0);
    expect(requests.at(-1)?.url).toBe('/api/v1/llm/custom-validators');
  });

  it('lists test plans', async () => {
    const result = await runCli(['plan', 'list', '--json']);
    expect(result.code).toBe(0);
    expect(requests.at(-1)?.url).toBe('/api/v1/test-plans');
  });

  it('publishes a plan with a body', async () => {
    const body = '{"sharing_scope":"PROJECT","expected_sharing_scope":"PRIVATE"}';
    const result = await runCli(['plan', 'publish', 'p1', '--body', body, '--json']);
    expect(result.code).toBe(0);
    expect(requests.at(-1)?.url).toBe('/api/v1/test-plans/p1/publish');
    expect(JSON.parse(requests.at(-1)?.body ?? '{}').sharing_scope).toBe('PROJECT');
  });

  it('creates a plan-run against a plan id', async () => {
    const body = '{"target":{"execution_mode":"app_integration","app_integration_id":"a1"}}';
    const result = await runCli(['plan-run', 'create', 'p1', '--body', body, '--json']);
    expect(result.code).toBe(0);
    expect(requests.at(-1)?.url).toBe('/api/v1/test-plans/p1/runs');
  });

  it('traces a plan-run with prompt_ref', async () => {
    const result = await runCli(['plan-run', 'trace', 'r1', '--prompt-ref', 'pr1', '--json']);
    expect(result.code).toBe(0);
    expect(requests.at(-1)?.url).toBe('/api/v1/test-plan-runs/r1/trace?prompt_ref=pr1');
  });

  it('cancels a plan-run', async () => {
    const result = await runCli(['plan-run', 'cancel', 'r1', '--json']);
    expect(result.code).toBe(0);
    expect(requests.at(-1)?.method).toBe('POST');
    expect(requests.at(-1)?.url).toBe('/api/v1/test-plan-runs/r1/cancel');
  });
});
