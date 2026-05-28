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
      findMany: vi.fn(),
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
  cascadeKpiUpdate: vi.fn().mockResolvedValue([]),
  recalculateMonthlyNumericKpi: vi.fn(),
  recalculateBinaryKpi: vi.fn(),
}));

import { requireAuth, checkStackWriteAccess } from '@/lib/auth-guard';
import { parseBody } from '@/lib/schemas';
import { prisma } from '@/lib/prisma';
import { cascadeKpiUpdate } from '@/lib/kpi-progress';
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

// Company-stack write access paths — verifies all 4 spec-required paths
describe('KPI [id] route — company stack access paths', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no GoalAssignee row (structural-edit path must not accidentally grant it)
    vi.mocked(prisma.goalAssignee.findUnique).mockResolvedValue(null);
    mockCheckStackWriteAccess.mockResolvedValue(null);
  });

  const companyStackKpi = {
    id: 'kpi-1',
    name: 'ARR',
    goalId: 'goal-co',
    ownerId: null,
    linkedKpiId: null,
    goal: {
      id: 'goal-co',
      deletedAt: null,
      stack: { id: 'stack-co', isCompany: true, ownerId: 'admin-user' },
    },
  };

  // Path 1: KPI owner can log progress (actualValue only — intendedProgressOnly=true)
  it('PUT allows KPI owner to log a progress value', async () => {
    const kpiOwnerAuth = {
      session: { user: { id: 'kpi-owner', isAdmin: false } },
      userId: 'kpi-owner',
    };
    mockRequireAuth.mockResolvedValue(kpiOwnerAuth as any);
    // KPI owned by the caller
    const ownedKpi = { ...companyStackKpi, ownerId: 'kpi-owner' };
    mockKpiFindUnique.mockResolvedValueOnce(ownedKpi as any);
    mockParseBody.mockResolvedValue({ data: { actualValue: 99 } } as any);
    vi.mocked(prisma.kpi.update).mockResolvedValueOnce({ id: 'kpi-1' } as any);

    const res = await PUT({} as any, { params });

    expect(res.status).toBe(200);
    // The KPI-owner short-circuit returns before checkStackWriteAccess
    expect(mockCheckStackWriteAccess).not.toHaveBeenCalled();
  });

  // Path 2: GoalAssignee (goal-level) can log progress via checkStackWriteAccess(restricted:true)
  it('PUT allows GoalAssignee to log progress via restricted checkStackWriteAccess', async () => {
    const assigneeAuth = {
      session: { user: { id: 'goal-assignee', isAdmin: false } },
      userId: 'goal-assignee',
    };
    mockRequireAuth.mockResolvedValue(assigneeAuth as any);
    mockKpiFindUnique.mockResolvedValueOnce(companyStackKpi as any);
    mockParseBody.mockResolvedValue({ data: { actualValue: 42 } } as any);
    // Not a KPI owner — falls through to checkStackWriteAccess with restricted:true
    mockCheckStackWriteAccess.mockResolvedValueOnce(null); // allowed
    vi.mocked(prisma.kpi.update).mockResolvedValueOnce({ id: 'kpi-1' } as any);

    const res = await PUT({} as any, { params });

    expect(res.status).toBe(200);
    expect(mockCheckStackWriteAccess).toHaveBeenCalledWith(
      companyStackKpi.goal.stack,
      'goal-assignee',
      false,
      expect.objectContaining({ restricted: true }),
    );
  });

  // Path 3: CompanyGoalAssignment holder can log progress — covered by
  // checkStackWriteAccess(restricted:true) which checks CompanyGoalAssignment.
  // This test confirms the Forbidden path when they have no assignment.
  it('PUT 403s a user with no CompanyGoalAssignment and no GoalAssignee row', async () => {
    const strangerAuth = {
      session: { user: { id: 'stranger', isAdmin: false } },
      userId: 'stranger',
    };
    mockRequireAuth.mockResolvedValue(strangerAuth as any);
    mockKpiFindUnique.mockResolvedValueOnce(companyStackKpi as any);
    mockParseBody.mockResolvedValue({ data: { actualValue: 1 } } as any);
    mockCheckStackWriteAccess.mockResolvedValueOnce(
      Response.json({ error: 'Forbidden' }, { status: 403 }),
    );

    const res = await PUT({} as any, { params });

    expect(res.status).toBe(403);
    expect(prisma.kpi.update).not.toHaveBeenCalled();
  });

  // Path 4: Team admin has full access (isAdmin=true short-circuits in checkStackWriteAccess)
  it('PUT allows team admin full write access', async () => {
    const adminAuth = {
      session: { user: { id: 'admin-user', isAdmin: true } },
      userId: 'admin-user',
    };
    mockRequireAuth.mockResolvedValue(adminAuth as any);
    mockKpiFindUnique.mockResolvedValueOnce(companyStackKpi as any);
    mockParseBody.mockResolvedValue({ data: { actualValue: 50 } } as any);
    mockCheckStackWriteAccess.mockResolvedValueOnce(null); // isAdmin=true → null
    vi.mocked(prisma.kpi.update).mockResolvedValueOnce({ id: 'kpi-1' } as any);

    const res = await PUT({} as any, { params });

    expect(res.status).toBe(200);
    expect(prisma.kpi.update).toHaveBeenCalled();
  });
});

