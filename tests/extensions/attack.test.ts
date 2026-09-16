import { describe, expect, it } from 'vitest';

import { BaseAttack, BaseSingleTurnAttack, BaseMultiTurnAttack } from '../../src/index.js';

// Trivial concrete subclass for exercising the abstract contract.
class Passthrough extends BaseAttack {
  override enhance(prompt: string): string {
    return prompt;
  }
}

class Upper extends BaseSingleTurnAttack {
  override enhance(prompt: string): string {
    return prompt.toUpperCase();
  }
}

class TwoTurn extends BaseMultiTurnAttack {
  nextTurn(targetResponse: string): string {
    return `follow-up:${targetResponse}`;
  }
}

describe('BaseAttack', () => {
  it('constructs with name + default metadata', () => {
    const a = new Passthrough('noop');
    expect(a.name).toBe('noop');
    expect(a.metadata).toEqual({});
    expect(a.progress()).toBe(1.0);
  });

  it('carries metadata through the constructor', () => {
    const a = new Passthrough('noop', { origin: 'test' });
    expect(a.metadata).toEqual({ origin: 'test' });
  });

  it('enhance runs the subclass implementation', () => {
    expect(new Passthrough('a').enhance('hi')).toBe('hi');
  });
});

describe('BaseSingleTurnAttack', () => {
  it('runs the subclass enhance', () => {
    expect(new Upper('upper').enhance('hi')).toBe('HI');
  });

  it('is an instance of BaseAttack', () => {
    expect(new Upper('upper')).toBeInstanceOf(BaseAttack);
  });
});

describe('BaseMultiTurnAttack', () => {
  it('defaults maxTurns to 5 with empty turns', () => {
    const m = new TwoTurn('mt');
    expect(m.maxTurns).toBe(5);
    expect(m.turns).toEqual([]);
  });

  it('honours maxTurns override', () => {
    const m = new TwoTurn('mt', { maxTurns: 2 });
    expect(m.maxTurns).toBe(2);
  });

  it('progress is 0 with no turns and 1 when maxTurns <= 0', () => {
    expect(new TwoTurn('mt').progress()).toBe(0);
    expect(new TwoTurn('mt', { maxTurns: 0 }).progress()).toBe(1);
  });

  it('runs the subclass nextTurn', async () => {
    const m = new TwoTurn('mt');
    await expect(Promise.resolve(m.nextTurn('ok'))).resolves.toBe('follow-up:ok');
  });
});
