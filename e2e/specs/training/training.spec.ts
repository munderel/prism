import { test, expect } from '../../fixtures/test';

test.describe('@deep training', () => {
  test('@smoke loads training page', async ({ page }) => {
    await page.goto('/training');
    await expect(page.getByRole('main')).toBeVisible();
  });
  test.fixme('enroll in a module', async () => {});
  test.fixme('quiz check / generate endpoints', async () => {});
});
