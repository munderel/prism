import { Page, expect } from '@playwright/test';

// Mirrors the sidebar config in prism/src/components/layout/Sidebar.tsx.
export const NAV_ITEMS = [
  { href: '/', label: 'Dashboard' },
  { href: '/goals', label: 'Goal Stack' },
  { href: '/training', label: 'Training' },
  { href: '/tasks', label: 'Tasks' },
  { href: '/reactive-tasks', label: 'Reactive Tasks' },
  { href: '/ideas', label: 'Ideas' },
  { href: '/aims', label: 'Aims' },
  { href: '/calendar', label: 'Calendar' },
  { href: '/reviews', label: 'Reviews' },
  { href: '/powerdown', label: 'Power Down' },
  { href: '/streaks', label: 'Streaks' },
  { href: '/leaderboard', label: 'Leaderboard' },
  { href: '/reports', label: 'Reports' },
  { href: '/kpis', label: 'KPI Dashboard' },
  { href: '/processes', label: 'Processes' },
  { href: '/delegated', label: 'Delegated', adminOnly: true },
  { href: '/settings', label: 'Settings' },
] as const;

export class NavSidebar {
  constructor(private page: Page) {}

  async go(label: string): Promise<void> {
    const link = this.page.getByRole('navigation').getByRole('link', { name: label, exact: true });
    await link.first().click();
  }

  async expectActive(label: string): Promise<void> {
    const link = this.page.getByRole('navigation').getByRole('link', { name: label, exact: true });
    await expect(link.first()).toBeVisible();
  }
}
