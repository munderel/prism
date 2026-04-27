import { vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent, createMockFetch } from '@/test/utils';
import { StepReviewTasks, type ReviewTasksSummary } from '../StepReviewTasks';

const STACKS = [{ id: 'stack-1', isCompany: false, weekStartDay: 1 }];

function makeTask(overrides: Partial<{
  id: string; title: string; status: string; priority: string;
  goal: { id: string; title: string } | null;
}> = {}) {
  return {
    id: overrides.id ?? 'task-1',
    title: overrides.title ?? 'Untitled',
    status: overrides.status ?? 'TODO',
    dueDate: '2026-04-20',
    priority: overrides.priority ?? 'MEDIUM',
    taskType: 'IMPROVE',
    goal: overrides.goal === undefined ? { id: 'goal-1', title: 'Ship Feature' } : overrides.goal,
  };
}

describe('StepReviewTasks', () => {
  it('shows loading state before tasks arrive', () => {
    global.fetch = vi.fn(() => new Promise(() => {})); // never resolves
    renderWithProviders(<StepReviewTasks />);
    expect(screen.getByText(/Loading last week's tasks/i)).toBeInTheDocument();
  });

  it('renders empty state when last week had no tasks', async () => {
    global.fetch = createMockFetch({
      '/api/stacks': STACKS,
      'startDate=': [],
    });
    renderWithProviders(<StepReviewTasks />);
    expect(await screen.findByText(/No tasks were due last week/i)).toBeInTheDocument();
  });

  it('groups tasks by goal and lands goalless tasks in Unlinked Tasks', async () => {
    global.fetch = createMockFetch({
      '/api/stacks': STACKS,
      'startDate=': [
        makeTask({ id: 't-1', title: 'Implement auth', goal: { id: 'g-1', title: 'Auth Goal' } }),
        makeTask({ id: 't-2', title: 'Fix nav bug',  goal: null }),
      ],
    });
    renderWithProviders(<StepReviewTasks />);
    expect(await screen.findByText('Auth Goal')).toBeInTheDocument();
    expect(screen.getByText('Unlinked Tasks')).toBeInTheDocument();
    expect(screen.getByText('Implement auth')).toBeInTheDocument();
    expect(screen.getByText('Fix nav bug')).toBeInTheDocument();
  });

  it('queries the API with a last-week startDate/endDate range', async () => {
    const fetchMock = createMockFetch({
      '/api/stacks': STACKS,
      'startDate=': [makeTask()],
    });
    global.fetch = fetchMock;
    renderWithProviders(<StepReviewTasks />);
    await screen.findByText('Untitled');

    const tasksCall = fetchMock.mock.calls.find(([url]) =>
      typeof url === 'string' && url.startsWith('/api/tasks?startDate='),
    );
    expect(tasksCall).toBeTruthy();
    const url = tasksCall![0] as string;
    expect(url).toMatch(/startDate=\d{4}-\d{2}-\d{2}/);
    expect(url).toMatch(/endDate=\d{4}-\d{2}-\d{2}/);
    expect(url).toContain('scope=individual');
  });

  it('marks a task done via PATCH and updates the counter', async () => {
    const fetchMock = createMockFetch({
      '/api/stacks': STACKS,
      'startDate=': [makeTask({ id: 't-1', title: 'Ship the thing' })],
      '/api/tasks/t-1': { id: 't-1', status: 'DONE' },
    });
    global.fetch = fetchMock;
    const user = userEvent.setup();
    renderWithProviders(<StepReviewTasks />);

    await screen.findByText('Ship the thing');
    expect(screen.getByText('0 done')).toBeInTheDocument();

    await user.click(screen.getByLabelText(/Mark Ship the thing done/i));

    await waitFor(() => {
      expect(screen.getByText('1 done')).toBeInTheDocument();
    });

    const patchCall = fetchMock.mock.calls.find(([url, init]) =>
      typeof url === 'string' && url.includes('/api/tasks/t-1') && (init as RequestInit | undefined)?.method === 'PATCH',
    );
    expect(patchCall).toBeTruthy();
    const body = JSON.parse((patchCall![1] as RequestInit).body as string);
    expect(body).toEqual({ status: 'DONE' });
  });

  it('marks a task abandoned via PATCH with status DROPPED', async () => {
    const fetchMock = createMockFetch({
      '/api/stacks': STACKS,
      'startDate=': [makeTask({ id: 't-2', title: 'Drop me' })],
      '/api/tasks/t-2': { id: 't-2', status: 'DROPPED' },
    });
    global.fetch = fetchMock;
    const user = userEvent.setup();
    renderWithProviders(<StepReviewTasks />);

    await screen.findByText('Drop me');
    await user.click(screen.getByLabelText(/Mark Drop me abandoned/i));

    await waitFor(() => {
      expect(screen.getByText('1 abandoned')).toBeInTheDocument();
    });

    const patchCall = fetchMock.mock.calls.find(([url, init]) =>
      typeof url === 'string' && url.includes('/api/tasks/t-2') && (init as RequestInit | undefined)?.method === 'PATCH',
    );
    expect(patchCall).toBeTruthy();
    const body = JSON.parse((patchCall![1] as RequestInit).body as string);
    expect(body).toEqual({ status: 'DROPPED' });
  });

  it('reverts UI and shows a toast when PATCH fails', async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url.includes('/api/stacks')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(STACKS) });
      }
      if (url.includes('startDate=')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([makeTask({ id: 't-3', title: 'Flaky task' })]) });
      }
      if (url.includes('/api/tasks/t-3') && init?.method === 'PATCH') {
        return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    // Silence the expected console.error from the failed PATCH
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {});

    const user = userEvent.setup();
    renderWithProviders(<StepReviewTasks />);

    await screen.findByText('Flaky task');
    await user.click(screen.getByLabelText(/Mark Flaky task done/i));

    expect(await screen.findByText(/Couldn't update task/i)).toBeInTheDocument();
    // counter reverts
    expect(screen.getByText('0 done')).toBeInTheDocument();
    expect(screen.getByText('1 carrying forward')).toBeInTheDocument();

    consoleErr.mockRestore();
  });

  it('publishes a summary upward via onSummaryChange', async () => {
    global.fetch = createMockFetch({
      '/api/stacks': STACKS,
      'startDate=': [
        makeTask({ id: 't-a', status: 'DONE' }),
        makeTask({ id: 't-b', status: 'DROPPED' }),
        makeTask({ id: 't-c', status: 'TODO' }),
      ],
    });
    const onSummaryChange = vi.fn<[ReviewTasksSummary], void>();
    renderWithProviders(<StepReviewTasks onSummaryChange={onSummaryChange} />);

    await waitFor(() => {
      expect(onSummaryChange).toHaveBeenCalled();
    });
    const last = onSummaryChange.mock.calls[onSummaryChange.mock.calls.length - 1][0];
    expect(last.doneIds).toEqual(['t-a']);
    expect(last.abandonedIds).toEqual(['t-b']);
    expect(last.carriedForwardIds).toEqual(['t-c']);
    expect(last.totalCount).toBe(3);
  });

  it('does not render any reschedule UI', async () => {
    global.fetch = createMockFetch({
      '/api/stacks': STACKS,
      'startDate=': [makeTask({ id: 't-1', title: 'Anything' })],
    });
    renderWithProviders(<StepReviewTasks />);
    await screen.findByText('Anything');

    expect(screen.queryByText(/Reschedule/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/New date/i)).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/Why is this being rescheduled/i)).not.toBeInTheDocument();
  });
});
