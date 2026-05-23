import { Page, Locator, expect } from '@playwright/test';

export async function waitForToast(page: Page, text?: string | RegExp): Promise<Locator> {
  const toast = page.getByRole('status').or(page.locator('[role="alert"]')).first();
  await expect(toast).toBeVisible({ timeout: 5_000 });
  if (text) await expect(toast).toContainText(text);
  return toast;
}

export async function waitForNoSpinner(page: Page): Promise<void> {
  const spinner = page.locator('[aria-busy="true"], [data-loading="true"], .animate-spin').first();
  await spinner.waitFor({ state: 'detached', timeout: 10_000 }).catch(() => {});
}

export async function waitForNetworkIdle(page: Page, ms = 500): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  await page.waitForTimeout(ms);
}
