import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts', worker: 'src/worker.ts', seed: 'prisma/seed.ts' },
  format: ['esm'],
  platform: 'node',
  target: 'node20',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  // Bundle the workspace package (shipped as TypeScript source); keep real deps external.
  noExternal: ['@jobs/shared'],
});
