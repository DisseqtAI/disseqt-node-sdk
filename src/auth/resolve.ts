import { AuthMissingError } from './errors.js';
import { loadSync } from './tokenStore.js';

/**
 * Resolve credentials for the sync client constructors. Order —
 * constructor args always win, then the on-disk config from `disseqt
 * login`, then env vars. `AuthMissingError` only fires when all three
 * sources come up empty. Keeps the constructor sync (fs is sync) so
 * `new Client(...)` stays a one-liner at call sites.
 */
export interface AuthOverrides {
  apiKey?: string;
  projectId?: string;
  baseUrl?: string;
}

export interface ResolvedAuth {
  apiKey: string;
  projectId: string;
  baseUrl?: string;
}

export function resolveAuthSync(overrides: AuthOverrides = {}): ResolvedAuth {
  const explicit = pick(overrides);
  if (explicit.apiKey !== undefined && explicit.projectId !== undefined) {
    return maybeBase(explicit as ResolvedAuth, overrides.baseUrl);
  }
  const stored = loadSync();
  const env = pickEnv();
  const apiKey = explicit.apiKey ?? stored?.apiKey ?? env.apiKey;
  const projectId = explicit.projectId ?? stored?.projectId ?? env.projectId;
  const baseUrl = overrides.baseUrl ?? stored?.baseUrl ?? env.baseUrl;
  if (apiKey === undefined || projectId === undefined) {
    throw new AuthMissingError();
  }
  return maybeBase({ apiKey, projectId }, baseUrl);
}

function pick(o: AuthOverrides): AuthOverrides {
  const out: AuthOverrides = {};
  if (isNonEmpty(o.apiKey)) out.apiKey = o.apiKey;
  if (isNonEmpty(o.projectId)) out.projectId = o.projectId;
  if (isNonEmpty(o.baseUrl)) out.baseUrl = o.baseUrl;
  return out;
}

function pickEnv(): AuthOverrides {
  const out: AuthOverrides = {};
  const k = process.env['DISSEQT_API_KEY'];
  const p = process.env['DISSEQT_PROJECT_ID'];
  const b = process.env['DISSEQT_BASE_URL'];
  if (isNonEmpty(k)) out.apiKey = k;
  if (isNonEmpty(p)) out.projectId = p;
  if (isNonEmpty(b)) out.baseUrl = b;
  return out;
}

function maybeBase(a: ResolvedAuth, baseUrl: string | undefined): ResolvedAuth {
  if (isNonEmpty(baseUrl)) return { ...a, baseUrl };
  return a;
}

function isNonEmpty(v: string | undefined): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}
