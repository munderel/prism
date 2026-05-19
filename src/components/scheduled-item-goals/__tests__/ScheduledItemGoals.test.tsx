/* eslint-disable @typescript-eslint/no-explicit-any */
import { vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '@/test/utils';
import { ScheduledItemGoals } from '../ScheduledItemGoals';

function makeWorkBlock(overrides: Record<string, any> = {}) {
  return {
    id: 'wb-1',
    start: '2026-04-28T13:00:00.000Z',
    end: '2026-04-28T14:30:00.000Z',
    mainObjective: 'Ship the analytics dashboard',
    completionStatus: 'PENDING',
    task: {
      id: 'task-1',
      title: 'Q2 dashboard work',
      taskType: 'IMPROVE',
      priority: 'HIGH',
      status: 'TODO',
      dueDate: null,
      estimatedMinutes: 90,
    },
    clearGoals: [
      { id: 'cg-1', text: 'Outline the 3 charts', isComplete: false, sortOrder: 0 },
      { id: 'cg-2', text: 'Wire up the SQL', isComplete: false, sortOrder: 1 },
    ],
    ...overrides,
  };
}

function makeAimInstance(overrides: Record<string, any> = {}) {
  return {
    id: 'aim-1',
    scheduledDate: '2026-04-28T00:00:00.000Z',
    timeBlockStart: '2026-04-28T07:00:00.000Z',
    timeBlockEnd: '2026-04-28T07:45:00.000Z',
    status: 'SCHEDULED',
    activityNote: '5km easy pace, focus on form',
    selectedActivity: 'run',
    aimCategory: { id: 'cat-1', name: 'Movement' },
    ...overrides,
  };
}

function makeProcessExecution(overrides: Record<string, any> = {}) {
  return {
    id: 'proc-event-2026-04-28',
    processId: 'p-1',
    title: 'Daily KPI log',
    timeBlockStart: '2026-04-28T17:00:00.000Z',
    timeBlockEnd: '2026-04-28T17:15:00.000Z',
    ...overrides,
  };
}

function makeTask(overrides: Record<string, any> = {}) {
  return {
    id: 'task-9',
    title: 'Orphan scheduled task',
    taskType: 'IMPROVE',
    timeBlockStart: '2026-04-28T19:00:00.000Z',
    timeBlockEnd: '2026-04-28T20:00:00.000Z',
    ...overrides,
  };
}

describe('ScheduledItemGoals — workBlock', () => {
  it('renders the main objective and existing clear goals', () => {
    const block = makeWorkBlock();
    renderWithProviders(
      <ScheduledItemGoals item={{ kind: 'workBlock', block }} mode="inline" />,
    );

    expect(screen.getByDisplayValue('Ship the analytics dashboard')).toBeInTheDocument();
    expect(screen.getByText('Outline the 3 charts')).toBeInTheDocument();
    expect(screen.getByText('Wire up the SQL')).toBeInTheDocument();
    expect(screen.getByText('Q2 dashboard work')).toBeInTheDocument();
  });

  it('saves a new main objective on blur', async () => {
    const user = userEvent.setup();
    const block = makeWorkBlock();
    const fetchMock = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ ...block, mainObjective: 'New objective' }) }),
    );
    global.fetch = fetchMock as any;

    renderWithProviders(
      <ScheduledItemGoals item={{ kind: 'workBlock', block }} mode="inline" />,
    );

    const input = screen.getByDisplayValue('Ship the analytics dashboard') as HTMLInputElement;
    await user.clear(input);
    await user.type(input, 'New objective');
    await user.tab();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/work-blocks/wb-1');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body as string)).toEqual({ mainObjective: 'New objective' });
  });

  it('does not PATCH when blur happens without changes', async () => {
    const user = userEvent.setup();
    const block = makeWorkBlock();
    const fetchMock = vi.fn();
    global.fetch = fetchMock as any;

    renderWithProviders(
      <ScheduledItemGoals item={{ kind: 'workBlock', block }} mode="inline" />,
    );

    const input = screen.getByDisplayValue('Ship the analytics dashboard');
    await user.click(input);
    await user.tab();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('adds a clear goal by sending the full new clearGoals list', async () => {
    const user = userEvent.setup();
    const block = makeWorkBlock();
    const fetchMock = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(block) }),
    );
    global.fetch = fetchMock as any;
    const onChange = vi.fn();

    renderWithProviders(
      <ScheduledItemGoals item={{ kind: 'workBlock', block }} mode="inline" onChange={onChange} />,
    );

    const newGoalInput = screen.getByPlaceholderText(/add a clear goal/i);
    await user.type(newGoalInput, 'Push to staging');
    await user.keyboard('{Enter}');

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/work-blocks/wb-1');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body as string)).toEqual({
      clearGoals: ['Outline the 3 charts', 'Wire up the SQL', 'Push to staging'],
    });
    await waitFor(() => expect(onChange).toHaveBeenCalled());
  });

  it('removes a clear goal by sending the remaining clearGoals list', async () => {
    const user = userEvent.setup();
    const block = makeWorkBlock();
    const fetchMock = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(block) }),
    );
    global.fetch = fetchMock as any;

    renderWithProviders(
      <ScheduledItemGoals item={{ kind: 'workBlock', block }} mode="inline" />,
    );

    const removeButtons = screen.getAllByRole('button', { name: /remove clear goal/i });
    await user.click(removeButtons[0]);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body as string)).toEqual({
      clearGoals: ['Wire up the SQL'],
    });
  });
});

describe('ScheduledItemGoals — aimInstance', () => {
  it('renders the activity note', () => {
    const aim = makeAimInstance();
    renderWithProviders(
      <ScheduledItemGoals item={{ kind: 'aimInstance', aim }} mode="inline" />,
    );
    expect(screen.getByDisplayValue('5km easy pace, focus on form')).toBeInTheDocument();
    expect(screen.getByText(/Movement/i)).toBeInTheDocument();
  });

  it('PATCHes /api/aims/instances/[id] when the note changes on blur', async () => {
    const user = userEvent.setup();
    const aim = makeAimInstance();
    const fetchMock = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(aim) }),
    );
    global.fetch = fetchMock as any;

    renderWithProviders(
      <ScheduledItemGoals item={{ kind: 'aimInstance', aim }} mode="inline" />,
    );

    const input = screen.getByDisplayValue('5km easy pace, focus on form') as HTMLInputElement;
    await user.clear(input);
    await user.type(input, 'Tempo run');
    await user.tab();

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/aims/instances/aim-1');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body as string)).toEqual({ activityNote: 'Tempo run' });
  });
});

describe('ScheduledItemGoals — processExecution', () => {
  it('renders title and time read-only with no editable inputs', () => {
    const exec = makeProcessExecution();
    renderWithProviders(
      <ScheduledItemGoals item={{ kind: 'processExecution', exec }} mode="inline" />,
    );

    expect(screen.getByText('Daily KPI log')).toBeInTheDocument();
    // No editable input/textarea should be rendered
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
});

describe('ScheduledItemGoals — taskOnly (orphan scheduled task)', () => {
  it('renders the task title', () => {
    const task = makeTask();
    renderWithProviders(
      <ScheduledItemGoals item={{ kind: 'taskOnly', task }} mode="inline" />,
      {
        swrData: { '/api/tasks/task-9/clear-goals': [] },
      },
    );
    expect(screen.getByText('Orphan scheduled task')).toBeInTheDocument();
  });
});
