import { test, expect } from '../../fixtures/test';

test.describe('@deep reports', () => {
  test('@smoke /reports loads', async ({ page }) => {
    await page.goto('/reports');
    await expect(page.getByRole('main')).toBeVisible();
  });
  test('@smoke /kpis loads', async ({ page }) => {
    await page.goto('/kpis');
    await expect(page.getByRole('main')).toBeVisible();
  });
  test.fixme('date range picker filters report data', async () => {});
  test.fixme('CSV/PDF download', async () => {});
  test.fixme('KPI dashboard inline target edit', async () => {});
});
