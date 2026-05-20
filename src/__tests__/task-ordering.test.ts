import { describe, it, expect } from 'vitest';
import { compareTasksByScheduledTime } from '@/lib/task-ordering';
import { createTask } from '@/test/fixtures';

// Tiny helper to keep each case to one assertion line. Returns the ids in
// post-sort order, so the test reads as "given inputs, expect this order."
function sortIds(tasks: ReturnType<typeof createTask>[]): string[] {
  return tasks.sort(compareTasksByScheduledTime).map((t) => t.id);
}

describe('compareTasksByScheduledTime', () => {
  it('earlier work-block start sorts before later one', () => {
    const a = createTask({ id: 'a', workBlocks: [{ start: '2026-05-18T10:00:00.000Z' }] });
    const b = createTask({ id: 'b', workBlocks: [{ start: '2026-05-18T14:00:00.000Z' }] });
    expect(sortIds([b, a])).toEqual(['a', 'b']);
  });

  it('takes the EARLIEST workBlock.start when a task has multiple blocks', () => {
    const a = createTask({
      id: 'a',
      workBlocks: [
        { start: '2026-05-18T15:00:00.000Z' },
        { start: '2026-05-18T09:00:00.000Z' },
      ],
    });
    const b = createTask({ id: 'b', workBlocks: [{ start: '2026-05-18T11:00:00.000Z' }] });
    expect(sortIds([b, a])).toEqual(['a', 'b']);
  });

  it('tasks with no work blocks sort AFTER tasks with work blocks (NULLS LAST)', () => {
    const scheduled = createTask({ id: 'scheduled', workBlocks: [{ start: '2026-05-18T10:00:00.000Z' }] });
    const unscheduled = createTask({ id: 'unscheduled', workBlocks: [] });
    expect(sortIds([unscheduled, scheduled])).toEqual(['scheduled', 'unscheduled']);
  });

  it('among unscheduled, earlier dueDate sorts first', () => {
    const a = createTask({ id: 'a', dueDate: '2026-05-18T00:00:00.000Z', workBlocks: [] });
    const b = createTask({ id: 'b', dueDate: '2026-05-20T00:00:00.000Z', workBlocks: [] });
    expect(sortIds([b, a])).toEqual(['a', 'b']);
  });

  it('among same-scheduled-time, HIGH priority sorts before MEDIUM', () => {
    const a = createTask({
      id: 'a-high',
      priority: 'HIGH',
      workBlocks: [{ start: '2026-05-18T10:00:00.000Z' }],
    });
    const b = createTask({
      id: 'b-med',
      priority: 'MEDIUM',
      workBlocks: [{ start: '2026-05-18T10:00:00.000Z' }],
    });
    expect(sortIds([b, a])).toEqual(['a-high', 'b-med']);
  });

  it('among same-scheduled-time, URGENT priority sorts before HIGH', () => {
    const a = createTask({
      id: 'a-urgent',
      priority: 'URGENT',
      workBlocks: [{ start: '2026-05-18T10:00:00.000Z' }],
    });
    const b = createTask({
      id: 'b-high',
      priority: 'HIGH',
      workBlocks: [{ start: '2026-05-18T10:00:00.000Z' }],
    });
    expect(sortIds([b, a])).toEqual(['a-urgent', 'b-high']);
  });

  it('scheduled trumps priority: LOW scheduled sorts before URGENT unscheduled', () => {
    const scheduledLow = createTask({
      id: 'scheduled-low',
      priority: 'LOW',
      workBlocks: [{ start: '2026-05-18T10:00:00.000Z' }],
    });
    const unscheduledUrgent = createTask({
      id: 'unscheduled-urgent',
      priority: 'URGENT',
      workBlocks: [],
    });
    expect(sortIds([unscheduledUrgent, scheduledLow])).toEqual([
      'scheduled-low',
      'unscheduled-urgent',
    ]);
  });

  // Relies on Array.prototype.sort stability — guaranteed in V8 and every
  // engine targeted by Next.js, so the assertion is safe.
  it('stable: equal-key tasks keep their original relative order', () => {
    const a = createTask({ id: 'a', workBlocks: [] });
    const b = createTask({ id: 'b', workBlocks: [] });
    const c = createTask({ id: 'c', workBlocks: [] });
    expect(sortIds([a, b, c])).toEqual(['a', 'b', 'c']);
  });

  // ─── Edge cases (added in fix-26 follow-up) ─────────────────────────────
  it('empty input list returns []', () => {
    expect(sortIds([])).toEqual([]);
  });

  it('single-element list is a no-op', () => {
    const t = createTask({ id: 'only' });
    expect(sortIds([t])).toEqual(['only']);
  });

  it('tie on workBlock start + dueDate falls through to priority', () => {
    const a = createTask({
      id: 'a-low',
      priority: 'LOW',
      dueDate: '2026-05-18T00:00:00.000Z',
      workBlocks: [{ start: '2026-05-18T10:00:00.000Z' }],
    });
    const b = createTask({
      id: 'b-urgent',
      priority: 'URGENT',
      dueDate: '2026-05-18T00:00:00.000Z',
      workBlocks: [{ start: '2026-05-18T10:00:00.000Z' }],
    });
    expect(sortIds([a, b])).toEqual(['b-urgent', 'a-low']);
  });

  it('tie on workBlock start: dueDate-only tiebreak resolves before priority', () => {
    const sameStart = '2026-05-18T10:00:00.000Z';
    const earlyDue = createTask({
      id: 'early-due',
      priority: 'LOW',
      dueDate: '2026-05-18T00:00:00.000Z',
      workBlocks: [{ start: sameStart }],
    });
    const lateDue = createTask({
      id: 'late-due',
      priority: 'URGENT',
      dueDate: '2026-05-25T00:00:00.000Z',
      workBlocks: [{ start: sameStart }],
    });
    // Earlier dueDate wins even though its priority is lower.
    expect(sortIds([lateDue, earlyDue])).toEqual(['early-due', 'late-due']);
  });

  it('malformed workBlock.start is treated as no-start (NULLS LAST)', () => {
    const broken = createTask({
      id: 'broken',
      workBlocks: [{ start: 'not-a-date' }],
    });
    const scheduled = createTask({
      id: 'scheduled',
      workBlocks: [{ start: '2026-05-18T10:00:00.000Z' }],
    });
    expect(sortIds([broken, scheduled])).toEqual(['scheduled', 'broken']);
  });

  it('malformed dueDate (no workBlocks) is treated as no-due (NULLS LAST)', () => {
    const broken = createTask({ id: 'broken', dueDate: 'not-a-date', workBlocks: [] });
    const real = createTask({ id: 'real', dueDate: '2026-05-18T00:00:00.000Z', workBlocks: [] });
    expect(sortIds([broken, real])).toEqual(['real', 'broken']);
  });

  it('two unscheduled tasks, both with null dueDate, fall through to priority', () => {
    const u = createTask({ id: 'u-urgent', priority: 'URGENT', dueDate: null, workBlocks: [] });
    const l = createTask({ id: 'l-low', priority: 'LOW', dueDate: null, workBlocks: [] });
    expect(sortIds([l, u])).toEqual(['u-urgent', 'l-low']);
  });
});
