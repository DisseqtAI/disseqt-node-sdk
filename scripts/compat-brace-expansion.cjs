#!/usr/bin/env node
/**
 * Compat shim for brace-expansion 5.0.8 (the CVE-2026-14257 / GHSA-mh99-v99m-4gvg ReDoS fix).
 *
 * WHY: 5.0.8 is the ONLY patched version, and its CommonJS entry is *named-only*
 *   (`exports.expand = expand`) — it is not a callable default. But this repo's transitive
 *   minimatch (<=9, pulled by eslint / its plugins / glob) does `require('brace-expansion')`
 *   and calls the result as a function. Without a callable default, eslint and `next build`
 *   crash at pattern-matching time. The only "clean" alternative (minimatch@10) breaks
 *   @eslint/config-array's default `import` of minimatch — a dead end. So we keep the security
 *   fix (5.0.8) and restore backward-compat by re-exporting a callable default that also carries
 *   the named exports.
 *
 * Runs on postinstall (local + CI + Vercel). Idempotent (guarded by a marker) and defensive:
 * if brace-expansion is absent or its layout changed, it no-ops instead of failing the install.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const MARKER = 'brace-expansion-compat-shim';
const target = path.join(
  __dirname,
  '..',
  'node_modules',
  'brace-expansion',
  'dist',
  'commonjs',
  'index.js',
);

try {
  let src = fs.readFileSync(target, 'utf8');

  if (src.includes(MARKER)) {
    process.exit(0); // already patched
  }
  // Only patch the named-only 5.x CJS build (the one that defines `exports.expand`).
  if (!/exports\.expand\s*=\s*expand/.test(src)) {
    process.exit(0);
  }

  const shim = `module.exports = Object.assign(expand, exports); /* ${MARKER} */\n`;
  const sourceMap = '//# sourceMappingURL=index.js.map';

  src = src.includes(sourceMap) ? src.replace(sourceMap, shim + sourceMap) : src + '\n' + shim;

  fs.writeFileSync(target, src);
  console.log('[compat] brace-expansion CJS callable-default shim applied');
} catch (err) {
  // brace-expansion not installed here, or its build layout changed — nothing to shim.
  console.log('[compat] brace-expansion shim skipped:', err && err.code ? err.code : err);
}
