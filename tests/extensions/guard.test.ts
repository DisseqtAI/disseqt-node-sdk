import { describe, expect, it } from 'vitest';

import { BaseGuard, type Client, type GuardResult } from '../../src/index.js';

const passing: GuardResult = {
  breached: false,
  decisions: [],
  raw: { validation: null, policies: [] },
  latencyMs: 0,
  blocked: false,
  policy_envelopes: [],
};

class AllowAll extends BaseGuard {
  async evaluate(client: Client, inputData: unknown): Promise<GuardResult> {
    // Touch the args so ESLint's no-unused-vars is satisfied; the
    // subclass exists only to exercise the abstract contract.
    void client;
    void inputData;
    return passing;
  }
}

describe('BaseGuard', () => {
  it('constructs with policyId + default empty name', () => {
    const g = new AllowAll('policy-123');
    expect(g.policyId).toBe('policy-123');
    expect(g.name).toBe('');
  });

  it('accepts a custom guard name', () => {
    const g = new AllowAll('policy-123', 'toxicity');
    expect(g.name).toBe('toxicity');
  });

  it('runs subclass evaluate', async () => {
    const result = await new AllowAll('p').evaluate({} as Client, { prompt: 'hi' });
    expect(result.blocked).toBe(false);
  });
});
