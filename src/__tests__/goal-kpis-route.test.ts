/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth-guard', () => ({
  requireAuth: vi.fn(),
  authError: vi.fn((r: any) => Response.json({ error: r.error }, { status: r.status })),
  checkStackReadAccess: vi.fn(),
  checkStackWriteAccess: vi.fn(),
  isStackPrivileged: vi.fn(() => true),
  verifyStackMembership: vi.fn(),
}));

vi.mock('@/lib/api-helpers', () => ({
  notFoundResponse: vi.fn((e: string) =>
    Response.json({ error: `${e} not found` }, { status: 404 }),
  ),
}));

vi.mock('@/lib/schemas', () => ({
  parseBody: vi.fn(),
  createKpiSchema: {},
}));

vi.mock('@/lib/goal-validation', () => ({
  validateKpiLevel: vi.fn(() => true),
  validateKpiLink: vi.fn(() => true),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    goal: { findUnique: vi.fn(), findMany: vi.fn() },
    kpi: { findMany: vi.fn() },
  },
}));

import { requireAuth, checkStackReadAccess } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';
import { GET } from '@/app/api/goals/[id]/kpis/route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockCheckReadAccess = vi.mocked(checkStackReadAccess);
const mockGoalFindUnique = vi.mocked(prisma.goal.findUnique);
const mockGoalFindMany = vi.mocked(prisma.goal.findMany);
const mockKpiFindMany = vi.mocked(prisma.kpi.findMany);

const authed = { session: { user: { id: 'u1', isAdmin: true } }, userId: 'u1' };
const params = Promise.resolve({ id: 'goal-monthly' });

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue(authed as any);
  mockCheckReadAccess.mockResolvedValue(null);
});

describe('GET /api/goals/[id]/kpis — linkedWeeklyActuals enrichment', () => {
  it('returns one tile per child goal even when some children have no linked KPI', async () => {
    // The reported bug: monthly with 3 weekly children but only 2 of them
    // have a KPI linked to the monthly KPI. Old behavior returned 2 tiles;
    // the new behavior must return 3.
    mockGoalFindUnique.mockResolvedValueOnce({
      id: 'goal-monthly',
      level: 'MONTHLY',
      deletedAt: null,
      stack: { id: 'stack-1' },
    } as any);

    mockKpiFindMany.mockResolvedValueOnce([
      {
        id: 'kpi-monthly',
        goalId: 'goal-monthly',
        name: 'Revenue',
        type: 'NUMERIC',
        unit: '$',
        targetValue: 100,
        actualValue: 50,
        isComplete: false,
        sortOrder: 0,
        linkedKpiId: null,
        owner: null,
      } as any,
    ]);

    // Three weekly children, but only the first two have a KPI linked to
    // the monthly KPI. The third weekly has no linked KPI yet.
    mockGoalFindMany.mockResolvedValueOnce([
      {
        id: 'w1',
        title: 'Week 1',
        kpis: [
          { id: 'k1', linkedKpiId: 'kpi-monthly', type: 'NUMERIC', actualValue: 20, isComplete: false },
        ],
      },
      {
        id: 'w2',
        title: 'Week 2',
        kpis: [
          { id: 'k2', linkedKpiId: 'kpi-monthly', type: 'NUMERIC', actualValue: 30, isComplete: false },
        ],
      },
      {
        id: 'w3',
        title: 'Week 3',
        kpis: [],
      },
    ] as any);

    const res = await GET({} as any, { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    const tiles = body.kpis[0].linkedWeeklyActuals;

    expect(tiles).toHaveLength(3);
    expect(tiles[0]).toMatchObject({ goalId: 'w1', goalTitle: 'Week 1', actual: 20, hasLinkedKpi: true });
    expect(tiles[1]).toMatchObject({ goalId: 'w2', goalTitle: 'Week 2', actual: 30, hasLinkedKpi: true });
    // The third weekly is represented in the rollup even though it has no
    // linked KPI — `hasLinkedKpi` is false so the UI can render it as a
    // dash rather than a misleading 0.
    expect(tiles[2]).toMatchObject({ goalId: 'w3', goalTitle: 'Week 3', hasLinkedKpi: false });
    expect(tiles[2].actual).toBeNull();
  });

  it('excludes soft-deleted child goals from the rollup tiles', async () => {
    mockGoalFindUnique.mockResolvedValueOnce({
      id: 'goal-monthly',
      level: 'MONTHLY',
      deletedAt: null,
      stack: { id: 'stack-1' },
    } as any);
    mockKpiFindMany.mockResolvedValueOnce([
      {
        id: 'kpi-monthly',
        goalId: 'goal-monthly',
        type: 'NUMERIC',
        owner: null,
      } as any,
    ]);
    // The route filters by `deletedAt: null` in the query — assert that
    // filter is passed through (the mock returns only the two live ones).
    mockGoalFindMany.mockResolvedValueOnce([
      { id: 'w1', title: 'Week 1', kpis: [] },
      { id: 'w2', title: 'Week 2', kpis: [] },
    ] as any);

    const res = await GET({} as any, { params });
    expect(res.status).toBe(200);
    expect(mockGoalFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ parentId: 'goal-monthly', deletedAt: null }),
      }),
    );
    const body = await res.json();
    expect(body.kpis[0].linkedWeeklyActuals).toHaveLength(2);
  });

  it('does not enrich for leaf-level (WEEKLY) goals', async () => {
    mockGoalFindUnique.mockResolvedValueOnce({
      id: 'goal-weekly',
      level: 'WEEKLY',
      deletedAt: null,
      stack: { id: 'stack-1' },
    } as any);
    mockKpiFindMany.mockResolvedValueOnce([
      { id: 'kpi-weekly', goalId: 'goal-weekly', owner: null } as any,
    ]);

    const res = await GET({} as any, { params });
    expect(res.status).toBe(200);
    // Weekly is a leaf: no `linkedWeeklyActuals` field is added, and we
    // never bother querying child goals.
    expect(mockGoalFindMany).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.kpis[0].linkedWeeklyActuals).toBeUndefined();
  });
});
