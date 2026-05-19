import { describe, it, expect } from 'vitest';
import { compareTasksByScheduledTime } from '@/lib/task-ordering';

// Section ordering rule (Component 2 / Component 3 plan):
//   workBlock.start ASC NULLS LAST, dueDate ASC, priority DESC
// Tasks with the earliest scheduled work block come first; tasks with no
// work block sink to the bottom of the section, breaking ties by dueDate
// then priority.

const PRIORITY_HIGH = 'HIGH';
const PRIORITY_MEDIUM = 'MEDIUM';

function makeTask(over: Record<string, unknown> = {}) {
  return {
    id: 'task',
    priority: PRIORITY_MEDIUM,
    dueDate: null,
    workBlocks: [],
    ...over,
  } as { id: string; priority: string; dueDate: string | null; workBlocks: { start: string }[] };
}

describe('compareTasksByScheduledTime', () => {
  it('earlier work-block start sorts before later one', () => {
    const a = makeTask({ id: 'a', workBlocks: [{ start: '2026-05-18T10:00:00.000Z' }] });
    const b = makeTask({ id: 'b', workBlocks: [{ start: '2026-05-18T14:00:00.000Z' }] });
    expect([b, a].sort(compareTasksByScheduledTime).map((t) => t.id)).toEqual(['a', 'b']);
  });

  it('takes the EARLIEST workBlock.start when a task has multiple blocks', () => {
    const a = makeTask({
      id: 'a',
      workBlocks: [
        { start: '2026-05-18T15:00:00.000Z' },
        { start: '2026-05-18T09:00:00.000Z' },
      ],
    });
    const b = makeTask({ id: 'b', workBlocks: [{ start: '2026-05-18T11:00:00.000Z' }] });
    expect([b, a].sort(compareTasksByScheduledTime).map((t) => t.id)).toEqual(['a', 'b']);
  });

  it('tasks with no work blocks sort AFTER tasks with work blocks (NULLS LAST)', () => {
    const scheduled = makeTask({ id: 'scheduled', workBlocks: [{ start: '2026-05-18T10:00:00.000Z' }] });
    const unscheduled = makeTask({ id: 'unscheduled', workBlocks: [] });
    expect([unscheduled, scheduled].sort(compareTasksByScheduledTime).map((t) => t.id)).toEqual([
      'scheduled',
      'unscheduled',
    ]);
  });

  it('among unscheduled, earlier dueDate sorts first', () => {
    const a = makeTask({ id: 'a', dueDate: '2026-05-18T00:00:00.000Z', workBlocks: [] });
    const b = makeTask({ id: 'b', dueDate: '2026-05-20T00:00:00.000Z', workBlocks: [] });
    expect([b, a].sort(compareTasksByScheduledTime).map((t) => t.id)).toEqual(['a', 'b']);
  });

  it('among same-scheduled-time, HIGH priority sorts before MEDIUM', () => {
    const a = makeTask({
      id: 'a-high',
      priority: PRIORITY_HIGH,
      workBlocks: [{ start: '2026-05-18T10:00:00.000Z' }],
    });
    const b = makeTask({
      id: 'b-med',
      priority: PRIORITY_MEDIUM,
      workBlocks: [{ start: '2026-05-18T10:00:00.000Z' }],
    });
    expect([b, a].sort(compareTasksByScheduledTime).map((t) => t.id)).toEqual(['a-high', 'b-med']);
  });

  it('stable: equal-key tasks keep their original relative order', () => {
    const a = makeTask({ id: 'a', workBlocks: [] });
    const b = makeTask({ id: 'b', workBlocks: [] });
    const c = makeTask({ id: 'c', workBlocks: [] });
    // Array.prototype.sort is stable in modern JS engines; the comparator
    // must return 0 for equal keys so the order is preserved.
    expect([a, b, c].sort(compareTasksByScheduledTime).map((t) => t.id)).toEqual(['a', 'b', 'c']);
  });
});
