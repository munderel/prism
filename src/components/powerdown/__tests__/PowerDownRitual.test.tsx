import { vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent, createMockFetch } from '@/test/utils';
import { PowerDownRitual } from '../PowerDownRitual';

// Spy on swr's `mutate` so the cache-revalidation contract on completion can
// be asserted directly. `vi.hoisted` is required because vi.mock is hoisted
// to the top of the module — without it the spy would be undefined when the
// factory runs.
const mutateSpy = vi.hoisted(() => vi.fn());
vi.mock('swr', async () => {
  const actual = await vi.importActual<typeof import('swr')>('swr');
  return { ...actual, mutate: mutateSpy };
});

// Mock framer-motion so m.div / AnimatePresence render children
vi.mock('framer-motion', () => ({
  m: {
    div: ({ children, ...props }: any) => {
      const { animate: _a, transition: _t, whileHover: _wh, whileTap: _wt, initial: _i, exit: _e, ...rest } = props;
      return <div {...rest}>{children}</div>;
    },
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
  LazyMotion: ({ children }: any) => <>{children}</>,
  domAnimation: {},
}));

function setup(fetchRoutes: Record<string, any> = {}) {
  const defaultRoutes: Record<string, any> = {
    '/api/powerdown': (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return { id: 'session-1', currentStep: 1, tomorrowPlan: [] };
      if (init?.method === 'PATCH') return { ok: true };
      return { id: 'session-1', currentStep: 1, tomorrowPlan: [] };
    },
    '/api/tasks': [],
    '/api/streaks': [],
    '/api/distractions': { id: 'dist-1' },
    ...fetchRoutes,
  };
  global.fetch = createMockFetch(defaultRoutes);
}

describe('PowerDownRitual', () => {
  const onComplete = vi.fn();

  beforeEach(() => {
    onComplete.mockReset();
    mutateSpy.mockReset();
  });

  it('shows loading state initially', () => {
    // Use a fetch that never resolves to keep loading visible
    global.fetch = vi.fn(() => new Promise(() => {}));
    renderWithProviders(<PowerDownRitual onComplete={onComplete} />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders step 1 after loading', async () => {
    setup();
    renderWithProviders(<PowerDownRitual onComplete={onComplete} />);

    await waitFor(() => {
      expect(screen.getByText(/Step 1/)).toBeInTheDocument();
    });
    expect(screen.getByText(/Review Today/)).toBeInTheDocument();
  });

  it('shows completed task count on step 1', async () => {
    setup({
      '/api/tasks': [
        { id: 't1', title: 'Done task', status: 'DONE' },
        { id: 't2', title: 'Pending task', status: 'TODO' },
      ],
    });
    renderWithProviders(<PowerDownRitual onComplete={onComplete} />);

    await waitFor(() => {
      expect(screen.getByText(/1 of 2 tasks completed/)).toBeInTheDocument();
    });
  });

  it('shows Next Step button on steps 1-8', async () => {
    setup();
    renderWithProviders(<PowerDownRitual onComplete={onComplete} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Next Step/i })).toBeInTheDocument();
    });
  });

  it('advances from step 1 to step 2 on Next click', async () => {
    setup();
    const user = userEvent.setup();
    renderWithProviders(<PowerDownRitual onComplete={onComplete} />);

    await waitFor(() => {
      expect(screen.getByText(/Step 1/)).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Next Step/i }));

    await waitFor(() => {
      expect(screen.getByText(/Step 2/)).toBeInTheDocument();
    });
    expect(screen.getByText(/Weekly Goals & Tasks/)).toBeInTheDocument();
  });

  // With no work blocks and no due KPI processes, the STEPS array has 10 entries;
  // the final step (gratitude) is where the "Complete Power Down" button lives.
  it('shows final step with Complete Power Down button', async () => {
    setup({
      '/api/powerdown': (url: string, init?: RequestInit) => {
        if (init?.method === 'PATCH') return { ok: true };
        return { id: 'session-1', currentStep: 10, tomorrowPlan: [] };
      },
    });
    renderWithProviders(<PowerDownRitual onComplete={onComplete} />);

    await waitFor(() => {
      expect(screen.getByText(/Step 10/)).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /Complete Power Down/i })).toBeInTheDocument();
  });

  it('shows completion screen after completing final step', async () => {
    setup({
      '/api/powerdown': (url: string, init?: RequestInit) => {
        if (init?.method === 'PATCH') return { ok: true };
        return { id: 'session-1', currentStep: 10, tomorrowPlan: [] };
      },
    });
    const user = userEvent.setup();
    renderWithProviders(<PowerDownRitual onComplete={onComplete} />);

    await waitFor(() => {
      expect(screen.getByText(/Step 10/)).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Complete Power Down/i }));

    await waitFor(() => {
      expect(screen.getByText('Power Down Complete!')).toBeInTheDocument();
    });
    expect(screen.getByText(/Rest well/)).toBeInTheDocument();
  });

  it('calls onComplete when Back to Dashboard is clicked after completion', async () => {
    setup({
      '/api/powerdown': (url: string, init?: RequestInit) => {
        if (init?.method === 'PATCH') return { ok: true };
        return { id: 'session-1', currentStep: 10, tomorrowPlan: [] };
      },
    });
    const user = userEvent.setup();
    renderWithProviders(<PowerDownRitual onComplete={onComplete} />);

    await waitFor(() => {
      expect(screen.getByText(/Step 10/)).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /Complete Power Down/i }));

    await waitFor(() => {
      expect(screen.getByText('Power Down Complete!')).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /Back to Dashboard/i }));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('creates new session via POST if GET returns no data', async () => {
    global.fetch = vi.fn((url: string, init?: RequestInit) => {
      if (typeof url === 'string' && url.includes('/api/powerdown')) {
        if (!init || init.method !== 'POST') {
          // First GET returns non-ok
          return Promise.resolve({ ok: false, json: () => Promise.resolve(null) });
        }
        // POST creates session
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ id: 'new-session', currentStep: 1, tomorrowPlan: [] }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    });

    renderWithProviders(<PowerDownRitual onComplete={onComplete} />);

    await waitFor(() => {
      expect(screen.getByText(/Step 1/)).toBeInTheDocument();
    });
  });

  it('shows Clear Goals on step 5', async () => {
    setup({
      '/api/powerdown': (url: string, init?: RequestInit) => {
        if (init?.method === 'PATCH') return { ok: true };
        return { id: 'session-1', currentStep: 5, tomorrowPlan: [] };
      },
      '/api/tasks': [
        { id: 't1', title: 'Tomorrow task', status: 'TODO' },
      ],
    });
    renderWithProviders(<PowerDownRitual onComplete={onComplete} />);

    await waitFor(() => {
      expect(screen.getByText(/Step 5/)).toBeInTheDocument();
    });
  });

  it('shows Goal Clarity Summary on its step', async () => {
    // With no work blocks and no due KPI processes, goal_summary is step 7.
    setup({
      '/api/powerdown': (url: string, init?: RequestInit) => {
        if (init?.method === 'PATCH') return { ok: true };
        return { id: 'session-1', currentStep: 7, tomorrowPlan: [] };
      },
      '/api/tasks': [
        { id: 't1', title: 'Tomorrow task A', status: 'TODO' },
        { id: 't2', title: 'Tomorrow task B', status: 'TODO' },
      ],
    });
    renderWithProviders(<PowerDownRitual onComplete={onComplete} />);

    await waitFor(() => {
      expect(screen.getByText(/Step 7/)).toBeInTheDocument();
    });
    expect(screen.getByText(/Goal Clarity Summary/)).toBeInTheDocument();
  });

  it('shows Previous button on steps after step 1', async () => {
    setup({
      '/api/powerdown': (url: string, init?: RequestInit) => {
        if (init?.method === 'PATCH') return { ok: true };
        return { id: 'session-1', currentStep: 3, tomorrowPlan: [] };
      },
    });
    renderWithProviders(<PowerDownRitual onComplete={onComplete} />);

    await waitFor(() => {
      expect(screen.getByText(/Step 3/)).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /Previous/i })).toBeInTheDocument();
  });

  it('displays powerdown streak when available', async () => {
    setup({
      '/api/streaks': [{ streakType: 'powerdown', currentCount: 7 }],
    });
    renderWithProviders(<PowerDownRitual onComplete={onComplete} />);

    await waitFor(() => {
      expect(screen.getByText(/7-day PowerDown streak/)).toBeInTheDocument();
    });
  });

  // Regression for cause #1: after completion, the StreakCounter on the
  // dashboard reads `useSWR('/api/streaks')` and stayed stale until manual
  // refresh. The completion path must call `mutate('/api/streaks')` so all
  // streak consumers re-fetch immediately. Same for `/api/powerdown` so the
  // session view reflects the newly-set `completedAt`.
  it('revalidates /api/streaks and /api/powerdown SWR caches after completion', async () => {
    setup({
      '/api/powerdown': (url: string, init?: RequestInit) => {
        if (init?.method === 'PATCH') return { ok: true };
        return { id: 'session-1', currentStep: 10, tomorrowPlan: [] };
      },
    });
    const user = userEvent.setup();
    renderWithProviders(<PowerDownRitual onComplete={onComplete} />);

    await waitFor(() => {
      expect(screen.getByText(/Step 10/)).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /Complete Power Down/i }));

    await waitFor(() => {
      expect(mutateSpy).toHaveBeenCalledWith('/api/streaks');
      // PowerDownRitual now anchors GET (and the matching mutate key) on
      // the session date so historical views address the right cache slot.
      expect(mutateSpy).toHaveBeenCalledWith(expect.stringMatching(/^\/api\/powerdown\?date=\d{4}-\d{2}-\d{2}$/));
    });
  });

  // Regression for cause #5 client-side handling: when the server returns
  // 200 with a `streakError` field (completedAt wrote OK but streak update
  // threw), the client must NOT show the celebration screen. Keeping the
  // user on the final step lets a retry tap re-fire the idempotent streak
  // update and self-heal the divergence.
  it('does not show completion screen when response carries streakError', async () => {
    setup({
      '/api/powerdown': (url: string, init?: RequestInit) => {
        if (init?.method === 'PATCH') return { streakError: 'engine exploded' };
        return { id: 'session-1', currentStep: 10, tomorrowPlan: [] };
      },
    });
    const user = userEvent.setup();
    renderWithProviders(<PowerDownRitual onComplete={onComplete} />);

    await waitFor(() => {
      expect(screen.getByText(/Step 10/)).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /Complete Power Down/i }));

    // Give the async completion handler time to settle, then assert the
    // celebration screen never rendered and we're still on the final step.
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText('Power Down Complete!')).not.toBeInTheDocument();
    expect(screen.getByText(/Step 10/)).toBeInTheDocument();
  });
});
