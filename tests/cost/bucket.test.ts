import { describe, expect, it } from 'vitest';

import { CostBucket } from '../../src/index.js';

describe('CostBucket', () => {
  it('starts empty', () => {
    const b = new CostBucket();
    expect(b.totals()).toEqual({
      simulationCost: 0,
      evaluationCost: 0,
      totalCost: 0,
      promptTokens: 0,
      completionTokens: 0,
    });
    expect(b.entries).toEqual([]);
  });

  it('accumulates simulation cost with tokens', () => {
    const b = new CostBucket();
    b.addSimulation(0.25, { promptTokens: 100, completionTokens: 40, label: 'sim-1' });
    expect(b.simulationCost).toBe(0.25);
    expect(b.promptTokens).toBe(100);
    expect(b.completionTokens).toBe(40);
    expect(b.entries).toEqual([
      {
        label: 'sim-1',
        simulationCost: 0.25,
        evaluationCost: 0,
        promptTokens: 100,
        completionTokens: 40,
      },
    ]);
  });

  it('accumulates evaluation cost independently of simulation', () => {
    const b = new CostBucket();
    b.addSimulation(0.5);
    b.addEvaluation(0.25);
    expect(b.totalCost).toBeCloseTo(0.75);
    expect(b.simulationCost).toBe(0.5);
    expect(b.evaluationCost).toBe(0.25);
    expect(b.entries).toHaveLength(2);
  });

  it('snapshot returns a mutation-safe deep copy', () => {
    const b = new CostBucket();
    b.addSimulation(0.1, { promptTokens: 10 });
    const snap = b.snapshot();
    snap.entries.push({
      label: 'x',
      simulationCost: 999,
      evaluationCost: 0,
      promptTokens: 0,
      completionTokens: 0,
    });
    expect(b.entries).toHaveLength(1);
    expect(b.simulationCost).toBe(0.1);
  });
});
