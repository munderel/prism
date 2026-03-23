import { vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, createMockFetch, createMockFetchError, userEvent } from '@/test/utils';
import { createGoal } from '@/test/fixtures';
import { GoalEditor } from '../GoalEditor';

describe('GoalEditor', () => {
  const onSave = vi.fn();
  const onClose = vi.fn();
  const stackId = 'stack-1';

  beforeEach(() => {
    onSave.mockReset();
    onClose.mockReset();
    global.fetch = createMockFetch({
      '/api/goals': { id: 'new-goal-1' },
    }) as any;
  });

  it('shows "New Goal" heading in create mode', () => {
    renderWithProviders(<GoalEditor stackId={stackId} onSave={onSave} onClose={onClose} />);
    expect(screen.getByText('New Goal')).toBeInTheDocument();
  });

  it('shows "Edit Goal" heading in edit mode', () => {
    const goal = createGoal({ id: 'g-1', title: 'Existing Goal' });
    renderWithProviders(<GoalEditor stackId={stackId} goal={goal} onSave={onSave} onClose={onClose} />);
    expect(screen.getByText('Edit Goal')).toBeInTheDocument();
  });

  it('defaults to HHG level when no parent is provided', () => {
    renderWithProviders(<GoalEditor stackId={stackId} onSave={onSave} onClose={onClose} />);
    expect(screen.getByText('HHG')).toBeInTheDocument();
  });

  it('derives child level from parent goal', () => {
    const parent = createGoal({ id: 'p-1', level: 'HIGH_HARD' });
    renderWithProviders(<GoalEditor stackId={stackId} parentGoal={parent} onSave={onSave} onClose={onClose} />);
    expect(screen.getByText('Yearly')).toBeInTheDocument();
  });

  it('derives Monthly from STRATEGIC parent', () => {
    const parent = createGoal({ id: 'p-1', level: 'STRATEGIC' });
    renderWithProviders(<GoalEditor stackId={stackId} parentGoal={parent} onSave={onSave} onClose={onClose} />);
    expect(screen.getByText('Monthly')).toBeInTheDocument();
  });

  it('shows Status dropdown only in edit mode', () => {
    const goal = createGoal({ id: 'g-1', title: 'Goal', status: 'IN_PROGRESS' });
    renderWithProviders(<GoalEditor stackId={stackId} goal={goal} onSave={onSave} onClose={onClose} />);
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByDisplayValue('In Progress')).toBeInTheDocument();
  });

  it('does not show Status dropdown in create mode', () => {
    renderWithProviders(<GoalEditor stackId={stackId} onSave={onSave} onClose={onClose} />);
    expect(screen.queryByText('Status')).not.toBeInTheDocument();
  });

  it('disables submit when title is empty', () => {
    renderWithProviders(<GoalEditor stackId={stackId} onSave={onSave} onClose={onClose} />);
    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled();
  });

  it('sends POST on create and calls onSave', async () => {
    const user = userEvent.setup();
    renderWithProviders(<GoalEditor stackId={stackId} onSave={onSave} onClose={onClose} />);

    await user.type(screen.getByPlaceholderText('What do you want to achieve?'), 'New goal');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/goals', expect.objectContaining({ method: 'POST' }));
    });
    await waitFor(() => expect(onSave).toHaveBeenCalled());
  });

  it('sends PATCH on edit and calls onSave', async () => {
    const user = userEvent.setup();
    const goal = createGoal({ id: 'g-1', title: 'Existing' });
    global.fetch = createMockFetch({
      '/api/goals/g-1': { id: 'g-1' },
    }) as any;

    renderWithProviders(<GoalEditor stackId={stackId} goal={goal} onSave={onSave} onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: 'Update' }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/goals/g-1', expect.objectContaining({ method: 'PATCH' }));
    });
    await waitFor(() => expect(onSave).toHaveBeenCalled());
  });

  it('displays error message on failure', async () => {
    const user = userEvent.setup();
    global.fetch = createMockFetchError('/api/goals', { error: 'Validation failed' }) as any;

    renderWithProviders(<GoalEditor stackId={stackId} onSave={onSave} onClose={onClose} />);
    await user.type(screen.getByPlaceholderText('What do you want to achieve?'), 'Bad goal');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(screen.getByText('Validation failed')).toBeInTheDocument();
    });
  });

  it('calls onClose when Cancel is clicked', async () => {
    const user = userEvent.setup();
    renderWithProviders(<GoalEditor stackId={stackId} onSave={onSave} onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('pre-fills fields in edit mode', () => {
    const goal = createGoal({
      id: 'g-1',
      title: 'Grow Revenue',
      description: 'Increase revenue 2x',
      status: 'NOT_STARTED',
    });
    renderWithProviders(<GoalEditor stackId={stackId} goal={goal} onSave={onSave} onClose={onClose} />);
    expect(screen.getByDisplayValue('Grow Revenue')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Increase revenue 2x')).toBeInTheDocument();
  });
});
