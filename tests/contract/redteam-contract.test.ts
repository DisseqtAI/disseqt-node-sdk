import { describe, expect, it, vi } from 'vitest';

import {
  DisseqtAPIClient,
  DisseqtResourceClient,
  type RedteamRun,
  type RedteamValidateResponse,
} from '../../src/index.js';
import { pollUntilTerminal, TERMINAL_STATUSES } from '../../src/cli/config.js';
import { extractRows } from '../../src/cli/commands/redteam.js';
import { testingResultsPage, testingRunStopped, testingValidateResponse } from './fixtures.js';

const envelope = (data: unknown) =>
  new Response(JSON.stringify({ status: 'success', data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

describe('contract: /testing/validate', () => {
  it('surfaces aggregate_decision + per-validator results', async () => {
    const client = new DisseqtResourceClient({
      apiKey: 'k',
      fetch: vi.fn(async () => envelope(testingValidateResponse)),
    });
    const out: RedteamValidateResponse = await client.redteam.validate({
      input: 'x',
      output: '',
      validators: ['toxicity', 'pii'],
      input_context: '',
    });
    expect(out.aggregate_decision).toBe('BLOCK');
    expect(out.results[0]?.rule_status).toBe('fail');
    expect(out.results[1]?.error).toBe('timeout');
    expect(out.processed_at).toBe(testingValidateResponse.processed_at);
  });
});

describe('contract: testing run status', () => {
  it('`stopped` is terminal and stop_reason is modelled', async () => {
    expect(TERMINAL_STATUSES.has('stopped')).toBe(true);
    const run: RedteamRun = testingRunStopped;
    expect(run.stop_reason).toBe('user_cancelled');
    const probe = vi.fn(async () => testingRunStopped as Record<string, unknown>);
    await expect(pollUntilTerminal(probe, { intervalMs: 1 })).resolves.toMatchObject({
      status: 'stopped',
    });
    expect(probe).toHaveBeenCalledTimes(1);
  });
});

describe('contract: {items, pagination} lists', () => {
  it('extractRows reads items (and still reads results / bare arrays)', () => {
    expect(extractRows(testingResultsPage)).toHaveLength(2);
    expect(extractRows({ results: [1] })).toEqual([1]);
    expect(extractRows([1, 2])).toEqual([1, 2]);
  });
});

describe('contract: prompt-pack output validations', () => {
  it('lists through the registered /:packId/output-validations route', async () => {
    const fetcher = vi.fn(async () => envelope({ items: [] }));
    const client = new DisseqtAPIClient({ apiKey: 'k', baseUrl: 'https://x.test', fetch: fetcher });
    await client.listRunOutputValidations('pack-1');
    const url = String((fetcher.mock.calls.at(-1) as unknown[] | undefined)?.[0]);
    expect(url).toBe(
      'https://x.test/sdk/prompt-packs/api/v1/sdk/prompt-packs/pack-1/output-validations',
    );
  });
});
