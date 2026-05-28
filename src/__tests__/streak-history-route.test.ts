/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tests for GET /api/aims/streak-history
 *
 * Covers:
 *  - missing aimCategoryId → 400
 *  - default 56-day window
 *  - ?days=N extended up to 365
 *  - ?days=N capped at 365 (values >365 are coerced)
 *  - ?weeks=N as an alias for days (weeks*7, capped at 52 weeks = 364 days)
 *  - backward compat: ?days=56 still works
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    aimInstance: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

vi.mock('@/lib/auth-guard', () => ({
  requireAuth: vi.fn(),
  authError: (a: any) => Response.json({ error: a.error }, { status: 401 }),
}));

vi.mock('@/lib/api-helpers', () => ({
  cacheHeaders: () => ({ 'Cache-Control': 'max-age=10' }),
}));

import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth-guard';
import { GET } from '@/app/api/aims/streak-history/route';

const mockFindMany = vi.mocked(prisma.aimInstance.findMany);
const mockRequireAuth = vi.mocked(requireAuth);

function makeRequest(params: Record<string, string>) {
  const url = new URL('http://localhost/api/aims/streak-history');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return { url: url.toString() } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue({ userId: 'user-1' } as any);
  mockFindMany.mockResolvedValue([]);
});

describe('GET /api/aims/streak-history', () => {
  it('returns 401 when unauthenticated', async () => {
    mockRequireAuth.mockResolvedValue({ error: 'Unauthorized' } as any);
    const res = await GET(makeRequest({ aimCategoryId: 'cat-1' }));
    expect(res.status).toBe(401);
  });

  it('returns 400 when aimCategoryId is missing', async () => {
    const res = await GET(makeRequest({}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/aimCategoryId/);
  });

  it('defaults to 56 days when no days/weeks param', async () => {
    await GET(makeRequest({ aimCategoryId: 'cat-1' }));
    const call = mockFindMany.mock.calls[0][0] as any;
    // The route returns exactly 56 entries (one per day in range)
    // We verify the result array has 56 entries to confirm the window size.
    const start: Date = call.where.scheduledDate.gte;
    const end: Date = call.where.scheduledDate.lte;
    // end is at 23:59:59.999, start is at 00:00:00, diff ≈ 56 days
    const diffDays = Math.round((end.getTime() - start.getTime()) / 86_400_000);
    expect(diffDays).toBe(56);
  });

  it('accepts ?days=90', async () => {
    await GET(makeRequest({ aimCategoryId: 'cat-1', days: '90' }));
    const call = mockFindMany.mock.calls[0][0] as any;
    const start: Date = call.where.scheduledDate.gte;
    const end: Date = call.where.scheduledDate.lte;
    const diffDays = Math.round((end.getTime() - start.getTime()) / 86_400_000);
    expect(diffDays).toBe(90);
  });

  it('accepts ?days=365 (max)', async () => {
    await GET(makeRequest({ aimCategoryId: 'cat-1', days: '365' }));
    const call = mockFindMany.mock.calls[0][0] as any;
    const start: Date = call.where.scheduledDate.gte;
    const end: Date = call.where.scheduledDate.lte;
    const diffDays = Math.round((end.getTime() - start.getTime()) / 86_400_000);
    expect(diffDays).toBe(365);
  });

  it('caps ?days above 365 at 365', async () => {
    await GET(makeRequest({ aimCategoryId: 'cat-1', days: '500' }));
    const call = mockFindMany.mock.calls[0][0] as any;
    const start: Date = call.where.scheduledDate.gte;
    const end: Date = call.where.scheduledDate.lte;
    const diffDays = Math.round((end.getTime() - start.getTime()) / 86_400_000);
    expect(diffDays).toBe(365);
  });

  it('accepts ?weeks=8 (equals 56 days)', async () => {
    await GET(makeRequest({ aimCategoryId: 'cat-1', weeks: '8' }));
    const call = mockFindMany.mock.calls[0][0] as any;
    const start: Date = call.where.scheduledDate.gte;
    const end: Date = call.where.scheduledDate.lte;
    const diffDays = Math.round((end.getTime() - start.getTime()) / 86_400_000);
    expect(diffDays).toBe(56); // 8*7 = 56 days
  });

  it('accepts ?weeks=16 (112 days)', async () => {
    await GET(makeRequest({ aimCategoryId: 'cat-1', weeks: '16' }));
    const call = mockFindMany.mock.calls[0][0] as any;
    const start: Date = call.where.scheduledDate.gte;
    const end: Date = call.where.scheduledDate.lte;
    const diffDays = Math.round((end.getTime() - start.getTime()) / 86_400_000);
    expect(diffDays).toBe(112); // 16*7 = 112 days
  });

  it('caps ?weeks above 52', async () => {
    await GET(makeRequest({ aimCategoryId: 'cat-1', weeks: '100' }));
    const call = mockFindMany.mock.calls[0][0] as any;
    const start: Date = call.where.scheduledDate.gte;
    const end: Date = call.where.scheduledDate.lte;
    const diffDays = Math.round((end.getTime() - start.getTime()) / 86_400_000);
    // 52 weeks * 7 = 364 days
    expect(diffDays).toBe(364);
  });

  it('weeks param takes precedence over days param', async () => {
    await GET(makeRequest({ aimCategoryId: 'cat-1', weeks: '4', days: '300' }));
    const call = mockFindMany.mock.calls[0][0] as any;
    const start: Date = call.where.scheduledDate.gte;
    const end: Date = call.where.scheduledDate.lte;
    const diffDays = Math.round((end.getTime() - start.getTime()) / 86_400_000);
    // weeks=4 → 4*7 = 28 days
    expect(diffDays).toBe(28);
  });

  it('returns correct response shape for a completed instance', async () => {
    const today = new Date();
    const scheduledDate = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
    const dateKey = scheduledDate.toISOString().slice(0, 10);
    mockFindMany.mockResolvedValue([
      { scheduledDate, status: 'COMPLETED', completedAt: new Date() } as any,
    ]);
    const res = await GET(makeRequest({ aimCategoryId: 'cat-1', days: '7' }));
    expect(res.status).toBe(200);
    const body: { date: string; scheduled: boolean; completed: boolean }[] = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(7);
    const entry = body.find((e) => e.date === dateKey);
    expect(entry).toBeDefined();
    expect(entry!.scheduled).toBe(true);
    expect(entry!.completed).toBe(true);
  });
});
