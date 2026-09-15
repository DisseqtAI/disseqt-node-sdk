// `disseqt scan` — walk a source tree and hunt AI-security issues.

import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { DisseqtHttpTransport } from '../http/index.js';
import type { Command } from 'commander';
import {
  APPSEC_VALIDATORS,
  DEFAULT_BATCH_CHARS,
  DEFAULT_MAX_CHUNK_CHARS,
  DEFAULT_MAX_FILE_BYTES,
  GitDiffError,
  changedFiles,
  collectChunks,
  dispatch,
  loadConfig,
  makeDefaultTransport,
  meetsMinSeverity,
  newDispatchStats,
  resolveBatchChars,
  toJson,
  toMarkdown,
  toSarif,
  type CodeChunk,
  type CodeFinding,
  type ScanConfig,
  type ScanTransport,
} from '../scan/index.js';
import { EXIT_FAILED, EXIT_OK, EXIT_USAGE } from './config.js';

const SEVERITY_CHOICES = ['low', 'medium', 'high', 'critical'] as const;
const FORMAT_CHOICES = ['json', 'sarif', 'markdown'] as const;

interface ScanOpts {
  diff?: string;
  format: string;
  minSeverity: string;
  output?: string;
  failOnFindings: boolean;
  maxFileBytes: string;
  maxChunkChars: string;
  batchChars?: string;
  validator?: string[];
}

/** Parse an int option or exit 2 with a helpful message. */
function parseIntOrDie(name: string, value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n <= 0) {
    process.stderr.write(`error: --${name} must be a positive integer (got ${JSON.stringify(value)})\n`);
    process.exit(EXIT_USAGE);
  }
  return n;
}

function resolveValidators(cli: string[] | undefined, cfg: ScanConfig): readonly string[] {
  if (cli !== undefined && cli.length > 0) return cli;
  if (cfg.validators.length > 0) return cfg.validators;
  return APPSEC_VALIDATORS;
}

function render(findings: CodeFinding[], fmt: string): string {
  if (fmt === 'sarif') return toSarif(findings);
  if (fmt === 'json') return toJson(findings);
  return toMarkdown(findings);
}

function shouldShowProgress(fmt: string, hasOutputPath: boolean): boolean {
  if (process.env['DISSEQT_SHOW_PROGRESS'] === '0') return false;
  // If we're piping JSON/SARIF to stdout, keep stdout clean.
  if (!hasOutputPath && (fmt === 'json' || fmt === 'sarif')) return false;
  return process.stderr.isTTY === true;
}

function buildTransport(): { transport: ScanTransport; baseUrl: string } {
  const apiKey = process.env['DISSEQT_API_KEY'];
  const projectId = process.env['DISSEQT_PROJECT_ID'];
  const baseUrl = process.env['DISSEQT_BASE_URL'] ?? 'https://api.disseqt.ai';

  if (apiKey === undefined || apiKey.trim().length === 0) {
    process.stderr.write('error: DISSEQT_API_KEY is not set\n');
    process.exit(EXIT_USAGE);
  }
  if (projectId === undefined || projectId.trim().length === 0) {
    process.stderr.write('error: DISSEQT_PROJECT_ID is not set\n');
    process.exit(EXIT_USAGE);
  }
  const http = new DisseqtHttpTransport({ apiKey, projectId });
  return { transport: makeDefaultTransport(http, baseUrl), baseUrl };
}

