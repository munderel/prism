/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth-guard', () => ({
  requireAuth: vi.fn(),
  authError: vi.fn((r: any) => Response.json({ error: r.error }, { status: r.status })),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    pushSubscription: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    notificationChannelPref: {
      findMany: vi.fn(),
      createMany: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

vi.mock('@/lib/schemas', () => ({
  parseBody: vi.fn(),
}));

const mockAuthError = vi.fn((r: any) => Response.json({ error: r.error }, { status: r.status }));

import { requireAuth, authError } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';
import { parseBody } from '@/lib/schemas';

const mockPrisma = prisma as any;
const mockParseBody = parseBody as any;

// ── Helpers ──────────────────────────────────────────────────────────────────

function authed(userId = 'user-1') {
  (requireAuth as any).mockResolvedValue({
    userId,
    session: { user: { id: userId, isAdmin: false } },
  });
  (authError as any).mockImplementation(mockAuthError);
}

function unauthed() {
  (requireAuth as any).mockResolvedValue({ error: 'Unauthorized', status: 401 });
}

// ── POST /api/notifications/subscribe ────────────────────────────────────────

describe('POST /api/notifications/subscribe', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns 401 when unauthenticated', async () => {
    unauthed();
    const { POST } = await import('@/app/api/notifications/subscribe/route');
    const req = new Request('http://test/api/notifications/subscribe', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(401);
  });

  it('returns 400 when body is invalid', async () => {
    authed();
    mockParseBody.mockResolvedValueOnce({
      error: Response.json({ error: 'Invalid' }, { status: 400 }),
    });
    const { POST } = await import('@/app/api/notifications/subscribe/route');
    const req = new Request('http://test/api/notifications/subscribe', {
      method: 'POST',
      body: JSON.stringify({ bad: 'data' }),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });

  it('creates a new subscription with device metadata', async () => {
    authed();
    mockParseBody.mockResolvedValueOnce({
      data: {
        endpoint: 'https://push.example.com/sub123',
        keys: { p256dh: 'pk123', auth: 'auth123' },
        deviceType: 'desktop',
        label: 'Chrome',
        userAgent: 'Mozilla/5.0',
      },
    });
    mockPrisma.pushSubscription.findFirst.mockResolvedValueOnce(null);
    const createdSub = {
      id: 'sub-1',
      userId: 'user-1',
      endpoint: 'https://push.example.com/sub123',
      p256dh: 'pk123',
      auth: 'auth123',
      deviceType: 'desktop',
      label: 'Chrome',
      lastSeenAt: new Date(),
      createdAt: new Date(),
    };
    mockPrisma.pushSubscription.create.mockResolvedValueOnce(createdSub);

    const { POST } = await import('@/app/api/notifications/subscribe/route');
    const req = new Request('http://test/api/notifications/subscribe', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.deviceType).toBe('desktop');
    expect(body.label).toBe('Chrome');
  });

  it('upserts an existing subscription (refreshes lastSeenAt)', async () => {
    authed();
    mockParseBody.mockResolvedValueOnce({
      data: {
        endpoint: 'https://push.example.com/sub123',
        keys: { p256dh: 'pk-new', auth: 'auth-new' },
        deviceType: 'desktop',
      },
    });
    const existingSub = { id: 'sub-1', userId: 'user-1', endpoint: 'https://push.example.com/sub123' };
    mockPrisma.pushSubscription.findFirst.mockResolvedValueOnce(existingSub);
    mockPrisma.pushSubscription.update.mockResolvedValueOnce({ ...existingSub, p256dh: 'pk-new' });

    const { POST } = await import('@/app/api/notifications/subscribe/route');
    const req = new Request('http://test/api/notifications/subscribe', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const res = await POST(req as any);
    // existing → 200
    expect(res.status).toBe(200);
    expect(mockPrisma.pushSubscription.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'sub-1' } }),
    );
  });
});

// ── DELETE /api/notifications/subscribe/[id] ─────────────────────────────────

