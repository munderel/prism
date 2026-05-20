/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth-guard', () => ({
  requireAuth: vi.fn(),
  authError: vi.fn((r: any) => Response.json({ error: r.error }, { status: r.status })),
  checkStackWriteAccess: vi.fn(),
  verifyStackMembership: vi.fn(),
  isStackPrivileged: vi.fn((stack: any, auth: any) =>
    Boolean(auth?.session?.user?.isAdmin) || stack?.ownerId === auth?.userId,
  ),
}));

vi.mock('@/lib/api-helpers', () => ({
  notFoundResponse: vi.fn((e: string) =>
    Response.json({ error: `${e} not found` }, { status: 404 }),
  ),
  pickDefined: vi.fn(() => ({})),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    kpi: {
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      updateMany: vi.fn(),
    },
    user: { findUnique: vi.fn() },
    goalAssignee: { findUnique: vi.fn() },
  },
}));

vi.mock('@/lib/schemas', () => ({
  parseBody: vi.fn(),
  updateKpiSchema: {},
}));

vi.mock('@/lib/kpi-progress', () => ({
  cascadeKpiUpdate: vi.fn(),
  recalculateMonthlyNumericKpi: vi.fn(),
  recalculateBinaryKpi: vi.fn(),
}));

import { requireAuth, checkStackWriteAccess } from '@/lib/auth-guard';
import { parseBody } from '@/lib/schemas';
import { prisma } from '@/lib/prisma';
import { PUT, DELETE } from '@/app/api/kpis/[id]/route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockCheckStackWriteAccess = vi.mocked(checkStackWriteAccess);
const mockParseBody = vi.mocked(parseBody);
const mockKpiFindUnique = vi.mocked(prisma.kpi.findUnique);

const authed = { session: { user: { id: 'u1', isAdmin: true } }, userId: 'u1' };
const params = Promise.resolve({ id: 'kpi-1' });

const softDeletedKpi = {
  id: 'kpi-1',
  name: 'Revenue',
  goalId: 'goal-1',
  ownerId: null,
  linkedKpiId: null,
  goal: {
    id: 'goal-1',
    deletedAt: new Date(),
    stack: { id: 'stack-1' },
  },
};

const liveKpi = {
  ...softDeletedKpi,
  goal: { ...softDeletedKpi.goal, deletedAt: null },
};

describe('KPI [id] route — soft-deleted goal guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue(authed as any);
    mockCheckStackWriteAccess.mockResolvedValue(null);
    mockParseBody.mockResolvedValue({ data: { actualValue: 5 } } as any);
  });

  it('PUT returns 404 when parent goal is soft-deleted', async () => {
    mockKpiFindUnique.mockResolvedValueOnce(softDeletedKpi as any);
    const res = await PUT({} as any, { params });
    expect(res.status).toBe(404);
    expect(prisma.kpi.update).not.toHaveBeenCalled();
  });

  it('DELETE returns 404 when parent goal is soft-deleted', async () => {
    mockKpiFindUnique.mockResolvedValueOnce(softDeletedKpi as any);
    const res = await DELETE({} as any, { params });
    expect(res.status).toBe(404);
    expect(prisma.kpi.delete).not.toHaveBeenCalled();
  });

  it('PUT proceeds past the guard for a live goal', async () => {
    mockKpiFindUnique.mockResolvedValueOnce(liveKpi as any);
    vi.mocked(prisma.kpi.update).mockResolvedValueOnce({ id: 'kpi-1' } as any);
    const res = await PUT({} as any, { params });
    expect(res.status).toBe(200);
    expect(prisma.kpi.update).toHaveBeenCalled();
  });

  it('DELETE proceeds past the guard for a live goal', async () => {
    mockKpiFindUnique.mockResolvedValueOnce(liveKpi as any);
    vi.mocked(prisma.kpi.updateMany).mockResolvedValueOnce({ count: 0 } as any);
    vi.mocked(prisma.kpi.delete).mockResolvedValueOnce({ id: 'kpi-1' } as any);
    const res = await DELETE({} as any, { params });
    expect(res.status).toBe(200);
    expect(prisma.kpi.delete).toHaveBeenCalledWith({ where: { id: 'kpi-1' } });
  });
});

// C8d: a GoalAssignee on this KPI's goal gets full edit access (rename,
// retarget, unit change) even when they're not stack owner or admin. This
// lets weekly-goal owners manage their KPIs end-to-end.
describe('KPI [id] route — GoalAssignee structural edit access', () => {
  const nonAdminAuth = {
    session: { user: { id: 'assignee-1', isAdmin: false } },
    userId: 'assignee-1',
  };
  // Reuse the live fixture but force a non-self stack owner so the assignee
  // branch is the only allowed path.
  const liveKpiForAssignee = {
    ...liveKpi,
    goal: {
      ...liveKpi.goal,
      stack: { id: 'stack-1', isCompany: false, ownerId: 'owner-other' },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue(nonAdminAuth as any);
    // A structural rename — `name` triggers `intendedProgressOnly = false`.
    mockParseBody.mockResolvedValue({ data: { name: 'Revenue Q2' } } as any);
  });

  it('PUT allows a GoalAssignee to rename a KPI even without stack-owner rights', async () => {
    mockKpiFindUnique.mockResolvedValueOnce(liveKpiForAssignee as any);
    vi.mocked(prisma.goalAssignee.findUnique).mockResolvedValueOnce({ id: 'ga-1' } as any);
    vi.mocked(prisma.kpi.update).mockResolvedValueOnce({ id: 'kpi-1', name: 'Revenue Q2' } as any);

    const res = await PUT({} as any, { params });

    expect(res.status).toBe(200);
    expect(prisma.kpi.update).toHaveBeenCalled();
    // The assignee path returned early; checkStackWriteAccess shouldn't have run.
    expect(mockCheckStackWriteAccess).not.toHaveBeenCalled();
  });

  it('PUT 403s a non-assignee non-admin non-owner attempting a structural edit', async () => {
    mockKpiFindUnique.mockResolvedValueOnce(liveKpiForAssignee as any);
    vi.mocked(prisma.goalAssignee.findUnique).mockResolvedValueOnce(null);
    // The fall-through path goes through checkStackWriteAccess, which would
    // 403 a non-admin/non-owner. Mock that response shape.
    mockCheckStackWriteAccess.mockResolvedValueOnce(
      Response.json({ error: 'Forbidden' }, { status: 403 }),
    );

    const res = await PUT({} as any, { params });

    expect(res.status).toBe(403);
    expect(prisma.kpi.update).not.toHaveBeenCalled();
  });
});
