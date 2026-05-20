/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    notification: {
      findMany: vi.fn(),
      count: vi.fn(),
      updateMany: vi.fn(),
    },
    pushSubscription: {
      findFirst: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

vi.mock('@/lib/auth-guard', () => ({
  requireAuth: vi.fn(),
  authError: (a: any) => Response.json({ error: a.error }, { status: a.status ?? 401 }),
}));

vi.mock('@/lib/schemas', () => ({
  parseBody: vi.fn(),
  pushSubscriptionSchema: {},
}));

vi.mock('@/lib/api-helpers', () => ({
  cacheHeaders: () => ({ 'Cache-Control': 'private, max-age=5' }),
  NO_STORE: { headers: { 'Cache-Control': 'no-store' } },
}));

import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth-guard';
import { GET, PATCH } from '@/app/api/notifications/route';

const authed = { session: { user: { id: 'u1', isAdmin: false } }, userId: 'u1' };
const mockRequireAuth = vi.mocked(requireAuth);

const sampleNotifications = [
  {
    id: 'n-1',
    userId: 'u1',
    type: 'AIM_INVITE',
    payload: { title: 'AIM Invitation', body: 'Deep Work invite', url: '/aims?invitation=inv-1' },
    readAt: null,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'n-2',
    userId: 'u1',
    type: 'GENERIC',
    payload: { title: 'Welcome', body: 'Welcome to Prism', url: null },
    readAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  },
];

describe('GET /api/notifications (inbox)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue(authed as any);
    vi.mocked(prisma.notification.findMany).mockResolvedValue(sampleNotifications as any);
    vi.mocked(prisma.notification.count).mockResolvedValue(1);
  });

  it('returns 401 when not authenticated', async () => {
    mockRequireAuth.mockResolvedValue({ error: 'Unauthorized', status: 401 } as any);
    const req = new Request('http://localhost/api/notifications');
    const res = await GET(req as any);
    expect(res.status).toBe(401);
  });

  it('returns notifications and unread count', async () => {
    const req = new Request('http://localhost/api/notifications?limit=10');
    const res = await GET(req as any);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.notifications).toHaveLength(2);
    expect(json.unreadCount).toBe(1);
  });

  it('filters unread when unread=true', async () => {
    vi.mocked(prisma.notification.findMany).mockResolvedValue([sampleNotifications[0]] as any);
    vi.mocked(prisma.notification.count).mockResolvedValue(1);
    const req = new Request('http://localhost/api/notifications?unread=true&limit=10');
    const res = await GET(req as any);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.notifications).toHaveLength(1);
    // Confirm the where clause included readAt: null
    expect(vi.mocked(prisma.notification.findMany)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ readAt: null }),
      }),
    );
  });

  it('clamps limit to 50', async () => {
    const req = new Request('http://localhost/api/notifications?limit=999');
    await GET(req as any);
    expect(vi.mocked(prisma.notification.findMany)).toHaveBeenCalledWith(
      expect.objectContaining({ take: 50 }),
    );
  });
});

describe('PATCH /api/notifications (mark read)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue(authed as any);
    vi.mocked(prisma.notification.updateMany).mockResolvedValue({ count: 1 });
  });

  it('marks specific notifications read', async () => {
    const req = new Request('http://localhost/api/notifications', {
      method: 'PATCH',
      body: JSON.stringify({ ids: ['n-1'] }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await PATCH(req as any);
    expect(res.status).toBe(200);
    expect(vi.mocked(prisma.notification.updateMany)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { in: ['n-1'] } }),
      }),
    );
  });

  it('marks all notifications read when all: true', async () => {
    const req = new Request('http://localhost/api/notifications', {
      method: 'PATCH',
      body: JSON.stringify({ all: true }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await PATCH(req as any);
    expect(res.status).toBe(200);
    expect(vi.mocked(prisma.notification.updateMany)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ readAt: null }),
      }),
    );
  });

  it('returns 400 when neither ids nor all: true provided', async () => {
    const req = new Request('http://localhost/api/notifications', {
      method: 'PATCH',
      body: JSON.stringify({ ids: [] }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await PATCH(req as any);
    expect(res.status).toBe(400);
  });
});
