import { vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render, userEvent, createMockFetch } from '@/test/utils';
import { PowerDownRitual } from '../PowerDownRitual';

// Mock framer-motion so m.div / AnimatePresence render children
vi.mock('framer-motion', () => ({
  m: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
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
  });

  it('shows loading state initially', () => {
    // Use a fetch that never resolves to keep loading visible
    global.fetch = vi.fn(() => new Promise(() => {}));
    render(<PowerDownRitual onComplete={onComplete} />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders step 1 after loading', async () => {
    setup();
    render(<PowerDownRitual onComplete={onComplete} />);

    await waitFor(() => {
      expect(screen.getByText(/Step 1/)).toBeInTheDocument();
    });
    expect(screen.getByText(/Mark Task Completion/)).toBeInTheDocument();
  });

  it('shows completed task count on step 1', async () => {
    setup({
      '/api/tasks': [
        { id: 't1', title: 'Done task', status: 'DONE' },
        { id: 't2', title: 'Pending task', status: 'TODO' },
      ],
    });
    render(<PowerDownRitual onComplete={onComplete} />);

    await waitFor(() => {
      expect(screen.getByText(/1 of 2 tasks completed/)).toBeInTheDocument();
    });
  });

  it('shows Next Step button on steps 1-8', async () => {
    setup();
    render(<PowerDownRitual onComplete={onComplete} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Next Step/i })).toBeInTheDocument();
    });
  });

  it('advances from step 1 to step 2 on Next click', async () => {
    setup();
    const user = userEvent.setup();
    render(<PowerDownRitual onComplete={onComplete} />);

    await waitFor(() => {
      expect(screen.getByText(/Step 1/)).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Next Step/i }));

    await waitFor(() => {
      expect(screen.getByText(/Step 2/)).toBeInTheDocument();
    });
    expect(screen.getByText(/Record Distractions/)).toBeInTheDocument();
  });

  it('shows step 9 with Complete Power Down button', async () => {
    setup({
      '/api/powerdown': (url: string, init?: RequestInit) => {
        if (init?.method === 'PATCH') return { ok: true };
        return { id: 'session-1', currentStep: 9, tomorrowPlan: [] };
      },
    });
    render(<PowerDownRitual onComplete={onComplete} />);

    await waitFor(() => {
      expect(screen.getByText(/Step 9/)).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /Complete Power Down/i })).toBeInTheDocument();
  });

  it('shows completion screen after completing step 9', async () => {
    setup({
      '/api/powerdown': (url: string, init?: RequestInit) => {
        if (init?.method === 'PATCH') return { ok: true };
        return { id: 'session-1', currentStep: 9, tomorrowPlan: [] };
      },
    });
    const user = userEvent.setup();
    render(<PowerDownRitual onComplete={onComplete} />);

    await waitFor(() => {
      expect(screen.getByText(/Step 9/)).toBeInTheDocument();
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
        return { id: 'session-1', currentStep: 9, tomorrowPlan: [] };
      },
    });
    const user = userEvent.setup();
    render(<PowerDownRitual onComplete={onComplete} />);

    await waitFor(() => {
      expect(screen.getByText(/Step 9/)).toBeInTheDocument();
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

    render(<PowerDownRitual onComplete={onComplete} />);

    await waitFor(() => {
      expect(screen.getByText(/Step 1/)).toBeInTheDocument();
    });
  });

  it('shows incomplete tasks on step 5 with reschedule buttons', async () => {
    setup({
      '/api/powerdown': (url: string, init?: RequestInit) => {
        if (init?.method === 'PATCH') return { ok: true };
        return { id: 'session-1', currentStep: 5, tomorrowPlan: [] };
      },
      '/api/tasks': [
        { id: 't1', title: 'Incomplete task', status: 'TODO' },
        { id: 't2', title: 'Done task', status: 'DONE' },
      ],
    });
    render(<PowerDownRitual onComplete={onComplete} />);

    await waitFor(() => {
      expect(screen.getByText(/Step 5/)).toBeInTheDocument();
    });
    expect(screen.getByText('Incomplete task')).toBeInTheDocument();
    expect(screen.getByText(/1 incomplete task from today/)).toBeInTheDocument();
  });

  it('shows Top 3 Tomorrow on step 6', async () => {
    setup({
      '/api/powerdown': (url: string, init?: RequestInit) => {
        if (init?.method === 'PATCH') return { ok: true };
        return { id: 'session-1', currentStep: 6, tomorrowPlan: [] };
      },
      '/api/tasks': [
        { id: 't1', title: 'Tomorrow task A', status: 'TODO' },
        { id: 't2', title: 'Tomorrow task B', status: 'TODO' },
      ],
    });
    render(<PowerDownRitual onComplete={onComplete} />);

    await waitFor(() => {
      expect(screen.getByText(/Step 6/)).toBeInTheDocument();
    });
    expect(screen.getByText(/Top 3 Tomorrow/)).toBeInTheDocument();
  });

  it('shows Previous button on steps after step 1', async () => {
    setup({
      '/api/powerdown': (url: string, init?: RequestInit) => {
        if (init?.method === 'PATCH') return { ok: true };
        return { id: 'session-1', currentStep: 3, tomorrowPlan: [] };
      },
    });
    render(<PowerDownRitual onComplete={onComplete} />);

    await waitFor(() => {
      expect(screen.getByText(/Step 3/)).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /Previous/i })).toBeInTheDocument();
  });

  it('displays powerdown streak when available', async () => {
    setup({
      '/api/streaks': [{ streakType: 'powerdown', currentCount: 7 }],
    });
    render(<PowerDownRitual onComplete={onComplete} />);

    await waitFor(() => {
      expect(screen.getByText(/7-day PowerDown streak/)).toBeInTheDocument();
    });
  });
});
