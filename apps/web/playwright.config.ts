import { defineConfig, devices } from '@playwright/test';

/**
 * E2E tests run against a live stack: web (3000) + API (4000) + a fixture page server (4100).
 * Locally, start `pnpm dev` with ALLOW_PRIVATE_NETWORK_FETCH=true on the API (test-only) so it can
 * fetch the fixture page; in CI the webServer entries below start everything.
 */
const CI = !!process.env.CI;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /public\.spec\.ts/ },
  ],
  webServer: [
    { command: 'node e2e/fixture-server.mjs', port: 4100, reuseExistingServer: true },
    ...(CI
      ? [
          { command: 'pnpm --filter @jobs/api start', port: 4000, cwd: '../..', reuseExistingServer: false, timeout: 120_000 },
          { command: 'pnpm start', port: 3000, reuseExistingServer: false, timeout: 120_000 },
        ]
      : []),
  ],
});
