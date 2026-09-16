/**
 * Regression guards against re-introducing the removed server-side
 * policy-evaluate path.
 *
 * Some checks are structural (TypeScript refuses at compile time — see
 * the `@ts-expect-error` markers); a green build with those markers in
 * place confirms the compiler still rejects the old API. Other checks
 * inspect the runtime shape of `Client` — if any of the removed fields
 * or exports come back, they turn red.
 */
import { describe, expect, it, vi } from 'vitest';

import { Client } from '../../src/index.js';
import * as validation from '../../src/validation/index.js';

function baseClient(): Client {
  return new Client({
    apiKey: 'k',
    projectId: 'p',
    applicationName: 'regression-guard',
    fetch: vi.fn(async () => new Response('{}', { status: 200 })) as unknown as typeof fetch,
  });
}

describe('policies-path removal — compile-time guards', () => {
  it('Client({ policies: [...] }) is a type error', () => {
    // @ts-expect-error - policies option removed with the server-side evaluate path
    new Client({ apiKey: 'k', projectId: 'p', policies: ['pid'] });
  });

  it('Client({ realtimePolicyBaseUrl }) is a type error', () => {
    // @ts-expect-error - realtimePolicyBaseUrl removed with the server-side evaluate path
    new Client({ apiKey: 'k', projectId: 'p', realtimePolicyBaseUrl: 'http://x' });
  });

  it('client.validate(req, { policies }) is a type error', async () => {
    const c = baseClient();
    await c.validate({ domain: 'x', slug: 'y', data: {} } as never).catch(() => undefined);
    // @ts-expect-error - second-arg options removed; .validate takes only the request now
    await c.validate({ domain: 'x', slug: 'y', data: {} } as never, { policies: ['pid'] }).catch(
      () => undefined,
    );
  });
});

describe('policies-path removal — runtime guards', () => {
  it('Client instance no longer exposes policies or realtimePolicyBaseUrl', () => {
    const c = baseClient() as unknown as Record<string, unknown>;
    expect(c['policies']).toBeUndefined();
    expect(c['realtimePolicyBaseUrl']).toBeUndefined();
  });

  it('validation index does not re-export Guardrails / BlockedError / anyBlocking', () => {
    const surface = validation as unknown as Record<string, unknown>;
    for (const removed of [
      'Guardrails',
      'GuardResult',
      'GuardrailsConfig',
      'BlockedError',
      'anyBlocking',
      'isBlocking',
      'isAsync',
      'parsePolicy',
      'PolicyDecision',
      'PolicyRule',
      'PolicyRuleset',
      'DECISION_BLOCK',
      'DECISION_BORDERLINE',
      'DECISION_PASS',
    ]) {
      expect(surface[removed], `${removed} should not be exported`).toBeUndefined();
    }
  });

  it('policy.js and guardrails.js modules are not importable', async () => {
    // @ts-expect-error - module was deleted; TS resolution failure is the guard
    await expect(import('../../src/validation/policy.js')).rejects.toThrow();
    // @ts-expect-error - module was deleted; TS resolution failure is the guard
    await expect(import('../../src/validation/guardrails.js')).rejects.toThrow();
  });
});
