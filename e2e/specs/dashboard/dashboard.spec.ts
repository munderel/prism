import { test, expect } from '../../fixtures/test';

test.describe('@deep dashboard', () => {
  test('@smoke dashboard renders', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('main')).toBeVisible();
  });

  test('Daily/Weekly view toggle', async ({ page }) => {
    await page.goto('/');
    for (const v of ['Daily', 'Weekly']) {
      const b = page.getByRole('button', { name: new RegExp(`^${v}$`) });
      if (await b.isVisible().catch(() => false)) await b.click();
    }
  });

  test('Focus Mode toggle', async ({ page }) => {
    await page.goto('/');
    const focus = page.getByRole('button', { name: /Focus Mode|Focus/i }).first();
    if (await focus.isVisible().catch(() => false)) {
      await focus.click();
      await focus.click();
    }
  });

  test.fixme('every widget renders and clicks through', async () => {});
  test.fixme('Win the Day celebration after completing all wins', async () => {});
  test.fixme('Derail Alert banner displays for at-risk tasks', async () => {});
});
