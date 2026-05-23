import { test, expect } from '../../fixtures/test';
import { commandPalette, pressEscape } from '../../helpers/keyboard';

test.describe('@deep command palette', () => {
  test('@smoke Cmd+K opens command palette', async ({ page }) => {
    await page.goto('/');
    // Focus body so the global keydown handler in MainLayout fires.
    await page.locator('body').click();
    await commandPalette(page);
    // CommandPalette is a fixed-position overlay, not a <dialog>. Match by structure.
    const palette = page.locator('div.fixed.inset-0').filter({ has: page.getByRole('textbox') }).first();
    await expect(palette).toBeVisible({ timeout: 3_000 });
    await pressEscape(page);
    await expect(palette).toBeHidden();
  });

  test.fixme('fuzzy-nav to every sidebar route', async () => {});
  test.fixme('quick-create actions for task, idea, goal', async () => {});
  test.fixme('arrow-key navigation + Enter selects', async () => {});
});
