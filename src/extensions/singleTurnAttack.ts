import { BaseAttack } from './attack.js';

// Single-turn attack — one prompt in, one mutated prompt out.
// Mirrors Python's `BaseSingleTurnAttack`. Inherits the passthrough
// `enhance` default from `BaseAttack`; subclasses override for actual
// mutation.
export abstract class BaseSingleTurnAttack extends BaseAttack {}
