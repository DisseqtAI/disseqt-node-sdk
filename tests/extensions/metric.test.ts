import { describe, expect, it } from 'vitest';

import { BaseMetric } from '../../src/index.js';

describe('BaseMetric', () => {
  it('constructs with defaults', () => {
    const m = new BaseMetric('toxicity', 0.5);
    expect(m.name).toBe('toxicity');
    expect(m.threshold).toBe(0.5);
    expect(m.criteria).toBe('');
    expect(m.labels).toEqual([]);
    expect(m.lowerIsBetter).toBe(true);
  });

  it('honours option overrides', () => {
    const m = new BaseMetric('accuracy', 0.8, {
      criteria: 'exact-match',
      labels: ['qa', 'benchmarks'],
      lowerIsBetter: false,
    });
    expect(m.criteria).toBe('exact-match');
    expect(m.labels).toEqual(['qa', 'benchmarks']);
    expect(m.lowerIsBetter).toBe(false);
  });
});
