// Batch code chunks and POST them to disseqt-go validators.

import type { DisseqtHttpTransport } from '../http/index.js';
import { DisseqtHttpError } from '../http/errors.js';
import { stripTrailingSlashes } from '../http/url.js';
import type { CodeChunk, CodeFinding, Severity } from './schema.js';

export const DEFAULT_BATCH_CHARS = 40_000;
export const BATCH_CHARS_ENV = 'DISSEQT_SCAN_CONTEXT_LIMIT';

/** App-security judges — default set for `disseqt scan`. */
export const APPSEC_VALIDATORS: readonly string[] = [
  'bfla',
  'bola',
  'rbac',
  'shell-injection',
  'debug-access',
  'intellectual-property',
];

/** Validators that exist on disseqt-go today; a safe fallback. */
export const FALLBACK_VALIDATORS: readonly string[] = [
  'sql-injection',
  'prompt-injection',
  'data-leakage',
  'insecure-output',
];

export const VALIDATOR_DOMAIN = 'input-validation';
const VALIDATOR_PATH_TEMPLATE = '/api/v1/sdk/validators/{domain}/{validator}';
export const BASE_ENV = 'DISSEQT_BASE_URL';
export const DEFAULT_BASE = 'https://api.disseqt.ai/realtime-validations';

