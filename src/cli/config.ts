import { AuthMissingError } from '../auth/errors.js';
import { DisseqtHttpError } from '../http/errors.js';
import { DisseqtResourceClient } from '../resources/index.js';

export const EXIT_OK = 0;
export const EXIT_FAILED = 1;
export const EXIT_USAGE = 2;

/**
 * Resolve credentials via `DisseqtResourceClient`'s built-in chain
 * (constructor args → `~/.disseqt/config.json` → `DISSEQT_*` env vars).
 * The two env vars used to be required here; keeping them explicit for
 * back-compat with existing CI setups that only export env vars.
 */
export function buildClient(): DisseqtResourceClient {
  try {
    return new DisseqtResourceClient({});
  } catch (error) {
    if (error instanceof AuthMissingError) {
      process.stderr.write(
        'error: DISSEQT_API_KEY / DISSEQT_PROJECT_ID not set and no ~/.disseqt/config.json — run `disseqt login`\n',
      );
      process.exit(EXIT_USAGE);
    }
    throw error;
  }
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
