import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { SDK_LANGUAGE, SDK_VERSION, USER_AGENT } from '../src/index.js';

describe('version single-sourcing', () => {
  it('SDK_VERSION matches package.json (drift guard)', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
      version: string;
    };
    expect(SDK_VERSION).toBe(pkg.version);
  });

  it('identity constants are coherent', () => {
    expect(SDK_LANGUAGE).toBe('node');
    expect(USER_AGENT).toBe(`disseqt-node-sdk/${SDK_VERSION}`);
  });
});
