import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { chunkFile, collectChunks, fnmatch, iterSourceFiles } from '../../src/scan/index.js';

async function collectAll<T>(iter: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const x of iter) out.push(x);
  return out;
}

describe('collector', () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'scan-collector-'));
    await writeFile(path.join(root, 'a.py'), 'print("hi")\nprint("bye")\n');
    await writeFile(path.join(root, 'b.ts'), 'export const x = 1;\n');
    await writeFile(path.join(root, 'c.txt'), 'not a source file\n');
    await mkdir(path.join(root, 'node_modules'));
    await writeFile(path.join(root, 'node_modules', 'dep.js'), 'skip me\n');
    await mkdir(path.join(root, '.git'));
    await writeFile(path.join(root, '.git', 'HEAD'), 'skip too\n');
  });
  afterEach(async () => {
    // tmpdir cleanup on OS churn; not worth rimraf for a happy-path test.
  });

  it('yields only supported extensions and skips SKIP_DIRS', async () => {
    const files = (await collectAll(iterSourceFiles(root))).map((p) => path.basename(p)).sort();
    expect(files).toEqual(['a.py', 'b.ts']);
  });

  it('respects maxFileBytes', async () => {
    const bigPath = path.join(root, 'big.py');
    await writeFile(bigPath, 'x'.repeat(500));
    const small = await collectAll(iterSourceFiles(root, { maxFileBytes: 100 }));
    expect(small.map((p) => path.basename(p))).not.toContain('big.py');
    const large = await collectAll(iterSourceFiles(root, { maxFileBytes: 10_000 }));
    expect(large.map((p) => path.basename(p))).toContain('big.py');
  });

  it('chunkFile emits one chunk for a small file with correct line numbers', async () => {
    const chunks = await collectAll(chunkFile(path.join(root, 'a.py'), root));
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.file_path).toBe('a.py');
    expect(chunks[0]?.language).toBe('python');
    expect(chunks[0]?.start_line).toBe(1);
    expect(chunks[0]?.end_line).toBe(2);
  });

  it('chunkFile splits when maxChunkChars is exceeded', async () => {
    const lines = Array.from({ length: 20 }, (_, i) => `line${i}=${'x'.repeat(50)}\n`).join('');
    await writeFile(path.join(root, 'big.py'), lines);
    const chunks = await collectAll(chunkFile(path.join(root, 'big.py'), root, 200));
    expect(chunks.length).toBeGreaterThan(1);
    // Line numbers must be contiguous and non-overlapping.
    let prevEnd = 0;
    for (const c of chunks) {
      expect(c.start_line).toBe(prevEnd + 1);
      expect(c.end_line).toBeGreaterThanOrEqual(c.start_line);
      prevEnd = c.end_line;
    }
  });

  it('collectChunks combines walking and chunking', async () => {
    const chunks = await collectAll(collectChunks(root));
    const paths = new Set(chunks.map((c) => c.file_path));
    expect(paths).toEqual(new Set(['a.py', 'b.ts']));
  });

  it('fnmatch handles star and question-mark patterns', () => {
    expect(fnmatch('foo.min.js', '*.min.js')).toBe(true);
    expect(fnmatch('foo.js', '*.min.js')).toBe(false);
    expect(fnmatch('go.sum', 'go.sum')).toBe(true);
  });
});
