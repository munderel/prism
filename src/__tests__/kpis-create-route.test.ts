/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth-guard', () => ({
  requireAuth: vi.fn(),
  authError: vi.fn((r: any) => Response.json({ error: r.error }, { status: r.status })),
  checkStackReadAccess: vi.fn(),
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
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    goal: { findUnique: vi.fn() },
    goalAssignee: { findUnique: vi.fn() },
    kpi: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    user: { findUnique: vi.fn() },
  },
}));

vi.mock('@/lib/schemas', () => ({
  parseBody: vi.fn(),
  createKpiSchema: {},
}));

vi.mock('@/lib/goal-validation', () => ({
  validateKpiLevel: vi.fn(() => true),
  validateKpiLink: vi.fn(() => true),
}));

import { requireAuth, checkStackWriteAccess, isStackPrivileged } from '@/lib/auth-guard';
import { parseBody } from '@/lib/schemas';
import { prisma } from '@/lib/prisma';
import { validateKpiLevel } from '@/lib/goal-validation';
import { POST } from '@/app/api/goals/[id]/kpis/route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockIsStackPrivileged = vi.mocked(isStackPrivileged);
const mockCheckStackWriteAccess = vi.mocked(checkStackWriteAccess);
const mockParseBody = vi.mocked(parseBody);
const mockValidateKpiLevel = vi.mocked(validateKpiLevel);
const mockGoalFindUnique = vi.mocked(prisma.goal.findUnique);
const mockGoalAssigneeFindUnique = vi.mocked(prisma.goalAssignee.findUnique);
const mockKpiFindUnique = vi.mocked(prisma.kpi.findUnique);
const mockKpiFindFirst = vi.mocked(prisma.kpi.findFirst);
const mockKpiCreate = vi.mocked(prisma.kpi.create);

const params = Promise.resolve({ id: 'goal-1' });

// A live (not soft-deleted) weekly goal owned by someone other than the
// caller, so the GoalAssignee branch is the only allowed path for a
// non-admin user.
const liveGoalForAssignee = {
  id: 'goal-1',
  level: 'WEEKLY',
  parentId: 'parent-1',
  deletedAt: null,
  stack: { id: 'stack-1', isCompany: false, ownerId: 'owner-other' },
};

const validBody = {
  name: 'Revenue',
  type: 'BINARY',
  unit: null,
  targetValue: null,
  linkedKpiId: null,
  ownerId: null,
};

// C8d parity: PR #32 widened POST /api/goals/[id]/kpis to allow a
// GoalAssignee on the goal to create a KPI even without stack-owner
// rights — mirroring the PATCH widening on /api/kpis/[id]. PATCH got 2
// tests in kpis-id-route.test.ts; POST got none. This file fills the gap.
//
// Mocks use `mockImplementation` (sticky) rather than `mockResolvedValueOnce`
// (queued) so the per-test state is fully replaced each iteration — no risk
// of a stale queue entry from a sibling test bleeding through.
describe('goals/[id]/kpis POST — GoalAssignee structural create access', () => {
  const nonAdminAuth = {
    session: { user: { id: 'assignee-1', isAdmin: false } },
    userId: 'assignee-1',
  };

  beforeEach(() => {
    vi.resetAllMocks();
    mockRequireAuth.mockResolvedValue(nonAdminAuth as any);
    mockParseBody.mockResolvedValue({ data: { ...validBody } } as any);
    mockIsStackPrivileged.mockImplementation((stack: any, auth: any) =>
      Boolean(auth?.session?.user?.isAdmin) || stack?.ownerId === auth?.userId,
    );
    mockValidateKpiLevel.mockReturnValue(true);
    mockGoalFindUnique.mockResolvedValue(liveGoalForAssignee as any);
    mockKpiFindUnique.mockResolvedValue(null as any);
    mockKpiFindFirst.mockResolvedValue(null as any);
  });

  it('POST allows a GoalAssignee to create a KPI on their goal without stack-owner rights', async () => {
    mockGoalAssigneeFindUnique.mockResolvedValue({ id: 'ga-1' } as any);
    mockKpiCreate.mockResolvedValue({ id: 'kpi-new', name: 'Revenue' } as any);

    const res = await POST({} as any, { params });

    expect(res.status).toBe(201);
    expect(prisma.kpi.create).toHaveBeenCalled();
    // The assignee path returned early; checkStackWriteAccess shouldn't have run.
    expect(mockCheckStackWriteAccess).not.toHaveBeenCalled();
  });

  it('POST 403s a non-assignee non-admin non-owner attempting to create a KPI', async () => {
    mockGoalAssigneeFindUnique.mockResolvedValue(null);
    // Fall-through path goes through checkStackWriteAccess, which would
    // 403 a non-admin/non-owner. Mock that response shape.
    mockCheckStackWriteAccess.mockResolvedValue(
      Response.json({ error: 'Forbidden' }, { status: 403 }),
    );

    const res = await POST({} as any, { params });

    expect(res.status).toBe(403);
    expect(prisma.kpi.create).not.toHaveBeenCalled();
  });
});
