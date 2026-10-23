import { defineConfig } from 'tsup';

// CLI-only bundle. Runs after the library build (see `npm run build`) so it
// can share the same dist/ dir without racing tsup's clean step. Shebang
// via banner keeps the library bundles pollution-free.
export default defineConfig({
  entry: { 'cli/index': 'src/cli/index.ts' },
  format: ['esm'],
  outExtension: () => ({ js: '.js' }),
  dts: false,
  sourcemap: true,
  clean: false,
  splitting: false,
  target: 'node18',
  treeshake: true,
  banner: { js: '#!/usr/bin/env node' },
});
