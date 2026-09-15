// Walk a source tree and yield char-bounded code chunks for scanning.

import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import type { CodeChunk } from './schema.js';

/** Language file-extension → language name. */
export const SUPPORTED_EXTENSIONS: Record<string, string> = {
  '.py': 'python',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.go': 'go',
  '.java': 'java',
};

export const SKIP_DIRS: ReadonlySet<string> = new Set([
  '.git',
  'node_modules',
  '.venv',
  'venv',
  'env',
  '__pycache__',
  '.mypy_cache',
  '.pytest_cache',
  '.ruff_cache',
  'dist',
  'build',
  'out',
  '.next',
  'target',
  'vendor',
  '.terraform',
  'coverage',
  '.turbo',
  '.cache',
  '.idea',
  '.vscode',
]);

export const SKIP_GLOBS: readonly string[] = [
  '*.min.js',
  '*.min.css',
  '*.map',
  '*.lock',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'go.sum',
];

export const DEFAULT_MAX_FILE_BYTES = 1_500_000;
export const DEFAULT_MAX_CHUNK_CHARS = 12_000;

/** Simple fnmatch — supports `*` and `?`, mirroring Python fnmatch.fnmatch. */
export function fnmatch(name: string, pattern: string): boolean {
  // ponytail: hand-rolled to avoid a `minimatch`/`micromatch` dep; upgrade to
  // a real matcher if SKIP_GLOBS grows brace/negation patterns.
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp('^' + escaped.replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
  return regex.test(name);
}

function skipGlobMatch(name: string, extraGlobs: readonly string[] = []): boolean {
  for (const pat of SKIP_GLOBS) {
    if (fnmatch(name, pat)) return true;
  }
  for (const pat of extraGlobs) {
    if (fnmatch(name, pat)) return true;
  }
  return false;
}

export interface IterOptions {
  only?: Iterable<string> | undefined;
  maxFileBytes?: number;
  extraSkipGlobs?: readonly string[];
}

/**
 * Yield source files under `root` that match a supported language.
 * `only` is an optional whitelist (used by --diff mode). Paths in `only`
 * may be absolute or relative to `root`.
 */
export async function* iterSourceFiles(
  root: string,
  options: IterOptions = {},
): AsyncIterableIterator<string> {
  const maxFileBytes = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
  const extraSkipGlobs = options.extraSkipGlobs ?? [];
  const absRoot = path.resolve(root);

  let whitelist: Set<string> | null = null;
  if (options.only !== undefined) {
    whitelist = new Set<string>();
    for (const p of options.only) {
      const candidate = path.isAbsolute(p) ? p : path.join(absRoot, p);
      whitelist.add(path.resolve(candidate));
    }
    if (whitelist.size === 0) return;
  }

  for await (const filePath of walk(absRoot)) {
    const ext = path.extname(filePath);
    if (!(ext in SUPPORTED_EXTENSIONS)) continue;
    if (skipGlobMatch(path.basename(filePath), extraSkipGlobs)) continue;
    if (whitelist !== null && !whitelist.has(path.resolve(filePath))) continue;
    try {
      const st = await stat(filePath);
      if (st.size > maxFileBytes) continue;
    } catch {
      continue;
    }
    yield filePath;
  }
}

/** Recursive walker that prunes SKIP_DIRS on the way down. */
async function* walk(root: string): AsyncIterableIterator<string> {
  let rootStat;
  try {
    rootStat = await stat(root);
  } catch {
    return;
  }
  if (rootStat.isFile()) {
    yield root;
    return;
  }
  const stack: string[] = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) break;
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        if (entry.name.startsWith('.') && entry.name !== '.') continue;
        stack.push(full);
      } else if (entry.isFile()) {
        yield full;
      }
    }
  }
}

/**
 * Yield line-aligned chunks of `filePath` under the `maxChunkChars` cap.
 * Chunks never split a line — line numbers stay honest.
 */
export async function* chunkFile(
  filePath: string,
  root: string,
  maxChunkChars: number = DEFAULT_MAX_CHUNK_CHARS,
): AsyncIterableIterator<CodeChunk> {
  const ext = path.extname(filePath);
  const lang = SUPPORTED_EXTENSIONS[ext] ?? 'text';
  let text: string;
  try {
    text = await readFile(filePath, 'utf-8');
  } catch {
    return;
  }
  if (text.trim().length === 0) return;

  const absRoot = path.resolve(root);
  const absFile = path.resolve(filePath);
  let rel: string;
  const relCandidate = path.relative(absRoot, absFile);
  if (!relCandidate.startsWith('..') && !path.isAbsolute(relCandidate)) {
    rel = relCandidate.split(path.sep).join('/');
  } else {
    rel = absFile.split(path.sep).join('/');
  }

  // Split preserving line endings, mirroring Python splitlines(keepends=True).
  const lines = splitKeepEnds(text);
  const buf: string[] = [];
  let bufSize = 0;
  let startLine = 1;
  let lineNo = 0;

  for (const line of lines) {
    lineNo += 1;
    const lineLen = line.length;
    if (buf.length > 0 && bufSize + lineLen > maxChunkChars) {
      yield {
        file_path: rel,
        language: lang,
        start_line: startLine,
        end_line: lineNo - 1,
        text: buf.join(''),
      };
      buf.length = 0;
      bufSize = 0;
      startLine = lineNo;
    }
    buf.push(line);
    bufSize += lineLen;
  }

  if (buf.length > 0) {
    yield {
      file_path: rel,
      language: lang,
      start_line: startLine,
      end_line: Math.max(lineNo, startLine),
      text: buf.join(''),
    };
  }
}

/** Split text into lines, preserving trailing newlines like Python keepends=True. */
function splitKeepEnds(text: string): string[] {
  if (text.length === 0) return [];
  const out: string[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '\n') {
      out.push(text.slice(start, i + 1));
      start = i + 1;
    }
  }
  if (start < text.length) {
    out.push(text.slice(start));
  }
  return out;
}

export interface CollectOptions extends IterOptions {
  maxChunkChars?: number;
}

/** One-shot helper: walk `root` and yield chunks for every source file. */
export async function* collectChunks(
  root: string,
  options: CollectOptions = {},
): AsyncIterableIterator<CodeChunk> {
  const maxChunkChars = options.maxChunkChars ?? DEFAULT_MAX_CHUNK_CHARS;
  const iterOpts: IterOptions = {};
  if (options.only !== undefined) iterOpts.only = options.only;
  if (options.maxFileBytes !== undefined) iterOpts.maxFileBytes = options.maxFileBytes;
  if (options.extraSkipGlobs !== undefined) iterOpts.extraSkipGlobs = options.extraSkipGlobs;
  for await (const filePath of iterSourceFiles(root, iterOpts)) {
    yield* chunkFile(filePath, root, maxChunkChars);
  }
}
