import { AuthMissingError, DisseqtAuthError } from '../auth/errors.js';
import { DisseqtHttpError } from '../http/errors.js';
import { DisseqtResourceClient } from '../resources/index.js';

export const EXIT_OK = 0;
export const EXIT_FAILED = 1;
export const EXIT_USAGE = 2;
export const EXIT_INTERRUPTED = 130;

/** Bad input or missing identity discovered inside an action: exit 2. */
export class CliUsageError extends Error {}

/** Ctrl-C while polling: exit 130 like a shell-killed process. */
class InterruptedError extends Error {}

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
    if (error instanceof DisseqtAuthError) {
      process.stderr.write(`error: ${error.message}\n`);
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
    if (error instanceof InterruptedError) process.exit(EXIT_INTERRUPTED);
    const usageLike = error instanceof CliUsageError || error instanceof DisseqtAuthError;
    process.exit(usageLike ? EXIT_USAGE : EXIT_FAILED);
  }
}

export interface ScopeIds {
  projectId: string | null;
  organizationId: string | null;
}

/** Project/org ids from config/env/flag, asking `whoami()` only for what is still missing. */
export async function scopeIds(
  client: DisseqtResourceClient,
  opts: { organizationId?: string | undefined; needOrg: boolean },
): Promise<ScopeIds> {
  const envOrg = process.env['DISSEQT_ORGANIZATION_ID']?.trim();
  let projectId = client.transport.projectId ?? null;
  let organizationId =
    opts.organizationId ?? (envOrg !== undefined && envOrg !== '' ? envOrg : null);
  if (projectId === null || (opts.needOrg && organizationId === null)) {
    const who = await client.whoami();
    projectId ??= who.project_id;
    organizationId ??= who.organization_id;
  }
  return { projectId, organizationId };
}

/** Throw a usage error naming the env var that would supply a missing id. */
export function requireId(value: string | null, envVar: string): string {
  if (value === null) {
    throw new CliUsageError(`${envVar} is not set and \`disseqt whoami\` could not supply it`);
  }
  return value;
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

const nested = (res: Record<string, unknown>, key: string): unknown => {
  const v = res[key];
  return v !== null && typeof v === 'object' ? (v as Record<string, unknown>)['status'] : undefined;
};

/** Lower-cased status from top level, MR `{job}`, pack-run `{run}` or plan-run `{header}`. */
export function statusOf(res: Record<string, unknown>): string {
  const s =
    res['status'] ??
    res['state'] ??
    nested(res, 'job') ??
    nested(res, 'run') ??
    nested(res, 'header');
  return String(s ?? '').toLowerCase();
}

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

/** Poll until `status`/`state` is terminal; on deadline or SIGINT call `cancel`, then throw with a hint.
 *  ponytail: constant interval; exp backoff if runs routinely miss the ceiling. */
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
      status = statusOf(res);
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
  const message = `${reason}; ${outcome}${hint}`;
  throw reason.startsWith('interrupted') ? new InterruptedError(message) : new Error(message);
}
