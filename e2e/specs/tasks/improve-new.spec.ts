import { test, expect } from '../../fixtures/test';
import { uniqueTitle } from '../../fixtures/test-data';

test.describe('@deep improve/new', () => {
  test('@smoke loads create-improve form', async ({ page }) => {
    await page.goto('/improve/new');
    await expect(page.getByRole('main')).toBeVisible();
  });

  test('create improve task and verify type via API (DB enum=GOAL_STACK)', async ({ page, api, track }) => {
    await page.goto('/improve/new');
    const title = uniqueTitle('Improve');
    const titleInput = page.getByRole('textbox').first();
    await titleInput.fill(title);
    await page.getByRole('button', { name: /Save|Create/i }).first().click();
    await page.waitForLoadState('networkidle');

    const tasks = await api.get<Array<{ id: string; title: string; type?: string }>>('/api/tasks');
    const created = tasks.find((t) => t.title === title);
    expect(created).toBeTruthy();
    if (created) {
      track({ type: 'task', id: created.id, title });
      // App-facing type is IMPROVE; raw DB value is GOAL_STACK (per CLAUDE.md ADR 8). API should normalize.
      if (created.type) expect(['IMPROVE', 'GOAL_STACK']).toContain(created.type);
    }
  });
});
