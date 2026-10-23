import { describe, expect, it } from 'vitest';

import { statusOf } from '../../src/cli/config.js';

describe('statusOf', () => {
  it('reads every status location the backend uses', () => {
    expect(statusOf({ status: 'COMPLETED' })).toBe('completed');
    expect(statusOf({ state: 'failed' })).toBe('failed');
    // mr-jailbreak GET /jobs/:id → {job: {status}}
    expect(statusOf({ job: { status: 'RUNNING' } })).toBe('running');
    // prompt-pack GET /runs/:id → {run: {status}}
    expect(statusOf({ run: { status: 'completed' } })).toBe('completed');
    // test-plan-runs GET /:id → RunReportResponse{header: {status}}
    expect(statusOf({ header: { status: 'stopped' }, stages: [] })).toBe('stopped');
    expect(statusOf({})).toBe('');
  });
});
