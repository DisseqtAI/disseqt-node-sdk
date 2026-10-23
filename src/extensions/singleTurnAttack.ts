import { BaseAttack } from './attack.js';

// Single-turn attack (Python `BaseSingleTurnAttack`): one prompt in, one mutated prompt out.
export abstract class BaseSingleTurnAttack extends BaseAttack {}