// Cascade chain response — verifies the client receives every parent KPI
// the server cascaded into, not just the immediate parent. Without this,
// strategic/HHG-level KPIs displayed in the same view stay stale.
describe('KPI [id] route — updatedLinkedKpis response chain', () => {
  const linkedKpi = {
    id: 'kpi-weekly',
    name: 'Weekly revenue',
    goalId: 'goal-weekly',
    ownerId: null,
    // Weekly links up to a monthly KPI — the cascade walks weekly → monthly → strategic.
    linkedKpiId: 'kpi-monthly',
    goal: {
      id: 'goal-weekly',
      deletedAt: null,
      stack: { id: 'stack-1' },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue(authed as any);
    mockCheckStackWriteAccess.mockResolvedValue(null);
    mockParseBody.mockResolvedValue({ data: { actualValue: 7 } } as any);
  });

  it('PUT returns updatedLinkedKpis populated from the cascade chain', async () => {
    mockKpiFindUnique.mockResolvedValueOnce(linkedKpi as any);
    vi.mocked(prisma.kpi.update).mockResolvedValueOnce({ id: 'kpi-weekly' } as any);
    // Two-level cascade: monthly + strategic both got recomputed.
    vi.mocked(cascadeKpiUpdate).mockResolvedValueOnce(['kpi-monthly', 'kpi-strategic']);
    vi.mocked(prisma.kpi.findMany).mockResolvedValueOnce([
      { id: 'kpi-strategic', actualValue: 70, isComplete: false } as any,
      { id: 'kpi-monthly', actualValue: 14, isComplete: false } as any,
    ]);

    const res = await PUT({} as any, { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    // Chain order is preserved: immediate parent first, then up.
    expect(body.updatedLinkedKpis.map((k: any) => k.id)).toEqual([
      'kpi-monthly',
      'kpi-strategic',
    ]);
    // Backwards-compatible single-parent field still set to the immediate parent.
    expect(body.updatedLinkedKpi.id).toBe('kpi-monthly');
  });

  it('PUT returns empty updatedLinkedKpis when KPI has no linked parent', async () => {
    const unlinked = { ...linkedKpi, linkedKpiId: null };
    mockKpiFindUnique.mockResolvedValueOnce(unlinked as any);
    vi.mocked(prisma.kpi.update).mockResolvedValueOnce({ id: 'kpi-weekly' } as any);

    const res = await PUT({} as any, { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.updatedLinkedKpis).toEqual([]);
    expect(body.updatedLinkedKpi).toBeNull();
    // Skipping the cascade also means no extra round-trips were issued.
    expect(cascadeKpiUpdate).not.toHaveBeenCalled();
    expect(prisma.kpi.findMany).not.toHaveBeenCalled();
  });
});
