/**
 * Tests for the optional due-time feature on TaskEditor (Component 11).
 *
 * Coverage:
 * - "Time (optional)" input is hidden when no due date is set
 * - "Time (optional)" input appears when a due date is set
 * - Submitting with date only sends a bare 'YYYY-MM-DD' string (server applies parseLocalDate)
 * - Submitting with date + time sends a full ISO datetime (local clock preserved)
 * - Edit mode: task with non-midnight dueDate pre-fills both date and time fields
 * - Edit mode: task with UTC-midnight dueDate leaves time field empty
 */

import { vi } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { renderWithProviders, createMockFetch, userEvent } from '@/test/utils';
import { createTask } from '@/test/fixtures';
import { TaskEditor } from '../TaskEditor';

// ─── helpers ──────────────────────────────────────────────────────────────────

function buildEditTask(dueDateIso: string | null = null) {
  return createTask({
    id: 'task-dt',
    title: 'Due Time Task',
    dueDate: dueDateIso,
    assigneeId: null,
    assignee: null,
    deliverableItems: [],
  });
}

function baseRoutes(overrides: Record<string, unknown> = {}) {
  return {
    ...overrides,
    '/api/users': [],
    '/api/tasks/task-dt': { id: 'task-dt' },
    '/api/tasks': { id: 'new-task-x' },
  };
}

// ─── suite ────────────────────────────────────────────────────────────────────

