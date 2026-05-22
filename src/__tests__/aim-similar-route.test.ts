/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Prisma mock ---
vi.mock('@/lib/prisma', () => ({
  prisma: {
    aimCategory: { findUnique: vi.fn() },
    userAim: { findMany: vi.fn() },
  },
}));

// --- Auth mock ---
vi.mock('@/lib/auth-guard', () => ({
  requireAuth: vi.fn(),
  authError: (a: any) => Response.json({ error: a.error }, { status: a.status ?? 401 }),
}));

vi.mock('@/lib/api-helpers', () => ({
  notFoundResponse: (entity: string) =>
    Response.json({ error: `${entity} not found` }, { status: 404 }),
  cacheHeaders: () => ({ 'Content-Type': 'application/json' }),
}));

import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth-guard';
import { GET } from '@/app/api/aims/similar/route';
import { levenshtein, normalizeName } from '@/lib/name-similarity';

const authed = { session: { user: { id: 'u1', isAdmin: false } }, userId: 'u1' };
const mockRequireAuth = vi.mocked(requireAuth);

function makeRequest(url: string) {
  return new Request(url, { method: 'GET' });
}

describe('levenshtein()', () => {
  it('returns 0 for identical strings', () => {
    expect(levenshtein('hello', 'hello')).toBe(0);
  });
  it('returns the full length when one string is empty', () => {
    expect(levenshtein('', 'abc')).toBe(3);
    expect(levenshtein('xyz', '')).toBe(3);
  });
  it('counts substitutions', () => {
    expect(levenshtein('cat', 'bat')).toBe(1);
    expect(levenshtein('kitten', 'sitting')).toBe(3);
  });
  it('counts insertions and deletions', () => {
    expect(levenshtein('abc', 'abcd')).toBe(1);
    expect(levenshtein('abcd', 'abc')).toBe(1);
  });
});

describe('normalizeName()', () => {
  it('lowercases', () => {
    expect(normalizeName('Deep Work')).toBe('deep work');
  });
  it('collapses inner whitespace', () => {
    expect(normalizeName('  Deep    Work  ')).toBe('deep work');
  });
});

describe('GET /api/aims/similar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue(authed as any);
    vi.mocked(prisma.aimCategory.findUnique).mockResolvedValue({
      id: 'cat-target',
      name: 'Deep Work',
    } as any);
  });

  it('returns 401 when not authenticated', async () => {
    mockRequireAuth.mockResolvedValue({ error: 'Unauthorized', status: 401 } as any);
    const res = await GET(makeRequest('http://localhost/api/aims/similar?aimCategoryId=cat-target') as any);
    expect(res.status).toBe(401);
  });

  it('returns 400 when aimCategoryId is missing', async () => {
    const res = await GET(makeRequest('http://localhost/api/aims/similar') as any);
    expect(res.status).toBe(400);
  });

  it('returns 404 when target category is missing', async () => {
    vi.mocked(prisma.aimCategory.findUnique).mockResolvedValue(null);
    const res = await GET(makeRequest('http://localhost/api/aims/similar?aimCategoryId=nope') as any);
    expect(res.status).toBe(404);
  });

  it('sorts results by Levenshtein distance to the target name', async () => {
    vi.mocked(prisma.userAim.findMany).mockResolvedValue([
      {
        id: 'ua-1',
        aimCategoryId: 'c1',
        currentPhase: 'SEED',
        currentStreak: 0,
        aimCategory: { id: 'c1', name: 'Cardio', isDaily: true },
      },
      {
        id: 'ua-2',
        aimCategoryId: 'c2',
        currentPhase: 'GROW',
        currentStreak: 5,
        aimCategory: { id: 'c2', name: 'Deep Work', isDaily: false },
      },
      {
        id: 'ua-3',
        aimCategoryId: 'c3',
        currentPhase: 'FLOW',
        currentStreak: 12,
        aimCategory: { id: 'c3', name: 'Deeep Wurk', isDaily: false },
      },
    ] as any);

    const res = await GET(
      makeRequest('http://localhost/api/aims/similar?aimCategoryId=cat-target') as any,
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.results).toHaveLength(3);
    // exact match first
    expect(json.results[0].id).toBe('ua-2');
    expect(json.results[0].distance).toBe(0);
    // near-match second
    expect(json.results[1].id).toBe('ua-3');
    // unrelated last
    expect(json.results[2].id).toBe('ua-1');
    // distances should be monotonically non-decreasing
    expect(json.results[0].distance).toBeLessThanOrEqual(json.results[1].distance);
    expect(json.results[1].distance).toBeLessThanOrEqual(json.results[2].distance);
  });

  it('returns an empty results array when the user has no UserAims', async () => {
    vi.mocked(prisma.userAim.findMany).mockResolvedValue([] as any);
    const res = await GET(
      makeRequest('http://localhost/api/aims/similar?aimCategoryId=cat-target') as any,
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.results).toEqual([]);
    expect(json.target).toEqual({ id: 'cat-target', name: 'Deep Work' });
  });

  it('scopes UserAims to the auth user', async () => {
    vi.mocked(prisma.userAim.findMany).mockResolvedValue([] as any);
    await GET(
      makeRequest('http://localhost/api/aims/similar?aimCategoryId=cat-target') as any,
    );
    expect(vi.mocked(prisma.userAim.findMany)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'u1', isActive: true },
      }),
    );
  });
});
