import { describe, expect, it, vi } from 'vitest';

import { anyBlocking, Client, DECISION_BLOCK } from '../../src/index.js';

describe('deprecated realtime-policy surface', () => {
  it('is still exported and constructible, warning exactly once per process', () => {
    const warn = vi.spyOn(globalThis.console, 'warn').mockImplementation(() => undefined);
    const make = () =>
      new Client({
        apiKey: 'k',
        applicationName: 'app',
        policies: ['pid'],
        realtimePolicyBaseUrl: 'http://x.test',
      });
    expect(make().policies).toEqual(['pid']);
    expect(make().realtimePolicyBaseUrl).toBe('http://x.test');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain('deprecated');
    expect(typeof anyBlocking).toBe('function');
    expect(DECISION_BLOCK).toBe('BLOCK');
    warn.mockRestore();
  });

  it('Client works without a project id', () => {
    expect(new Client({ apiKey: 'k' }).projectId).toBeUndefined();
  });
});
