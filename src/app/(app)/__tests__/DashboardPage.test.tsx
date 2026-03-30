import { vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/utils';
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

vi.mock('@/components/dashboard/WinTheDayCard', () => ({
  WinTheDayCard: () => <div data-testid="win-the-day-card" />,
}));

vi.mock('@/components/dopamine/WinTheDayCelebration', () => ({
  WinTheDayCelebration: () => null,
}));

vi.mock('@/components/dashboard/FocusView', () => ({
  FocusView: () => <div data-testid="focus-view" />,
}));

vi.mock('@/components/dashboard/DashboardTimeline', () => ({
  DashboardTimeline: () => <div data-testid="dashboard-timeline" />,
}));

vi.mock('@/components/dashboard/QuickAddMenu', () => ({
  QuickAddMenu: () => <button>Quick Add</button>,
}));

vi.mock('@/components/calendar/WeeklyHourTarget', () => ({
  WeeklyHourTarget: () => <div data-testid="weekly-hour-target" />,
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
  it('shows greeting with user first name', async () => {
    renderPage();

    await waitFor(() => {
      // Greeting depends on time of day: "Good morning", "Good afternoon", or "Good evening"
      expect(screen.getByText(/Test/)).toBeInTheDocument();
    });
  });

  it('renders Quick Add button', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Quick Add')).toBeInTheDocument();
    });
  });

  it('renders WinTheDayCard component', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('win-the-day-card')).toBeInTheDocument();
    });
  });

  it('renders DashboardTimeline component', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('dashboard-timeline')).toBeInTheDocument();
    });
  });

  it('renders Power Down link', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Power Down')).toBeInTheDocument();
    });
  });

  it('renders view mode toggle buttons', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Daily')).toBeInTheDocument();
      expect(screen.getByText('Weekly')).toBeInTheDocument();
    });
  });

  it('handles empty task list gracefully', async () => {
    renderPage([]);

    await waitFor(() => {
      // Page should still render without errors
      expect(screen.getByText('Quick Add')).toBeInTheDocument();
    });
  });
});
