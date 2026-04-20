import { defineConfig, devices } from '@playwright/test';

/**
 * Phase 18 — Playwright E2E config.
 *
 * The specs in tests/e2e/ exercise the Next.js frontend with the backend
 * fully mocked via `page.route('**\/api/v1/**', ...)`. This keeps the
 * suite deterministic, fast, and runnable without a DB / MinIO / Redis
 * stack — we only need Node + a browser.
 *
 * To run against a real backend, set `E2E_REAL_API=1` and ensure the
 * backend is listening on NEXT_PUBLIC_API_URL. CI defaults to the
 * mocked flow so builds don't need infra.
 */
const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 3100);
const baseURL = `http://localhost:${PORT}`;
const reuseExisting = process.env.E2E_REUSE_SERVER === '1';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false, // next dev in a single process — serial keeps flakes low on Windows
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',

  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 5_000,
    navigationTimeout: 15_000,
  },

  projects: [
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: /responsive\.spec\.ts/,
    },
    {
      // Use chromium engine with iPhone 12 viewport/UA so we don't need
      // to install the full WebKit download just for responsive checks.
      name: 'mobile-iphone12',
      use: {
        ...devices['iPhone 12'],
        defaultBrowserType: 'chromium',
      },
      testMatch: /responsive\.spec\.ts/,
    },
  ],

  webServer: reuseExisting
    ? undefined
    : {
        command: `next dev -p ${PORT}`,
        port: PORT,
        timeout: 120_000,
        reuseExistingServer: true,
        stdout: 'ignore',
        stderr: 'pipe',
        env: {
          NEXT_PUBLIC_API_URL: `${baseURL}/api/v1`,
        },
      },
});
