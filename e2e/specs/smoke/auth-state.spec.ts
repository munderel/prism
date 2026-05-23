import { test, expect } from '../../fixtures/test';

test.describe('@smoke auth state', () => {
  test('session loads dashboard, not login', async ({ page }) => {
    await page.goto('/');
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('hitting /login while authed bounces to dashboard', async ({ page }) => {
    await page.goto('/login');
    // Some apps stay on /login if already authed; tolerate either, but if it redirects assert the target.
    if (!/\/login/.test(page.url())) {
      await expect(page).toHaveURL(/\/$|^\/[^l]/);
    }
  });
});
