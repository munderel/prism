/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    kpi: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import {
  cascadeKpiUpdate,
  recalculateMonthlyNumericKpi,
  recalculateBinaryKpi,
} from '@/lib/kpi-progress';
import { prisma } from '@/lib/prisma';

const mockFindUnique = vi.mocked(prisma.kpi.findUnique);
const mockFindMany = vi.mocked(prisma.kpi.findMany);
const mockFindFirst = vi.mocked(prisma.kpi.findFirst);
const mockUpdate = vi.mocked(prisma.kpi.update);

beforeEach(() => {
  vi.clearAllMocks();
});

// Helper: build the shape cascadeKpiUpdate's findUnique expects when peeking
// at the parent's goal via the linkedKpi relation.
function kpiNode(opts: {
  linkedKpiId: string | null;
  type?: 'NUMERIC' | 'BINARY';
  isComplete?: boolean;
  parentGoalDeletedAt?: Date | null;
}) {
  return {
    linkedKpiId: opts.linkedKpiId,
    type: opts.type ?? 'NUMERIC',
    isComplete: opts.isComplete ?? false,
    linkedKpi:
      opts.linkedKpiId === null
        ? null
        : { goal: { deletedAt: opts.parentGoalDeletedAt ?? null } },
  } as any;
}

describe('cascadeKpiUpdate', () => {
  it('chains the update through the full parent chain (weekly → monthly → strategic)', async () => {
    // Tree (linkedKpiId → parent):
    //   W (weekly, links to M)    ← change starts here
    //   M (monthly, links to S)
    //   S (strategic, links to null)
    mockFindUnique.mockImplementation((args: any) => {
      const id = args.where.id;
      if (id === 'W') return kpiNode({ linkedKpiId: 'M' });
      if (id === 'M') return kpiNode({ linkedKpiId: 'S' });
      if (id === 'S') return kpiNode({ linkedKpiId: null });
      return null;
    });
    mockFindMany.mockImplementation((args: any) => {
      const parentId = args.where.linkedKpiId;
      if (parentId === 'M') return [{ actualValue: 50 }, { actualValue: 50 }] as any;
      if (parentId === 'S') return [{ actualValue: 100 }, { actualValue: 150 }] as any;
      return [] as any;
    });
    mockUpdate.mockResolvedValue({} as any);

    await cascadeKpiUpdate('W');

    const updatedIds = mockUpdate.mock.calls.map((c) => (c[0] as any).where.id);
    expect(updatedIds).toContain('M');
    expect(updatedIds).toContain('S');
  });

  it('does NOT loop forever if the linkedKpiId chain has a cycle, and visits each at most once', async () => {
    // Pathological tree: A → B → A (shouldn't happen but the guard must hold).
    mockFindUnique.mockImplementation((args: any) => {
      const id = args.where.id;
      if (id === 'A') return kpiNode({ linkedKpiId: 'B' });
      if (id === 'B') return kpiNode({ linkedKpiId: 'A' });
      return null;
    });
    mockFindMany.mockResolvedValue([] as any);
    mockUpdate.mockResolvedValue({} as any);

    await expect(cascadeKpiUpdate('A')).resolves.not.toThrow();
    // Exact call count — if the visited guard regresses, this fails loudly
    // rather than timing out silently.
    expect(mockUpdate).toHaveBeenCalledTimes(2);
    const updatedIds = mockUpdate.mock.calls.map((c) => (c[0] as any).where.id).sort();
    expect(updatedIds).toEqual(['A', 'B']);
  });

  it('stops cleanly when the chain ends with no linkedKpiId', async () => {
    mockFindUnique.mockResolvedValueOnce(kpiNode({ linkedKpiId: null }));

    await cascadeKpiUpdate('leaf');

    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('skips the recalc when the parent KPI lives on a soft-deleted goal, but keeps walking up', async () => {
    // W (live) → M (TRASHED) → S (live). Recalc on M is skipped, but the
    // chain must continue so S still gets recomputed.
    const trashedDate = new Date('2026-01-01T00:00:00.000Z');
    mockFindUnique.mockImplementation((args: any) => {
      const id = args.where.id;
      if (id === 'W') return kpiNode({ linkedKpiId: 'M', parentGoalDeletedAt: trashedDate });
      if (id === 'M') return kpiNode({ linkedKpiId: 'S', parentGoalDeletedAt: null });
      if (id === 'S') return kpiNode({ linkedKpiId: null });
      return null;
    });
    mockFindMany.mockResolvedValue([] as any);
    mockUpdate.mockResolvedValue({} as any);

    await cascadeKpiUpdate('W');

    const updatedIds = mockUpdate.mock.calls.map((c) => (c[0] as any).where.id);
    expect(updatedIds).not.toContain('M');
    expect(updatedIds).toContain('S');
  });
});

describe('recalculateMonthlyNumericKpi', () => {
  it('sums actualValue across linked children whose goal is live (excludes soft-deleted)', async () => {
    mockFindMany.mockResolvedValue([
      { actualValue: 30 },
      { actualValue: 20 },
    ] as any);
    mockUpdate.mockResolvedValue({} as any);

    await recalculateMonthlyNumericKpi('M');

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          linkedKpiId: 'M',
          goal: { deletedAt: null },
        }),
      }),
    );
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'M' },
        data: { actualValue: 50 },
      }),
    );
  });

  it('treats null actualValue as 0', async () => {
    mockFindMany.mockResolvedValue([
      { actualValue: 25 },
      { actualValue: null },
    ] as any);
    mockUpdate.mockResolvedValue({} as any);

    await recalculateMonthlyNumericKpi('M');

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { actualValue: 25 } }),
    );
  });
});

describe('recalculateBinaryKpi', () => {
  it('auto-completes the parent when a child reports isComplete=true', async () => {
    mockUpdate.mockResolvedValue({} as any);
    await recalculateBinaryKpi('M', true);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'M' },
        data: expect.objectContaining({ isComplete: true }),
      }),
    );
  });

  it('checks for any-still-complete child filtered by live goal when reverting', async () => {
    mockFindFirst.mockResolvedValue(null as any);
    mockUpdate.mockResolvedValue({} as any);

    await recalculateBinaryKpi('M', false);

    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          linkedKpiId: 'M',
          isComplete: true,
          goal: { deletedAt: null },
        }),
      }),
    );
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isComplete: false }),
      }),
    );
  });

  it('does NOT revert when at least one live-goal child is still complete', async () => {
    mockFindFirst.mockResolvedValue({ id: 'other-live-child' } as any);
    mockUpdate.mockResolvedValue({} as any);

    await recalculateBinaryKpi('M', false);

    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
