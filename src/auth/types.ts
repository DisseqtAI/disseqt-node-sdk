/**
 * Auth stored under `~/.disseqt/config.json`. Same JSON shape as the Python
 * SDK — cross-SDK config compat is intentional so a `disseqt login` from
 * either CLI unlocks both.
 */
export interface StoredAuth {
  apiKey: string;
  projectId: string;
  baseUrl?: string;
}