describe('TaskEditor — due time (Component 11)', () => {
  const onSave = vi.fn();
  const onClose = vi.fn();

  beforeEach(() => {
    onSave.mockReset();
    onClose.mockReset();
  });

  // ── visibility ──────────────────────────────────────────────────────────────

  it('hides the time input when no due date is set', () => {
    global.fetch = createMockFetch(baseRoutes()) as any;
    renderWithProviders(<TaskEditor onSave={onSave} onClose={onClose} />);
    expect(screen.queryByLabelText('Due time (optional)')).not.toBeInTheDocument();
  });

  it('shows the time input after a due date is entered', async () => {
    global.fetch = createMockFetch(baseRoutes()) as any;
    renderWithProviders(<TaskEditor onSave={onSave} onClose={onClose} />);

    const datePicker = document.querySelector('input[type="date"]') as HTMLInputElement;
    fireEvent.change(datePicker, { target: { value: '2026-05-20' } });

    await waitFor(() => {
      expect(screen.getByLabelText('Due time (optional)')).toBeInTheDocument();
    });
  });

  // ── create mode: date only ───────────────────────────────────────────────────

  it('sends a bare YYYY-MM-DD string when no time is set', async () => {
    const user = userEvent.setup();
    let capturedBody: Record<string, unknown> = {};
    global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/tasks' && init?.method === 'POST') {
        capturedBody = JSON.parse(init.body as string);
      }
      return { ok: true, json: async () => ({ id: 'new-task-x' }) };
    }) as any;

    renderWithProviders(<TaskEditor onSave={onSave} onClose={onClose} />);

    await user.type(screen.getByPlaceholderText('What needs to be done?'), 'My task');

    const datePicker = document.querySelector('input[type="date"]') as HTMLInputElement;
    fireEvent.change(datePicker, { target: { value: '2026-05-20' } });

    // Leave time empty, submit
    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    // Should be a bare date string, not an ISO datetime
    expect(capturedBody.dueDate).toBe('2026-05-20');
  });

  // ── create mode: date + time ─────────────────────────────────────────────────

  it('sends a full ISO datetime when date + time are set', async () => {
    const user = userEvent.setup();
    let capturedBody: Record<string, unknown> = {};
    global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/tasks' && init?.method === 'POST') {
        capturedBody = JSON.parse(init.body as string);
      }
      return { ok: true, json: async () => ({ id: 'new-task-x' }) };
    }) as any;

    renderWithProviders(<TaskEditor onSave={onSave} onClose={onClose} />);

    await user.type(screen.getByPlaceholderText('What needs to be done?'), 'My timed task');

    // Set due date
    const datePicker = document.querySelector('input[type="date"]') as HTMLInputElement;
    fireEvent.change(datePicker, { target: { value: '2026-05-20' } });

    // Set time via fireEvent.change (most reliable for <input type="time"> in jsdom)
    await waitFor(() => expect(screen.getByLabelText('Due time (optional)')).toBeInTheDocument());
    const timePicker = screen.getByLabelText('Due time (optional)') as HTMLInputElement;
    fireEvent.change(timePicker, { target: { value: '14:00' } });

    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());

    // Should be a full ISO string containing 'T'
    expect(typeof capturedBody.dueDate).toBe('string');
    expect((capturedBody.dueDate as string).includes('T')).toBe(true);

    // The local time encoded must round-trip to 14:00 in local timezone
    const stored = new Date(capturedBody.dueDate as string);
    expect(stored.getHours()).toBe(14);
    expect(stored.getMinutes()).toBe(0);
  });

  // ── edit mode: task with non-midnight dueDate ────────────────────────────────

  it('pre-fills both date and time fields when editing a task with a timed dueDate', async () => {
    global.fetch = createMockFetch(baseRoutes()) as any;

    // Build a task with 14:30 local time. Construct via new Date(year, month, day, h, m)
    // so the local hours are guaranteed to be 14:30 regardless of test runner TZ.
    const d = new Date(2026, 4, 20, 14, 30, 0, 0); // local 2026-05-20 14:30
    const task = buildEditTask(d.toISOString());

    renderWithProviders(<TaskEditor task={task} onSave={onSave} onClose={onClose} />);

    // Date field should show 2026-05-20
    const datePicker = document.querySelector('input[type="date"]') as HTMLInputElement;
    expect(datePicker.value).toBe('2026-05-20');

    // Time field should be visible and show 14:30
    await waitFor(() => {
      const timePicker = screen.getByLabelText('Due time (optional)') as HTMLInputElement;
      expect(timePicker.value).toBe('14:30');
    });
  });

  // ── edit mode: task with UTC-midnight dueDate ────────────────────────────────

  it('leaves time field empty when editing a task with a UTC-midnight dueDate', () => {
    global.fetch = createMockFetch(baseRoutes()) as any;

    // UTC midnight is the convention for date-only dueDates (parseDateOnly stores them this way)
    const task = buildEditTask('2026-05-20T00:00:00.000Z');

    renderWithProviders(<TaskEditor task={task} onSave={onSave} onClose={onClose} />);

    // Date field should show 2026-05-20 (stripped from ISO string)
    const datePicker = document.querySelector('input[type="date"]') as HTMLInputElement;
    expect(datePicker.value).toBe('2026-05-20');

    // Time input is rendered (dueDate has a value) but should be empty
    const timePicker = screen.getByLabelText('Due time (optional)') as HTMLInputElement;
    expect(timePicker.value).toBe('');
  });

  // ── edit mode: sends ISO when time is filled on a date-only task ─────────────

  it('sends a full ISO datetime on PATCH when editing a date-only task and adding a time', async () => {
    const user = userEvent.setup();
    let capturedBody: Record<string, unknown> = {};
    global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/api/tasks/task-dt') && init?.method === 'PATCH') {
        capturedBody = JSON.parse(init.body as string);
      }
      return { ok: true, json: async () => ({ id: 'task-dt' }) };
    }) as any;

    const task = buildEditTask('2026-05-20T00:00:00.000Z');
    renderWithProviders(<TaskEditor task={task} onSave={onSave} onClose={onClose} />);

    // Time input is present (dueDate has a value) but empty — now set it to 09:15
    await waitFor(() => expect(screen.getByLabelText('Due time (optional)')).toBeInTheDocument());
    const timePicker = screen.getByLabelText('Due time (optional)') as HTMLInputElement;
    fireEvent.change(timePicker, { target: { value: '09:15' } });

    await user.click(screen.getByRole('button', { name: 'Update' }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());

    expect(typeof capturedBody.dueDate).toBe('string');
    expect((capturedBody.dueDate as string).includes('T')).toBe(true);
    const stored = new Date(capturedBody.dueDate as string);
    expect(stored.getHours()).toBe(9);
    expect(stored.getMinutes()).toBe(15);
  });
});
