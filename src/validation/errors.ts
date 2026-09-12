/**
 * Thrown by `Client.validateSync()` and `Guardrails.guard*` when a
 * realtime-policy verdict is BLOCK (or, when `raiseOnAsync` is set, when
 * a policy runs in async mode and no final verdict is available yet).
 *
 * Carries the raw response object so callers can inspect the offending
 * policies via `parsePolicy()` or the DSQ envelope directly. Mirrors the
 * Python SDK's `BlockedError`.
 */
export class BlockedError extends Error {
  /** The raw response object (validator response or policy envelope). */
  readonly response: unknown;
  /**
   * "block" when at least one policy decided BLOCK, "async" when the caller
   * opted in to `raiseOnAsync` and a policy ran without a final verdict.
   */
  readonly reason: 'block' | 'async';

  constructor(message: string, response: unknown, reason: 'block' | 'async' = 'block') {
    super(message);
    this.name = 'BlockedError';
    this.response = response;
    this.reason = reason;
  }
}
