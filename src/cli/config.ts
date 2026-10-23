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

export interface PollOptions {
  intervalMs?: number;
  timeoutMs?: number;
  /** Id shown in the hint. */
  id?: string;
  /** Called on timeout or Ctrl-C before giving up (e.g. cancel the run). */
  cancel?: () => Promise<unknown>;
  /** Command that inspects the job later, e.g. `disseqt redteam status <id>`. */
  statusCommand?: string;
}

/**
 * Poll `getStatus` (unwrapped `data`) until `status`/`state` is terminal. On deadline or
 * SIGINT it calls `cancel`, prints a hint, and throws (exit 1 via `runAction`).
 * ponytail: constant interval; exp backoff if runs routinely miss the ceiling.
 */
export async function pollUntilTerminal<T extends Record<string, unknown>>(
  getStatus: () => Promise<T>,
  options: PollOptions = {},
): Promise<T> {
  const interval = options.intervalMs ?? 3000;
  const timeoutMs = options.timeoutMs ?? 15 * 60 * 1000;
  const deadline = Date.now() + timeoutMs;
  let onSigint = (): void => undefined;
  const interrupted = new Promise<'interrupted'>((resolve) => {
    onSigint = () => resolve('interrupted');
  });
  process.once('SIGINT', onSigint);
  let status = '';
  try {
    for (;;) {
      const res = await Promise.race([getStatus(), interrupted]);
      if (res === 'interrupted') return await giveUp('interrupted (Ctrl-C)', options);
      status = String(res['status'] ?? res['state'] ?? '').toLowerCase();
      if (TERMINAL_STATUSES.has(status)) return res;
      if (Date.now() >= deadline) {
        const why = `did not finish within ${timeoutMs / 1000}s (last status: "${status || '?'}")`;
        return await giveUp(why, options);
      }
      const slept = await Promise.race([
        new Promise<'slept'>((r) => setTimeout(() => r('slept'), interval)),
        interrupted,
      ]);
      if (slept === 'interrupted') return await giveUp('interrupted (Ctrl-C)', options);
    }
  } finally {
    process.removeListener('SIGINT', onSigint);
  }
}

async function giveUp(reason: string, options: PollOptions): Promise<never> {
  const id = options.id ?? 'job';
  let outcome = `${id} is still running`;
  if (options.cancel !== undefined) {
    try {
      await options.cancel();
      outcome = `cancelled ${id}`;
    } catch (error) {
      outcome = `cancel of ${id} failed: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
  const hint =
    options.statusCommand !== undefined ? `; inspect with \`${options.statusCommand}\`` : '';
  throw new Error(`${reason}; ${outcome}${hint}`);
}
