/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth-guard', () => ({
  requireAdmin: vi.fn(),
  authError: vi.fn((r: any) => Response.json({ error: r.error }, { status: r.status })),
}));

vi.mock('@/lib/api-helpers', () => ({
  NO_STORE: { headers: { 'Cache-Control': 'no-store' } },
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('@/lib/calendar', () => ({
  getCalendarClient: vi.fn(),
  listWritableCalendarIds: vi.fn(),
}));

import { requireAdmin } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';
import { getCalendarClient, listWritableCalendarIds } from '@/lib/calendar';
import { GET } from '@/app/api/calendar/debug/route';

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockUserFindUnique = vi.mocked(prisma.user.findUnique);
const mockGetCalendarClient = vi.mocked(getCalendarClient);
const mockListWritableCalendarIds = vi.mocked(listWritableCalendarIds);

const adminSession = { session: { user: { id: 'admin1', isAdmin: true } }, userId: 'admin1' };

describe('GET /api/calendar/debug', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when unauthenticated', async () => {
    mockRequireAdmin.mockResolvedValue({ error: 'Unauthorized', status: 401 });
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin users', async () => {
    mockRequireAdmin.mockResolvedValue({ error: 'Forbidden', status: 403 });
    const res = await GET();
    expect(res.status).toBe(403);
    // The route must not touch calendar APIs or the DB when gated.
    expect(mockGetCalendarClient).not.toHaveBeenCalled();
    expect(mockListWritableCalendarIds).not.toHaveBeenCalled();
    expect(mockUserFindUnique).not.toHaveBeenCalled();
  });

  it('returns the diagnostic payload for admins', async () => {
    mockRequireAdmin.mockResolvedValue(adminSession as any);
    mockListWritableCalendarIds.mockResolvedValue(['primary']);
    mockGetCalendarClient.mockResolvedValue(null as any); // no Google link — events skipped
    mockUserFindUnique.mockResolvedValue({
      syncTargetCalendarId: 'primary',
      selectedCalendarIds: ['primary'],
      googleSyncState: null,
    } as any);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.syncTargetCalendarId).toBe('primary');
    expect(body.writableCalendars).toEqual(['primary']);
    expect(body.eventsByCalendar).toEqual({});
    // Data stays scoped to the calling admin's own account.
    expect(mockGetCalendarClient).toHaveBeenCalledWith('admin1');
    expect(mockUserFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'admin1' } })
    );
  });
});
