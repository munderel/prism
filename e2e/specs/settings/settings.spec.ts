import { test, expect } from '../../fixtures/test';

test.describe('@deep settings', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/settings');
  });

  test('@smoke loads settings', async ({ page }) => {
    await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('theme toggle changes html class and persists on reload', async ({ page }) => {
    const themeBtn = page.getByRole('button', { name: /theme|dark|light/i }).first();
    if (!(await themeBtn.isVisible().catch(() => false))) return;
    const initial = await page.locator('html').getAttribute('class');
    await themeBtn.click();
    await page.waitForTimeout(300);
    const after = await page.locator('html').getAttribute('class');
    expect(after).not.toBe(initial);
    await page.reload();
    const reloaded = await page.locator('html').getAttribute('class');
    expect(reloaded).toBe(after);
  });

  test.fixme('change timezone persists and affects calendar boundaries', async () => {});
  test.fixme('toggle Aim duration/frequency defaults persists', async () => {});
  test.fixme('admin: invite user, lock/unlock user, reset 2FA', async () => {});
  test.fixme('task type colors editor updates UI', async () => {});
  test.fixme('feature toggles hide/show sidebar items', async () => {});
});

test.describe('@deep settings/notifications', () => {
  test('@smoke loads notifications settings', async ({ page }) => {
    await page.goto('/settings/notifications');
    await expect(page.getByRole('main')).toBeVisible();
  });

  test.fixme('toggle email/push channels persists', async () => {});
  test.fixme('test-email button triggers /api/notifications/test', async () => {});
});
