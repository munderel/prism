/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Prisma mock ---
vi.mock('@/lib/prisma', () => ({
  prisma: {
    aimInstance: {
      findMany: vi.fn(),
    },
  },
}));

// --- Auth mock ---
vi.mock('@/lib/auth-guard', () => ({
  requireAuth: vi.fn(),
  authError: (a: any) => Response.json({ error: a.error }, { status: a.status ?? 401 }),
}));

// --- api-helpers mock ---
vi.mock('@/lib/api-helpers', () => ({
  cacheHeaders: () => ({ 'Cache-Control': 'private, max-age=30, stale-while-revalidate=60' }),
}));

import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth-guard';
import { GET } from '@/app/api/calendar/groupable-aims/route';

const authed = { session: { user: { id: 'u1', isAdmin: false } }, userId: 'u1' };
const mockRequireAuth = vi.mocked(requireAuth);

// Representative AIM instance from a teammate (userId !== u1)
const teammateInstance = {
  id: 'inst-t1',
  userId: 'u2',
  aimCategoryId: 'cat-1',
  scheduledDate: new Date('2026-05-20T00:00:00.000Z'),
  timeBlockStart: new Date('2026-05-20T18:00:00.000Z'),
  timeBlockEnd: new Date('2026-05-20T19:00:00.000Z'),
  aimCategory: { id: 'cat-1', name: 'Deep Work', isDaily: true },
  user: { id: 'u2', name: 'Alice', image: null },
  dismissals: [],
};

describe('GET /api/calendar/groupable-aims', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockRequireAuth.mockResolvedValue(authed as any);
    vi.mocked(prisma.aimInstance.findMany).mockResolvedValue([]);
  });

  it('returns 401 when not authenticated', async () => {
    mockRequireAuth.mockResolvedValue({ error: 'Unauthorized', status: 401 } as any);
    const req = new Request('http://localhost/api/calendar/groupable-aims?date=2026-05-20');
    const res = await GET(req as any);
    expect(res.status).toBe(401);
  });

  it('returns 400 when neither date nor start+end is supplied', async () => {
    const req = new Request('http://localhost/api/calendar/groupable-aims');
    const res = await GET(req as any);
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid date format', async () => {
    const req = new Request('http://localhost/api/calendar/groupable-aims?date=not-a-date');
    const res = await GET(req as any);
    expect(res.status).toBe(400);
  });

  it('returns empty array when no groupable instances exist', async () => {
    const req = new Request('http://localhost/api/calendar/groupable-aims?date=2026-05-20');
    const res = await GET(req as any);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual([]);
  });

  it('returns groupable instance with attendStatus=NONE', async () => {
    // First findMany call: teammate instances; second: own instances
    vi.mocked(prisma.aimInstance.findMany)
      .mockResolvedValueOnce([teammateInstance] as any) // teammate instances
      .mockResolvedValueOnce([]); // own instances

    const req = new Request('http://localhost/api/calendar/groupable-aims?date=2026-05-20');
    const res = await GET(req as any);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveLength(1);
    expect(json[0].id).toBe('inst-t1');
    expect(json[0].attendStatus).toBe('NONE');
    expect(json[0].owner.id).toBe('u2');
    expect(json[0].aimCategory.name).toBe('Deep Work');
  });

  it('excludes instance dismissed as NOT_GOING', async () => {
    const dismissed = {
      ...teammateInstance,
      dismissals: [{ id: 'dis-1', status: 'NOT_GOING' }],
    };
    vi.mocked(prisma.aimInstance.findMany)
      .mockResolvedValueOnce([dismissed] as any)
      .mockResolvedValueOnce([]);

    const req = new Request('http://localhost/api/calendar/groupable-aims?date=2026-05-20');
    const res = await GET(req as any);
    const json = await res.json();
    expect(json).toHaveLength(0);
  });

  it('keeps instance with MAYBE dismissal and returns attendStatus=MAYBE', async () => {
    const maybed = {
      ...teammateInstance,
      dismissals: [{ id: 'dis-1', status: 'MAYBE' }],
    };
    vi.mocked(prisma.aimInstance.findMany)
      .mockResolvedValueOnce([maybed] as any)
      .mockResolvedValueOnce([]);

    const req = new Request('http://localhost/api/calendar/groupable-aims?date=2026-05-20');
    const res = await GET(req as any);
    const json = await res.json();
    expect(json).toHaveLength(1);
    expect(json[0].attendStatus).toBe('MAYBE');
  });

  it('excludes instance already attended (own instance same category+date)', async () => {
    vi.mocked(prisma.aimInstance.findMany)
      .mockResolvedValueOnce([teammateInstance] as any) // teammate instances
      .mockResolvedValueOnce([{ // own instance same category+date
        aimCategoryId: 'cat-1',
        scheduledDate: new Date('2026-05-20T00:00:00.000Z'),
        timeBlockStart: null,
      }] as any);

    const req = new Request('http://localhost/api/calendar/groupable-aims?date=2026-05-20');
    const res = await GET(req as any);
    const json = await res.json();
    // Should be filtered out since own instance exists for same category+date
    expect(json).toHaveLength(0);
  });

  it('accepts start+end range parameters', async () => {
    vi.mocked(prisma.aimInstance.findMany)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const req = new Request(
      'http://localhost/api/calendar/groupable-aims?start=2026-05-20T00:00:00.000Z&end=2026-05-27T00:00:00.000Z',
    );
    const res = await GET(req as any);
    expect(res.status).toBe(200);
  });
});
