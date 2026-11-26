import { existsSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

// Load local env files (e.g. TEST_DATABASE_URL) without overriding real env vars.
for (const file of ['.env.test', '.env']) {
  if (existsSync(file)) process.loadEnvFile(file);
}

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Integration tests share one database; run files sequentially.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    globalSetup: ['./test/global-setup.ts'],
  },
});
