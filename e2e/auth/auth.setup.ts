import { test as setup, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const STORAGE_PATH = path.join(__dirname, 'storageState.json');
const MAX_AGE_DAYS = 25;

setup('storageState is present and fresh', async ({ request }) => {
  if (!fs.existsSync(STORAGE_PATH)) {
    throw new Error(
      `Missing ${STORAGE_PATH}.\n` +
        `Run "npm run e2e:auth" first — see e2e/README.md for the cookie-extraction steps.`
    );
  }
  const ageDays = (Date.now() - fs.statSync(STORAGE_PATH).mtimeMs) / 86_400_000;
  if (ageDays > MAX_AGE_DAYS) {
    throw new Error(
      `storageState is ${ageDays.toFixed(1)}d old (max ${MAX_AGE_DAYS}d). Re-run "npm run e2e:auth".`
    );
  }
  // Final sanity: the cookie still works against the API.
  const resp = await request.get('/api/stacks');
  expect(
    resp.status(),
    `session-token expired or invalid (HTTP ${resp.status()}). Re-run "npm run e2e:auth".`
  ).toBeLessThan(400);
});
