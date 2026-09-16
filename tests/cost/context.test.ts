import { describe, expect, it } from 'vitest';

import { CostBucket, currentCostBucket, withCostContext } from '../../src/index.js';

describe('withCostContext', () => {
  it('binds a fresh bucket visible via currentCostBucket', () => {
    const seen = withCostContext((bucket) => {
      const active = currentCostBucket();
      return { bucket, active };
    });
    expect(seen.active).toBe(seen.bucket);
    expect(seen.bucket).toBeInstanceOf(CostBucket);
  });

  it('propagates the bucket through nested async awaits', async () => {
    // The critical parity test — mirrors Python's ContextVar behaviour.
    // AsyncLocalStorage MUST carry the store through the promise chain
    // for extension code (e.g. `client.validate` deep in a stack) to
    // find the active bucket without threading it through every call.
    async function deepCall(): Promise<CostBucket | undefined> {
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
      return currentCostBucket();
    }
    const outer = await withCostContext(async (bucket) => {
      const found = await deepCall();
      bucket.addSimulation(0.5);
      return { bucket, found };
    });
    expect(outer.found).toBe(outer.bucket);
    expect(outer.bucket.simulationCost).toBe(0.5);
  });

  it('nested contexts get their own bucket', () => {
    const result = withCostContext((outer) => {
      const outerActive = currentCostBucket();
      const innerActive = withCostContext((inner) => {
        return { inner, active: currentCostBucket() };
      });
      const outerAfter = currentCostBucket();
      return { outer, outerActive, innerActive, outerAfter };
    });
    expect(result.outerActive).toBe(result.outer);
    expect(result.innerActive.active).toBe(result.innerActive.inner);
    expect(result.innerActive.inner).not.toBe(result.outer);
    // Scope pops cleanly — outer bucket restored after inner exits.
    expect(result.outerAfter).toBe(result.outer);
  });

  it('currentCostBucket returns undefined outside a scope', () => {
    expect(currentCostBucket()).toBeUndefined();
  });

  it('accumulation inside a nested async call attributes to the active bucket', async () => {
    async function bill(costUsd: number): Promise<void> {
      await Promise.resolve();
      currentCostBucket()?.addEvaluation(costUsd);
    }
    const bucket = await withCostContext(async (b) => {
      await bill(0.1);
      await bill(0.2);
      return b;
    });
    expect(bucket.evaluationCost).toBeCloseTo(0.3);
    expect(bucket.entries).toHaveLength(2);
  });
});
