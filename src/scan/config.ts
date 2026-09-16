// Auto-discovery for `.disseqt-code-scan.yaml` in the scan root.
// js-yaml is optional — if it isn't installed we silently skip.

import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import type { ScanConfig } from './schema.js';

export const CONFIG_FILENAME = '.disseqt-code-scan.yaml';

export function emptyConfig(): ScanConfig {
  return {
    validators: [],
    min_severity: null,
    max_file_bytes: null,
    max_chunk_chars: null,
    batch_chars: null,
    extra_skip_globs: [],
  };
}

/** Return the path to `.disseqt-code-scan.yaml` in `root` if present. */
export async function discover(root: string): Promise<string | null> {
  const candidate = path.join(root, CONFIG_FILENAME);
  try {
    const st = await stat(candidate);
    return st.isFile() ? candidate : null;
  } catch {
    return null;
  }
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const v of value) {
    if (typeof v === 'string' && v.length > 0) out.push(v);
  }
  return out;
}

function toIntOrNull(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === 'string') {
    const n = Number.parseInt(value, 10);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/** Load config from the scan root, returning defaults if missing. */
export async function loadConfig(root: string): Promise<ScanConfig> {
  const p = await discover(root);
  if (p === null) return emptyConfig();

  let yaml;
  try {
    // Dynamic import so missing js-yaml gracefully degrades to defaults.
    yaml = await import('js-yaml');
  } catch {
    return emptyConfig();
  }
  let raw: unknown;
  try {
    const text = await readFile(p, 'utf-8');
    raw = yaml.load(text);
  } catch {
    return emptyConfig();
  }
  if (raw === null || raw === undefined || typeof raw !== 'object' || Array.isArray(raw)) {
    return emptyConfig();
  }
  const obj = raw as Record<string, unknown>;
  const minSev = obj['min_severity'];
  return {
    validators: toStringArray(obj['validators']),
    min_severity: typeof minSev === 'string' && minSev.length > 0 ? minSev : null,
    max_file_bytes: toIntOrNull(obj['max_file_bytes']),
    max_chunk_chars: toIntOrNull(obj['max_chunk_chars']),
    batch_chars: toIntOrNull(obj['batch_chars']),
    extra_skip_globs: toStringArray(obj['extra_skip_globs']),
  };
}
