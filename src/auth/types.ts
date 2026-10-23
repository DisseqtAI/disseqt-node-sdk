/** `~/.disseqt/config.json` auth; same shape as the Python SDK so either CLI's login works for both. */
export interface StoredAuth {
  apiKey: string;
  /** Optional: the API key alone identifies the project. */
  projectId?: string;
  baseUrl?: string;
}
