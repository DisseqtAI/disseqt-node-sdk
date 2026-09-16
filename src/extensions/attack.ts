// `BaseAttack` — root of the client-side attack extension hierarchy.
// Mirrors Python's `disseqt_sdk.extensions.BaseAttack` (Phase 5a).
//
// Subclasses either override `enhance()` for client-side prompt mutation
// or leave it as passthrough and let the SDK dispatch to server-side
// attack techniques.

export type AttackMetadata = Record<string, unknown>;

export abstract class BaseAttack {
  readonly name: string;
  readonly metadata: AttackMetadata;

  constructor(name: string, metadata: AttackMetadata = {}) {
    this.name = name;
    this.metadata = metadata;
  }

  /** Return a mutated version of `prompt`. Default: passthrough. */
  enhance(prompt: string): string | Promise<string> {
    return prompt;
  }

  /** Progress in [0, 1]. Multi-turn attacks override; single-turn is 1.0 after enhance. */
  progress(): number {
    return 1.0;
  }
}
