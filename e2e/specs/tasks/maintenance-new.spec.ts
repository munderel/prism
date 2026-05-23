import { test, expect } from '../../fixtures/test';
import { uniqueTitle } from '../../fixtures/test-data';

test.describe('@deep maintenance/new', () => {
  test('@smoke loads create-maintenance form', async ({ page }) => {
    await page.goto('/maintenance/new');
    await expect(page.getByRole('main')).toBeVisible();
  });

  test('create maintenance task', async ({ page, api, track }) => {
    await page.goto('/maintenance/new');
    const title = uniqueTitle('Maintenance');
    await page.getByRole('textbox').first().fill(title);
    await page.getByRole('button', { name: /Save|Create/i }).first().click();
    await page.waitForLoadState('networkidle');

    const tasks = await api.get<Array<{ id: string; title: string }>>('/api/tasks');
    const created = tasks.find((t) => t.title === title);
    expect(created).toBeTruthy();
    if (created) track({ type: 'task', id: created.id, title });
  });
});
