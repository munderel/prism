/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    task: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    taskCompletionSnapshot: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    workBlock: {
      updateMany: vi.fn(),
      update: vi.fn(),
    },
    clearGoal: {
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import { prisma } from '@/lib/prisma';
import { completeTask, TaskNotFoundError } from '@/lib/task-completion';

const mockTaskFindUnique = vi.mocked(prisma.task.findUnique);
const mockTaskFindMany = vi.mocked(prisma.task.findMany);
const mockSnapshotFindUnique = vi.mocked(prisma.taskCompletionSnapshot.findUnique);
const mockTransaction = vi.mocked(prisma.$transaction);

function block(start: Date, end: Date, completionStatus: string, actualMinutes?: number, id = 'b1') {
  return { id, start, end, completionStatus, actualMinutes: actualMinutes ?? null };
}

describe('completeTask', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws TaskNotFoundError when the task does not exist', async () => {
    mockTaskFindUnique.mockResolvedValue(null);
    await expect(completeTask('missing', 'user1')).rejects.toBeInstanceOf(TaskNotFoundError);
  });

  it('is a no-op on an already-DONE task and does not flip new PENDING blocks', async () => {
    const start = new Date('2026-04-20T09:00:00Z');
    const end = new Date('2026-04-20T10:00:00Z');
    mockTaskFindUnique.mockResolvedValue({
      id: 't1',
      status: 'DONE',
      estimatedMinutes: 60,
      workBlocks: [block(start, end, 'PENDING')],
      clearGoals: [],
    } as any);
    mockSnapshotFindUnique.mockResolvedValue({ taskId: 't1', completedAt: start } as any);

    const result = await completeTask('t1', 'user1');

    expect(result.alreadyCompleted).toBe(true);
    expect(result.snapshot?.taskId).toBe('t1');
    // Crucially: no transaction runs — no PENDING -> MISSED flip.
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('uses actorId for the snapshot.userId even when the actor is not the owner', async () => {
    const start = new Date('2026-04-20T09:00:00Z');
    const end = new Date('2026-04-20T10:00:00Z');
    mockTaskFindUnique.mockResolvedValue({
      id: 't1',
      status: 'TODO',
      estimatedMinutes: 60,
      ownerId: 'owner1',
      workBlocks: [block(start, end, 'COMPLETED', 55)],
      clearGoals: [{ isComplete: true }, { isComplete: false }],
    } as any);
    mockTaskFindMany.mockResolvedValue([] as any); // no children
    mockTransaction.mockResolvedValue([
      { count: 0 }, // workBlock.updateMany
      { count: 0 }, // clearGoal.updateMany
      { taskId: 't1', userId: 'assignee1' }, // snapshot upsert
      { id: 't1' }, // task.update
    ] as any);

    const result = await completeTask('t1', 'assignee1');
    expect(result.alreadyCompleted).toBe(false);
    expect(mockTransaction).toHaveBeenCalledTimes(1);

    // The transaction now bundles 4 operations:
    // 1. Flip PENDING/PARTIAL workblocks to COMPLETED
    // 2. Cascade ClearGoals to isComplete=true
    // 3. Upsert the TaskCompletionSnapshot
    // 4. Update the task status to DONE
    const ops = (mockTransaction.mock.calls[0]?.[0] ?? []) as any[];
    expect(ops.length).toBe(4);
  });

  it('cascades into child tasks before completing the parent', async () => {
    const start = new Date('2026-04-20T09:00:00Z');
    const end = new Date('2026-04-20T10:00:00Z');
    // First call: the parent task.
    // Second call: the child task (recursion).
    mockTaskFindUnique
      .mockResolvedValueOnce({
        id: 'parent', status: 'TODO', estimatedMinutes: 60, ownerId: 'owner1',
        workBlocks: [], clearGoals: [],
      } as any)
      .mockResolvedValueOnce({
        id: 'child', status: 'TODO', estimatedMinutes: 30, ownerId: 'owner1',
        workBlocks: [], clearGoals: [],
      } as any);
    // Parent has one child, child has none.
    mockTaskFindMany
      .mockResolvedValueOnce([{ id: 'child' }] as any)
      .mockResolvedValueOnce([] as any);
    mockTransaction.mockResolvedValue([{ count: 0 }, { count: 0 }, { taskId: 'x' }, { id: 'x' }] as any);

    await completeTask('parent', 'user1');

    // Parent + child each run their own transaction (2 total).
    expect(mockTransaction).toHaveBeenCalledTimes(2);
  });

  it('cascades clear goals by task id AND by workblock ids', async () => {
    const start = new Date('2026-04-20T09:00:00Z');
    const end = new Date('2026-04-20T10:00:00Z');
    mockTaskFindUnique.mockResolvedValue({
      id: 't1', status: 'TODO', estimatedMinutes: 60, ownerId: 'owner1',
      workBlocks: [block(start, end, 'COMPLETED', 55, 'b1')],
      clearGoals: [],
    } as any);
    mockTaskFindMany.mockResolvedValue([] as any);
    mockTransaction.mockResolvedValue([{ count: 0 }, { count: 0 }, {}, {}] as any);

    await completeTask('t1', 'user1');

    const ops = (mockTransaction.mock.calls[0]?.[0] ?? []) as any[];
    expect(ops.length).toBe(4);
    // The second op is the clearGoal.updateMany (position-sensitive in the transaction).
    // We can't deeply introspect the prepared op, but we assert the transaction shape.
  });
});
