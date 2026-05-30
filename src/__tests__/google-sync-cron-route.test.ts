/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth-guard', () => ({
  requireCronSecret: vi.fn(),
}));

vi.mock('@/lib/calendar-sync-engine', () => ({
  runCalendarSync: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { GET } from '@/app/api/cron/google-sync/route';
import { requireCronSecret } from '@/lib/auth-guard';
import { runCalendarSync } from '@/lib/calendar-sync-engine';
import { prisma } from '@/lib/prisma';

const mockSecret = vi.mocked(requireCronSecret);
const mockRun = vi.mocked(runCalendarSync);
const mockFindMany = vi.mocked(prisma.user.findMany);
const mockUpdate = vi.mocked(prisma.user.update);

function req() {
  return new Request('http://localhost/api/cron/google-sync', {
    headers: { authorization: 'Bearer test' },
  }) as any;
}

describe('GET /api/cron/google-sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSecret.mockReturnValue(true);
    mockFindMany.mockResolvedValue([] as any);
    mockUpdate.mockResolvedValue({} as any);
    mockRun.mockResolvedValue({ synced: true } as any);
  });

  it('returns 401 when the cron secret is invalid', async () => {
    mockSecret.mockReturnValue(false);
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it('only selects Google-linked users, oldest-first', async () => {
    await GET(req());
    const arg = mockFindMany.mock.calls[0][0] as any;
    expect(arg.where).toEqual({ googleRefreshToken: { not: null } });
    expect(arg.orderBy).toEqual([{ lastGoogleSyncAt: { sort: 'asc', nulls: 'first' } }]);
  });

  it('runs the engine per user with viaCron and stamps lastGoogleSyncAt', async () => {
    mockFindMany.mockResolvedValue([{ id: 'u1' }, { id: 'u2' }] as any);
    const res = await GET(req());
    const body = await res.json();

    expect(mockRun).toHaveBeenCalledTimes(2);
    expect(mockRun).toHaveBeenCalledWith('u1', expect.objectContaining({ viaCron: true }));
    // Each user's rotation cursor is advanced.
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'u1' }, data: expect.objectContaining({ lastGoogleSyncAt: expect.any(Date) }) }),
    );
    expect(body).toMatchObject({ ok: true, eligible: 2, processed: 2, failed: 0 });
  });

  it('counts skipped (no-change) runs separately', async () => {
    mockFindMany.mockResolvedValue([{ id: 'u1' }] as any);
    mockRun.mockResolvedValue({ synced: true, skipped: true, reason: 'no-changes' } as any);
    const res = await GET(req());
    const body = await res.json();
    expect(body).toMatchObject({ processed: 0, skipped: 1 });
  });

  it('isolates a failing user and still advances its cursor', async () => {
    mockFindMany.mockResolvedValue([{ id: 'u1' }, { id: 'u2' }] as any);
    mockRun.mockRejectedValueOnce(new Error('google down')).mockResolvedValueOnce({ synced: true } as any);
    const res = await GET(req());
    const body = await res.json();

    expect(body).toMatchObject({ failed: 1, processed: 1 });
    // Cursor still stamped for the failed user so it doesn't starve the rest.
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'u1' } }),
    );
  });
});
