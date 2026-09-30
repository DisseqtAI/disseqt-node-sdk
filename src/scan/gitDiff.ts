// Resolve the `--diff BASE..HEAD` flag to a list of changed files.

import { spawn } from 'node:child_process';
import path from 'node:path';

export class GitDiffError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'GitDiffError';
  }
}

/** Split `base..head` into `[base, head]`. Also accepts `base...head`. */
export function parseDiffRange(spec: string): [string, string] {
  for (const sep of ['...', '..']) {
    const idx = spec.indexOf(sep);
    if (idx >= 0) {
      const base = spec.slice(0, idx).trim();
      const head = spec.slice(idx + sep.length).trim();
      if (base.length > 0 && head.length > 0) return [base, head];
    }
  }
  throw new GitDiffError(
    `invalid diff spec ${JSON.stringify(spec)}: expected BASE..HEAD (e.g. main..HEAD)`,
  );
}

export type Spawner = typeof spawn;

/** Return files changed between two git refs, as absolute paths under `cwd`. */
export async function changedFiles(
  spec: string,
  cwd: string,
  spawner: Spawner = spawn,
): Promise<string[]> {
  const [base, head] = parseDiffRange(spec);
  const args = ['diff', '--name-only', '--diff-filter=ACMRT', `${base}..${head}`];
  return await new Promise<string[]>((resolve, reject) => {
    let child;
    try {
      child = spawner('git', args, { cwd });
    } catch (error) {
      reject(new GitDiffError('git is not installed or not on PATH', { cause: error }));
      return;
    }
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (c: Buffer) => (stdout += c.toString('utf-8')));
    child.stderr?.on('data', (c: Buffer) => (stderr += c.toString('utf-8')));
    child.on('error', (error: Error & { code?: string }) => {
      if (error.code === 'ENOENT') {
        reject(new GitDiffError('git is not installed or not on PATH', { cause: error }));
        return;
      }
      reject(
        new GitDiffError(`git diff ${base}..${head} failed: ${error.message}`, { cause: error }),
      );
    });
    child.on('close', (code: number | null) => {
      if (code !== 0) {
        reject(
          new GitDiffError(`git diff ${base}..${head} failed: ${stderr.trim() || `exit ${code}`}`),
        );
        return;
      }
      const files = stdout
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .map((line) => path.join(cwd, line));
      resolve(files);
    });
  });
}
