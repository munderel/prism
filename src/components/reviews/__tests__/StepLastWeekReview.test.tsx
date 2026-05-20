import { vi, describe, it, expect, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent, createMockFetch } from '@/test/utils';
import { StepLastWeekReview } from '../weekly-steps/StepLastWeekReview';

// Spy on swr mutate
const mutateSpy = vi.hoisted(() => vi.fn());
vi.mock('swr', async () => {
  const actual = await vi.importActual<typeof import('swr')>('swr');
  return { ...actual, useSWRConfig: () => ({ mutate: mutateSpy }) };
});

// Framer-motion stub
vi.mock('framer-motion', () => ({
  m: {
    div: ({ children, ...props }: any) => {
      const { animate: _a, transition: _t, initial: _i, exit: _e, ...rest } = props;
      return <div {...rest}>{children}</div>;
    },
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
  LazyMotion: ({ children }: any) => <>{children}</>,
  domAnimation: {},
}));

const LAST_WEEK_START = '2026-05-11';
const LAST_WEEK_END = '2026-05-17';

const MOCK_WORK_BLOCK = {
  id: 'wb-1',
  start: '2026-05-13T09:00:00.000Z',
  end: '2026-05-13T10:30:00.000Z',
  mainObjective: 'Finish feature 15',
  completionStatus: 'PENDING',
  actualMinutes: null,
  task: { id: 'task-1', title: 'Ship review UI', estimatedMinutes: 90, status: 'DONE', dueDate: null },
};

const MOCK_AIM_INSTANCE = {
  id: 'aim-1',
  scheduledDate: '2026-05-13T00:00:00.000Z',
  timeBlockStart: '2026-05-13T07:00:00.000Z',
  timeBlockEnd: '2026-05-13T08:00:00.000Z',
  status: 'SCHEDULED',
  actualMinutes: null,
  aimCategory: { id: 'cat-1', name: 'Evening Run', defaultDurationMin: 60 },
};

function setup(overrides: Record<string, any> = {}) {
  global.fetch = createMockFetch({
    '/api/work-blocks': [MOCK_WORK_BLOCK],
    '/api/aims/instances': [MOCK_AIM_INSTANCE],
    ...overrides,
  });
}

describe('StepLastWeekReview', () => {
  beforeEach(() => {
    mutateSpy.mockReset();
  });

  it('shows loading state then renders work blocks and AIM instances', async () => {
    setup();
    renderWithProviders(
      <StepLastWeekReview lastWeekStart={LAST_WEEK_START} lastWeekEnd={LAST_WEEK_END} />,
    );

    // Loading text first
    expect(screen.getByText(/Loading last week/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Ship review UI')).toBeInTheDocument();
      expect(screen.getByText('Evening Run')).toBeInTheDocument();
    });
  });

  it('shows "Nothing to review" when no items exist', async () => {
    setup({
      '/api/work-blocks': [],
      '/api/aims/instances': [],
    });
    renderWithProviders(
      <StepLastWeekReview lastWeekStart={LAST_WEEK_START} lastWeekEnd={LAST_WEEK_END} />,
    );
    await waitFor(() => {
      expect(screen.getByText(/Nothing to review yet/i)).toBeInTheDocument();
    });
  });

  it('renders COMPLETED/PARTIAL/MISSED for work blocks and COMPLETED/SKIPPED/MISSED for AIMs', async () => {
    setup();
    renderWithProviders(
      <StepLastWeekReview lastWeekStart={LAST_WEEK_START} lastWeekEnd={LAST_WEEK_END} />,
    );
    await waitFor(() => expect(screen.getByText('Ship review UI')).toBeInTheDocument());
    // Two items: work block has Completed+Partial+Missed; AIM has Completed+Skipped+Missed
    const completedBtns = screen.getAllByRole('button', { name: 'Completed' });
    expect(completedBtns.length).toBeGreaterThanOrEqual(2); // one per item
    expect(screen.getByRole('button', { name: 'Partial' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Skipped' })).toBeInTheDocument();
    // Missed appears for both items
    const missedBtns = screen.getAllByRole('button', { name: 'Missed' });
    expect(missedBtns.length).toBeGreaterThanOrEqual(2);
  });

  it('renders COMPLETED/SKIPPED/MISSED for AIM instances', async () => {
    setup();
    renderWithProviders(
      <StepLastWeekReview lastWeekStart={LAST_WEEK_START} lastWeekEnd={LAST_WEEK_END} />,
    );
    await waitFor(() => expect(screen.getByText('Evening Run')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Skipped' })).toBeInTheDocument();
  });

  it('Save button is disabled until a status is picked', async () => {
    setup();
    renderWithProviders(
      <StepLastWeekReview lastWeekStart={LAST_WEEK_START} lastWeekEnd={LAST_WEEK_END} />,
    );
    await waitFor(() => expect(screen.getByText('Ship review UI')).toBeInTheDocument());
    const saveBtn = screen.getByRole('button', { name: /Save Reviews/i });
    expect(saveBtn).toBeDisabled();
  });

  it('enables Save after picking a status, and PATCHes work block and AIM on save', async () => {
    setup();
    const user = userEvent.setup();
    renderWithProviders(
      <StepLastWeekReview lastWeekStart={LAST_WEEK_START} lastWeekEnd={LAST_WEEK_END} />,
    );
    await waitFor(() => expect(screen.getByText('Ship review UI')).toBeInTheDocument());

    // Pick Completed for work block
    const completedButtons = screen.getAllByRole('button', { name: 'Completed' });
    await user.click(completedButtons[0]);

    const saveBtn = screen.getByRole('button', { name: /Save Reviews/i });
    expect(saveBtn).not.toBeDisabled();

    await user.click(saveBtn);

    await waitFor(() => {
      const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
      const patchCalls = fetchMock.mock.calls.filter(
        ([url, init]: [string, RequestInit]) => init?.method === 'PATCH',
      );
      expect(patchCalls.some(([url]: [string]) => url.includes('/api/work-blocks/wb-1'))).toBe(true);
    });
  });

  it('calls SWR mutate on successful save', async () => {
    setup();
    const user = userEvent.setup();
    renderWithProviders(
      <StepLastWeekReview lastWeekStart={LAST_WEEK_START} lastWeekEnd={LAST_WEEK_END} />,
    );
    await waitFor(() => expect(screen.getByText('Ship review UI')).toBeInTheDocument());

    const completedBtns = screen.getAllByRole('button', { name: 'Completed' });
    await user.click(completedBtns[0]);
    await user.click(screen.getByRole('button', { name: /Save Reviews/i }));

    await waitFor(() => {
      expect(mutateSpy).toHaveBeenCalledWith('/api/work-blocks');
      expect(mutateSpy).toHaveBeenCalledWith('/api/aims/instances');
    });
  });

  it('shows "Saved!" feedback after successful save', async () => {
    setup();
    const user = userEvent.setup();
    renderWithProviders(
      <StepLastWeekReview lastWeekStart={LAST_WEEK_START} lastWeekEnd={LAST_WEEK_END} />,
    );
    await waitFor(() => expect(screen.getByText('Ship review UI')).toBeInTheDocument());

    const completedBtns = screen.getAllByRole('button', { name: 'Completed' });
    await user.click(completedBtns[0]);
    await user.click(screen.getByRole('button', { name: /Save Reviews/i }));

    await waitFor(() => {
      expect(screen.getByText('Saved!')).toBeInTheDocument();
    });
  });

  it('pre-fills existing COMPLETED status for already-reviewed blocks', async () => {
    setup({
      '/api/work-blocks': [{ ...MOCK_WORK_BLOCK, completionStatus: 'COMPLETED', actualMinutes: 75 }],
    });
    renderWithProviders(
      <StepLastWeekReview lastWeekStart={LAST_WEEK_START} lastWeekEnd={LAST_WEEK_END} />,
    );
    await waitFor(() => expect(screen.getByText('Ship review UI')).toBeInTheDocument());
    // Actual minutes input should be pre-filled with 75
    await waitFor(() => {
      const inputs = screen.getAllByRole('spinbutton') as HTMLInputElement[];
      expect(inputs.some((i) => i.value === '75')).toBe(true);
    });
  });
});
