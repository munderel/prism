import { vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, createMockFetch, createMockFetchError, userEvent } from '@/test/utils';
import { createTask, createGoal, createStack } from '@/test/fixtures';
import { TaskEditor } from '../TaskEditor';

function setupFetch(overrides: Record<string, any> = {}) {
  global.fetch = createMockFetch({
    '/api/stacks': [createStack({ id: 'stack-1', name: 'My Stack' })],
    '/api/goals?stackId=stack-1': [
      createGoal({ id: 'goal-1', title: 'Ship MVP', level: 'STRATEGIC', stackName: 'My Stack' }),
    ],
    '/api/tasks': { id: 'new-task-1' },
    ...overrides,
  }) as any;
}

describe('TaskEditor', () => {
  const onSave = vi.fn();
  const onClose = vi.fn();

  beforeEach(() => {
    onSave.mockReset();
    onClose.mockReset();
    setupFetch();
  });

  it('shows "New Task" heading in create mode', () => {
    renderWithProviders(<TaskEditor onSave={onSave} onClose={onClose} />);
    expect(screen.getByText('New Task')).toBeInTheDocument();
  });

  it('shows "Edit Task" heading in edit mode', () => {
    const task = createTask({ id: 't-1', title: 'Existing' });
    renderWithProviders(<TaskEditor task={task} onSave={onSave} onClose={onClose} />);
    expect(screen.getByText('Edit Task')).toBeInTheDocument();
  });

  it('shows task type selector only in create mode', () => {
    renderWithProviders(<TaskEditor onSave={onSave} onClose={onClose} />);
    expect(screen.getByText('Goal Stack')).toBeInTheDocument();
    expect(screen.getByText('React')).toBeInTheDocument();
    expect(screen.getByText('Maintenance')).toBeInTheDocument();
  });

  it('hides task type selector in edit mode', () => {
    const task = createTask({ id: 't-1', title: 'Existing', taskType: 'REACT' });
    renderWithProviders(<TaskEditor task={task} onSave={onSave} onClose={onClose} />);
    expect(screen.queryByText('Task Type')).not.toBeInTheDocument();
  });

  it('shows Linked Goal select when GOAL_STACK type is selected', async () => {
    renderWithProviders(<TaskEditor onSave={onSave} onClose={onClose} />);
    await waitFor(() => {
      expect(screen.getByText('Linked Goal')).toBeInTheDocument();
    });
  });

  it('shows Frequency and Interval for MAINTENANCE type', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TaskEditor onSave={onSave} onClose={onClose} />);
    await user.click(screen.getByText('Maintenance'));
    expect(screen.getByText('Frequency')).toBeInTheDocument();
    expect(screen.getByText('Interval')).toBeInTheDocument();
  });

  it('shows Status dropdown only in edit mode', () => {
    const task = createTask({ id: 't-1', title: 'Existing', status: 'TODO' });
    renderWithProviders(<TaskEditor task={task} onSave={onSave} onClose={onClose} />);
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByDisplayValue('To Do')).toBeInTheDocument();
  });

  it('does not show Status dropdown in create mode', () => {
    renderWithProviders(<TaskEditor onSave={onSave} onClose={onClose} />);
    expect(screen.queryByText('Status')).not.toBeInTheDocument();
  });

  it('disables submit when title is empty', () => {
    renderWithProviders(<TaskEditor onSave={onSave} onClose={onClose} />);
    const createBtn = screen.getByRole('button', { name: 'Create' });
    expect(createBtn).toBeDisabled();
  });

  it('enables submit when title is filled', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TaskEditor onSave={onSave} onClose={onClose} />);
    await user.type(screen.getByPlaceholderText('What needs to be done?'), 'New task title');
    const createBtn = screen.getByRole('button', { name: 'Create' });
    expect(createBtn).toBeEnabled();
  });

  it('sends POST on create and calls onSave', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TaskEditor onSave={onSave} onClose={onClose} />);

    await user.type(screen.getByPlaceholderText('What needs to be done?'), 'New task');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/tasks', expect.objectContaining({ method: 'POST' }));
    });
    await waitFor(() => expect(onSave).toHaveBeenCalled());
  });

  it('sends PATCH on edit and calls onSave', async () => {
    const user = userEvent.setup();
    const task = createTask({ id: 't-1', title: 'Old title' });
    global.fetch = createMockFetch({
      '/api/tasks/t-1': { id: 't-1' },
    }) as any;

    renderWithProviders(<TaskEditor task={task} onSave={onSave} onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: 'Update' }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/tasks/t-1', expect.objectContaining({ method: 'PATCH' }));
    });
    await waitFor(() => expect(onSave).toHaveBeenCalled());
  });

  it('displays error message on submission failure', async () => {
    const user = userEvent.setup();
    global.fetch = createMockFetchError('/api/tasks', { error: 'Title already exists' }) as any;

    renderWithProviders(<TaskEditor onSave={onSave} onClose={onClose} />);
    await user.type(screen.getByPlaceholderText('What needs to be done?'), 'Duplicate');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(screen.getByText('Title already exists')).toBeInTheDocument();
    });
  });

  it('calls onClose when Cancel is clicked', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TaskEditor onSave={onSave} onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('pre-fills fields in edit mode', () => {
    const task = createTask({
      id: 't-1',
      title: 'My Task',
      description: 'Task desc',
      priority: 'HIGH',
      deliverable: 'Final report',
    });
    renderWithProviders(<TaskEditor task={task} onSave={onSave} onClose={onClose} />);

    expect(screen.getByDisplayValue('My Task')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Task desc')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Final report')).toBeInTheDocument();
    expect(screen.getByDisplayValue('High')).toBeInTheDocument();
  });

  it('shows Expected Deliverable field', () => {
    renderWithProviders(<TaskEditor onSave={onSave} onClose={onClose} />);
    expect(screen.getByText('Expected Deliverable')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Final report PDF/)).toBeInTheDocument();
  });
});
