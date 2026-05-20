import { vi } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
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
    expect(screen.getAllByText('High Hard Goal').length).toBeGreaterThanOrEqual(1);
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
    // Fill required date fields (root goal create mode requires start/end dates)
    const dateInputs = document.querySelectorAll('input[type="date"]');
    fireEvent.change(dateInputs[0], { target: { value: '2026-01-01' } });
    fireEvent.change(dateInputs[1], { target: { value: '2027-01-01' } });
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
    // Fill required date fields so form can submit
    const dateInputs = document.querySelectorAll('input[type="date"]');
    fireEvent.change(dateInputs[0], { target: { value: '2026-01-01' } });
    fireEvent.change(dateInputs[1], { target: { value: '2027-01-01' } });
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

  it('pre-fills date inputs with stored UTC-anchored dates without TZ shift', () => {
    // API stores date-only fields as UTC midnight via parseDateOnly().
    // The editor must display the same calendar date the user picked,
    // regardless of viewer timezone — date-only display should be UTC-anchored.
    const goal = createGoal({
      id: 'g-1',
      level: 'WEEKLY',
      startDate: '2026-05-11T00:00:00.000Z',
      endDate: '2026-05-17T00:00:00.000Z',
    });
    renderWithProviders(<GoalEditor stackId={stackId} goal={goal} onSave={onSave} onClose={onClose} />);
    const dateInputs = document.querySelectorAll('input[type="date"]');
    expect(dateInputs).toHaveLength(2);
    expect(dateInputs[0]).toHaveValue('2026-05-11');
    expect(dateInputs[1]).toHaveValue('2026-05-17');
  });

  it('preserves stored dates on PATCH when the user does not touch them', async () => {
    const user = userEvent.setup();
    const goal = createGoal({
      id: 'g-1',
      level: 'WEEKLY',
      startDate: '2026-05-11T00:00:00.000Z',
      endDate: '2026-05-17T00:00:00.000Z',
    });
    const fetchMock = createMockFetch({ '/api/goals/g-1': { id: 'g-1' } });
    global.fetch = fetchMock as any;

    renderWithProviders(<GoalEditor stackId={stackId} goal={goal} onSave={onSave} onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: 'Update' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.startDate).toBe('2026-05-11');
    expect(body.endDate).toBe('2026-05-17');
  });

  // Full end-to-end round-trip:
  //   (1) user creates a root goal with start='2026-05-11', end='2026-05-17'
  //   (2) POST body carries those exact strings (no TZ shift)
  //   (3) the editor is then re-rendered as if the API echoed back UTC-midnight
  //       ISO strings — the date inputs must show the same '2026-05-11' and
  //       '2026-05-17' the user typed.
  // Locks the compounding-drift bug class dead end-to-end.
  it('round-trips create → re-render: typed dates appear unchanged in edit form', async () => {
    const user = userEvent.setup();
    const fetchMock = createMockFetch({
      '/api/goals': { id: 'new-goal-1' },
    });
    global.fetch = fetchMock as any;

    const { unmount } = renderWithProviders(
      <GoalEditor stackId={stackId} onSave={onSave} onClose={onClose} />,
    );

    await user.type(screen.getByPlaceholderText('What do you want to achieve?'), 'Cross-year goal');
    const dateInputs = document.querySelectorAll('input[type="date"]');
    fireEvent.change(dateInputs[0], { target: { value: '2026-05-11' } });
    fireEvent.change(dateInputs[1], { target: { value: '2026-05-17' } });
    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.startDate).toBe('2026-05-11');
    expect(body.endDate).toBe('2026-05-17');

    // Simulate the API echoing those dates back as UTC-midnight ISO strings
    // and re-mounting the editor in edit mode.
    unmount();
    const savedGoal = createGoal({
      id: 'new-goal-1',
      title: 'Cross-year goal',
      startDate: '2026-05-11T00:00:00.000Z',
      endDate: '2026-05-17T00:00:00.000Z',
    });
    renderWithProviders(
      <GoalEditor stackId={stackId} goal={savedGoal} onSave={onSave} onClose={onClose} />,
    );
    const reopened = document.querySelectorAll('input[type="date"]');
    expect(reopened[0]).toHaveValue('2026-05-11');
    expect(reopened[1]).toHaveValue('2026-05-17');
  });
});
