/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    process: { findMany: vi.fn() },
  },
}));

// The generator is invoked per process; stub it so the checker's own memo is
// the only thing under test here.
vi.mock('@/lib/process-task-generator', () => ({
  generateTasksForCurrentPeriod: vi.fn().mockResolvedValue(undefined),
}));

import { prisma } from '@/lib/prisma';
import {
  checkAndCreateDueProcessTasks,
  _resetSweepMemo,
} from '@/lib/process-task-checker';

const mockFindMany = vi.mocked(prisma.process.findMany);

describe('checkAndCreateDueProcessTasks — per-instance sweep memo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetSweepMemo();
    vi.useFakeTimers();
    mockFindMany.mockResolvedValue([{ id: 'proc-1' }] as any);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('collapses two calls within the 30s window to a single findMany', async () => {
    await checkAndCreateDueProcessTasks();
    await checkAndCreateDueProcessTasks();
    expect(mockFindMany).toHaveBeenCalledOnce();
  });

  it('runs findMany again once the 30s window has elapsed', async () => {
    await checkAndCreateDueProcessTasks();
    vi.advanceTimersByTime(30_001);
    await checkAndCreateDueProcessTasks();
    expect(mockFindMany).toHaveBeenCalledTimes(2);
  });

  it('an empty process set still arms the memo (no repeated findMany within window)', async () => {
    mockFindMany.mockResolvedValue([] as any);
    await checkAndCreateDueProcessTasks();
    await checkAndCreateDueProcessTasks();
    expect(mockFindMany).toHaveBeenCalledOnce();
  });
});