async function runScan(scanPath: string, opts: ScanOpts): Promise<never> {
  const fmt = opts.format;
  if (!(FORMAT_CHOICES as readonly string[]).includes(fmt)) {
    process.stderr.write(
      `error: --format must be one of ${FORMAT_CHOICES.join('|')} (got ${JSON.stringify(fmt)})\n`,
    );
    process.exit(EXIT_USAGE);
  }
  if (!(SEVERITY_CHOICES as readonly string[]).includes(opts.minSeverity)) {
    process.stderr.write(
      `error: --min-severity must be one of ${SEVERITY_CHOICES.join('|')} (got ${JSON.stringify(opts.minSeverity)})\n`,
    );
    process.exit(EXIT_USAGE);
  }

  const root = path.resolve(scanPath);
  const scanRoot = root; // Python resolves scan_root from parent when root is a file; we let collect handle files vs dirs.

  const cfg = await loadConfig(scanRoot);
  const effectiveMin =
    opts.minSeverity !== 'low' ? opts.minSeverity : cfg.min_severity ?? opts.minSeverity;
  const maxFileBytesCli = parseIntOrDie('max-file-bytes', opts.maxFileBytes, DEFAULT_MAX_FILE_BYTES);
  const maxChunkCharsCli = parseIntOrDie('max-chunk-chars', opts.maxChunkChars, DEFAULT_MAX_CHUNK_CHARS);
  const batchCharsCli = opts.batchChars === undefined ? null : parseIntOrDie('batch-chars', opts.batchChars, DEFAULT_BATCH_CHARS);

  const effectiveMaxFile = cfg.max_file_bytes ?? maxFileBytesCli;
  const effectiveMaxChunk = cfg.max_chunk_chars ?? maxChunkCharsCli;
  const effectiveBatchChars = resolveBatchChars(batchCharsCli ?? cfg.batch_chars);
  const validators = resolveValidators(opts.validator, cfg);

  let only: string[] | undefined;
  if (opts.diff !== undefined && opts.diff.length > 0) {
    try {
      only = await changedFiles(opts.diff, scanRoot);
    } catch (error) {
      const msg =
        error instanceof GitDiffError
          ? error.message
          : error instanceof Error
            ? error.message
            : String(error);
      process.stderr.write(`error: ${msg}\n`);
      process.exit(EXIT_USAGE);
    }
    if (only.length === 0) {
      process.stdout.write('# disseqt scan\n\nNo changed files in diff range.\n');
      process.exit(EXIT_OK);
    }
  }

  const collectOpts: Parameters<typeof collectChunks>[1] = {
    maxFileBytes: effectiveMaxFile,
    maxChunkChars: effectiveMaxChunk,
    extraSkipGlobs: cfg.extra_skip_globs,
  };
  if (only !== undefined) collectOpts.only = only;
  const chunks: CodeChunk[] = [];
  for await (const c of collectChunks(root, collectOpts)) chunks.push(c);
  if (chunks.length === 0) {
    process.stdout.write('# disseqt scan\n\nNo source files matched (nothing to do).\n');
    process.exit(EXIT_OK);
  }

  const { transport } = buildTransport();
  const stats = newDispatchStats();
  const showProgress = shouldShowProgress(fmt, opts.output !== undefined);

  const findings: CodeFinding[] = [];
  const dispatchOpts: Parameters<typeof dispatch>[3] = {
    batchChars: effectiveBatchChars,
    stats,
  };
  if (showProgress) {
    dispatchOpts.onProgress = (done, total) => {
      process.stderr.write(`\rScanning ... ${done}/${total} requests`);
      if (done === total) process.stderr.write('\n');
    };
  }
  for await (const f of dispatch(chunks, validators, transport, dispatchOpts)) {
    if (meetsMinSeverity(f.severity, effectiveMin)) findings.push(f);
  }

  const report = render(findings, fmt);
  if (opts.output !== undefined && opts.output.length > 0) {
    await writeFile(opts.output, report, 'utf-8');
  } else {
    process.stdout.write(report.endsWith('\n') ? report : `${report}\n`);
  }

  const fileCount = new Set(chunks.map((c) => c.file_path)).size;
  process.stderr.write(
    `scanned ${chunks.length} chunk(s) across ${fileCount} file(s); ` +
      `${stats.batches_ok} batch(es) ok, ${stats.batches_failed} failed; ` +
      `${findings.length} finding(s) after min-severity=${effectiveMin}\n`,
  );

  if (opts.failOnFindings && findings.length > 0) process.exit(EXIT_FAILED);
  process.exit(EXIT_OK);
}

/** Wire the `scan` subcommand onto the top-level `disseqt` program. */
export function registerScan(program: Command): void {
  program
    .command('scan [path]')
    .description('scan a source tree for AI-security issues')
    .option('--diff <spec>', 'scan only files changed between two git refs (e.g. main..HEAD)')
    .option('-f, --format <fmt>', `report format: ${FORMAT_CHOICES.join('|')}`, 'markdown')
    .option(
      '--min-severity <level>',
      `drop findings below this severity: ${SEVERITY_CHOICES.join('|')}`,
      'low',
    )
    .option('-o, --output <path>', 'write report to a file instead of stdout')
    .option('--fail-on-findings', 'exit non-zero when findings remain', true)
    .option('--no-fail-on-findings', 'always exit 0 regardless of findings')
    .option(
      '--max-file-bytes <n>',
      `skip files larger than N bytes (default ${DEFAULT_MAX_FILE_BYTES})`,
      String(DEFAULT_MAX_FILE_BYTES),
    )
    .option(
      '--max-chunk-chars <n>',
      `split files into chunks no larger than N chars (default ${DEFAULT_MAX_CHUNK_CHARS})`,
      String(DEFAULT_MAX_CHUNK_CHARS),
    )
    .option(
      '--batch-chars <n>',
      `bundle chunks up to N chars per request (default ${DEFAULT_BATCH_CHARS}; env DISSEQT_SCAN_CONTEXT_LIMIT)`,
    )
    .option('--validator <name>', 'override default validator set (repeatable)', collectValidator, [])
    .action(async (pathArg: string | undefined, opts: ScanOpts) => {
      await runScan(pathArg ?? '.', opts);
    });
}

function collectValidator(value: string, previous: string[]): string[] {
  return [...previous, value];
}
