import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
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
      if (req.headers['x-api-key'] === 'bad') {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'error', error: { external: 'invalid api key' } }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      // disseqt-go compat envelope from the llm-judge route: a failing score
      // yields one finding per chunk so exit code + rendered output can be asserted.
      res.end(
        JSON.stringify({
          data: {
            metric_name: 'llm-judge-sql-injection',
            actual_value: 0.8,
            metric_labels: ['fail'],
            threshold: ['fail'],
            threshold_score: 0.5,
            others: { reason: 'String-concat SQL' },
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

const runCli = (
  args: string[],
  cwd: string,
  env: Record<string, string> = {},
): Promise<RunResult> =>
  new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI, ...args], {
      cwd,
      env: {
        ...process.env,
        DISSEQT_API_KEY: 'k',
        DISSEQT_PROJECT_ID: 'p',
        DISSEQT_VALIDATORS_BASE_URL: baseUrl,
        DISSEQT_SHOW_PROGRESS: '0',
        ...env,
      },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c: Buffer) => (stdout += c.toString('utf-8')));
    child.stderr.on('data', (c: Buffer) => (stderr += c.toString('utf-8')));
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });

describe('disseqt scan CLI', () => {
  it('renders --help without invoking the backend', async () => {
    const tmp = await mkdtemp(path.join(tmpdir(), 'scan-cli-'));
    const result = await runCli(['scan', '--help'], tmp);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('scan a source tree for AI-security issues');
    expect(result.stdout).toContain('--diff');
  });

  it('scans a temp dir and writes SARIF to --output', async () => {
    const tmp = await mkdtemp(path.join(tmpdir(), 'scan-cli-'));
    await writeFile(
      path.join(tmp, 'a.py'),
      'query = "SELECT * FROM users WHERE id=" + user_id\nprint(query)\n',
    );
    const out = path.join(tmp, 'report.sarif');
    const result = await runCli(
      ['scan', tmp, '--format', 'sarif', '-o', out, '--validator', 'sql-injection'],
      tmp,
    );
    // exit 1 = findings present with --fail-on-findings (default on)
    expect(result.code).toBe(1);
    const raw = await readFile(out, 'utf-8');
    const parsed = JSON.parse(raw) as { version: string; runs: unknown[] };
    expect(parsed.version).toBe('2.1.0');
    expect(parsed.runs).toHaveLength(1);
    // Bare --validator names are normalised to the llm-judge-* metric the route serves.
    const hit = requests.find(
      (r) => r.url === '/api/v1/sdk/validators/input-validation/llm-judge-sql-injection',
    );
    expect(hit?.method).toBe('POST');
    expect(raw).toContain('String-concat SQL');
  });

  it('honours --no-fail-on-findings', async () => {
    const tmp = await mkdtemp(path.join(tmpdir(), 'scan-cli-'));
    await writeFile(path.join(tmp, 'a.py'), 'code = 1\n');
    const result = await runCli(
      ['scan', tmp, '--no-fail-on-findings', '--validator', 'sql-injection'],
      tmp,
    );
    expect(result.code).toBe(0);
  });

  it('exits 1 and stops after the first 401', async () => {
    const tmp = await mkdtemp(path.join(tmpdir(), 'scan-cli-'));
    await writeFile(path.join(tmp, 'a.py'), 'code = 1\n');
    const before = requests.length;
    const result = await runCli(
      ['scan', tmp, '--validator', 'bfla', '--validator', 'bola', '--no-fail-on-findings'],
      tmp,
      { DISSEQT_API_KEY: 'bad' },
    );
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('error: validator llm-judge-bfla');
    expect(requests.length - before).toBe(1);
  });

  it('exits 0 when no source files match', async () => {
    const tmp = await mkdtemp(path.join(tmpdir(), 'scan-cli-'));
    await writeFile(path.join(tmp, 'readme.txt'), 'not source\n');
    const result = await runCli(['scan', tmp, '--validator', 'sql-injection'], tmp);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('No source files matched');
  });
});
