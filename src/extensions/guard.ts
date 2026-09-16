import type { Client } from '../validation/client.js';
import type { GuardResult } from '../validation/guardrails.js';

// Custom guard — thin wrapper over a policy id.
// Subclasses override `evaluate` when they need local scoring or a
// transformation before returning. The default is left abstract because
// evaluation semantics depend on the concrete request type.
// Mirrors Python's `BaseGuard`.
export abstract class BaseGuard {
  readonly policyId: string;
  readonly name: string;

  constructor(policyId: string, name = '') {
    this.policyId = policyId;
    this.name = name;
  }

  /** Evaluate `inputData` against this guard's policy. */
  abstract evaluate(client: Client, inputData: unknown): Promise<GuardResult>;
}
