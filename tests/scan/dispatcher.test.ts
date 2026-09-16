import { describe, expect, it, vi } from 'vitest';

import {
  batchChunks,
  dispatch,
  extractFindingsList,
  newDispatchStats,
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
    expect(validatorPath('bfla')).toBe('/api/v1/sdk/validators/input-validation/bfla');
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
      if (path.endsWith('/bfla')) {
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
    expect(findings[0]?.validator).toBe('bfla');
    expect(findings[0]?.severity).toBe('high');
  });

  it('dispatch tolerates per-batch errors', async () => {
    const transport: ScanTransport = vi.fn(async (_method, path) => {
      if (path.endsWith('/bfla')) throw new Error('backend down');
      return { data: { findings: [] } };
    });
    const stats = newDispatchStats();
    const findings = await collect(
      dispatch([chunk('a.ts', 'code\n')], ['bfla', 'bola'], transport, { stats }),
    );
    expect(findings).toHaveLength(0);
    expect(stats.batches_failed).toBe(1);
    expect(stats.batches_ok).toBe(1);
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
