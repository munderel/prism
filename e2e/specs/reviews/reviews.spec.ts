import { test, expect } from '../../fixtures/test';

test.describe('@deep reviews', () => {
  test('@smoke reviews page renders', async ({ page }) => {
    await page.goto('/reviews');
    await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible();
  });

  test.fixme('start a Weekly Review and walk all 11 steps', async () => {
    // Requires data-testid={review-step-${n}} on WeeklyReviewWizard step roots.
    // For each step: assert step heading, fill required fields, click Next, finally Submit.
  });

  test.fixme('start a Monthly Review (9 steps)', async () => {});
  test.fixme('start a Yearly Review', async () => {});
  test.fixme('save draft and resume', async () => {});

  test.fixme('admin: create team review schedule', async () => {});
});
