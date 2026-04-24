/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth-guard', () => ({
  requireAuth: vi.fn(),
  authError: vi.fn((r: any) => Response.json({ error: r.error }, { status: r.status })),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    processKpi: { findMany: vi.fn() },
    processKpiEntry: { findMany: vi.fn() },
  },
}));

vi.mock('@/lib/kpi-aggregation', () => ({
  getDateRangeForTimeLevel: vi.fn(() => ({ start: '2026-04-01', end: '2026-04-30' })),
  getSubPeriodBoundaries: vi.fn(() => []),
  aggregateEntries: vi.fn(() => []),
}));

import { requireAuth } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';
import { GET } from '@/app/api/kpis/aggregation/route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockKpiFindMany = vi.mocked(prisma.processKpi.findMany);
const mockEntryFindMany = vi.mocked(prisma.processKpiEntry.findMany);

const userAuth = { session: { user: { id: 'user-A', isAdmin: false } }, userId: 'user-A' };
const adminAuth = { session: { user: { id: 'admin-1', isAdmin: true } }, userId: 'admin-1' };

function createRequest(params: Record<string, string> = {}) {
  const url = new URL('http://localhost/api/kpis/aggregation');
  url.searchParams.set('timeLevel', 'MONTHLY');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return { nextUrl: url } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockKpiFindMany.mockResolvedValue([] as any);
  mockEntryFindMany.mockResolvedValue([] as any);
});

describe('GET /api/kpis/aggregation', () => {
  it('non-admins get a process scope filter (assignee or active delegate)', async () => {
    mockRequireAuth.mockResolvedValue(userAuth as any);

    await GET(createRequest());

    expect(mockKpiFindMany).toHaveBeenCalledOnce();
    const args = mockKpiFindMany.mock.calls[0][0] as any;
    expect(args.where.process).toEqual({
      OR: [
        { assigneeId: 'user-A' },
        { delegateId: 'user-A', delegateUntil: { gte: expect.any(Date) } },
      ],
    });
  });

  it('admins get an empty process scope (no restriction)', async () => {
    mockRequireAuth.mockResolvedValue(adminAuth as any);

    await GET(createRequest());

    const args = mockKpiFindMany.mock.calls[0][0] as any;
    expect(args.where.process).toEqual({});
  });

  it('rejects a non-admin filtering by another user with 403', async () => {
    mockRequireAuth.mockResolvedValue(userAuth as any);

    const response = await GET(createRequest({ userId: 'someone-else' }));
    expect(response.status).toBe(403);
    expect(mockKpiFindMany).not.toHaveBeenCalled();
  });

  it('allows a non-admin filtering by their own userId', async () => {
    mockRequireAuth.mockResolvedValue(userAuth as any);

    const response = await GET(createRequest({ userId: 'user-A' }));
    expect(response.status).toBe(200);
    expect(mockKpiFindMany).toHaveBeenCalledOnce();
  });

  it('allows admins to filter by any userId', async () => {
    mockRequireAuth.mockResolvedValue(adminAuth as any);

    const response = await GET(createRequest({ userId: 'someone-else' }));
    expect(response.status).toBe(200);
    expect(mockKpiFindMany).toHaveBeenCalledOnce();
  });

  it('combines processAccess scope with assigneeId filter under the process relation', async () => {
    mockRequireAuth.mockResolvedValue(userAuth as any);

    await GET(createRequest({ assigneeId: 'user-A' }));

    const args = mockKpiFindMany.mock.calls[0][0] as any;
    expect(args.where.process).toEqual({
      OR: [
        { assigneeId: 'user-A' },
        { delegateId: 'user-A', delegateUntil: { gte: expect.any(Date) } },
      ],
      assigneeId: 'user-A',
    });
  });
});
