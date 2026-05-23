import { test, expect } from '../../fixtures/test';

test.describe('@deep leaderboard', () => {
  test('@smoke loads leaderboard page', async ({ page }) => {
    await page.goto('/leaderboard');
    await expect(page.getByRole('main')).toBeVisible();
  });
  test.fixme('ranked user cards display', async () => {});
  test.fixme('period filters', async () => {});
});
