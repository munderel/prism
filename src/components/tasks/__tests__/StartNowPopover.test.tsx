import { vi, beforeEach, beforeAll, describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent, createMockFetch } from '@/test/utils';
import { createTask } from '@/test/fixtures';
import { StartNowPopover } from '../StartNowPopover';
import { TaskCard } from '../TaskCard';

// jsdom doesn't ship ResizeObserver — the Popover primitive needs it.
beforeAll(() => {
  if (!global.ResizeObserver) {
    global.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockAnchorRect = {
  top: 100,
  left: 200,
  bottom: 120,
  right: 260,
  width: 60,
  height: 20,
  x: 200,
  y: 100,
  toJSON: () => ({}),
} as DOMRect;

function makeWorkBlockResponse(overrides: Record<string, unknown> = {}) {
  return {
    id: 'wb-1',
    taskId: 'task-1',
    start: new Date().toISOString(),
    end: new Date(Date.now() + 30 * 60_000).toISOString(),
    mainObjective: 'Test objective',
    clearGoals: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// StartNowPopover unit tests
// ---------------------------------------------------------------------------

describe('StartNowPopover', () => {
  const onClose = vi.fn();
  const onCreated = vi.fn();

  beforeEach(() => {
    onClose.mockReset();
    onCreated.mockReset();
  });

  it('renders with default duration from task.estimatedMinutes', () => {
    const task = createTask({ estimatedMinutes: 45 });
    renderWithProviders(
      <StartNowPopover
        task={task}
        anchorRect={mockAnchorRect}
        onClose={onClose}
        onCreated={onCreated}
      />,
    );
    const input = screen.getByRole('spinbutton') as HTMLInputElement;
    expect(input.value).toBe('45');
  });

  it('falls back to 30-min default when estimatedMinutes is null', () => {
    const task = createTask({ estimatedMinutes: null });
    renderWithProviders(
      <StartNowPopover
        task={task}
        anchorRect={mockAnchorRect}
        onClose={onClose}
        onCreated={onCreated}
      />,
    );
    const input = screen.getByRole('spinbutton') as HTMLInputElement;
    expect(input.value).toBe('30');
  });

  it('pre-fills main objective from first deliverable item', () => {
    const task = createTask({
      deliverableItems: [
        { id: 'di-1', text: 'Finish the report', isDone: false },
        { id: 'di-2', text: 'Send to manager', isDone: false },
      ],
    });
    renderWithProviders(
      <StartNowPopover
        task={task}
        anchorRect={mockAnchorRect}
        onClose={onClose}
        onCreated={onCreated}
      />,
    );
    // The main objective input is the text input for the objective field.
    const objectiveInput = screen.getByPlaceholderText('What do you aim to achieve?') as HTMLInputElement;
    expect(objectiveInput.value).toBe('Finish the report');
  });

  it('pre-fills main objective from task.title when no deliverable items', () => {
    const task = createTask({ title: 'My important task', deliverableItems: [] });
    renderWithProviders(
      <StartNowPopover
        task={task}
        anchorRect={mockAnchorRect}
        onClose={onClose}
        onCreated={onCreated}
      />,
    );
    const objectiveInput = screen.getByPlaceholderText('What do you aim to achieve?') as HTMLInputElement;
    expect(objectiveInput.value).toBe('My important task');
  });

  it('pre-fills clear goals from deliverable items (skipping the first)', () => {
    const task = createTask({
      deliverableItems: [
        { id: 'di-1', text: 'Objective text', isDone: false },
        { id: 'di-2', text: 'Goal one', isDone: false },
        { id: 'di-3', text: 'Goal two', isDone: false },
      ],
    });
    renderWithProviders(
      <StartNowPopover
        task={task}
        anchorRect={mockAnchorRect}
        onClose={onClose}
        onCreated={onCreated}
      />,
    );
    expect(screen.getByDisplayValue('Goal one')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Goal two')).toBeInTheDocument();
  });

  it('calls POST /api/work-blocks with correct body and calls onCreated on 201', async () => {
    const user = userEvent.setup();
    const task = createTask({
      id: 'task-abc',
      title: 'My task',
      estimatedMinutes: 30,
      deliverableItems: [{ id: 'di-1', text: 'Deliver X', isDone: false }],
    });

    global.fetch = createMockFetch({
      '/api/work-blocks': makeWorkBlockResponse(),
    });

    // Also mock mutate calls (fetch won't resolve them; just need no crash).
    const { mutate: swrMutate } = await import('swr');
    vi.spyOn({ mutate: swrMutate }, 'mutate').mockResolvedValue(undefined);

    renderWithProviders(
      <StartNowPopover
        task={task}
        anchorRect={mockAnchorRect}
        onClose={onClose}
        onCreated={onCreated}
      />,
    );

    const startBtn = screen.getByRole('button', { name: /start/i });
    await user.click(startBtn);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/work-blocks',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(fetchCall[1].body as string);
    expect(body.taskId).toBe('task-abc');
    expect(body.mainObjective).toBe('Deliver X');
    expect(typeof body.start).toBe('string');
    expect(typeof body.end).toBe('string');

    await waitFor(() => {
      expect(onCreated).toHaveBeenCalled();
    });
  });

  it('shows an error toast on non-ok response', async () => {
    const user = userEvent.setup();
    const task = createTask({ estimatedMinutes: 30 });

    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'Internal server error' }),
      }),
    );

    renderWithProviders(
      <StartNowPopover
        task={task}
        anchorRect={mockAnchorRect}
        onClose={onClose}
        onCreated={onCreated}
      />,
    );

    await user.click(screen.getByRole('button', { name: /start/i }));

    await waitFor(() => {
      expect(screen.getByText('Internal server error')).toBeInTheDocument();
    });
    expect(onCreated).not.toHaveBeenCalled();
  });

  it('Cancel button calls onClose', async () => {
    const user = userEvent.setup();
    const task = createTask();
    renderWithProviders(
      <StartNowPopover
        task={task}
        anchorRect={mockAnchorRect}
        onClose={onClose}
        onCreated={onCreated}
      />,
    );
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it('add goal button adds a new goal row', async () => {
    const user = userEvent.setup();
    const task = createTask({ deliverableItems: [] });
    renderWithProviders(
      <StartNowPopover
        task={task}
        anchorRect={mockAnchorRect}
        onClose={onClose}
        onCreated={onCreated}
      />,
    );

    const addBtn = screen.getByText('Add goal');
    await user.click(addBtn);
    expect(screen.getByPlaceholderText('Goal 1')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// TaskCard trigger button test
// ---------------------------------------------------------------------------

describe('TaskCard — Start Now trigger', () => {
  it('clicking Start Now button opens the popover', async () => {
    const user = userEvent.setup();
    const task = createTask({ estimatedMinutes: 60 });
    renderWithProviders(
      <TaskCard
        task={task}
        onToggle={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onClick={vi.fn()}
      />,
    );

    // Hover to make buttons visible (they are opacity-0 normally).
    await user.hover(screen.getByText('Test Task'));

    const startNowBtn = screen.getByTitle('Start Now');
    await user.click(startNowBtn);

    // The popover heading "Start Now" should appear.
    await waitFor(() => {
      expect(screen.getAllByText('Start Now').length).toBeGreaterThan(0);
    });
  });
});
