export const VALIDATION_DEFAULT_BASE_URL = 'https://production-monitoring-eu.disseqt.ai';
export const VALIDATION_PATH_TEMPLATE = '/api/v1/sdk/validators/{domain}/{validator}';

export interface ValidationClientConfig {
  apiKey: string;
  projectId: string;
  baseUrl?: string;
  timeoutMs?: number;
}

export * from './enums.js';
export * from './models.js';
