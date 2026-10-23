// Root of the client-side attack hierarchy (Python `BaseAttack`). Override `enhance()` to
// mutate prompts locally; the passthrough default leaves it to server-side techniques.

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
