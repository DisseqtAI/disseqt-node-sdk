export interface PromptPacksClientConfig {
  apiKey: string;
  projectId: string;
  baseUrl?: string;
  timeoutMs?: number;
}

export * from './models.js';
export * from './client.js';
