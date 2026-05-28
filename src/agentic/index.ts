export const AGENTIC_DEFAULT_ENDPOINT = 'https://api.disseqt.ai/agentic-monitoring/api/v1/traces';

export interface AgenticClientConfig {
  apiKey: string;
  projectId: string;
  serviceName: string;
  endpoint?: string;
  serviceVersion?: string;
  environment?: string;
  maxBatchSize?: number;
  flushIntervalMs?: number;
  maxRetries?: number;
}

export * from './context.js';
export * from './buffer.js';
export * from './client.js';
export * from './enums.js';
export * from './helpers.js';
export * from './models.js';
export * from './semantics.js';
export * from './span.js';
export * from './transport.js';
export * from './trace.js';
export * from './utils.js';
