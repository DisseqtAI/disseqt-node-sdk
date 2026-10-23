import { describe, expect, it } from 'vitest';

import { stripTrailingSlashes } from '../../src/http/url.js';

describe('stripTrailingSlashes', () => {
  it('leaves a clean URL untouched', () => {
    expect(stripTrailingSlashes('https://api.disseqt.ai')).toBe('https://api.disseqt.ai');
  });

  it('strips one or many trailing slashes', () => {
    expect(stripTrailingSlashes('https://x/')).toBe('https://x');
    expect(stripTrailingSlashes('https://x/////')).toBe('https://x');
  });

  it('returns empty string for all-slashes input', () => {
    expect(stripTrailingSlashes('////')).toBe('');
  });

  it('handles empty string', () => {
    expect(stripTrailingSlashes('')).toBe('');
  });

  it('does not touch interior slashes', () => {
    expect(stripTrailingSlashes('https://x/a/b/c/')).toBe('https://x/a/b/c');
  });

  it('handles pathological trailing runs without backtracking', () => {
    const nasty = 'https://x' + '/'.repeat(100_000);
    expect(stripTrailingSlashes(nasty)).toBe('https://x');
  });
});
