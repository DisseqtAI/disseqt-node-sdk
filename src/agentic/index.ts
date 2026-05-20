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
