/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    aimInstance: {
      findUnique: vi.fn(),
    },
    aimInvitation: {
      create: vi.fn(),
    },
  },
}));

vi.mock('@/lib/auth-guard', () => ({
  requireAuth: vi.fn(),
  authError: (a: any) => Response.json({ error: a.error }, { status: a.status ?? 401 }),
}));

vi.mock('@/lib/notifications', () => ({
  notifyUser: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/api-helpers', () => ({
  notFoundResponse: (entity: string) => Response.json({ error: `${entity} not found` }, { status: 404 }),
  forbiddenResponse: () => Response.json({ error: 'Forbidden' }, { status: 403 }),
  NO_STORE: { headers: { 'Cache-Control': 'no-store' } },
}));

import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth-guard';
import { POST } from '@/app/api/aims/instances/[id]/invite/route';

const authed = { session: { user: { id: 'u1', isAdmin: false } }, userId: 'u1' };
const mockRequireAuth = vi.mocked(requireAuth);

function paramsFor(id: string) {
  return { params: Promise.resolve({ id }) };
}

const baseInstance = {
  id: 'inst-1',
  userId: 'u1',
  aimCategoryId: 'cat-1',
  aimCategory: { name: 'Deep Work' },
};

describe('POST /api/aims/instances/[id]/invite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue(authed as any);
    vi.mocked(prisma.aimInstance.findUnique).mockResolvedValue(baseInstance as any);
    vi.mocked(prisma.aimInvitation.create).mockResolvedValue({
      id: 'inv-1',
      aimInstanceId: 'inst-1',
      inviterId: 'u1',
      inviteeId: 'u2',
      status: 'PENDING',
      createdAt: new Date(),
      respondedAt: null,
    } as any);
  });

  it('returns 401 when not authenticated', async () => {
    mockRequireAuth.mockResolvedValue({ error: 'Unauthorized', status: 401 } as any);
    const req = new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ userIds: ['u2'] }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(req as any, paramsFor('inst-1'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when instance not found', async () => {
    vi.mocked(prisma.aimInstance.findUnique).mockResolvedValue(null);
    const req = new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ userIds: ['u2'] }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(req as any, paramsFor('inst-1'));
    expect(res.status).toBe(404);
  });

  it('returns 403 when user does not own the instance', async () => {
    vi.mocked(prisma.aimInstance.findUnique).mockResolvedValue({
      ...baseInstance,
      userId: 'other-user',
    } as any);
    const req = new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ userIds: ['u2'] }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(req as any, paramsFor('inst-1'));
    expect(res.status).toBe(403);
  });

  it('returns 400 when inviting yourself', async () => {
    const req = new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ userIds: ['u1'] }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(req as any, paramsFor('inst-1'));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/yourself/i);
  });

  it('returns 400 when userIds is empty', async () => {
    const req = new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ userIds: [] }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(req as any, paramsFor('inst-1'));
    expect(res.status).toBe(400);
  });

  it('creates invitations and returns 200 with created ids', async () => {
    const req = new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ userIds: ['u2'] }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(req as any, paramsFor('inst-1'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.created).toContain('inv-1');
    expect(vi.mocked(prisma.aimInvitation.create)).toHaveBeenCalledWith({
      data: { aimInstanceId: 'inst-1', inviterId: 'u1', inviteeId: 'u2' },
    });
  });

  it('skips duplicate invitations (P2002) idempotently', async () => {
    vi.mocked(prisma.aimInvitation.create).mockRejectedValue({ code: 'P2002' });
    const req = new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ userIds: ['u2'] }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(req as any, paramsFor('inst-1'));
    expect(res.status).toBe(200);
    const json = await res.json();
    // created list is empty since it was a duplicate
    expect(json.created).toHaveLength(0);
  });
});
