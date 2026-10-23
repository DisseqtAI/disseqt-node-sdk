import {
  accessSync,
  chmodSync,
  constants,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';

import { AuthConfigPermissionError } from './errors.js';
import type { StoredAuth } from './types.js';

/**
 * Fixed on-disk layout — matches the Python SDK so a `disseqt login` from
 * either CLI writes a file the other can read.
 */
export const CONFIG_DIR_NAME = '.disseqt';
export const CONFIG_FILE_NAME = 'config.json';

export function configDir(): string {
  // Tests + local overrides use `DISSEQT_CONFIG_HOME` to avoid touching
  // the real `~/.disseqt`. Falls back to the OS home.
  const override = process.env['DISSEQT_CONFIG_HOME'];
  const root = override !== undefined && override.length > 0 ? override : homedir();
  return join(root, CONFIG_DIR_NAME);
}

export function configPath(): string {
  return join(configDir(), CONFIG_FILE_NAME);
}

/** Stored auth, or null when absent; throws `AuthConfigPermissionError` if wider than 0o600 (skipped on Windows). */
export async function load(): Promise<StoredAuth | null> {
  return loadSync();
}

/** Sync sibling for constructor-time resolution (constructors can't await). */
export function loadSync(): StoredAuth | null {
  const path = configPath();
  try {
    accessSync(path, constants.R_OK);
  } catch {
    return null;
  }
  if (platform() !== 'win32') {
    const st = statSync(path);
    const mode = st.mode & 0o777;
    if ((mode & 0o077) !== 0) {
      throw new AuthConfigPermissionError(path, mode);
    }
  }
  const raw = readFileSync(path, 'utf-8');
  const parsed = JSON.parse(raw) as { auth?: Record<string, unknown> };
  const auth = parsed.auth;
  if (auth === undefined || auth === null || typeof auth !== 'object') {
    return null;
  }
  const apiKey = auth['api_key'];
  const projectId = auth['project_id'];
  const baseUrl = auth['base_url'];
  if (typeof apiKey !== 'string' || apiKey.length === 0) return null;
  const out: StoredAuth = { apiKey };
  if (typeof projectId === 'string' && projectId.length > 0) out.projectId = projectId;
  if (typeof baseUrl === 'string' && baseUrl.length > 0) {
    out.baseUrl = baseUrl;
  }
  return out;
}

/** Write `~/.disseqt/config.json` (dir 0o700, file 0o600); existing wider modes are tightened first. */
export async function save(auth: StoredAuth): Promise<void> {
  const dir = configDir();
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  // `mode` only applies on create, so tighten pre-existing paths before the key lands.
  if (platform() !== 'win32') {
    chmodSync(dir, 0o700);
    if (existsSync(configPath())) chmodSync(configPath(), 0o600);
  }
  const payload = {
    auth: {
      api_key: auth.apiKey,
      ...(auth.projectId !== undefined ? { project_id: auth.projectId } : {}),
      ...(auth.baseUrl !== undefined ? { base_url: auth.baseUrl } : {}),
    },
  };
  writeFileSync(configPath(), `${JSON.stringify(payload, null, 2)}\n`, {
    mode: 0o600,
  });
}

function isNodeError(v: unknown): v is Error & { code: string } {
  return v instanceof Error && typeof (v as { code?: unknown }).code === 'string';
}

/** Delete the config file; idempotent (no-op if it doesn't exist). */
export async function clear(): Promise<void> {
  try {
    unlinkSync(configPath());
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') return;
    throw error;
  }
}
