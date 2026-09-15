// `disseqt scan` code scanner — barrel export.

export {
  DEFAULT_MAX_CHUNK_CHARS,
  DEFAULT_MAX_FILE_BYTES,
  SKIP_DIRS,
  SKIP_GLOBS,
  SUPPORTED_EXTENSIONS,
  chunkFile,
  collectChunks,
  fnmatch,
  iterSourceFiles,
} from './collector.js';
export type { CollectOptions, IterOptions } from './collector.js';
export { CONFIG_FILENAME, discover, emptyConfig, loadConfig } from './config.js';
export {
  APPSEC_VALIDATORS,
  BATCH_CHARS_ENV,
  BASE_ENV,
  DEFAULT_BASE,
  DEFAULT_BATCH_CHARS,
  FALLBACK_VALIDATORS,
  VALIDATOR_DOMAIN,
  batchAsPrompt,
  batchChunks,
  batchTotalChars,
  dispatch,
  extractFindingsList,
  makeDefaultTransport,
  newDispatchStats,
  resolveBatchChars,
  validatorPath,
} from './dispatcher.js';
export type {
  ChunkBatch,
  DispatchOptions,
  DispatchStats,
  ScanTransport,
} from './dispatcher.js';
export { GitDiffError, changedFiles, parseDiffRange } from './gitDiff.js';
export { toJson, toMarkdown, toSarif } from './formatters.js';
export {
  SEVERITY_ORDER,
  findingToDict,
  meetsMinSeverity,
} from './schema.js';
export type { CodeChunk, CodeFinding, ScanConfig, Severity } from './schema.js';
