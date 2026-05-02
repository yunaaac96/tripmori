import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
    viewport: { width: 430, height: 932 },
    // Ignore HTTPS errors from Firebase SDK in test env
    ignoreHTTPSErrors: true,
    // Capture screenshot on failure
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  // Start vite dev server in --mode test so Vite loads .env.test (fake-but-
  // valid Firebase creds). Real network calls are intercepted by helpers.ts
  // mockFirebase. Without --mode test, a checkout missing .env.local would
  // give Firebase apiKey: undefined and auth.authStateReady() would never
  // resolve, freezing the splash and timing out every test.
  webServer: {
    command: 'npm run dev -- --mode test',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
