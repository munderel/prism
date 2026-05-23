import { test, expect } from '../../fixtures/test';
import { uniqueTitle } from '../../fixtures/test-data';

test.describe('@deep tasks', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tasks');
    await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('@smoke renders task page', async ({ page }) => {
    // Day / Week / Month / Agenda view toggles
    for (const v of ['Day', 'Week', 'Month', 'Agenda']) {
      const btn = page.getByRole('button', { name: new RegExp(`^${v}$`) });
      if (await btn.isVisible().catch(() => false)) await btn.click();
    }
  });

  test('create task via inline creator, then API delete', async ({ page, api, track }) => {
    const title = uniqueTitle('Task');
    // Inline creator likely surfaces as an input with placeholder or "+ Add task" button.
    const inlineAdd = page.getByPlaceholder(/Add (a )?task|Quick add/i).first();
    if (await inlineAdd.isVisible().catch(() => false)) {
      await inlineAdd.fill(title);
      await inlineAdd.press('Enter');
    } else {
      await page.getByRole('button', { name: /New Task|Add Task|Create Task/i }).first().click();
      const dialog = page.getByRole('dialog').first();
      await dialog.getByRole('textbox').first().fill(title);
      await dialog.getByRole('button', { name: /Save|Create/i }).click();
    }

    await expect(page.getByText(title)).toBeVisible({ timeout: 5_000 });

    const tasks = await api.get<Array<{ id: string; title: string }>>('/api/tasks');
    const created = tasks.find((t) => t.title === title);
    expect(created).toBeTruthy();
    if (created) track({ type: 'task', id: created.id, title });
  });

  test('navigate prev/next/today', async ({ page }) => {
    for (const name of ['Previous', 'Next', 'Today']) {
      const btn = page.getByRole('button', { name: new RegExp(name, 'i') });
      if (await btn.isVisible().catch(() => false)) await btn.click();
    }
  });

  test.fixme('every TaskEditor field (priority, due, duration, parent goal, assignee, recurrence)', async () => {});
  test.fixme('complete + uncomplete task; verify state via API', async () => {});
  test.fixme('bulk select + bulk delete', async () => {});
  test.fixme('drag-reorder', async () => {});
  test.fixme('deep link to /tasks/[id]/edit', async () => {});
});
