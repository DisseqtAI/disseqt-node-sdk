export const PROMPT_PACKS_DEFAULT_BASE_URL = 'http://localhost:8000';
export const PROMPT_PACKS_PATH_PREFIX = '/sdk/prompt-packs/api/v1/sdk/prompt-packs';

export interface PromptPacksClientConfig {
  apiKey: string;
  projectId: string;
  baseUrl?: string;
  timeoutMs?: number;
}
