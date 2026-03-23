import '@/test/mocks';
import { setMockPathname } from '@/test/mocks';
import { render } from '@testing-library/react';
import { screen } from '@testing-library/react';
import { Sidebar } from '../Sidebar';

describe('Sidebar', () => {
  it('renders the Prism brand name', () => {
    setMockPathname('/');
    render(<Sidebar />);
    expect(screen.getByText('ism')).toBeInTheDocument();
    expect(screen.getByText('Pr')).toBeInTheDocument();
  });

  it('renders all 10 nav items', () => {
    setMockPathname('/');
    render(<Sidebar />);
    const labels = [
      'Dashboard', 'Goal Stack', 'Tasks', 'Calendar', 'Reviews',
      'Power Down', 'Leaderboard', 'Reports', 'Processes', 'Settings',
    ];
    for (const label of labels) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('highlights the active nav item', () => {
    setMockPathname('/tasks');
    render(<Sidebar />);
    const tasksLink = screen.getByText('Tasks').closest('a');
    expect(tasksLink).toHaveClass('bg-indigo-600/20');
    expect(tasksLink).toHaveClass('text-indigo-400');
  });

  it('non-active items have text-gray-400', () => {
    setMockPathname('/tasks');
    render(<Sidebar />);
    const dashboardLink = screen.getByText('Dashboard').closest('a');
    expect(dashboardLink).toHaveClass('text-gray-400');
    expect(dashboardLink).not.toHaveClass('bg-indigo-600/20');
  });
});
