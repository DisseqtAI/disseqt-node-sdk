import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

describe('consumer-install safety (drift guard)', () => {
  it('never ships a postinstall hook that requires a file outside "files"', () => {
    // A `postinstall` lifecycle script runs on EVERY consumer install from the
    // published tarball, including files not listed in package.json's "files"
    // array (only "dist", README, CHANGELOG, LICENSE ship). scripts/ is
    // deliberately excluded -- it's this repo's own dev tooling. `prepare`
    // does not run for a registry-tarball install (only for local `npm
    // install` with no args, or a git-URL dependency), so it's the safe hook
    // for repo-only setup steps like this one. See scripts/compat-brace-expansion.cjs
    // for what it patches and why. Reintroducing `postinstall` here breaks
    // `npm install @disseqt-ai/sdk` for every consumer with MODULE_NOT_FOUND.
    const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
      scripts?: Record<string, string>;
    };
    expect(pkg.scripts?.postinstall).toBeUndefined();
  });
});
