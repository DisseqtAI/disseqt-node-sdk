import { DisseqtResourceClient } from '../resources/index.js';
import { DisseqtHttpError } from '../http/errors.js';

export const EXIT_OK = 0;
export const EXIT_FAILED = 1;
export const EXIT_USAGE = 2;

/**
 * Env-var-only config. Do NOT invent a `disseqt login` — the SDK contract
 * is `DISSEQT_PROJECT_ID` + `DISSEQT_API_KEY`, matching Python and CI setups.
 */
export function buildClient(): DisseqtResourceClient {
  const apiKey = process.env['DISSEQT_API_KEY'];
  const projectId = process.env['DISSEQT_PROJECT_ID'];
  const baseUrl = process.env['DISSEQT_BASE_URL'];

  if (apiKey === undefined || apiKey.trim().length === 0) {
    process.stderr.write('error: DISSEQT_API_KEY is not set\n');
    process.exit(EXIT_USAGE);
  }
  if (projectId === undefined || projectId.trim().length === 0) {
    process.stderr.write('error: DISSEQT_PROJECT_ID is not set\n');
    process.exit(EXIT_USAGE);
  }
  const cfg: ConstructorParameters<typeof DisseqtResourceClient>[0] = { apiKey, projectId };
  if (baseUrl !== undefined && baseUrl.trim().length > 0) {
    cfg.baseUrl = baseUrl;
  }
  return new DisseqtResourceClient(cfg);
}

/** Print + exit helper used by every command. */
export function emit(value: unknown, json: boolean): void {
  if (json) {
    process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
    return;
  }
  if (typeof value === 'string') {
    process.stdout.write(`${value}\n`);
    return;
  }
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

/** Run an async action, convert known errors to exit codes. */
export async function runAction(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    process.exit(EXIT_OK);
  } catch (error) {
    if (error instanceof DisseqtHttpError) {
      process.stderr.write(`error: ${error.message} (status ${error.statusCode})\n`);
      if (error.responseBody) {
        process.stderr.write(`${error.responseBody}\n`);
      }
      process.exit(EXIT_FAILED);
    }
    const msg = error instanceof Error ? error.message : String(error);
    process.stderr.write(`error: ${msg}\n`);
    process.exit(EXIT_FAILED);
  }
}

/**
 * Poll `getStatus` until it returns a terminal status or timeout elapses.
 * Terminal statuses: completed, failed, cancelled, error, blocked, succeeded.
 * ponytail: constant 3s interval + 15min ceiling; upgrade to exp backoff if runs
 * routinely miss the ceiling.
 */
export async function pollUntilTerminal<T extends Record<string, unknown>>(
  getStatus: () => Promise<T>,
  options: { intervalMs?: number; timeoutMs?: number } = {},
): Promise<T> {
  const interval = options.intervalMs ?? 3000;
  const deadline = Date.now() + (options.timeoutMs ?? 15 * 60 * 1000);
  const terminal = new Set([
    'completed',
    // pkg/testplan/walk.go: a test-plan run may terminate with per-prompt
    // execution failures but still finalize; that state is 'completed_with_errors'.
    'completed_with_errors',
    'complete',
    'failed',
    'cancelled',
    'canceled',
    'error',
    'errored',
    'blocked',
    'succeeded',
    'success',
  ]);
  for (;;) {
    const res = await getStatus();
    const status = String(res['status'] ?? '').toLowerCase();
    if (terminal.has(status)) return res;
    if (Date.now() > deadline) return res;
    await new Promise((r) => setTimeout(r, interval));
  }
}