describe('DELETE /api/notifications/subscribe/[id]', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns 401 when unauthenticated', async () => {
    unauthed();
    const { DELETE } = await import('@/app/api/notifications/subscribe/[id]/route');
    const req = new Request('http://test/api/notifications/subscribe/sub-1', { method: 'DELETE' });
    const res = await DELETE(req as any, { params: Promise.resolve({ id: 'sub-1' }) });
    expect(res.status).toBe(401);
  });

  it('returns 404 when subscription does not exist', async () => {
    authed();
    mockPrisma.pushSubscription.findUnique.mockResolvedValueOnce(null);
    const { DELETE } = await import('@/app/api/notifications/subscribe/[id]/route');
    const req = new Request('http://test/api/notifications/subscribe/no-sub', { method: 'DELETE' });
    const res = await DELETE(req as any, { params: Promise.resolve({ id: 'no-sub' }) });
    expect(res.status).toBe(404);
  });

  it('returns 403 when user does not own the subscription', async () => {
    authed('user-1');
    mockPrisma.pushSubscription.findUnique.mockResolvedValueOnce({
      id: 'sub-1',
      userId: 'user-2', // different owner
    });
    const { DELETE } = await import('@/app/api/notifications/subscribe/[id]/route');
    const req = new Request('http://test/api/notifications/subscribe/sub-1', { method: 'DELETE' });
    const res = await DELETE(req as any, { params: Promise.resolve({ id: 'sub-1' }) });
    expect(res.status).toBe(403);
  });

  it('deletes the subscription when owned by user', async () => {
    authed('user-1');
    mockPrisma.pushSubscription.findUnique.mockResolvedValueOnce({
      id: 'sub-1',
      userId: 'user-1',
    });
    mockPrisma.pushSubscription.delete.mockResolvedValueOnce({});
    const { DELETE } = await import('@/app/api/notifications/subscribe/[id]/route');
    const req = new Request('http://test/api/notifications/subscribe/sub-1', { method: 'DELETE' });
    const res = await DELETE(req as any, { params: Promise.resolve({ id: 'sub-1' }) });
    expect(res.status).toBe(200);
    expect(mockPrisma.pushSubscription.delete).toHaveBeenCalledWith({ where: { id: 'sub-1' } });
  });
});

// ── GET /api/notifications/preferences ───────────────────────────────────────

describe('GET /api/notifications/preferences', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns 401 when unauthenticated', async () => {
    unauthed();
    const { GET } = await import('@/app/api/notifications/preferences/route');
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns channel prefs for authenticated user', async () => {
    authed();
    mockPrisma.notificationChannelPref.findMany
      .mockResolvedValueOnce([]) // ensureDefaults check
      .mockResolvedValueOnce([
        { id: 'p1', notifType: 'DERAILING', channel: 'EMAIL', enabled: true },
        { id: 'p2', notifType: 'DERAILING', channel: 'PUSH_DESKTOP', enabled: false },
      ]);
    mockPrisma.notificationChannelPref.createMany.mockResolvedValueOnce({ count: 28 });

    const { GET } = await import('@/app/api/notifications/preferences/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });
});

// ── PATCH /api/notifications/preferences ─────────────────────────────────────

describe('PATCH /api/notifications/preferences', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns 401 when unauthenticated', async () => {
    unauthed();
    const { PATCH } = await import('@/app/api/notifications/preferences/route');
    const req = new Request('http://test/api/notifications/preferences', {
      method: 'PATCH',
      body: JSON.stringify({ notifType: 'DERAILING', channel: 'EMAIL', enabled: false }),
    });
    const res = await PATCH(req as any);
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid body', async () => {
    authed();
    mockParseBody.mockResolvedValueOnce({
      error: Response.json({ error: 'Invalid' }, { status: 400 }),
    });
    const { PATCH } = await import('@/app/api/notifications/preferences/route');
    const req = new Request('http://test/api/notifications/preferences', {
      method: 'PATCH',
      body: JSON.stringify({ bad: 'data' }),
    });
    const res = await PATCH(req as any);
    expect(res.status).toBe(400);
  });

  it('upserts a preference', async () => {
    authed();
    mockParseBody.mockResolvedValueOnce({
      data: { notifType: 'DERAILING', channel: 'PUSH_DESKTOP', enabled: false },
    });
    const updatedPref = {
      id: 'p1',
      userId: 'user-1',
      notifType: 'DERAILING',
      channel: 'PUSH_DESKTOP',
      enabled: false,
    };
    mockPrisma.notificationChannelPref.upsert.mockResolvedValueOnce(updatedPref);

    const { PATCH } = await import('@/app/api/notifications/preferences/route');
    const req = new Request('http://test/api/notifications/preferences', {
      method: 'PATCH',
      body: JSON.stringify({ notifType: 'DERAILING', channel: 'PUSH_DESKTOP', enabled: false }),
    });
    const res = await PATCH(req as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.enabled).toBe(false);
  });
});
