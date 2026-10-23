import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AuthMissingError } from '../../src/auth/errors.js';
import { resolveAuthSync } from '../../src/auth/resolve.js';
import * as tokenStore from '../../src/auth/tokenStore.js';

const KEYS = ['DISSEQT_CONFIG_HOME', 'DISSEQT_API_KEY', 'DISSEQT_PROJECT_ID', 'DISSEQT_BASE_URL'];
let tmp: string;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) Reflect.deleteProperty(process.env, k);
  tmp = mkdtempSync(join(tmpdir(), 'disseqt-resolve-'));
  process.env['DISSEQT_CONFIG_HOME'] = tmp;
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) Reflect.deleteProperty(process.env, k);
    else process.env[k] = saved[k];
  }
  rmSync(tmp, { recursive: true, force: true });
});

describe('resolveAuthSync', () => {
  it('env beats the stored config (canonical precedence: args > env > config)', async () => {
    await tokenStore.save({ apiKey: 'stored-key', projectId: 'stored-proj' });
    process.env['DISSEQT_API_KEY'] = 'env-key';
    process.env['DISSEQT_PROJECT_ID'] = 'env-proj';
    expect(resolveAuthSync()).toEqual({ apiKey: 'env-key', projectId: 'env-proj' });
  });

  it('never pairs an env key with a stored project id', async () => {
    await tokenStore.save({ apiKey: 'stored-key', projectId: 'stored-proj' });
    process.env['DISSEQT_API_KEY'] = 'env-key';
    expect(resolveAuthSync()).toEqual({ apiKey: 'env-key' });
  });

  it('falls back to the stored config', async () => {
    await tokenStore.save({ apiKey: 'stored-key', projectId: 'stored-proj' });
    expect(resolveAuthSync()).toEqual({ apiKey: 'stored-key', projectId: 'stored-proj' });
  });

  it('project id is optional — an API key alone resolves', () => {
    process.env['DISSEQT_API_KEY'] = 'env-key';
    expect(resolveAuthSync()).toEqual({ apiKey: 'env-key' });
  });

  it('explicit args win', () => {
    process.env['DISSEQT_API_KEY'] = 'env-key';
    expect(resolveAuthSync({ apiKey: 'arg', projectId: 'p' })).toEqual({
      apiKey: 'arg',
      projectId: 'p',
    });
  });

  it('an explicit key is never paired with an env project id', () => {
    process.env['DISSEQT_PROJECT_ID'] = 'env-proj';
    expect(resolveAuthSync({ apiKey: 'arg' })).toEqual({ apiKey: 'arg' });
  });

  it('reads the stored base_url even when the key comes from env', async () => {
    await tokenStore.save({ apiKey: 'stored-key', baseUrl: 'https://stored.example' });
    process.env['DISSEQT_API_KEY'] = 'env-key';
    expect(resolveAuthSync()).toEqual({ apiKey: 'env-key', baseUrl: 'https://stored.example' });
  });

  it('throws AuthMissingError without any API key', () => {
    process.env['DISSEQT_PROJECT_ID'] = 'p';
    expect(() => resolveAuthSync()).toThrow(AuthMissingError);
  });
});

describe('tokenStore without a project id', () => {
  it('round-trips a key-only config', async () => {
    await tokenStore.save({ apiKey: 'k' });
    expect(tokenStore.loadSync()).toEqual({ apiKey: 'k' });
  });
});
