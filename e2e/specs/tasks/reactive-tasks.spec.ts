import { test, expect } from '../../fixtures/test';

test.describe('@deep reactive tasks', () => {
  test('@smoke loads', async ({ page }) => {
    await page.goto('/reactive-tasks');
    await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible();
  });

  test.fixme('create REACT task via UI and verify type=REACT via API', async () => {});
  test.fixme('complete reactive task', async () => {});
  test.fixme('delete reactive task', async () => {});
});
