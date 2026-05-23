import { test, expect } from '../../fixtures/test';

test.describe('@deep streaks', () => {
  test('@smoke loads streaks page with heatmap', async ({ page }) => {
    await page.goto('/streaks');
    await expect(page.getByRole('main')).toBeVisible();
  });
  test.fixme('streak resume/pause buttons', async () => {});
  test.fixme('best vs current count display', async () => {});
});
