import { spawn } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const CLI = new URL('../../dist/cli/index.js', import.meta.url).pathname;

interface Recorded {
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
}

let server: Server;
let baseUrl = '';
const requests: Recorded[] = [];
let respond: (req: Recorded) => { status: number; body: unknown } = () => ({
  status: 200,
  body: { data: [] },
});

beforeAll(async () => {
  server = createServer((req, res) => {
    const recorded: Recorded = {
      method: req.method ?? '',
      url: req.url ?? '',
      headers: req.headers,
    };
    requests.push(recorded);
    let body = '';
    req.on('data', (c: Buffer) => (body += c.toString('utf-8')));
    req.on('end', () => {
      const { status, body: responseBody } = respond(recorded);
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(responseBody));
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

let configHome: string;

beforeEach(() => {
  configHome = mkdtempSync(join(tmpdir(), 'disseqt-cli-'));
  requests.length = 0;
  respond = () => ({ status: 200, body: { data: [] } });
});

afterEach(() => {
  rmSync(configHome, { recursive: true, force: true });
});

interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

function runCli(args: string[], env: Record<string, string> = {}): Promise<RunResult> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI, ...args], {
      env: {
        ...process.env,
        DISSEQT_API_KEY: '',
        DISSEQT_PROJECT_ID: '',
        DISSEQT_CONFIG_HOME: configHome,
        ...env,
      },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c: Buffer) => (stdout += c.toString('utf-8')));
    child.stderr.on('data', (c: Buffer) => (stderr += c.toString('utf-8')));
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

function readConfig(): { auth: { api_key: string; project_id: string; base_url?: string } } | null {
  const path = join(configHome, '.disseqt', 'config.json');
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf-8')) as {
    auth: { api_key: string; project_id: string; base_url?: string };
  };
}

describe('disseqt login', () => {
  it('renders help without touching the network', async () => {
    const result = await runCli(['login', '--help']);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('login');
    expect(result.stdout).toContain('--api-key');
    expect(requests.length).toBe(0);
  });

  it('accepts --api-key / --project-id, smoke-tests, and writes the config', async () => {
    respond = () => ({ status: 200, body: { data: [] } });
    const result = await runCli([
      'login',
      '--api-key',
      'fake_apikey_12345',
      '--project-id',
      'proj_1',
      '--base-url',
      baseUrl,
      '--json',
    ]);
    expect(result.code).toBe(0);
    expect(requests.length).toBe(1);
    expect(requests[0]?.method).toBe('GET');
    expect(requests[0]?.url).toBe('/api/v1/testing/attack-techniques');
    expect(requests[0]?.headers['x-api-key']).toBe('fake_apikey_12345');
    expect(requests[0]?.headers['x-project-id']).toBe('proj_1');
    const cfg = readConfig();
    expect(cfg?.auth.api_key).toBe('fake_apikey_12345');
    expect(cfg?.auth.project_id).toBe('proj_1');
    const parsed = JSON.parse(result.stdout) as { logged_in: boolean; api_key_prefix: string };
    expect(parsed.logged_in).toBe(true);
    // The masked prefix must not include chars beyond position 8
    expect(parsed.api_key_prefix.startsWith('fake_api')).toBe(true);
    expect(parsed.api_key_prefix).not.toContain('key_12345');
  });

  it('honours DISSEQT_BASE_URL when --base-url is absent', async () => {
    const result = await runCli(
      ['login', '--api-key', 'fake_apikey_12345', '--project-id', 'proj_1'],
      { DISSEQT_BASE_URL: baseUrl },
    );
    expect(result.code).toBe(0);
    expect(requests[0]?.url).toBe('/api/v1/testing/attack-techniques');
    expect(readConfig()?.auth.base_url).toBeUndefined();
  });

  it('exits non-zero on 401 and does NOT write the config', async () => {
    respond = () => ({ status: 401, body: { error: 'invalid' } });
    const result = await runCli([
      'login',
      '--api-key',
      'badfake',
      '--project-id',
      'proj_bad',
      '--base-url',
      baseUrl,
    ]);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain('invalid');
    expect(readConfig()).toBeNull();
  });

  it('never prints the token in success output', async () => {
    respond = () => ({ status: 200, body: { data: [] } });
    const secret = 'fake_apikey_12345_XYZ';
    const result = await runCli([
      'login',
      '--api-key',
      secret,
      '--project-id',
      'proj_1',
      '--base-url',
      baseUrl,
      '--json',
    ]);
    expect(result.code).toBe(0);
    // Full token must not appear anywhere. Only the 8-char prefix.
    expect(result.stdout).not.toContain(secret);
    expect(result.stderr).not.toContain(secret);
  });

  it('errors out when stdin is not a TTY and flags are missing', async () => {
    const result = await runCli(['login', '--base-url', baseUrl]);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toMatch(/TTY|api-key/);
  });
});

describe('disseqt logout', () => {
  it('clears the config locally without hitting the network', async () => {
    await runCli([
      'login',
      '--api-key',
      'fake_apikey_1234XYZ',
      '--project-id',
      'proj_1',
      '--base-url',
      baseUrl,
    ]);
    expect(readConfig()).not.toBeNull();
    requests.length = 0;

    const result = await runCli(['logout']);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('logged out');
    expect(readConfig()).toBeNull();
    expect(requests.length).toBe(0);
  });

  it('has no --local-only flag any more', async () => {
    const result = await runCli(['logout', '--help']);
    expect(result.code).toBe(0);
    expect(result.stdout).not.toContain('--local-only');
    expect(result.stdout).toContain('local');
  });

  it('is a no-op message when already logged out', async () => {
    const result = await runCli(['logout']);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('already logged out');
  });
});
