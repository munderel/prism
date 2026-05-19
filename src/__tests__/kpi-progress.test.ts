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

import { cascadeKpiUpdate } from '@/lib/kpi-progress';
import { prisma } from '@/lib/prisma';

const mockFindUnique = vi.mocked(prisma.kpi.findUnique);
const mockFindMany = vi.mocked(prisma.kpi.findMany);
const mockUpdate = vi.mocked(prisma.kpi.update);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('cascadeKpiUpdate', () => {
  it('chains the update through the full parent chain (weekly → monthly → quarterly)', async () => {
    // Tree shape (linkedKpiId → parent):
    //   W (weekly, links to M)  ← change starts here
    //   M (monthly, links to Q)
    //   Q (quarterly, links to null)
    // Bug 2 in the source plan: the original implementation stopped after M.
    mockFindUnique.mockImplementation((args: any) => {
      const id = args.where.id;
      if (id === 'W') return { id: 'W', linkedKpiId: 'M', type: 'NUMERIC', actualValue: 50, isComplete: false } as any;
      if (id === 'M') return { id: 'M', linkedKpiId: 'Q', type: 'NUMERIC', actualValue: 100, isComplete: false } as any;
      if (id === 'Q') return { id: 'Q', linkedKpiId: null, type: 'NUMERIC', actualValue: 250, isComplete: false } as any;
      return null;
    });
    mockFindMany.mockImplementation((args: any) => {
      const parentId = args.where.linkedKpiId;
      if (parentId === 'M') return [{ actualValue: 50 }, { actualValue: 50 }] as any;
      if (parentId === 'Q') return [{ actualValue: 100 }, { actualValue: 150 }] as any;
      return [] as any;
    });
    mockUpdate.mockResolvedValue({} as any);

    await cascadeKpiUpdate('W');

    const updatedIds = mockUpdate.mock.calls.map((c) => (c[0] as any).where.id);
    expect(updatedIds).toContain('M');
    expect(updatedIds).toContain('Q');
  });

  it('does NOT loop forever if the linkedKpiId chain has a cycle', async () => {
    // Pathological tree: A → B → A (shouldn't happen but the guard must hold).
    mockFindUnique.mockImplementation((args: any) => {
      const id = args.where.id;
      if (id === 'A') return { id: 'A', linkedKpiId: 'B', type: 'NUMERIC', actualValue: 1, isComplete: false } as any;
      if (id === 'B') return { id: 'B', linkedKpiId: 'A', type: 'NUMERIC', actualValue: 1, isComplete: false } as any;
      return null;
    });
    mockFindMany.mockResolvedValue([] as any);
    mockUpdate.mockResolvedValue({} as any);

    // No timeout — if the cycle guard fails, the test will hang and the
    // suite's per-test timeout will surface as a clear failure rather than
    // silently consuming the worker.
    await expect(cascadeKpiUpdate('A')).resolves.not.toThrow();
    // Each KPI should be visited at most once.
    expect(mockUpdate.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it('stops cleanly when the chain ends with no linkedKpiId', async () => {
    mockFindUnique.mockResolvedValueOnce({
      id: 'leaf',
      linkedKpiId: null,
      type: 'NUMERIC',
      actualValue: 0,
      isComplete: false,
    } as any);

    await cascadeKpiUpdate('leaf');

    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
