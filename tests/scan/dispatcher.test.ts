import { describe, expect, it, vi } from 'vitest';

import { DisseqtHttpError } from '../../src/http/errors.js';

import {
  APPSEC_VALIDATORS,
  batchChunks,
  dispatch,
  extractFindingsList,
  findingsFromMetric,
  newDispatchStats,
  normalizeValidator,
  resolveBatchChars,
  validatorPath,
} from '../../src/scan/index.js';
import type { CodeChunk, CodeFinding, ScanTransport } from '../../src/scan/index.js';

const chunk = (file: string, text: string, startLine = 1, endLine = 1): CodeChunk => ({
  file_path: file,
  language: 'typescript',
  start_line: startLine,
  end_line: endLine,
  text,
});

async function collect<T>(iter: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const x of iter) out.push(x);
  return out;
}

describe('dispatcher', () => {
  it('resolveBatchChars: CLI beats env beats default', () => {
    expect(resolveBatchChars(500)).toBe(500);
    delete process.env['DISSEQT_SCAN_CONTEXT_LIMIT'];
    expect(resolveBatchChars(null)).toBe(40_000);
    process.env['DISSEQT_SCAN_CONTEXT_LIMIT'] = '999';
    expect(resolveBatchChars(null)).toBe(999);
    delete process.env['DISSEQT_SCAN_CONTEXT_LIMIT'];
  });

  it('validatorPath renders the {domain}/{validator} template', () => {
    expect(validatorPath('llm-judge-bfla')).toBe(
      '/api/v1/sdk/validators/input-validation/llm-judge-bfla',
    );
  });

  // The judge route serves llm-judge-* metrics only; bare names 404.
  it('normalizeValidator prefixes llm-judge- and kebab-cases', () => {
    expect(normalizeValidator('bfla')).toBe('llm-judge-bfla');
    expect(normalizeValidator('Shell_Injection')).toBe('llm-judge-shell-injection');
    expect(normalizeValidator('llm-judge-bola')).toBe('llm-judge-bola');
    expect(APPSEC_VALIDATORS).toEqual([
      'llm-judge-bfla',
      'llm-judge-bola',
      'llm-judge-rbac',
      'llm-judge-shell-injection',
      'llm-judge-debug-access',
      'llm-judge-intellectual-property',
    ]);
  });

  it('batchChunks groups under batchChars', async () => {
    const chunks = [
      chunk('a.ts', 'x'.repeat(30)),
      chunk('b.ts', 'y'.repeat(30)),
      chunk('c.ts', 'z'.repeat(30)),
    ];
    // With budget 50, each next chunk overflows -> one chunk per batch.
    const tight = await collect(batchChunks(chunks, 50));
    expect(tight).toHaveLength(3);
    // With budget 100, all three chunks (90 chars) fit in one batch.
    const loose = await collect(batchChunks(chunks, 100));
    expect(loose).toHaveLength(1);
    // With budget 65, first two fit (60), third overflows -> two batches.
    const mid = await collect(batchChunks(chunks, 65));
    expect(mid).toHaveLength(2);
  });

  it('dispatch POSTs each batch to every validator and aggregates findings', async () => {
    const transport: ScanTransport = vi.fn(async (_method, path) => {
      if (path.endsWith('/llm-judge-bfla')) {
        return {
          data: {
            findings: [
              {
                file_path: 'a.ts',
                vulnerability: 'BFLA',
                vulnerability_type: 'bfla',
                severity: 'high',
                reason: 'missing auth check',
                line_start: 1,
              },
            ],
          },
        };
      }
      return { data: { findings: [] } };
    });
    const stats = newDispatchStats();
    const chunks = [chunk('a.ts', 'code\n'), chunk('b.ts', 'code\n')];
    const findings: CodeFinding[] = await collect(
      dispatch(chunks, ['bfla', 'bola'], transport, { batchChars: 1000, stats }),
    );
    // 1 batch x 2 validators = 2 requests
    expect(transport).toHaveBeenCalledTimes(2);
    expect(stats.total_batches).toBe(2);
    expect(stats.batches_ok).toBe(2);
    expect(stats.batches_failed).toBe(0);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.validator).toBe('llm-judge-bfla');
    expect(findings[0]?.severity).toBe('high');
    const paths = (transport as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[1]);
    expect(paths).toEqual([
      '/api/v1/sdk/validators/input-validation/llm-judge-bfla',
      '/api/v1/sdk/validators/input-validation/llm-judge-bola',
    ]);
  });

  it('dispatch turns a compat metric envelope into one finding per chunk', async () => {
    const transport: ScanTransport = vi.fn(async () => ({
      data: {
        metric_name: 'llm-judge-bfla',
        actual_value: 0.82,
        metric_labels: ['fail'],
        threshold: ['fail'],
        threshold_score: 0.5,
        others: { reason: 'endpoint skips the authorization check' },
      },
    }));
    const chunks = [chunk('a.ts', 'code\n', 1, 3), chunk('b.ts', 'code\n', 10, 12)];
    const findings = await collect(dispatch(chunks, ['bfla'], transport, { batchChars: 1000 }));
    expect(findings).toHaveLength(2);
    expect(findings.map((f) => f.file_path)).toEqual(['a.ts', 'b.ts']);
    expect(findings[0]).toMatchObject({
      vulnerability: 'llm-judge-bfla',
      vulnerability_type: 'bfla',
      severity: 'high',
      reason: 'endpoint skips the authorization check',
      line_start: 1,
      line_end: 3,
      validator: 'llm-judge-bfla',
    });
  });

  it('findingsFromMetric: below threshold → none; severity label wins over score', () => {
    const batch = { chunks: [chunk('a.ts', 'x')] };
    expect(
      findingsFromMetric(
        { data: { actual_value: 0.2, threshold_score: 0.5 } },
        'llm-judge-bola',
        batch,
      ),
    ).toEqual([]);
    expect(
      findingsFromMetric(
        { data: { actual_value: 0.95, metric_labels: ['medium'], threshold_score: 0.5 } },
        'llm-judge-bola',
        batch,
      )[0]?.severity,
    ).toBe('medium');
    expect(
      findingsFromMetric({ data: { actual_value: 0.95 } }, 'llm-judge-bola', batch)[0]?.severity,
    ).toBe('critical');
    expect(findingsFromMetric({ data: { findings: [] } }, 'llm-judge-bola', batch)).toEqual([]);
  });

  it('dispatch tolerates per-batch errors', async () => {
    const transport: ScanTransport = vi.fn(async (_method, path) => {
      if (path.endsWith('/llm-judge-bfla')) throw new Error('backend down');
      return { data: { findings: [] } };
    });
    const stats = newDispatchStats();
    const findings = await collect(
      dispatch([chunk('a.ts', 'code\n')], ['bfla', 'bola'], transport, { stats }),
    );
    expect(findings).toHaveLength(0);
    expect(stats.batches_failed).toBe(1);
    expect(stats.batches_ok).toBe(1);
    expect(stats.first_error).toBe('validator llm-judge-bfla: backend down');
  });

  it('dispatch stops after the first 401/403', async () => {
    const transport: ScanTransport = vi.fn(async () => {
      throw new DisseqtHttpError(403, 'forbidden');
    });
    const stats = newDispatchStats();
    await collect(dispatch([chunk('a.ts', 'code\n')], ['bfla', 'bola'], transport, { stats }));
    expect(transport).toHaveBeenCalledTimes(1);
    expect(stats.batches_failed).toBe(1);
    expect(stats.batches_ok).toBe(0);
    expect(stats.first_error).toContain('HTTP 403');
  });

  it('extractFindingsList handles data.findings, data.issues, top-level, and rejects garbage', () => {
    expect(extractFindingsList({ data: { findings: [{ a: 1 }] } })).toEqual([{ a: 1 }]);
    expect(extractFindingsList({ data: { issues: [{ b: 2 }] } })).toEqual([{ b: 2 }]);
    expect(extractFindingsList({ findings: [{ c: 3 }] })).toEqual([{ c: 3 }]);
    expect(extractFindingsList({ nothing: 'here' })).toEqual([]);
    expect(extractFindingsList(null)).toEqual([]);
    expect(extractFindingsList('not an object')).toEqual([]);
  });
});
