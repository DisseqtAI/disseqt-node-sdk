import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir, platform } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AuthConfigPermissionError } from '../../src/auth/errors.js';
import * as tokenStore from '../../src/auth/tokenStore.js';

let tmp: string;
let previousHome: string | undefined;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'disseqt-auth-'));
  previousHome = process.env['DISSEQT_CONFIG_HOME'];
  process.env['DISSEQT_CONFIG_HOME'] = tmp;
});

afterEach(() => {
  if (previousHome === undefined) {
    delete process.env['DISSEQT_CONFIG_HOME'];
  } else {
    process.env['DISSEQT_CONFIG_HOME'] = previousHome;
  }
  rmSync(tmp, { recursive: true, force: true });
});

describe('tokenStore.save', () => {
  it('creates the parent dir at 0o700 and the file at 0o600', async () => {
    await tokenStore.save({ apiKey: 'fake_apikey', projectId: 'proj_1' });

    const dirMode = statSync(tokenStore.configDir()).mode & 0o777;
    const fileMode = statSync(tokenStore.configPath()).mode & 0o777;

    if (platform() !== 'win32') {
      expect(dirMode).toBe(0o700);
      expect(fileMode).toBe(0o600);
    }
    const raw = readFileSync(tokenStore.configPath(), 'utf-8');
    const parsed = JSON.parse(raw) as { auth: { api_key: string; project_id: string } };
    expect(parsed.auth.api_key).toBe('fake_apikey');
    expect(parsed.auth.project_id).toBe('proj_1');
  });

  it('round-trips through load', async () => {
    await tokenStore.save({
      apiKey: 'fake_apikey',
      projectId: 'proj_1',
      baseUrl: 'https://api.example.com',
    });
    const loaded = await tokenStore.load();
    expect(loaded).toEqual({
      apiKey: 'fake_apikey',
      projectId: 'proj_1',
      baseUrl: 'https://api.example.com',
    });
  });
});

describe('tokenStore.load', () => {
  it('returns null when the config file does not exist', async () => {
    expect(await tokenStore.load()).toBeNull();
  });

  it('refuses to read when file is wider than 0o600', async () => {
    if (platform() === 'win32') return;
    mkdirSync(tokenStore.configDir(), { recursive: true, mode: 0o700 });
    writeFileSync(
      tokenStore.configPath(),
      JSON.stringify({ auth: { api_key: 'k', project_id: 'p' } }),
      { mode: 0o644 },
    );
    chmodSync(tokenStore.configPath(), 0o644);
    expect(() => tokenStore.loadSync()).toThrow(AuthConfigPermissionError);
  });

  it('returns null on a well-formed file with missing fields', async () => {
    mkdirSync(tokenStore.configDir(), { recursive: true, mode: 0o700 });
    writeFileSync(tokenStore.configPath(), JSON.stringify({ auth: { api_key: 'k' } }), {
      mode: 0o600,
    });
    expect(await tokenStore.load()).toBeNull();
  });
});

describe('tokenStore.clear', () => {
  it('is idempotent when the file does not exist', async () => {
    await expect(tokenStore.clear()).resolves.toBeUndefined();
  });

  it('deletes an existing file', async () => {
    await tokenStore.save({ apiKey: 'k', projectId: 'p' });
    await tokenStore.clear();
    expect(await tokenStore.load()).toBeNull();
  });
});
