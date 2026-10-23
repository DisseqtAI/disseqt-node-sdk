import type { Command } from 'commander';
import { existsSync } from 'node:fs';
import { createInterface, type Interface as ReadlineInterface } from 'node:readline';

import { DisseqtAuthError } from '../auth/errors.js';
import { resolveBaseUrl } from '../auth/resolve.js';
import * as tokenStore from '../auth/tokenStore.js';
import type { StoredAuth } from '../auth/types.js';
import { DisseqtHttpError } from '../http/errors.js';
import { DisseqtHttpTransport } from '../http/transport.js';
import { stripTrailingSlashes } from '../http/url.js';
import { RESOURCES_DEFAULT_BASE_URL } from '../resources/base.js';
import { buildClient, emit, EXIT_FAILED, EXIT_OK, EXIT_USAGE, runAction } from './config.js';

/** Cheap authenticated GET every project can hit — proves the key (and project, if given). */
const SMOKE_PATH = '/api/v1/testing/attack-techniques';
const PROMPT_URL = 'https://app.disseqt.ai/settings/api-keys';
const KEY_PREFIX_LEN = 8;

interface LoginOpts {
  apiKey?: string;
  projectId?: string;
  baseUrl?: string;
  json?: boolean;
}

interface LogoutOpts {
  json?: boolean;
}

/** Register `disseqt login` + `disseqt logout` on the root program. */
export function registerAuth(program: Command): void {
  program
    .command('login')
    .description('paste an API key, verify, store to ~/.disseqt/config.json')
    .option('--api-key <key>', 'skip prompt, use this API key')
    .option('--project-id <id>', 'optional; the API key already identifies its project')
    .option(
      '--base-url <url>',
      'override backend base URL (default: DISSEQT_BASE_URL or production)',
    )
    .option('--json', 'emit JSON on success', false)
    .action(async (opts: LoginOpts) => {
      await runLogin(opts);
    });

  program
    .command('whoami')
    .description('show the project / organization / user your API key resolves to')
    .option('--json', 'emit JSON', false)
    .action(async (opts: { json?: boolean }) => {
      await runAction(async () => {
        const client = buildClient();
        const identity = await client.whoami();
        emit({ ...identity, api_key: maskedPrefix(client.transport.apiKey) }, opts.json === true);
      });
    });

  program
    .command('logout')
    .description('clear the local ~/.disseqt/config.json (keys are revoked from the dashboard)')
    .option('--json', 'emit JSON on completion', false)
    .action(async (opts: LogoutOpts) => {
      await runLogout(opts);
    });
}

async function runLogin(opts: LoginOpts): Promise<void> {
  try {
    const auth = await collectCredentials(opts);
    const baseUrl = stripTrailingSlashes(
      resolveBaseUrl(opts.baseUrl) ?? RESOURCES_DEFAULT_BASE_URL,
    );
    await verify(auth, baseUrl);
    const stored: StoredAuth = { apiKey: auth.apiKey };
    if (auth.projectId !== undefined) stored.projectId = auth.projectId;
    if (opts.baseUrl !== undefined && opts.baseUrl.trim().length > 0) {
      stored.baseUrl = baseUrl;
    }
    await tokenStore.save(stored);
    emitSuccess(auth.apiKey, auth.projectId, opts.json === true);
    process.exit(EXIT_OK);
  } catch (error) {
    handleAuthError(error);
  }
}

async function runLogout(opts: LogoutOpts): Promise<void> {
  try {
    // Existence only: a corrupt or over-permissive file must still be removable.
    if (!existsSync(tokenStore.configPath())) {
      process.stdout.write('already logged out (no config file)\n');
      process.exit(EXIT_OK);
    }
    await tokenStore.clear();
    if (opts.json === true) {
      process.stdout.write(`${JSON.stringify({ logged_out: true })}\n`);
    } else {
      process.stdout.write('logged out\n');
    }
    process.exit(EXIT_OK);
  } catch (error) {
    handleAuthError(error);
  }
}

/** Read from flags first, fall back to interactive stdin. */
interface LoginCredentials {
  apiKey: string;
  projectId?: string;
}

