/**
 * Tests for Component 13: TaskEditor fullPage prop, hours summary,
 * pencil-click navigation, and calendar click routing.
 */

import { vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, createMockFetch, userEvent } from '@/test/utils';
import { createTask } from '@/test/fixtures';
import { TaskEditor } from '../TaskEditor';
import { TaskCard } from '../TaskCard';

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeTask(overrides: Record<string, any> = {}) {
  return createTask({
    id: 'task-fp',
    title: 'Full Page Task',
    estimatedMinutes: 120,
    assigneeId: null,
    assignee: null,
    deliverableItems: [],
    workBlocks: [],
    goal: null,
    ...overrides,
  });
}

function setupFetch(overrides: Record<string, any> = {}) {
  global.fetch = createMockFetch({
    '/api/users': [],
    '/api/tasks/task-fp': makeTask(),
    '/api/tasks': { id: 'new-1' },
    ...overrides,
  }) as any;
}

// ─── fullPage prop ────────────────────────────────────────────────────────────

describe('TaskEditor — fullPage prop (Component 13)', () => {
  const onSave = vi.fn();
  const onClose = vi.fn();

  beforeEach(() => {
    onSave.mockReset();
    onClose.mockReset();
    setupFetch();
  });

  it('does NOT render a dialog role when fullPage=true', () => {
    const task = makeTask();
    renderWithProviders(<TaskEditor task={task} fullPage onSave={onSave} onClose={onClose} />);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('does NOT render aria-modal when fullPage=true', () => {
    const task = makeTask();
    renderWithProviders(<TaskEditor task={task} fullPage onSave={onSave} onClose={onClose} />);
    expect(document.querySelector('[aria-modal]')).toBeNull();
  });

  it('does NOT render the fixed backdrop overlay when fullPage=true', () => {
    const task = makeTask();
    const { container } = renderWithProviders(
      <TaskEditor task={task} fullPage onSave={onSave} onClose={onClose} />
    );
    // The backdrop uses `fixed inset-0 z-50` — check that no element has all three classes
    const backdrop = container.querySelector('.fixed.inset-0.z-50');
    expect(backdrop).toBeNull();
  });

  it('DOES render dialog role when fullPage is false (default)', () => {
    const task = makeTask();
    renderWithProviders(<TaskEditor task={task} onSave={onSave} onClose={onClose} />);
    expect(document.querySelector('[role="dialog"]')).toBeTruthy();
  });

  it('does NOT render a close X button when fullPage=true', () => {
    const task = makeTask();
    renderWithProviders(<TaskEditor task={task} fullPage onSave={onSave} onClose={onClose} />);
    expect(screen.queryByRole('button', { name: /close/i })).toBeNull();
  });

  it('calls onClose when Cancel is clicked in fullPage mode', async () => {
    const user = userEvent.setup();
    const task = makeTask();
    renderWithProviders(<TaskEditor task={task} fullPage onSave={onSave} onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
  });
});

// ─── hours summary ────────────────────────────────────────────────────────────

describe('TaskEditor — hours summary (Component 13)', () => {
  const onSave = vi.fn();
  const onClose = vi.fn();

  beforeEach(() => {
    onSave.mockReset();
    onClose.mockReset();
  });

  it('shows hours done / estimated when workBlocks exist', async () => {
    const task = makeTask({
      estimatedMinutes: 120, // 2.0h estimated
      workBlocks: [
        // 30 min COMPLETED via actualMinutes
        { id: 'wb1', start: '2026-05-01T09:00:00Z', end: '2026-05-01T09:30:00Z', actualMinutes: 30, completionStatus: 'COMPLETED' },
        // 60 min PARTIAL via start/end diff (no actualMinutes)
        { id: 'wb2', start: '2026-05-01T10:00:00Z', end: '2026-05-01T11:00:00Z', actualMinutes: null, completionStatus: 'PARTIAL' },
        // PENDING — should NOT be counted
        { id: 'wb3', start: '2026-05-01T11:00:00Z', end: '2026-05-01T12:00:00Z', actualMinutes: 60, completionStatus: 'PENDING' },
      ],
    });
    global.fetch = createMockFetch({
      '/api/users': [],
      [`/api/tasks/${task.id}`]: task,
    }) as any;
    renderWithProviders(<TaskEditor task={task} onSave={onSave} onClose={onClose} />);
    // 30 + 60 = 90 min done = 1.5h; estimated = 2.0h
    // Hours summary uses separate text nodes for "Hours: ", "1.5 done", "/ 2.0 estimated"
    await waitFor(() => {
      expect(screen.getByText(/1\.5 done/)).toBeInTheDocument();
    });
    expect(screen.getByText(/2\.0 estimated/)).toBeInTheDocument();
  });

  it('hides hours summary in create mode (no task id)', () => {
    global.fetch = createMockFetch({ '/api/users': [] }) as any;
    renderWithProviders(<TaskEditor onSave={onSave} onClose={onClose} />);
    // No "Hours: " label in create mode
    expect(screen.queryByText('Hours: ')).toBeNull();
  });

  it('does NOT show estimated when estimatedMinutes is 0', async () => {
    const task = makeTask({
      estimatedMinutes: 0,
      workBlocks: [
        { id: 'wb1', start: '2026-05-01T09:00:00Z', end: '2026-05-01T09:30:00Z', actualMinutes: 30, completionStatus: 'COMPLETED' },
      ],
    });
    global.fetch = createMockFetch({
      '/api/users': [],
      [`/api/tasks/${task.id}`]: task,
    }) as any;
    renderWithProviders(<TaskEditor task={task} onSave={onSave} onClose={onClose} />);
    // Should show done side
    await waitFor(() => {
      expect(screen.getByText(/0\.5 done/)).toBeInTheDocument();
    });
    // Should NOT show "/ X.X estimated" text
    expect(screen.queryByText(/\/ .* estimated/)).toBeNull();
  });
});

// ─── pencil-click navigation ──────────────────────────────────────────────────

describe('TaskCard — pencil navigates to /tasks/[id]/edit (Component 13)', () => {
  it('clicking the pencil button calls router.push with /tasks/[id]/edit', async () => {
    const user = userEvent.setup();
    // The global next/navigation mock (from src/test/mocks.tsx) returns
    // a fresh object per useRouter() call, so we need to spy on the module.
    const pushSpy = vi.fn();
    vi.spyOn(
      await import('next/navigation'),
      'useRouter'
    ).mockReturnValue({
      push: pushSpy,
      replace: vi.fn(),
      back: vi.fn(),
      refresh: vi.fn(),
      forward: vi.fn(),
      prefetch: vi.fn(),
    });

    const task = createTask({ id: 'my-task-id', title: 'Test' });
    renderWithProviders(
      <TaskCard
        task={task}
        onToggle={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    const pencilBtn = screen.getByTitle('Edit task');
    await user.click(pencilBtn);
    expect(pushSpy).toHaveBeenCalledWith('/tasks/my-task-id/edit');
  });
});

// ─── split button removed ─────────────────────────────────────────────────────

describe('TaskEditor — split button removed (Component 13)', () => {
  const onSave = vi.fn();
  const onClose = vi.fn();

  beforeEach(() => {
    global.fetch = createMockFetch({ '/api/users': [] }) as any;
  });

  it('does NOT render "Split into sessions" button in edit mode', () => {
    const task = makeTask();
    renderWithProviders(<TaskEditor task={task} onSave={onSave} onClose={onClose} />);
    expect(screen.queryByText(/split into sessions/i)).toBeNull();
  });
});

// ─── preferredTime inputs removed ────────────────────────────────────────────

describe('TaskEditor — preferredTime inputs removed (Component 13)', () => {
  const onSave = vi.fn();
  const onClose = vi.fn();

  beforeEach(() => {
    global.fetch = createMockFetch({ '/api/users': [] }) as any;
  });

  it('does NOT render "Preferred Time From" input', () => {
    renderWithProviders(<TaskEditor onSave={onSave} onClose={onClose} />);
    expect(screen.queryByText(/preferred time from/i)).toBeNull();
  });

  it('does NOT render "Preferred Time To" input', () => {
    renderWithProviders(<TaskEditor onSave={onSave} onClose={onClose} />);
    expect(screen.queryByText(/preferred time to/i)).toBeNull();
  });
});
