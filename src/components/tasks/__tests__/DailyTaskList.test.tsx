import { vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '@/test/utils';
import { createTask } from '@/test/fixtures';
import { DailyTaskList } from '../DailyTaskList';

describe('DailyTaskList', () => {
  const date = '2026-03-23';
  const onEdit = vi.fn();
  const onDelete = vi.fn();

  beforeEach(() => {
    onEdit.mockReset();
    onDelete.mockReset();
  });

  it('shows loading state', () => {
    renderWithProviders(
      <DailyTaskList date={date} onEdit={onEdit} onDelete={onDelete} />,
      { swrData: {} },
    );
    expect(screen.getByText('Loading tasks...')).toBeInTheDocument();
  });

  it('renders three sections with correct labels', async () => {
    // REVIEW is intentionally not a section here — reviews surface via the
    // pink banner on the Tasks page, not as a task row.
    renderWithProviders(
      <DailyTaskList date={date} onEdit={onEdit} onDelete={onDelete} />,
      { swrData: { '/api/tasks': [] } },
    );
    await waitFor(() => {
      expect(screen.getByText('Improve')).toBeInTheDocument();
    });
    expect(screen.getByText('React')).toBeInTheDocument();
    expect(screen.getByText('Maintenance')).toBeInTheDocument();
    expect(screen.queryByText('Review')).not.toBeInTheDocument();
  });

  it('shows task counts per section', async () => {
    const tasks = [
      createTask({ id: 't-1', title: 'Task A', taskType: 'IMPROVE' }),
      createTask({ id: 't-2', title: 'Task B', taskType: 'IMPROVE' }),
      createTask({ id: 't-3', title: 'Task C', taskType: 'REACT' }),
    ];
    renderWithProviders(
      <DailyTaskList date={date} onEdit={onEdit} onDelete={onDelete} />,
      { swrData: { '/api/tasks': tasks } },
    );
    await waitFor(() => {
      expect(screen.getByText('(2)')).toBeInTheDocument();
    });
    expect(screen.getByText('(1)')).toBeInTheDocument();
    // Only MAINTENANCE is empty here (IMPROVE=2, REACT=1, MAINTENANCE=0).
    expect(screen.getAllByText('(0)').length).toBe(1);
  });

  it('renders task titles in their sections', async () => {
    const tasks = [
      createTask({ id: 't-1', title: 'Write tests', taskType: 'IMPROVE' }),
      createTask({ id: 't-2', title: 'Fix bug', taskType: 'REACT' }),
    ];
    renderWithProviders(
      <DailyTaskList date={date} onEdit={onEdit} onDelete={onDelete} />,
      { swrData: { '/api/tasks': tasks } },
    );
    await waitFor(() => {
      expect(screen.getByText('Write tests')).toBeInTheDocument();
    });
    expect(screen.getByText('Fix bug')).toBeInTheDocument();
  });

  it('shows "No tasks" when a section is empty', async () => {
    renderWithProviders(
      <DailyTaskList date={date} onEdit={onEdit} onDelete={onDelete} />,
      { swrData: { '/api/tasks': [] } },
    );
    await waitFor(() => {
      // One "No tasks" per section: IMPROVE, REACT, MAINTENANCE.
      expect(screen.getAllByText('No tasks').length).toBe(3);
    });
  });

  it('collapses a section when header is clicked', async () => {
    const user = userEvent.setup();
    const tasks = [
      createTask({ id: 't-1', title: 'Visible Task', taskType: 'IMPROVE' }),
    ];
    renderWithProviders(
      <DailyTaskList date={date} onEdit={onEdit} onDelete={onDelete} />,
      { swrData: { '/api/tasks': tasks } },
    );

    await waitFor(() => {
      expect(screen.getByText('Visible Task')).toBeInTheDocument();
    });

    // Click the "Improve" section header button to collapse
    await user.click(screen.getByText('Improve'));

    await waitFor(() => {
      expect(screen.queryByText('Visible Task')).not.toBeInTheDocument();
    });
  });

  it('expands a collapsed section when header is clicked again', async () => {
    const user = userEvent.setup();
    const tasks = [
      createTask({ id: 't-1', title: 'Toggle Task', taskType: 'REACT' }),
    ];
    renderWithProviders(
      <DailyTaskList date={date} onEdit={onEdit} onDelete={onDelete} />,
      { swrData: { '/api/tasks': tasks } },
    );

    await waitFor(() => {
      expect(screen.getByText('Toggle Task')).toBeInTheDocument();
    });

    // Collapse
    await user.click(screen.getByText('React'));
    await waitFor(() => {
      expect(screen.queryByText('Toggle Task')).not.toBeInTheDocument();
    });

    // Expand
    await user.click(screen.getByText('React'));
    await waitFor(() => {
      expect(screen.getByText('Toggle Task')).toBeInTheDocument();
    });
  });
});
