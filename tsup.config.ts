import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/validation/index.ts',
    'src/prompt-packs/index.ts',
    'src/agentic/index.ts',
  ],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  target: 'node18',
  treeshake: true,
});
