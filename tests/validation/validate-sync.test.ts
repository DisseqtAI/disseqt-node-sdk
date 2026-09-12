import { describe, expect, it, vi } from 'vitest';

import {
  BlockedError,
  Client,
  DECISION_BLOCK,
  DECISION_PASS,
  ENFORCEMENT_ASYNC,
  ENFORCEMENT_SYNC,
  InputValidationRequest,
} from '../../src/index.js';

const POLICY_ID = '994ad00e-0000-0000-0000-000000000001';

interface PolicyEnvelope {
  policy_id: string;
  policy_name?: string;
  policy_version?: number;
  decision: string;
  enforcement: string;
}

function policyEnvelope(decision: string, enforcement = ENFORCEMENT_SYNC): PolicyEnvelope {
  return {
    policy_id: POLICY_ID,
    policy_name: 'test-policy',
    policy_version: 1,
    decision,
    enforcement,
  };
}

function makeClient(envelope: PolicyEnvelope): Client {
  const fetcher = vi.fn(async () => {
    return new Response(JSON.stringify({ status: 'success', data: envelope }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  return new Client({
    projectId: 'p',
    apiKey: 'k',
    applicationName: 'test-app',
    fetch: fetcher,
  });
}

describe('Client.validateSync', () => {
  it('returns the result unchanged when no policy blocks', async () => {
    const client = makeClient(policyEnvelope(DECISION_PASS));
    const result = await client.validateSync(new InputValidationRequest({ prompt: 'hi' }), {
      policies: [POLICY_ID],
    });
    expect(result.policies).toHaveLength(1);
  });

  it('throws BlockedError when a policy verdict is BLOCK', async () => {
    const client = makeClient(policyEnvelope(DECISION_BLOCK));
    await expect(
      client.validateSync(new InputValidationRequest({ prompt: 'hi' }), {
        policies: [POLICY_ID],
      }),
    ).rejects.toMatchObject({ name: 'BlockedError', reason: 'block' });
  });

  it('BlockedError carries the raw response', async () => {
    const client = makeClient(policyEnvelope(DECISION_BLOCK));
    try {
      await client.validateSync(new InputValidationRequest({ prompt: 'hi' }), {
        policies: [POLICY_ID],
      });
      expect.fail('expected BlockedError');
    } catch (error) {
      expect(error).toBeInstanceOf(BlockedError);
      const blocked = error as BlockedError;
      expect(blocked.response).toBeTypeOf('object');
      expect((blocked.response as { policies: unknown[] }).policies).toHaveLength(1);
    }
  });

  it('does not throw on async policies by default', async () => {
    const client = makeClient(policyEnvelope(DECISION_PASS, ENFORCEMENT_ASYNC));
    await expect(
      client.validateSync(new InputValidationRequest({ prompt: 'hi' }), {
        policies: [POLICY_ID],
      }),
    ).resolves.toBeDefined();
  });

  it('throws BlockedError with reason "async" when raiseOnAsync is set', async () => {
    const client = makeClient(policyEnvelope(DECISION_PASS, ENFORCEMENT_ASYNC));
    await expect(
      client.validateSync(new InputValidationRequest({ prompt: 'hi' }), {
        policies: [POLICY_ID],
        raiseOnAsync: true,
      }),
    ).rejects.toMatchObject({ name: 'BlockedError', reason: 'async' });
  });

  it('block wins over async when both apply', async () => {
    const client = makeClient(policyEnvelope(DECISION_BLOCK, ENFORCEMENT_ASYNC));
    try {
      await client.validateSync(new InputValidationRequest({ prompt: 'hi' }), {
        policies: [POLICY_ID],
        raiseOnAsync: true,
      });
      expect.fail('expected BlockedError');
    } catch (error) {
      // block outranks async — we prefer to surface the definitive verdict
      expect((error as BlockedError).reason).toBe('block');
    }
  });
});
