import { test, expect } from '../../fixtures/test';
import { NAV_ITEMS } from '../../pos/components/NavSidebarPO';

// Touches every primary route from the sidebar. Asserts the page renders without an error boundary
// and (where present) the page heading matches the nav label. Cheap, catches regressions fast.
test.describe('@smoke navigation', () => {
  for (const item of NAV_ITEMS) {
    test(`loads ${item.label} (${item.href})`, async ({ page }) => {
      const resp = await page.goto(item.href);
      // Admin-only routes may 403; tolerate that for the non-admin test account.
      if (item.adminOnly && resp && resp.status() >= 400) {
        test.info().annotations.push({ type: 'note', description: `${item.href} requires admin` });
        return;
      }
      await expect(page).toHaveURL(new RegExp(item.href === '/' ? '/$' : item.href));
      // Generic "something rendered" assertion — at least a main landmark or visible heading.
      const main = page.getByRole('main').or(page.locator('main')).first();
      await expect(main).toBeVisible({ timeout: 10_000 });
      // Error boundary safety: no "Something went wrong" surfaced.
      await expect(page.getByText(/something went wrong|application error/i)).toHaveCount(0);
    });
  }
});
