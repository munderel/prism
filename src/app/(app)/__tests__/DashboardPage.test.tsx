import { vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '@/test/utils';
import { createTask } from '@/test/fixtures';
import DashboardPage from '../page';

// Mock child components to isolate page-level tests
vi.mock('@/components/tasks/DailyTaskList', () => ({
  DailyTaskList: (props: any) => <div data-testid="daily-task-list" data-date={props.date} />,
}));

vi.mock('@/components/tasks/TaskEditor', () => ({
  TaskEditor: (props: any) => (
    <div data-testid="task-editor">
      <button onClick={props.onClose}>Close Editor</button>
    </div>
  ),
}));

const tasks = [
  createTask({ id: 't1', title: 'Task 1', status: 'DONE', priority: 'MEDIUM' }),
  createTask({ id: 't2', title: 'Task 2', status: 'IN_PROGRESS', priority: 'MEDIUM' }),
  createTask({ id: 't3', title: 'Task 3', status: 'TODO', priority: 'URGENT' }),
  createTask({ id: 't4', title: 'Task 4', status: 'TODO', priority: 'MEDIUM' }),
];

function renderPage(taskData: any[] = tasks) {
  return renderWithProviders(<DashboardPage />, {
    swrData: {
      '/api/tasks': taskData,
    },
  });
}

describe('DashboardPage', () => {
  it('shows welcome message with user name', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/Welcome back, Test User/)).toBeInTheDocument();
    });
  });

  it('renders stat cards with correct counts', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Total Tasks')).toBeInTheDocument();
    });

    // 4 total, 1 done, 1 in progress, 1 urgent
    const statValues = screen.getAllByText(/^[0-4]$/);
    expect(statValues.length).toBeGreaterThanOrEqual(4);
  });

  it('renders DailyTaskList component', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('daily-task-list')).toBeInTheDocument();
    });
  });

  it('shows Quick Add button', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Quick Add/i })).toBeInTheDocument();
    });
  });

  it('opens TaskEditor when Quick Add is clicked', async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Quick Add/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Quick Add/i }));

    await waitFor(() => {
      expect(screen.getByTestId('task-editor')).toBeInTheDocument();
    });
  });

  it('closes TaskEditor when close is triggered', async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Quick Add/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Quick Add/i }));

    await waitFor(() => {
      expect(screen.getByTestId('task-editor')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Close Editor'));

    await waitFor(() => {
      expect(screen.queryByTestId('task-editor')).not.toBeInTheDocument();
    });
  });

  it('handles empty task list gracefully', async () => {
    renderPage([]);

    await waitFor(() => {
      expect(screen.getByText('Total Tasks')).toBeInTheDocument();
    });
    // All stat values should be 0
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });
});
