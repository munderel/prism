import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    goal: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import {
  computeLeafProgress,
  computeParentProgress,
  computeLinkedProgress,
  cascadeProgressUp,
} from '@/lib/progress';
import { prisma } from '@/lib/prisma';

const mockFindUnique = vi.mocked(prisma.goal.findUnique);
const mockUpdate = vi.mocked(prisma.goal.update);

describe('computeLeafProgress', () => {
  it('returns 0 when no tasks', () => {
    expect(computeLeafProgress([])).toBe(0);
  });

  it('returns 100 when all tasks done', () => {
    const tasks = [
      { status: 'DONE' },
      { status: 'DONE' },
    ];
    expect(computeLeafProgress(tasks as any)).toBe(100);
  });

  it('returns correct percentage for partial completion', () => {
    const tasks = [
      { status: 'DONE' },
      { status: 'TODO' },
      { status: 'IN_PROGRESS' },
      { status: 'DONE' },
      { status: 'TODO' },
    ];
    expect(computeLeafProgress(tasks as any)).toBe(40);
  });

  it('counts DROPPED tasks as completed for percentage', () => {
    const tasks = [
      { status: 'DONE' },
      { status: 'DROPPED' },
      { status: 'TODO' },
    ];
    // DROPPED are excluded from total: 1 done / 2 active = 50%
    expect(computeLeafProgress(tasks as any)).toBe(50);
  });
});

describe('computeParentProgress', () => {
  it('returns 0 when no children', () => {
    expect(computeParentProgress([])).toBe(0);
  });

  it('returns average of children progressPct', () => {
    const children = [
      { progressPct: 40 },
      { progressPct: 80 },
    ];
    expect(computeParentProgress(children as any)).toBe(60);
  });

  it('includes zero-progress children in average', () => {
    const children = [
      { progressPct: 100 },
      { progressPct: 0 },
    ];
    expect(computeParentProgress(children as any)).toBe(50);
  });
});

describe('computeLinkedProgress', () => {
  it('returns 0 when no links', () => {
    expect(computeLinkedProgress([])).toBe(0);
  });

  it('returns weighted average of linked goals', () => {
    const links = [
      { weight: 1.0, individualGoal: { progressPct: 30 } },
      { weight: 2.0, individualGoal: { progressPct: 90 } },
    ];
    // (30*1 + 90*2) / (1+2) = 210/3 = 70
    expect(computeLinkedProgress(links as any)).toBe(70);
  });

  it('handles equal weights', () => {
    const links = [
      { weight: 1.0, individualGoal: { progressPct: 50 } },
      { weight: 1.0, individualGoal: { progressPct: 100 } },
    ];
    expect(computeLinkedProgress(links as any)).toBe(75);
  });
});

describe('cascadeProgressUp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdate.mockResolvedValue({} as any);
  });

  function goalRow(overrides: Partial<{
    id: string;
    parentId: string | null;
    status: string;
    children: Array<{ progressPct: number }>;
    tasks: Array<{ status: string }>;
    companyGoalLinks: Array<{ weight: number; individualGoal: { progressPct: number } }>;
  }> = {}) {
    return {
      id: overrides.id ?? 'g1',
      parentId: overrides.parentId ?? null,
      status: overrides.status ?? 'IN_PROGRESS',
      deletedAt: null,
      children: overrides.children ?? [],
      tasks: overrides.tasks ?? [],
      companyGoalLinks: overrides.companyGoalLinks ?? [],
    };
  }

  it('forces progressPct=100 when status is COMPLETED, regardless of task state', async () => {
    mockFindUnique.mockResolvedValueOnce(goalRow({
      status: 'COMPLETED',
      tasks: [{ status: 'DONE' }, { status: 'TODO' }, { status: 'TODO' }],
    }) as any);

    await cascadeProgressUp('g1');

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'g1' },
      data: { progressPct: 100 },
    });
  });

  it('forces progressPct=0 when status is ABANDONED, regardless of task state', async () => {
    mockFindUnique.mockResolvedValueOnce(goalRow({
      status: 'ABANDONED',
      tasks: [{ status: 'DONE' }, { status: 'DONE' }, { status: 'DONE' }],
    }) as any);

    await cascadeProgressUp('g1');

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'g1' },
      data: { progressPct: 0 },
    });
  });

  it('auto-flips IN_PROGRESS to COMPLETED when all tasks are DONE', async () => {
    mockFindUnique.mockResolvedValueOnce(goalRow({
      status: 'IN_PROGRESS',
      tasks: [{ status: 'DONE' }, { status: 'DONE' }, { status: 'DONE' }, { status: 'DONE' }, { status: 'DONE' }],
    }) as any);

    await cascadeProgressUp('g1');

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'g1' },
      data: { progressPct: 100, status: 'COMPLETED' },
    });
  });

  it('cascades a manually-completed child up to its parent average', async () => {
    // First call: leaf goal with COMPLETED status — pinned to 100.
    mockFindUnique.mockResolvedValueOnce(goalRow({
      id: 'child',
      parentId: 'parent',
      status: 'COMPLETED',
      tasks: [{ status: 'TODO' }],
    }) as any);
    // Second call: parent reads its child as 100; another child is at 0.
    mockFindUnique.mockResolvedValueOnce(goalRow({
      id: 'parent',
      parentId: null,
      status: 'IN_PROGRESS',
      children: [{ progressPct: 100 }, { progressPct: 0 }],
    }) as any);

    await cascadeProgressUp('child');

    expect(mockUpdate).toHaveBeenNthCalledWith(1, {
      where: { id: 'child' },
      data: { progressPct: 100 },
    });
    expect(mockUpdate).toHaveBeenNthCalledWith(2, {
      where: { id: 'parent' },
      data: { progressPct: 50 },
    });
  });
});
