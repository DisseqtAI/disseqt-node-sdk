import { BaseAttack, type AttackMetadata } from './attack.js';

// Multi-turn attack — tracks turn state.
// Subclasses override `nextTurn` and manage state via `turns`.
// Mirrors Python's `BaseMultiTurnAttack`.
export abstract class BaseMultiTurnAttack extends BaseAttack {
  readonly maxTurns: number;
  readonly turns: readonly string[];

  constructor(name: string, opts: { maxTurns?: number; metadata?: AttackMetadata } = {}) {
    super(name, opts.metadata ?? {});
    this.maxTurns = opts.maxTurns ?? 5;
    this.turns = [];
  }

  /** Return the next attacker prompt given the previous target response. */
  abstract nextTurn(targetResponse: string): string | Promise<string>;

  override progress(): number {
    if (this.maxTurns <= 0) {
      return 1.0;
    }
    return Math.min(1.0, this.turns.length / this.maxTurns);
  }
}
