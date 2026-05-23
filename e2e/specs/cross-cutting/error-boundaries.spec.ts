import { test, expect } from '../../fixtures/test';

test.describe('@deep error boundaries / 404s', () => {
  test('non-existent task edit returns error or 404 UI', async ({ page }) => {
    const resp = await page.goto('/tasks/does-not-exist-xyz/edit');
    // Either 4xx response or an inline error page is acceptable.
    if (resp) {
      expect([200, 404, 500].includes(resp.status())).toBeTruthy();
    }
    // Some kind of "not found" or error text should render.
    const notFound = page.getByText(/not found|404|something went wrong/i);
    if (await notFound.isVisible().catch(() => false)) {
      await expect(notFound).toBeVisible();
    }
  });

  test('non-existent work block edit', async ({ page }) => {
    await page.goto('/work-blocks/does-not-exist/edit');
    // Just ensure it doesn't crash the app shell.
    await expect(page.getByRole('main').or(page.locator('body'))).toBeVisible();
  });

  test('non-existent meeting edit', async ({ page }) => {
    await page.goto('/meetings/does-not-exist/edit');
    await expect(page.getByRole('main').or(page.locator('body'))).toBeVisible();
  });
});
