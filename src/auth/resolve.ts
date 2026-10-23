import { AuthMissingError } from './errors.js';
import { loadSync } from './tokenStore.js';

/**
 * Resolve credentials for the sync client constructors. Precedence matches the
 * Python SDK: constructor args > `DISSEQT_*` env vars > `~/.disseqt/config.json`.
 * Only the API key is required; the project id is derived server-side from it.
 */
export interface AuthOverrides {
  apiKey?: string;
  projectId?: string;
  baseUrl?: string;
}

export interface ResolvedAuth {
  apiKey: string;
  projectId?: string;
  baseUrl?: string;
}

export function resolveAuthSync(overrides: AuthOverrides = {}): ResolvedAuth {
  const explicit = pick(overrides);
  const env = pickEnv();
  // The project id always comes from the same source as the key, so an env key
  // is never paired with a stored project (that pair would 401).
  const source = explicit.apiKey !== undefined ? explicit : env.apiKey !== undefined ? env : null;
  // The stored config is a unit: only read when no key came from args/env.
  const stored = source === null ? loadSync() : null;
  const keySource = source ?? stored;
  if (keySource?.apiKey === undefined) throw new AuthMissingError();
  const projectId =
    explicit.projectId ?? (keySource === explicit ? env.projectId : keySource.projectId);
  const out: ResolvedAuth = { apiKey: keySource.apiKey };
  if (projectId !== undefined) out.projectId = projectId;
  const baseUrl = explicit.baseUrl ?? env.baseUrl ?? stored?.baseUrl;
  if (baseUrl !== undefined) out.baseUrl = baseUrl;
  return out;
}

function pick(o: AuthOverrides): AuthOverrides {
  const out: AuthOverrides = {};
  if (isNonEmpty(o.apiKey)) out.apiKey = o.apiKey;
  if (isNonEmpty(o.projectId)) out.projectId = o.projectId;
  if (isNonEmpty(o.baseUrl)) out.baseUrl = o.baseUrl;
  return out;
}

function pickEnv(): AuthOverrides {
  return pick({
    apiKey: process.env['DISSEQT_API_KEY'],
    projectId: process.env['DISSEQT_PROJECT_ID'],
    baseUrl: process.env['DISSEQT_BASE_URL'],
  } as AuthOverrides);
}

function isNonEmpty(v: string | undefined): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}
