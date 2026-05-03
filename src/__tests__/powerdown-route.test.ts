/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth-guard', () => ({
  requireAuth: vi.fn(),
  authError: vi.fn((r: any) => Response.json({ error: r.error }, { status: r.status })),
}));

vi.mock('@/lib/api-helpers', () => ({
  safeParseJson: vi.fn(),
  pickDefined: vi.fn((obj: any, fields: string[]) => {
    const r: any = {};
    for (const f of fields) { if (obj[f] !== undefined) r[f] = obj[f]; }
    return r;
  }),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    powerdownSession: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  },
}));

// Mock the streak engine so we can assert it was called without touching the
// real upsert logic (which would need its own prisma.streak mocks).
vi.mock('@/lib/streak-engine', () => ({
  updateSpecificStreak: vi.fn().mockResolvedValue(undefined),
  updateDailyStreak: vi.fn().mockResolvedValue({}),
}));

import { requireAuth } from '@/lib/auth-guard';
import { safeParseJson } from '@/lib/api-helpers';
import { prisma } from '@/lib/prisma';
import { updateSpecificStreak, updateDailyStreak } from '@/lib/streak-engine';
import { GET, POST, PATCH } from '@/app/api/powerdown/route';
import { updatePowerdownSchema } from '@/lib/schemas';

const mockRequireAuth = vi.mocked(requireAuth);
const mockSafeParseJson = vi.mocked(safeParseJson);
const mockSessionFindMany = vi.mocked(prisma.powerdownSession.findMany);
const mockSessionFindFirst = vi.mocked(prisma.powerdownSession.findFirst);
const mockSessionFindUnique = vi.mocked(prisma.powerdownSession.findUnique);
const mockSessionCreate = vi.mocked(prisma.powerdownSession.create);
const mockSessionUpdate = vi.mocked(prisma.powerdownSession.update);
const mockSessionUpdateMany = vi.mocked(prisma.powerdownSession.updateMany);

const authedResult = { session: { user: { id: 'user1', isAdmin: false } }, userId: 'user1' };

function createGetRequest(params: Record<string, string> = {}) {
  const url = new URL('http://localhost/api/powerdown');
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return { nextUrl: url } as any;
}

describe('GET /api/powerdown', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue(authedResult as any);
  });

  it('returns 401 when unauthenticated', async () => {
    mockRequireAuth.mockResolvedValue({ error: 'Unauthorized', status: 401 });
    const res = await GET(createGetRequest());
    expect(res.status).toBe(401);
  });

  it('returns today\'s session by default', async () => {
    const session = { id: 's1', sessionDate: new Date(), userId: 'user1' };
    mockSessionFindFirst.mockResolvedValue(session as any);
    const res = await GET(createGetRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe('s1');
  });

  it('returns sessions in date range', async () => {
    const sessions = [{ id: 's1' }, { id: 's2' }];
    mockSessionFindMany.mockResolvedValue(sessions as any);
    const res = await GET(createGetRequest({ start: '2026-04-01', end: '2026-04-04' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
  });

  it('returns recent completed sessions capped at 30', async () => {
    mockSessionFindMany.mockResolvedValue([] as any);
    await GET(createGetRequest({ recent: '50' }));
    expect(mockSessionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 30, // capped
      })
    );
  });

  it('defaults to 7 when recent is 0 (falsy parseInt fallback)', async () => {
    mockSessionFindMany.mockResolvedValue([] as any);
    await GET(createGetRequest({ recent: '0' }));
    // parseInt('0') is 0 which is falsy, so `0 || 7` = 7
    expect(mockSessionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 7,
      })
    );
  });
});

describe('POST /api/powerdown', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue(authedResult as any);
  });

  it('creates new session', async () => {
    mockSessionFindFirst.mockResolvedValue(null);
    mockSessionCreate.mockResolvedValue({ id: 's-new', userId: 'user1' } as any);
    const res = await POST();
    expect(res.status).toBe(201);
    expect(mockSessionCreate).toHaveBeenCalled();
  });

  it('returns existing session if one exists today (idempotent)', async () => {
    const existing = { id: 's-existing', userId: 'user1' };
    mockSessionFindFirst.mockResolvedValue(existing as any);
    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe('s-existing');
    expect(mockSessionCreate).not.toHaveBeenCalled();
  });

  // Regression for cause #2: previous code used `startOfToday()` from
  // date-utils which is server-local (UTC on Vercel) — for a Tokyo user
  // (UTC+9) at 02:00Z that returned the prior calendar day in Tokyo.
  // The route must build the session-date window from the user's timezone.
  it('uses the user timezone (not server UTC) for the today window', async () => {
    vi.useFakeTimers();
    // 02:00 UTC = 11:00 in Tokyo (Apr 24). The Tokyo "today" runs from
    // 2026-04-23T15:00:00Z (Tokyo midnight Apr 24) to 2026-04-24T15:00:00Z.
    vi.setSystemTime(new Date('2026-04-24T02:00:00Z'));
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ timezone: 'Asia/Tokyo' } as any);
    mockSessionFindFirst.mockResolvedValue(null);
    mockSessionCreate.mockResolvedValue({ id: 's-new', userId: 'user1' } as any);

    await POST();

    expect(mockSessionFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          sessionDate: {
            gte: new Date('2026-04-23T15:00:00Z'),
            lt: new Date('2026-04-24T15:00:00Z'),
          },
        }),
      })
    );
    vi.useRealTimers();
  });
});

