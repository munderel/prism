/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tests for Component 17: Recurring habits → goal KPIs (via AIMs)
 *
 * Covers:
 * 1. AIM completion handler: NUMERIC KPI increment + cascade
 * 2. AIM completion handler: no KPI write when not linked
 * 3. AIM completion handler: no KPI write for BINARY KPI
 * 4. AIM user PUT route: rejects 400 when target KPI is BINARY
 * 5. AIM user PUT route: accepts when target KPI is NUMERIC
 * 6. AIM user PUT route: rejects invalid kpiIncrement
 * 7. No retroactive backfill on new linkage
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================
// Mocks for the AIM instance PATCH route
// ============================================================
vi.mock('@/lib/prisma', () => ({
  prisma: {
    aimInstance: {
      findUnique: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
    userAim: {
      findUnique: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn().mockResolvedValue({ id: 'ua-1', aimCategory: {} }),
    },
    kpi: {
      findUnique: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
    aimCategory: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    task: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('@/lib/auth-guard', () => ({
  requireAuth: vi.fn(),
  authError: (a: any) => Response.json({ error: a.error }, { status: 401 }),
  checkStackReadAccess: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/schemas', () => ({
  parseBody: vi.fn(),
  updateAimInstanceSchema: {},
  putUserAimsSchema: {},
}));

vi.mock('@/lib/aim-phases', () => ({
  getPointsPerCompletion: () => 1,
  evaluatePhaseGraduation: () => null,
}));

vi.mock('@/lib/calendar', () => ({
  createGoogleEvent: vi.fn().mockResolvedValue(null),
  updateGoogleEvent: vi.fn().mockResolvedValue(undefined),
  deleteGoogleEvent: vi.fn().mockResolvedValue(undefined),
  getGoogleSyncInfo: vi.fn().mockResolvedValue({ hasGoogle: false, calendarId: null }),
}));

vi.mock('@/lib/completion-token', () => ({
  getAimCompletionUrl: () => 'http://localhost/complete',
}));

vi.mock('@/lib/streak-engine', () => ({
  updateSpecificStreak: vi.fn().mockResolvedValue(undefined),
  maybeIncrementDailyStreakIfDayComplete: vi.fn().mockResolvedValue({}),
}));

vi.mock('@/lib/derailing-buffer', () => ({
  applyBufferOnCompletion: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/aim-progress', () => ({
  recalculateUserAimProgress: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/streak-recompute', () => ({
  recomputeAimStreaks: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/lib/kpi-progress', () => ({
  cascadeKpiUpdate: vi.fn().mockResolvedValue(undefined),
  recalculateMonthlyNumericKpi: vi.fn().mockResolvedValue(undefined),
  recalculateBinaryKpi: vi.fn().mockResolvedValue(undefined),
}));

import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth-guard';
import { parseBody } from '@/lib/schemas';
import { cascadeKpiUpdate } from '@/lib/kpi-progress';
import { PATCH } from '@/app/api/aims/instances/[id]/route';
import { PUT } from '@/app/api/aims/user/route';

const mockFindUnique = vi.mocked(prisma.aimInstance.findUnique);
const mockUpdate = vi.mocked(prisma.aimInstance.update);
const mockKpiUpdate = vi.mocked(prisma.kpi.update);
const mockKpiFindMany = vi.mocked(prisma.kpi.findMany);
const mockAimCategoryFindMany = vi.mocked(prisma.aimCategory.findMany);
const mockUserAimFindUnique = vi.mocked(prisma.userAim.findUnique);
const mockRequireAuth = vi.mocked(requireAuth);
const mockParseBody = vi.mocked(parseBody);

const mockStack = {
  id: 'stack-1',
  isCompany: false,
  ownerId: 'user-1',
} as const;

function kpiFixture(id: string, type: 'NUMERIC' | 'BINARY', linkedFrom = 0) {
  return {
    id,
    type,
    goalId: 'goal-1',
    goal: { id: 'goal-1', stack: mockStack, deletedAt: null },
    _count: { linkedFrom },
  } as any;
}

function ownedCategory(id: string) {
  return { id, createdByUserId: 'user-1', isDefault: false };
}

function makePatchRequest() {
  return { json: async () => ({ status: 'COMPLETED' }) } as any;
}
function makePutRequest(body: any) {
  return { json: async () => body } as any;
}

// Base AimInstance (SCHEDULED)
const baseInstance = {
  id: 'inst-1',
  userId: 'user-1',
  aimCategoryId: 'cat-1',
  status: 'SCHEDULED',
  calendarEventId: null,
} as any;

// Base UserAim
const baseUserAim = {
  id: 'ua-1',
  currentPhase: 'SEED',
  phaseStartedAt: new Date(),
  completionCount: 0,
  aimCategory: { defaultFrequency: 7 },
} as any;

// AimCategory with NUMERIC KPI linked (kpiIncrement = 0.5)
const updatedInstanceWithKpi = {
  id: 'inst-1',
  status: 'COMPLETED',
  aimCategory: {
    name: 'Code daily',
    linkedKpiId: 'kpi-1',
    kpiIncrement: 0.5,
    linkedKpi: { id: 'kpi-1', type: 'NUMERIC' },
  },
  selectedActivity: null,
  timeBlockStart: null,
  timeBlockEnd: null,
} as any;

// AimCategory with NO KPI linked
const updatedInstanceNoKpi = {
  id: 'inst-1',
  status: 'COMPLETED',
  aimCategory: {
    name: 'Meditation',
    linkedKpiId: null,
    kpiIncrement: null,
    linkedKpi: null,
  },
  selectedActivity: null,
  timeBlockStart: null,
  timeBlockEnd: null,
} as any;

// AimCategory with BINARY KPI linked (should not increment)
const updatedInstanceBinaryKpi = {
  id: 'inst-1',
  status: 'COMPLETED',
  aimCategory: {
    name: 'Workout',
    linkedKpiId: 'kpi-2',
    kpiIncrement: 1,
    linkedKpi: { id: 'kpi-2', type: 'BINARY' },
  },
  selectedActivity: null,
  timeBlockStart: null,
  timeBlockEnd: null,
} as any;

describe('AIM instance PATCH — KPI increment side effect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue({
      userId: 'user-1',
      session: { user: { isAdmin: false } },
    } as any);
    mockParseBody.mockResolvedValue({ data: { status: 'COMPLETED' } } as any);
    mockFindUnique.mockResolvedValue(baseInstance);
    mockUserAimFindUnique.mockResolvedValue(baseUserAim);
  });

  it('increments NUMERIC KPI by kpiIncrement and calls cascadeKpiUpdate on completion', async () => {
    mockUpdate.mockResolvedValue(updatedInstanceWithKpi);

    await PATCH(makePatchRequest(), { params: Promise.resolve({ id: 'inst-1' }) });

    expect(mockKpiUpdate).toHaveBeenCalledWith({
      where: { id: 'kpi-1' },
      data: { actualValue: { increment: 0.5 } },
    });
    expect(cascadeKpiUpdate).toHaveBeenCalledWith('kpi-1');
  });

  it('defaults kpiIncrement to 1 when kpiIncrement is null', async () => {
    mockUpdate.mockResolvedValue({
      ...updatedInstanceWithKpi,
      aimCategory: {
        ...updatedInstanceWithKpi.aimCategory,
        kpiIncrement: null, // null → default 1
      },
    });

    await PATCH(makePatchRequest(), { params: Promise.resolve({ id: 'inst-1' }) });

    expect(mockKpiUpdate).toHaveBeenCalledWith({
      where: { id: 'kpi-1' },
      data: { actualValue: { increment: 1 } },
    });
  });

  it('does NOT write to KPI when linkedKpiId is null', async () => {
    mockUpdate.mockResolvedValue(updatedInstanceNoKpi);

    await PATCH(makePatchRequest(), { params: Promise.resolve({ id: 'inst-1' }) });

    expect(mockKpiUpdate).not.toHaveBeenCalled();
    expect(cascadeKpiUpdate).not.toHaveBeenCalled();
  });

  it('does NOT write to KPI when linkedKpi.type is BINARY', async () => {
    mockUpdate.mockResolvedValue(updatedInstanceBinaryKpi);

    await PATCH(makePatchRequest(), { params: Promise.resolve({ id: 'inst-1' }) });

    expect(mockKpiUpdate).not.toHaveBeenCalled();
    expect(cascadeKpiUpdate).not.toHaveBeenCalled();
  });

  it('does NOT write KPI when aim was already COMPLETED (no double-increment)', async () => {
    mockFindUnique.mockResolvedValue({ ...baseInstance, status: 'COMPLETED' });
    mockUpdate.mockResolvedValue(updatedInstanceWithKpi);

    await PATCH(makePatchRequest(), { params: Promise.resolve({ id: 'inst-1' }) });

    expect(mockKpiUpdate).not.toHaveBeenCalled();
    expect(cascadeKpiUpdate).not.toHaveBeenCalled();
  });
});

// ============================================================
// AIM user PUT route — KPI linkage validation
// ============================================================
describe('PUT /api/aims/user — KPI linkage validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue({
      userId: 'user-1',
      session: { user: { isAdmin: false } },
    } as any);
  });

  it('returns 400 when target KPI is BINARY', async () => {
    mockParseBody.mockResolvedValue({
      data: {
        aims: [{ aimCategoryId: 'cat-1', linkedKpiId: 'kpi-binary' }],
      },
    } as any);
    mockAimCategoryFindMany.mockResolvedValue([ownedCategory('cat-1')] as any);
    mockKpiFindMany.mockResolvedValue([kpiFixture('kpi-binary', 'BINARY')]);

    const res = await PUT(makePutRequest({ aims: [{ aimCategoryId: 'cat-1', linkedKpiId: 'kpi-binary' }] }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe('Cannot link AIM to a BINARY KPI');
  });

  it('returns 400 when linked KPI does not exist', async () => {
    mockParseBody.mockResolvedValue({
      data: {
        aims: [{ aimCategoryId: 'cat-1', linkedKpiId: 'kpi-missing' }],
      },
    } as any);
    mockAimCategoryFindMany.mockResolvedValue([ownedCategory('cat-1')] as any);
    mockKpiFindMany.mockResolvedValue([]);

    const res = await PUT(makePutRequest({ aims: [{ aimCategoryId: 'cat-1', linkedKpiId: 'kpi-missing' }] }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe('Linked KPI not found');
  });

  it('returns 400 when kpiIncrement <= 0', async () => {
    mockParseBody.mockResolvedValue({
      data: {
        aims: [{ aimCategoryId: 'cat-1', kpiIncrement: -1 }],
      },
    } as any);
    mockAimCategoryFindMany.mockResolvedValue([ownedCategory('cat-1')] as any);

    const res = await PUT(makePutRequest({ aims: [{ aimCategoryId: 'cat-1', kpiIncrement: -1 }] }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe('kpiIncrement must be > 0');
  });

  it('accepts NUMERIC KPI linkage and updates AimCategory', async () => {
    mockParseBody.mockResolvedValue({
      data: {
        aims: [{ aimCategoryId: 'cat-1', linkedKpiId: 'kpi-numeric', kpiIncrement: 0.5 }],
      },
    } as any);
    mockAimCategoryFindMany.mockResolvedValue([ownedCategory('cat-1')] as any);
    // Leaf KPI (no rollup children) — eligible for AIM linkage.
    mockKpiFindMany.mockResolvedValue([kpiFixture('kpi-numeric', 'NUMERIC')]);

    vi.mocked(prisma.$transaction).mockResolvedValue([{ id: 'ua-1', aimCategory: {} }, {}] as any);

    const mockAimCategoryUpdate = vi.mocked(prisma.aimCategory.update);
    mockAimCategoryUpdate.mockResolvedValue({} as any);

    const res = await PUT(makePutRequest({ aims: [{ aimCategoryId: 'cat-1', linkedKpiId: 'kpi-numeric', kpiIncrement: 0.5 }] }));

    expect(res.status).toBe(200);
    expect(mockAimCategoryUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'cat-1' },
        data: expect.objectContaining({ linkedKpiId: 'kpi-numeric', kpiIncrement: 0.5 }),
      }),
    );
  });

  it('rejects linking an AIM to a KPI that rolls up weekly children (dual-role guard)', async () => {
    mockParseBody.mockResolvedValue({
      data: { aims: [{ aimCategoryId: 'cat-1', linkedKpiId: 'kpi-monthly' }] },
    } as any);
    mockAimCategoryFindMany.mockResolvedValue([ownedCategory('cat-1')] as any);
    // Rollup parent: has linked weekly children → would lose AIM increments to SUM(children).
    mockKpiFindMany.mockResolvedValue([kpiFixture('kpi-monthly', 'NUMERIC', 3)]);

    const res = await PUT(makePutRequest({ aims: [{ aimCategoryId: 'cat-1', linkedKpiId: 'kpi-monthly' }] }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('rolls up weekly children');
  });

  it('allows unlinking (linkedKpiId: null) without touching KPI values', async () => {
    mockParseBody.mockResolvedValue({
      data: {
        aims: [{ aimCategoryId: 'cat-1', linkedKpiId: null }],
      },
    } as any);
    mockAimCategoryFindMany.mockResolvedValue([ownedCategory('cat-1')] as any);

    vi.mocked(prisma.$transaction).mockResolvedValue([{ id: 'ua-1', aimCategory: {} }, {}] as any);
    vi.mocked(prisma.aimCategory.update).mockResolvedValue({} as any);

    const res = await PUT(makePutRequest({ aims: [{ aimCategoryId: 'cat-1', linkedKpiId: null }] }));

    expect(res.status).toBe(200);
    expect(mockKpiUpdate).not.toHaveBeenCalled();
  });

  it('rejects cross-user writes to another user\'s AIM category (403)', async () => {
    mockParseBody.mockResolvedValue({
      data: {
        aims: [{ aimCategoryId: 'cat-other', linkedKpiId: 'kpi-numeric' }],
      },
    } as any);
    mockAimCategoryFindMany.mockResolvedValue([
      { id: 'cat-other', createdByUserId: 'user-2', isDefault: false },
    ] as any);

    const res = await PUT(makePutRequest({ aims: [{ aimCategoryId: 'cat-other', linkedKpiId: 'kpi-numeric' }] }));
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toBe('Not allowed to modify this AIM category');
    expect(mockKpiFindMany).not.toHaveBeenCalled();
  });

  it('allows a no-op linkage resend on a category the user does not own (per-user save not blocked)', async () => {
    // Saving active-days on a shared default AIM resends the existing linkage
    // unchanged. Ownership must not reject it, and the shared row must not be
    // rewritten — only the per-user UserAim upsert should run.
    mockParseBody.mockResolvedValue({
      data: {
        aims: [{ aimCategoryId: 'cat-shared', linkedKpiId: 'kpi-x', kpiIncrement: 1, activeWeekdays: 65 }],
      },
    } as any);
    mockAimCategoryFindMany.mockResolvedValue([
      { id: 'cat-shared', createdByUserId: null, isDefault: true, linkedKpiId: 'kpi-x', kpiIncrement: 1 },
    ] as any);
    mockKpiFindMany.mockResolvedValue([kpiFixture('kpi-x', 'NUMERIC')]);
    vi.mocked(prisma.$transaction).mockResolvedValue([{ id: 'ua-1', aimCategory: {} }] as any);
    const mockAimCategoryUpdate = vi.mocked(prisma.aimCategory.update);

    const res = await PUT(
      makePutRequest({ aims: [{ aimCategoryId: 'cat-shared', linkedKpiId: 'kpi-x', kpiIncrement: 1, activeWeekdays: 65 }] }),
    );

    expect(res.status).toBe(200);
    expect(mockAimCategoryUpdate).not.toHaveBeenCalled();
  });

  it('rejects linking to a KPI on a stack the user can\'t read (403)', async () => {
    const { checkStackReadAccess } = await import('@/lib/auth-guard');
    vi.mocked(checkStackReadAccess).mockResolvedValueOnce(
      Response.json({ error: 'Forbidden' }, { status: 403 }),
    );

    mockParseBody.mockResolvedValue({
      data: {
        aims: [{ aimCategoryId: 'cat-1', linkedKpiId: 'kpi-private' }],
      },
    } as any);
    mockAimCategoryFindMany.mockResolvedValue([ownedCategory('cat-1')] as any);
    mockKpiFindMany.mockResolvedValue([kpiFixture('kpi-private', 'NUMERIC')]);

    const res = await PUT(makePutRequest({ aims: [{ aimCategoryId: 'cat-1', linkedKpiId: 'kpi-private' }] }));
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toBe('Not allowed to link to this KPI');
  });
});
