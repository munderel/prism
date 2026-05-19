import { describe, it, expect } from 'vitest';
import { compareTasksByScheduledTime } from '@/lib/task-ordering';
import { createTask } from '@/test/fixtures';

describe('compareTasksByScheduledTime', () => {
  it('earlier work-block start sorts before later one', () => {
    const a = createTask({ id: 'a', workBlocks: [{ start: '2026-05-18T10:00:00.000Z' }] });
    const b = createTask({ id: 'b', workBlocks: [{ start: '2026-05-18T14:00:00.000Z' }] });
    expect([b, a].sort(compareTasksByScheduledTime).map((t) => t.id)).toEqual(['a', 'b']);
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
    expect([b, a].sort(compareTasksByScheduledTime).map((t) => t.id)).toEqual(['a', 'b']);
  });

  it('tasks with no work blocks sort AFTER tasks with work blocks (NULLS LAST)', () => {
    const scheduled = createTask({ id: 'scheduled', workBlocks: [{ start: '2026-05-18T10:00:00.000Z' }] });
    const unscheduled = createTask({ id: 'unscheduled', workBlocks: [] });
    expect([unscheduled, scheduled].sort(compareTasksByScheduledTime).map((t) => t.id)).toEqual([
      'scheduled',
      'unscheduled',
    ]);
  });

  it('among unscheduled, earlier dueDate sorts first', () => {
    const a = createTask({ id: 'a', dueDate: '2026-05-18T00:00:00.000Z', workBlocks: [] });
    const b = createTask({ id: 'b', dueDate: '2026-05-20T00:00:00.000Z', workBlocks: [] });
    expect([b, a].sort(compareTasksByScheduledTime).map((t) => t.id)).toEqual(['a', 'b']);
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
    expect([b, a].sort(compareTasksByScheduledTime).map((t) => t.id)).toEqual(['a-high', 'b-med']);
  });

  it('stable: equal-key tasks keep their original relative order', () => {
    const a = createTask({ id: 'a', workBlocks: [] });
    const b = createTask({ id: 'b', workBlocks: [] });
    const c = createTask({ id: 'c', workBlocks: [] });
    expect([a, b, c].sort(compareTasksByScheduledTime).map((t) => t.id)).toEqual(['a', 'b', 'c']);
  });
});
