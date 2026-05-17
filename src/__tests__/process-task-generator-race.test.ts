/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    process: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
    task: {
      count: vi.fn(),
      create: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('@/lib/delegation', () => ({
  resolveAssignee: vi.fn(() => 'owner-1'),
}));

import { prisma } from '@/lib/prisma';
import { generateTasksForCurrentPeriod } from '@/lib/process-task-generator';

const mockProcessFindUnique = vi.mocked(prisma.process.findUnique);
const mockProcessUpdateMany = vi.mocked(prisma.process.updateMany);
const mockTaskCount = vi.mocked(prisma.task.count);
const mockTaskCreate = vi.mocked(prisma.task.create);

const baseAdvancedProcess = {
  id: 'proc-1',
  title: 'Assign Shifts',
  description: null,
  mode: 'ADVANCED' as const,
  cadence: 'BIWEEKLY' as const,
  scheduledTime: null,
  scheduledDayOfWeek: null,
  scheduledDayOfMonth: null,
  durationEndDate: null,
  defaultDurationMinutes: 60,
  steps: [],
  function: { id: 'fn-1' },
};

describe('generateTasksForCurrentPeriod — race-condition guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProcessFindUnique.mockResolvedValue(baseAdvancedProcess as any);
    mockTaskCount.mockResolvedValue(0);
    mockTaskCreate.mockResolvedValue({ id: 'task-1' } as any);
  });

  it('creates the task when the period claim succeeds', async () => {
    mockProcessUpdateMany.mockResolvedValue({ count: 1 } as any);

    await generateTasksForCurrentPeriod('proc-1');

    expect(mockProcessUpdateMany).toHaveBeenCalledOnce();
    expect(mockTaskCreate).toHaveBeenCalledOnce();
  });

  it('skips creation when the period claim loses the race (count === 0)', async () => {
    mockProcessUpdateMany.mockResolvedValue({ count: 0 } as any);

    await generateTasksForCurrentPeriod('proc-1');

    expect(mockProcessUpdateMany).toHaveBeenCalledOnce();
    expect(mockTaskCreate).not.toHaveBeenCalled();
  });

  it('only one of two concurrent callers wins the claim', async () => {
    // Simulate Postgres row-level serialization: first updateMany matches the
    // row (count 1), second updateMany sees the already-advanced lastRunAt
    // and matches nothing (count 0).
    mockProcessUpdateMany
      .mockResolvedValueOnce({ count: 1 } as any)
      .mockResolvedValueOnce({ count: 0 } as any);

    await Promise.all([
      generateTasksForCurrentPeriod('proc-1'),
      generateTasksForCurrentPeriod('proc-1'),
    ]);

    expect(mockProcessUpdateMany).toHaveBeenCalledTimes(2);
    expect(mockTaskCreate).toHaveBeenCalledTimes(1);
  });

  it('swallows P2002 from task.create as a final safety net', async () => {
    mockProcessUpdateMany.mockResolvedValue({ count: 1 } as any);
    mockTaskCreate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    await expect(generateTasksForCurrentPeriod('proc-1')).resolves.toBeUndefined();
  });

  it('re-throws non-P2002 errors from task.create', async () => {
    mockProcessUpdateMany.mockResolvedValue({ count: 1 } as any);
    mockTaskCreate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Connection lost', {
        code: 'P1001',
        clientVersion: 'test',
      }),
    );

    await expect(generateTasksForCurrentPeriod('proc-1')).rejects.toThrow();
  });

  it('claims with periodStart-based WHERE so prior-period lastRunAt does not block', async () => {
    mockProcessUpdateMany.mockResolvedValue({ count: 1 } as any);

    await generateTasksForCurrentPeriod('proc-1');

    const callArgs = mockProcessUpdateMany.mock.calls[0][0] as any;
    expect(callArgs.where.id).toBe('proc-1');
    expect(callArgs.where.OR).toEqual([
      { lastRunAt: null },
      expect.objectContaining({ lastRunAt: expect.objectContaining({ lt: expect.any(Date) }) }),
    ]);
    expect(callArgs.data.lastRunAt).toBeInstanceOf(Date);
  });
});
