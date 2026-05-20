export interface DisseqtAuthConfig {
  apiKey: string;
  projectId: string;
}

export interface DisseqtClientConfig extends DisseqtAuthConfig {
  baseUrl?: string;
  timeoutMs?: number;
}
