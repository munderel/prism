import { defineConfig, devices } from '@playwright/test';
import * as path from 'path';

const STORAGE_STATE = path.join(__dirname, 'auth', 'storageState.json');

// Default the E2E target to localhost — NOT production. The suite runs
// destructive mutations (create/edit/delete), so silently defaulting an unset
// E2E_BASE_URL to the live site meant `npm run e2e` could mutate production
// data. To intentionally run against production, set E2E_BASE_URL explicitly.
const E2E_BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './specs',
  outputDir: './test-results',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  timeout: 60_000,
  expect: { timeout: 7_000 },

  use: {
    baseURL: E2E_BASE_URL,
    viewport: { width: 1440, height: 900 },
    locale: 'en-US',
    timezoneId: 'America/Los_Angeles',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
  },

  projects: [
    {
      name: 'setup',
      testDir: './auth',
      testMatch: /auth\.setup\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: STORAGE_STATE },
      dependencies: ['setup'],
      testIgnore: /auth\.setup\.ts/,
    },
  ],
});
