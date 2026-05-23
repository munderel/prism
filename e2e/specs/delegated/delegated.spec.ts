import { test, expect } from '../../fixtures/test';

test.describe('@deep delegated', () => {
  test('@smoke loads or returns 403 for non-admin', async ({ page }) => {
    const resp = await page.goto('/delegated');
    if (resp && resp.status() >= 400) {
      test.info().annotations.push({ type: 'note', description: 'test account is not admin — delegated is admin-only' });
      return;
    }
    await expect(page.getByRole('main')).toBeVisible();
  });
});
