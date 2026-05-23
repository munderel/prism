import { test, expect } from '../../fixtures/test';

test.describe('@deep power down', () => {
  test('@smoke powerdown page renders in forced dark theme', async ({ page }) => {
    await page.goto('/powerdown');
    await expect(page.getByRole('main')).toBeVisible();
    // ADR 12: Power Down forces dark mode regardless of next-themes setting.
    const html = page.locator('html');
    await expect(html).toHaveClass(/dark/);
  });

  test.fixme('walk all 9 ritual steps and assert completion increments streak', async () => {
    // Requires data-testid={powerdown-step-${n}} on PowerDownRitual step roots.
    // Step list (from inventory): Review Today → Log Process KPIs (conditional) → Prep Weekly Goals
    // → Capture Wins & Distractions → Clear Goals Guide → Calendar Review → Closure → Shutdown.
  });
});