function createPatchRequest(body: any) {
  return {
    nextUrl: new URL('http://localhost/api/powerdown'),
    json: () => Promise.resolve(body),
  } as any;
}

describe('PATCH /api/powerdown', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue(authedResult as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ timezone: 'America/New_York' } as any);
  });

  it('updates session by sessionId', async () => {
    mockSafeParseJson.mockResolvedValue({ data: { sessionId: 's1', currentStep: 3 } } as any);
    mockSessionFindUnique.mockResolvedValue({ id: 's1', userId: 'user1' } as any);
    mockSessionUpdate.mockResolvedValue({ id: 's1', currentStep: 3 } as any);
    const res = await PATCH(createPatchRequest({ sessionId: 's1', currentStep: 3 }));
    expect(res.status).toBe(200);
  });

  it('sets completedAt when complete flag is true', async () => {
    mockSafeParseJson.mockResolvedValue({ data: { sessionId: 's1', complete: true } } as any);
    mockSessionFindUnique.mockResolvedValue({ id: 's1', userId: 'user1' } as any);
    mockSessionUpdateMany.mockResolvedValue({ count: 1 } as any);
    mockSessionUpdate.mockResolvedValue({ id: 's1' } as any);
    await PATCH(createPatchRequest({ sessionId: 's1', complete: true }));
    // Atomic completion transitions completedAt null -> now via updateMany,
    // gated on completedAt: null to prevent double-firing the streak update.
    expect(mockSessionUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 's1', completedAt: null }),
        data: expect.objectContaining({ completedAt: expect.any(Date) }),
      })
    );
  });

  it('returns 404 when session not found', async () => {
    mockSafeParseJson.mockResolvedValue({ data: { sessionId: 's-missing' } } as any);
    mockSessionFindUnique.mockResolvedValue(null);
    const res = await PATCH(createPatchRequest({ sessionId: 's-missing' }));
    expect(res.status).toBe(404);
  });

  it('returns 404 when session belongs to different user', async () => {
    mockSafeParseJson.mockResolvedValue({ data: { sessionId: 's1' } } as any);
    mockSessionFindUnique.mockResolvedValue({ id: 's1', userId: 'other-user' } as any);
    const res = await PATCH(createPatchRequest({ sessionId: 's1' }));
    expect(res.status).toBe(404);
  });

  it('returns 400 when sessionId is missing and no sessionDate', async () => {
    mockSafeParseJson.mockResolvedValue({ data: { currentStep: 3 } } as any);
    const res = await PATCH(createPatchRequest({ currentStep: 3 }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('sessionId is required');
  });

  it('creates session by sessionDate when no sessionId', async () => {
    mockSessionFindFirst.mockResolvedValue(null);
    mockSessionCreate.mockResolvedValue({ id: 's-new', userId: 'user1' } as any);
    mockSessionUpdate.mockResolvedValue({ id: 's-new' } as any);

    const res = await PATCH(createPatchRequest({
      sessionDate: '2026-04-04',
      timeBlockStart: '2026-04-04T21:00:00Z',
      timeBlockEnd: '2026-04-04T21:30:00Z',
    }));
    expect(res.status).toBe(200);
    expect(mockSessionCreate).toHaveBeenCalled();
  });

  it('updates existing session found by sessionDate', async () => {
    const existing = { id: 's-existing', userId: 'user1' };
    mockSessionFindFirst.mockResolvedValue(existing as any);
    mockSessionUpdate.mockResolvedValue({ id: 's-existing' } as any);

    const res = await PATCH(createPatchRequest({
      sessionDate: '2026-04-04',
      timeBlockStart: '2026-04-04T21:00:00Z',
    }));
    expect(res.status).toBe(200);
    expect(mockSessionCreate).not.toHaveBeenCalled();
  });

  // Regression: tomorrowPlan was typed as z.string() but the client always sends
  // string[]. That silently 400'd every completion PATCH, so completedAt never
  // transitioned and the powerdown streak never incremented. Exercise the real
  // Zod schema with the full client payload so a future type regression is caught.
  it('accepts full client payload with tomorrowPlan array and fires completion', async () => {
    mockSessionFindUnique.mockResolvedValue({ id: 's1', userId: 'user1' } as any);
    mockSessionUpdateMany.mockResolvedValue({ count: 1 } as any);
    mockSessionUpdate.mockResolvedValue({ id: 's1' } as any);

    const res = await PATCH(createPatchRequest({
      sessionId: 's1',
      currentStep: 12,
      tomorrowPlan: ['task-id-1', 'task-id-2'],
      distractions: [],
      gratitudes: [],
      ideas: [],
      clearGoals: [],
      complete: true,
    }));

    expect(res.status).toBe(200);
    expect(mockSessionUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 's1', completedAt: null }),
        data: expect.objectContaining({ completedAt: expect.any(Date) }),
      })
    );
  });

  // Regression: self-heal contract. Streak firing must NOT be gated on
  // updateMany's count returning 1 (the completedAt null->now transition).
  // A user whose session already has completedAt set from a prior broken
  // state (e.g. manual DB write, pre-fix partial request) must still get
  // their streak credited on the next complete:true submission. The
  // streak engine is per-day idempotent so re-firing is safe.
  it('fires streak updates on complete:true even when updateMany count is 0 (self-heal)', async () => {
    mockSessionFindUnique.mockResolvedValue({ id: 's1', userId: 'user1' } as any);
    // Session already completed -> updateMany affects zero rows, but streak
    // firing must still happen.
    mockSessionUpdateMany.mockResolvedValue({ count: 0 } as any);
    mockSessionUpdate.mockResolvedValue({ id: 's1' } as any);

    const res = await PATCH(createPatchRequest({
      sessionId: 's1',
      complete: true,
      tomorrowPlan: [],
      distractions: [],
      gratitudes: [],
      ideas: [],
    }));

    expect(res.status).toBe(200);
    expect(vi.mocked(updateSpecificStreak)).toHaveBeenCalledWith('user1', 'powerdown');
    expect(vi.mocked(updateDailyStreak)).toHaveBeenCalledWith('user1', 'powerdown');
  });

  // Regression for cause #5: previous code swallowed streak update errors with
  // .catch() and returned 200 — the client never knew the streak failed and
  // the UI happily showed a celebration screen on top of a silently broken
  // server-side state. The route must surface the error as a `streakError`
  // field on the 200 response so the client can react (toast + keep the user
  // on the final step so a retry self-heals).
  it('surfaces streakError on response when streak update throws', async () => {
    mockSessionFindUnique.mockResolvedValue({ id: 's1', userId: 'user1' } as any);
    mockSessionUpdateMany.mockResolvedValue({ count: 1 } as any);
    mockSessionUpdate.mockResolvedValue({ id: 's1' } as any);
    vi.mocked(updateDailyStreak).mockRejectedValueOnce(new Error('boom from streak engine'));

    // Silence the expected console.error so the test output stays clean.
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await PATCH(createPatchRequest({
      sessionId: 's1',
      complete: true,
      tomorrowPlan: [],
      distractions: [],
      gratitudes: [],
      ideas: [],
    }));

    expect(res.status).toBe(200); // completedAt already wrote; don't re-prompt
    const body = await res.json();
    expect(body.streakError).toBe('boom from streak engine');

    errSpy.mockRestore();
  });

  it('omits streakError when streak update succeeds', async () => {
    mockSessionFindUnique.mockResolvedValue({ id: 's1', userId: 'user1' } as any);
    mockSessionUpdateMany.mockResolvedValue({ count: 1 } as any);
    mockSessionUpdate.mockResolvedValue({ id: 's1' } as any);
    // Default mocks resolve cleanly.

    const res = await PATCH(createPatchRequest({
      sessionId: 's1',
      complete: true,
      tomorrowPlan: [],
      distractions: [],
      gratitudes: [],
      ideas: [],
    }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.streakError).toBeUndefined();
  });
});

describe('updatePowerdownSchema', () => {
  it('accepts tomorrowPlan as empty array', () => {
    const result = updatePowerdownSchema.safeParse({ sessionId: 's1', tomorrowPlan: [] });
    expect(result.success).toBe(true);
  });

  it('accepts tomorrowPlan as array of task id strings', () => {
    const result = updatePowerdownSchema.safeParse({
      sessionId: 's1',
      tomorrowPlan: ['task-a', 'task-b', 'task-c'],
      complete: true,
    });
    expect(result.success).toBe(true);
  });

  it('rejects tomorrowPlan as a plain string (legacy shape)', () => {
    const result = updatePowerdownSchema.safeParse({
      sessionId: 's1',
      tomorrowPlan: 'plain-string',
    });
    expect(result.success).toBe(false);
  });

  it('accepts the full payload the PowerDownRitual client sends', () => {
    const result = updatePowerdownSchema.safeParse({
      sessionId: 's1',
      currentStep: 12,
      tomorrowPlan: ['task-id-1', 'task-id-2'],
      distractions: [],
      gratitudes: [],
      ideas: [],
      clearGoals: [],
      complete: true,
    });
    expect(result.success).toBe(true);
  });
});
