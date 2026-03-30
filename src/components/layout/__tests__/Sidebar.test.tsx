import '@/test/mocks';
import { setMockPathname } from '@/test/mocks';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/utils';
import { Sidebar } from '../Sidebar';

// Mock next-themes
vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'dark', setTheme: vi.fn() }),
}));

describe('Sidebar', () => {
  it('renders the Prism brand name', () => {
    setMockPathname('/');
    renderWithProviders(<Sidebar />, { swrData: { '/api/settings': { hiddenFeatures: [] } } });
    // Desktop + Mobile both render "Prism"
    const prismElements = screen.getAllByText('Prism');
    expect(prismElements.length).toBeGreaterThanOrEqual(1);
  });

  it('renders all nav items', () => {
    setMockPathname('/');
    renderWithProviders(<Sidebar />, { swrData: { '/api/settings': { hiddenFeatures: [] } } });
    const labels = [
      'Dashboard', 'Goal Stack', 'Training', 'Tasks', 'Reactive Tasks', 'Ideas',
      'Aims', 'Calendar', 'Reviews', 'Power Down',
      'Leaderboard', 'Reports',
      'Processes', 'Settings',
    ];
    for (const label of labels) {
      // Each label appears in both desktop and mobile sidebar
      const elements = screen.getAllByText(label);
      expect(elements.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('highlights the active nav item', () => {
    setMockPathname('/tasks');
    renderWithProviders(<Sidebar />, { swrData: { '/api/settings': { hiddenFeatures: [] } } });
    const tasksLinks = screen.getAllByText('Tasks');
    const tasksLink = tasksLinks[0].closest('a');
    expect(tasksLink).toHaveClass('nav-active-indicator');
    expect(tasksLink).toHaveClass('text-[var(--text-primary)]');
  });

  it('non-active items have text-[var(--text-secondary)]', () => {
    setMockPathname('/tasks');
    renderWithProviders(<Sidebar />, { swrData: { '/api/settings': { hiddenFeatures: [] } } });
    const dashboardLinks = screen.getAllByText('Dashboard');
    const dashboardLink = dashboardLinks[0].closest('a');
    expect(dashboardLink).toHaveClass('text-[var(--text-secondary)]');
    expect(dashboardLink).not.toHaveClass('nav-active-indicator');
  });
});
