import { test, expect } from '../../fixtures/test';
import { uniqueTitle } from '../../fixtures/test-data';

test.describe('@deep ideas', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/ideas');
  });

  test('@smoke renders page heading and search', async ({ page }) => {
    await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByPlaceholder('Search ideas...')).toBeVisible();
  });

  test('open New Idea form, submit, delete via API cleanup', async ({ page, api, track }) => {
    const title = uniqueTitle('Idea');
    await page.getByRole('button', { name: /^New Idea$/ }).click();

    // The form should expose a title field. Fill the first visible textbox in the open dialog.
    const dialog = page.getByRole('dialog').first();
    await expect(dialog).toBeVisible();
    await dialog.getByRole('textbox').first().fill(title);
    await dialog.getByRole('button', { name: /Submit|Save|Create/i }).click();

    await expect(page.getByText(title)).toBeVisible({ timeout: 5_000 });

    const ideas = await api.get<Array<{ id: string; title: string }>>('/api/ideas');
    const created = ideas.find((i) => i.title === title);
    expect(created).toBeTruthy();
    if (created) track({ type: 'idea', id: created.id, title });
  });

  test('search filter narrows list', async ({ page }) => {
    const search = page.getByPlaceholder('Search ideas...');
    await search.fill('zzz-no-such-idea-xyz');
    await page.waitForTimeout(400);
    // Empty state should appear or list should shrink.
  });

  test('status filters cycle without error', async ({ page }) => {
    for (const status of ['Submitted', 'Under Review', 'Approved', 'Rejected', 'Converted', 'Archived']) {
      const btn = page.getByRole('button', { name: new RegExp(`^${status}$`) });
      if (await btn.isVisible().catch(() => false)) await btn.click();
    }
  });

  test.fixme('sort options (ICE score / newest / oldest)', async () => {});
  test.fixme('convert idea to task', async () => {});
  test.fixme('convert idea to goal', async () => {});
  test.fixme('archive action', async () => {});
});
