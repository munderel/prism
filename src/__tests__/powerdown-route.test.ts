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
    },
  },
}));

import { requireAuth } from '@/lib/auth-guard';
import { safeParseJson } from '@/lib/api-helpers';
import { prisma } from '@/lib/prisma';
import { GET, POST, PATCH } from '@/app/api/powerdown/route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockSafeParseJson = vi.mocked(safeParseJson);
const mockSessionFindMany = vi.mocked(prisma.powerdownSession.findMany);
const mockSessionFindFirst = vi.mocked(prisma.powerdownSession.findFirst);
const mockSessionFindUnique = vi.mocked(prisma.powerdownSession.findUnique);
const mockSessionCreate = vi.mocked(prisma.powerdownSession.create);
const mockSessionUpdate = vi.mocked(prisma.powerdownSession.update);

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
    mockSessionUpdate.mockResolvedValue({ id: 's1' } as any);
    await PATCH(createPatchRequest({ sessionId: 's1', complete: true }));
    expect(mockSessionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          completedAt: expect.any(Date),
        }),
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
    mockSafeParseJson.mockResolvedValue({
      data: { sessionDate: '2026-04-04', timeBlockStart: '2026-04-04T21:00:00Z', timeBlockEnd: '2026-04-04T21:30:00Z' },
    } as any);
    mockSessionFindFirst.mockResolvedValue(null);
    mockSessionCreate.mockResolvedValue({ id: 's-new', userId: 'user1' } as any);
    mockSessionUpdate.mockResolvedValue({ id: 's-new' } as any);

    const res = await PATCH(createPatchRequest({}));
    expect(res.status).toBe(200);
    expect(mockSessionCreate).toHaveBeenCalled();
  });

  it('updates existing session found by sessionDate', async () => {
    mockSafeParseJson.mockResolvedValue({
      data: { sessionDate: '2026-04-04', timeBlockStart: '2026-04-04T21:00:00Z' },
    } as any);
    const existing = { id: 's-existing', userId: 'user1' };
    mockSessionFindFirst.mockResolvedValue(existing as any);
    mockSessionUpdate.mockResolvedValue({ id: 's-existing' } as any);

    const res = await PATCH(createPatchRequest({}));
    expect(res.status).toBe(200);
    expect(mockSessionCreate).not.toHaveBeenCalled();
  });
});
