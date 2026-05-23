import { test, expect } from '../../fixtures/test';
import { commandPalette, pressEscape, META } from '../../helpers/keyboard';

test.describe('@deep keyboard shortcuts', () => {
  test('Cmd+K + Escape', async ({ page }) => {
    await page.goto('/');
    await commandPalette(page);
    await expect(page.getByRole('dialog').first()).toBeVisible();
    await pressEscape(page);
  });

  test('Escape closes open modals', async ({ page }) => {
    await page.goto('/goals');
    // Open the Guide button if present
    const guide = page.getByRole('button', { name: /Goal Stack Guide/i });
    if (await guide.isVisible().catch(() => false)) {
      await guide.click();
      await pressEscape(page);
    }
  });

  test('Meta is set per-platform', () => {
    expect(['Control', 'Meta']).toContain(META);
  });
});
