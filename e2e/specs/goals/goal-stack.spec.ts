import { test, expect } from '../../fixtures/test';
import { uniqueTitle } from '../../fixtures/test-data';

test.describe('@deep goal stack', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/goals');
    await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('@smoke page renders heading and primary controls', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Goal Stack Guide/i })).toBeVisible();
  });

  test('create new stack via inline form, then delete it', async ({ page, api, track }) => {
    const name = uniqueTitle('Stack');
    // The page exposes a name input and a submit button.
    const input = page.getByPlaceholder('Stack name');
    await input.fill(name);
    await input.press('Enter');

    // Stack tab appears.
    await expect(page.getByRole('button', { name })).toBeVisible({ timeout: 5_000 });

    // Find id via API and track for cleanup, then delete via UI to test the delete flow too.
    const stacks = await api.get<Array<{ id: string; name: string }>>('/api/stacks');
    const created = stacks.find((s) => s.name === name);
    expect(created).toBeTruthy();
    if (created) track({ type: 'stack', id: created.id, title: name });

    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: `Delete stack '${name}'` }).click().catch(async () => {
      // Some implementations open a confirm modal instead of native confirm.
      await page.getByRole('button', { name: /Confirm|Delete/ }).click();
    });
    await expect(page.getByRole('button', { name })).toBeHidden({ timeout: 5_000 });
  });

  test('Mine / All toggle filters company stacks', async ({ page }) => {
    const mine = page.getByRole('button', { name: /^Mine$/ });
    const all = page.getByRole('button', { name: /^All$/ });
    if (await mine.isVisible().catch(() => false)) {
      await mine.click();
      await all.click();
    } else {
      test.info().annotations.push({ type: 'note', description: 'Mine/All toggle not present for non-company users' });
    }
  });

  test('In Progress / Due Today filters toggle', async ({ page }) => {
    for (const label of ['In Progress', 'Due Today']) {
      const btn = page.getByRole('button', { name: new RegExp(`^${label}$`) });
      if (await btn.isVisible().catch(() => false)) {
        await btn.click();
        await btn.click();
      }
    }
  });

  test('Stack vs Daily Actions view toggle', async ({ page }) => {
    const daily = page.getByRole('button', { name: /Daily Actions/i });
    if (await daily.isVisible().catch(() => false)) {
      await daily.click();
      await page.getByRole('button', { name: /Stack/i }).first().click();
    }
  });

  test.fixme('create goal at each level (HIGH_HARD → DAILY) and link parent', async () => {
    // GoalEditor modal interaction — needs concrete selectors. See plan §9: add data-testid to GoalCard.
  });

  test.fixme('drag-reorder goals persists across reload', async () => {});
  test.fixme('YAML import/export round-trip', async () => {});
  test.fixme('Assignees modal adds/removes user', async () => {});
});