async function collectCredentials(opts: LoginOpts): Promise<LoginCredentials> {
  const explicitKey = opts.apiKey?.trim();
  const explicitProject = opts.projectId?.trim();
  if (explicitKey !== undefined && explicitKey.length > 0) {
    return explicitProject !== undefined && explicitProject.length > 0
      ? { apiKey: explicitKey, projectId: explicitProject }
      : { apiKey: explicitKey };
  }
  if (process.stdin.isTTY !== true) {
    throw new UsageError('stdin is not a TTY — pass --api-key or run interactively');
  }
  process.stdout.write(`create or copy an API key: ${PROMPT_URL}\n\n`);
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  try {
    const apiKey =
      opts.apiKey !== undefined && opts.apiKey.trim().length > 0
        ? opts.apiKey.trim()
        : await promptSecret(rl, 'API key: ');
    if (apiKey.length === 0) throw new UsageError('API key cannot be empty');
    const projectId = (await promptLine(rl, 'Project ID (optional, Enter to skip): ')).trim();
    return projectId.length > 0 ? { apiKey, projectId } : { apiKey };
  } finally {
    rl.close();
  }
}

/** Node's readline hides its `_writeToOutput` behind an internal hook; type it here so we don't need `any`. */
interface MutableReadline extends ReadlineInterface {
  _writeToOutput?: (chunk: string) => void;
}

// ponytail: mutes echo via readline's internal `_writeToOutput`; use a prompt lib if this grows.
function promptSecret(rl: ReadlineInterface, prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const mutable = rl as MutableReadline;
    const original = mutable._writeToOutput;
    let muted = false;
    mutable._writeToOutput = (chunk: string): void => {
      if (muted) {
        if (chunk.includes('\n') || chunk.includes('\r')) {
          process.stdout.write(chunk);
        }
        return;
      }
      process.stdout.write(chunk);
    };
    rl.question(prompt, (answer) => {
      muted = false;
      if (original !== undefined) {
        mutable._writeToOutput = original;
      } else {
        delete mutable._writeToOutput;
      }
      process.stdout.write('\n');
      resolve(answer.trim());
    });
    muted = true;
  });
}

function promptLine(rl: ReadlineInterface, prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

/** GET the smoke path with the key (+ project if given): 401/403 → bad credentials. */
async function verify(auth: LoginCredentials, baseUrl: string): Promise<void> {
  const transport = new DisseqtHttpTransport(auth);
  try {
    await transport.requestRaw({ method: 'GET', url: `${baseUrl}${SMOKE_PATH}` });
  } catch (error) {
    if (
      error instanceof DisseqtHttpError &&
      (error.statusCode === 401 || error.statusCode === 403)
    ) {
      throw new AuthCheckFailed('invalid API key or project ID');
    }
    throw error;
  }
}

function emitSuccess(apiKey: string, projectId: string | undefined, json: boolean): void {
  const masked = maskedPrefix(apiKey);
  if (json) {
    process.stdout.write(
      `${JSON.stringify({ logged_in: true, api_key_prefix: masked, project_id: projectId ?? null })}\n`,
    );
    return;
  }
  const scope = projectId !== undefined ? ` (project ${projectId})` : '';
  process.stdout.write(`logged in as ${masked}${scope}\n`);
}

// At most 8 chars and never more than half the key, so short keys are not echoed whole.
function maskedPrefix(apiKey: string): string {
  return `${apiKey.slice(0, Math.min(KEY_PREFIX_LEN, Math.floor(apiKey.length / 2)))}…`;
}

class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UsageError';
  }
}

class AuthCheckFailed extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthCheckFailed';
  }
}

function handleAuthError(error: unknown): never {
  if (error instanceof UsageError) {
    process.stderr.write(`error: ${error.message}\n`);
    process.exit(EXIT_USAGE);
  }
  if (error instanceof AuthCheckFailed) {
    process.stderr.write(`error: ${error.message}\n`);
    process.exit(2);
  }
  if (error instanceof DisseqtAuthError) {
    process.stderr.write(`error: ${error.message}\n`);
    process.exit(EXIT_USAGE);
  }
  if (error instanceof DisseqtHttpError) {
    process.stderr.write(`error: ${error.message}\n`);
    process.exit(EXIT_FAILED);
  }
  const msg = error instanceof Error ? error.message : String(error);
  process.stderr.write(`error: ${msg}\n`);
  process.exit(EXIT_FAILED);
}
