/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// prisma.$transaction is what advisoryLock uses; we invoke the callback with a
// `tx` whose methods we can assert on. $executeRaw is the advisory-lock SQL.
vi.mock('@/lib/prisma', () => ({
  prisma: {
    process: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock('@/lib/delegation', () => ({
  resolveAssignee: vi.fn(() => 'owner-1'),
}));

import { prisma } from '@/lib/prisma';
import { generateTasksForCurrentPeriod } from '@/lib/process-task-generator';

const mockProcessFindUnique = vi.mocked(prisma.process.findUnique);
const mockTransaction = vi.mocked(prisma.$transaction);

// tx-scoped mocks (rebuilt each test)
let txProcessFindUnique: ReturnType<typeof vi.fn>;
let txProcessUpdate: ReturnType<typeof vi.fn>;
let txTaskCount: ReturnType<typeof vi.fn>;
let txTaskCreate: ReturnType<typeof vi.fn>;
let txTaskCreateMany: ReturnType<typeof vi.fn>;

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

describe('generateTasksForCurrentPeriod — race / atomicity guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProcessFindUnique.mockResolvedValue(baseAdvancedProcess as any);

    txProcessFindUnique = vi.fn().mockResolvedValue({ lastRunAt: null });
    txProcessUpdate = vi.fn().mockResolvedValue({});
    txTaskCount = vi.fn().mockResolvedValue(0);
    txTaskCreate = vi.fn().mockResolvedValue({ id: 'task-1' });
    txTaskCreateMany = vi.fn().mockResolvedValue({ count: 0 });

    const tx = {
      $executeRaw: vi.fn().mockResolvedValue(0),
      process: { findUnique: txProcessFindUnique, update: txProcessUpdate },
      task: { count: txTaskCount, create: txTaskCreate, createMany: txTaskCreateMany },
      user: { findUnique: vi.fn().mockResolvedValue({ timezone: 'America/New_York' }) },
    };
    // advisoryLock(key, fn) => prisma.$transaction(tx => fn(tx))
    mockTransaction.mockImplementation((async (cb: any) => cb(tx)) as any);
  });

  it('runs inside a transaction (advisory lock) and creates the task, then advances lastRunAt', async () => {
    await generateTasksForCurrentPeriod('proc-1');
    expect(mockTransaction).toHaveBeenCalledOnce();
    expect(txTaskCreate).toHaveBeenCalledOnce();
    expect(txProcessUpdate).toHaveBeenCalledOnce(); // claim advanced AFTER create
  });

  it('skips creation when the period was already claimed (lastRunAt >= periodStart)', async () => {
    txProcessFindUnique.mockResolvedValue({ lastRunAt: new Date() });
    await generateTasksForCurrentPeriod('proc-1');
    expect(txTaskCreate).not.toHaveBeenCalled();
    expect(txProcessUpdate).not.toHaveBeenCalled();
  });

  it('FAST PATH: does NOT open the advisory-lock transaction when the outer lastRunAt >= periodStart', async () => {
    // The findUnique already loaded lastRunAt; a fresh claim means the whole
    // transaction (advisory lock) is skipped, saving a lock per request.
    mockProcessFindUnique.mockResolvedValue({
      ...baseAdvancedProcess,
      lastRunAt: new Date(),
    } as any);
    await generateTasksForCurrentPeriod('proc-1');
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(txProcessFindUnique).not.toHaveBeenCalled();
    expect(txTaskCreate).not.toHaveBeenCalled();
  });

  it('FAST PATH: STILL opens the transaction when lastRunAt is before periodStart (stale claim)', async () => {
    // A lastRunAt from a prior period must not short-circuit — the lock runs.
    mockProcessFindUnique.mockResolvedValue({
      ...baseAdvancedProcess,
      lastRunAt: new Date('2000-01-01T00:00:00Z'),
    } as any);
    await generateTasksForCurrentPeriod('proc-1');
    expect(mockTransaction).toHaveBeenCalledOnce();
  });

  it('skips creation when tasks already exist this period but still advances the claim', async () => {
    txTaskCount.mockResolvedValue(2);
    await generateTasksForCurrentPeriod('proc-1');
    expect(txTaskCreate).not.toHaveBeenCalled();
    expect(txProcessUpdate).toHaveBeenCalledOnce();
  });

  it('REGRESSION: a create failure does NOT advance lastRunAt (transaction rolls back, period retried)', async () => {
    txTaskCreate.mockRejectedValue(new Error('Connection lost'));
    await expect(generateTasksForCurrentPeriod('proc-1')).rejects.toThrow('Connection lost');
    // The claim advance happens only after the create; a thrown create means it
    // never ran, so the transaction rolls back and the next call retries.
    expect(txProcessUpdate).not.toHaveBeenCalled();
  });

  it('uses createMany for multi-step processes (single statement, skipDuplicates)', async () => {
    mockProcessFindUnique.mockResolvedValue({
      ...baseAdvancedProcess,
      steps: [
        { title: 'Step 1', description: null },
        { title: 'Step 2', description: null },
      ],
    } as any);
    await generateTasksForCurrentPeriod('proc-1');
    expect(txTaskCreateMany).toHaveBeenCalledOnce();
    const arg = txTaskCreateMany.mock.calls[0][0] as any;
    expect(arg.skipDuplicates).toBe(true);
    expect(arg.data).toHaveLength(2);
    expect(txProcessUpdate).toHaveBeenCalledOnce();
  });
});