/** CLI flag beats env var beats default. */
export function resolveBatchChars(cliValue: number | null | undefined): number {
  if (cliValue !== undefined && cliValue !== null && cliValue > 0) return cliValue;
  const env = process.env[BATCH_CHARS_ENV];
  if (env !== undefined && env.length > 0) {
    const n = Number.parseInt(env, 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return DEFAULT_BATCH_CHARS;
}

export interface ChunkBatch {
  chunks: readonly CodeChunk[];
}

export function batchTotalChars(batch: ChunkBatch): number {
  let sum = 0;
  for (const c of batch.chunks) sum += c.text.length;
  return sum;
}

/** Concatenate chunks into a single prompt with file/line markers. */
export function batchAsPrompt(batch: ChunkBatch): string {
  const parts: string[] = [];
  for (const chunk of batch.chunks) {
    parts.push(
      `--- FILE: ${chunk.file_path} (lines ${chunk.start_line}-${chunk.end_line}, ${chunk.language}) ---\n${chunk.text}`,
    );
  }
  return parts.join('\n');
}

/** Yield `ChunkBatch` groups, each under `batchChars` of text. */
export async function* batchChunks(
  chunks: AsyncIterable<CodeChunk> | Iterable<CodeChunk>,
  batchChars: number = DEFAULT_BATCH_CHARS,
): AsyncIterableIterator<ChunkBatch> {
  let buf: CodeChunk[] = [];
  let bufSize = 0;
  for await (const chunk of chunks) {
    const size = chunk.text.length;
    if (buf.length > 0 && bufSize + size > batchChars) {
      yield { chunks: buf };
      buf = [];
      bufSize = 0;
    }
    buf.push(chunk);
    bufSize += size;
  }
  if (buf.length > 0) yield { chunks: buf };
}

export interface DispatchStats {
  total_batches: number;
  batches_ok: number;
  batches_failed: number;
  findings_by_validator: Record<string, number>;
}

export function newDispatchStats(): DispatchStats {
  return {
    total_batches: 0,
    batches_ok: 0,
    batches_failed: 0,
    findings_by_validator: {},
  };
}

/** Transport hook — split out so tests can inject a fake. */
export type ScanTransport = (
  method: 'POST',
  path: string,
  body: Record<string, unknown>,
) => Promise<unknown>;

export function validatorPath(validator: string, domain: string = VALIDATOR_DOMAIN): string {
  return VALIDATOR_PATH_TEMPLATE.replace('{domain}', domain).replace('{validator}', validator);
}

function buildPayload(batch: ChunkBatch, validator: string): Record<string, unknown> {
  return {
    input_data: {
      llm_input_query: batchAsPrompt(batch),
    },
    config_input: {
      scan_mode: 'code',
      validator,
      chunk_count: batch.chunks.length,
    },
  };
}

function coerceSeverity(value: unknown): Severity {
  if (typeof value === 'string') {
    const low = value.trim().toLowerCase();
    if (low === 'critical' || low === 'high' || low === 'medium' || low === 'low') {
      return low;
    }
    if (low === 'error' || low === 'err') return 'high';
    if (low === 'warn' || low === 'warning' || low === 'info') return 'medium';
  }
  return 'medium';
}

function findChunkFor(filePath: string, batch: ChunkBatch): CodeChunk | null {
  for (const chunk of batch.chunks) {
    if (chunk.file_path === filePath) return chunk;
  }
  return null;
}

function sliceSnippet(chunk: CodeChunk, lineStart: number, lineEnd: number | null): string | null {
  if (lineStart < chunk.start_line || lineStart > chunk.end_line) return null;
  const lines = chunk.text.split('\n');
  if (lines.length === 0) return null;
  const end = lineEnd ?? lineStart;
  const clampedEnd = Math.min(end, chunk.end_line);
  const lo = Math.max(0, lineStart - chunk.start_line);
  const hi = Math.min(lines.length, clampedEnd - chunk.start_line + 1);
  const result = lines.slice(lo, hi).join('\n');
  return result.length > 0 ? result : null;
}

function readString(raw: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const val = raw[key];
    if (typeof val === 'string' && val.length > 0) return val;
  }
  return null;
}

function readInt(raw: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    const val = raw[key];
    if (typeof val === 'number' && Number.isFinite(val)) return Math.trunc(val);
    if (typeof val === 'string') {
      const n = Number.parseInt(val, 10);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function findingFromDict(
  raw: Record<string, unknown>,
  validator: string,
  batch: ChunkBatch,
): CodeFinding | null {
  let filePath = readString(raw, 'file_path', 'file', 'path');
  if (filePath === null && batch.chunks.length > 0) {
    filePath = batch.chunks[0]?.file_path ?? null;
  }
  if (filePath === null || filePath.length === 0) return null;

  const chunk = findChunkFor(filePath, batch);
  const lineStart = readInt(raw, 'line_start', 'start_line', 'line') ?? 1;
  const lineEnd = readInt(raw, 'line_end', 'end_line');

  const vuln = readString(raw, 'vulnerability', 'title', 'message') ?? validator;
  const vulnType = readString(raw, 'vulnerability_type', 'type') ?? validator;
  const reason = readString(raw, 'reason', 'description', 'detail') ?? vuln;

  let snippet = readString(raw, 'code_snippet', 'snippet');
  if (snippet === null && chunk !== null) {
    snippet = sliceSnippet(chunk, lineStart, lineEnd);
  }

  return {
    file_path: filePath,
    vulnerability: vuln,
    vulnerability_type: vulnType,
    severity: coerceSeverity(raw['severity']),
    reason,
    line_start: lineStart,
    line_end: lineEnd,
    recommendation: readString(raw, 'recommendation', 'fix'),
    code_snippet: snippet,
    validator,
  };
}

/** Pull the findings array out of a validator response envelope, or []. */
export function extractFindingsList(envelope: unknown): Record<string, unknown>[] {
  if (envelope === null || typeof envelope !== 'object') return [];
  const env = envelope as Record<string, unknown>;
  const holders: Record<string, unknown>[] = [];
  const data = env['data'];
  if (data !== null && typeof data === 'object') {
    holders.push(data as Record<string, unknown>);
  }
  holders.push(env);
  for (const holder of holders) {
    for (const key of ['findings', 'issues', 'results']) {
      const val = holder[key];
      if (Array.isArray(val)) {
        return val.filter(
          (x): x is Record<string, unknown> =>
            typeof x === 'object' && x !== null && !Array.isArray(x),
        );
      }
    }
  }
  return [];
}

export interface DispatchOptions {
  batchChars?: number;
  transport?: ScanTransport;
  stats?: DispatchStats;
  onProgress?: (done: number, total: number) => void;
}

/**
 * POST batches to each validator and yield the parsed findings.
 * Batch-level failures are logged (via `onError`) and skipped so one flaky
 * validator doesn't kill the whole scan.
 */
export async function* dispatch(
  chunks: AsyncIterable<CodeChunk> | Iterable<CodeChunk>,
  validators: readonly string[],
  transport: ScanTransport,
  options: DispatchOptions = {},
): AsyncIterableIterator<CodeFinding> {
  const stats = options.stats ?? newDispatchStats();
  const batchChars = options.batchChars ?? DEFAULT_BATCH_CHARS;
  if (validators.length === 0) return;

  // Materialise so we can report total up front (parity with Python's list(...) call).
  const batches: ChunkBatch[] = [];
  for await (const b of batchChunks(chunks, batchChars)) {
    batches.push(b);
  }
  stats.total_batches = batches.length * Math.max(validators.length, 1);

  let done = 0;
  for (const batch of batches) {
    for (const validator of validators) {
      let envelope: unknown;
      try {
        envelope = await transport(
          'POST',
          validatorPath(validator),
          buildPayload(batch, validator),
        );
      } catch (error) {
        stats.batches_failed += 1;
        if (error instanceof DisseqtHttpError) {
          process.stderr.write(
            `[warn] validator ${validator} failed for batch of ${batch.chunks.length} chunks: ${error.message}\n`,
          );
        } else {
          const msg = error instanceof Error ? error.message : String(error);
          process.stderr.write(`[warn] validator ${validator} errored: ${msg}\n`);
        }
        done += 1;
        options.onProgress?.(done, stats.total_batches);
        continue;
      }
      stats.batches_ok += 1;
      for (const raw of extractFindingsList(envelope)) {
        const finding = findingFromDict(raw, validator, batch);
        if (finding === null) continue;
        stats.findings_by_validator[validator] = (stats.findings_by_validator[validator] ?? 0) + 1;
        yield finding;
      }
      done += 1;
      options.onProgress?.(done, stats.total_batches);
    }
  }
}

/** Default transport backed by the SDK's HTTP layer. */
export function makeDefaultTransport(
  transport: DisseqtHttpTransport,
  baseUrl: string,
): ScanTransport {
  const trimmedBase = stripTrailingSlashes(baseUrl);
  return async (method, path, body) => {
    return transport.requestJson({
      method,
      url: `${trimmedBase}${path}`,
      json: body as Record<string, unknown>,
    });
  };
}
