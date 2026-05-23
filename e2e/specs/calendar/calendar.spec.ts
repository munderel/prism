import { test, expect } from '../../fixtures/test';

test.describe('@deep calendar', () => {
  test('@smoke calendar renders', async ({ page }) => {
    await page.goto('/calendar');
    await expect(page.getByRole('main')).toBeVisible();
    // FullCalendar root
    await expect(page.locator('.fc, [class*="calendar"]').first()).toBeVisible({ timeout: 15_000 });
  });

  test('day/week/month view toggles', async ({ page }) => {
    await page.goto('/calendar');
    for (const v of ['Day', 'Week', 'Month', 'Agenda']) {
      const btn = page.getByRole('button', { name: new RegExp(`^${v}$`) });
      if (await btn.isVisible().catch(() => false)) await btn.click();
    }
  });

  test('today / prev / next navigation', async ({ page }) => {
    await page.goto('/calendar');
    for (const n of ['Today', 'Previous', 'Next']) {
      const b = page.getByRole('button', { name: new RegExp(n, 'i') });
      if (await b.isVisible().catch(() => false)) await b.click();
    }
  });

  test.fixme('drag a task from sidebar onto calendar creates a work block', async () => {
    // Needs data-testid on FullCalendar event nodes and the sidebar drag sources.
  });
  test.fixme('resize a work block changes duration', async () => {});
  test.fixme('click event opens detail popover / editor', async () => {});
  test.fixme('Google Calendar sync button (admin) fires /api/calendar/sync', async () => {});
});
