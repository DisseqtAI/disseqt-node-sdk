import { AuthMissingError } from '../auth/errors.js';
import { DisseqtHttpError } from '../http/errors.js';
import { DisseqtResourceClient } from '../resources/index.js';

export const EXIT_OK = 0;
export const EXIT_FAILED = 1;
export const EXIT_USAGE = 2;

/** Resolve credentials via `DisseqtResourceClient`'s chain (env > `~/.disseqt/config.json`); exits 2 when none. */
export function buildClient(): DisseqtResourceClient {
  try {
    return new DisseqtResourceClient({});
  } catch (error) {
    if (error instanceof AuthMissingError) {
      process.stderr.write(
        'error: DISSEQT_API_KEY not set and no ~/.disseqt/config.json — run `disseqt login`\n',
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

/** Run states that end polling (testing runs, pack/plan runs, mr-jailbreak jobs). */
export const TERMINAL_STATUSES: ReadonlySet<string> = new Set([
  'completed',
  // pkg/testplan/walk.go: per-prompt failures still finalize as completed_with_errors.
  'completed_with_errors',
  'complete',
  'failed',
  'cancelled',
  'canceled',
  // api/testing_handlers.go cancel → `stopped` (with stop_reason).
  'stopped',
  'error',
  'errored',
  'blocked',
  'succeeded',
  'done',
]);

/**
 * Poll `getStatus` (unwrapped `data`) until `status`/`state` is terminal; throws at the deadline.
 * ponytail: constant interval; exp backoff if runs routinely miss the ceiling.
 */
export async function pollUntilTerminal<T extends Record<string, unknown>>(
  getStatus: () => Promise<T>,
  options: { intervalMs?: number; timeoutMs?: number } = {},
): Promise<T> {
  const interval = options.intervalMs ?? 3000;
  const timeoutMs = options.timeoutMs ?? 15 * 60 * 1000;
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const res = await getStatus();
    const status = String(res['status'] ?? res['state'] ?? '').toLowerCase();
    if (TERMINAL_STATUSES.has(status)) return res;
    if (Date.now() >= deadline) {
      throw new Error(
        `did not finish within ${timeoutMs / 1000}s (last status: "${status || '?'}")`,
      );
    }
    await new Promise((r) => setTimeout(r, interval));
  }
}
