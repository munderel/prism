/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- AIM respond ----
vi.mock('@/lib/prisma', () => ({
  prisma: {
    aimInvitation: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    workBlockInvitation: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    notification: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  },
}));

vi.mock('@/lib/auth-guard', () => ({
  requireAuth: vi.fn(),
  authError: (a: any) => Response.json({ error: a.error }, { status: a.status ?? 401 }),
}));

vi.mock('@/lib/api-helpers', () => ({
  notFoundResponse: (entity: string) => Response.json({ error: `${entity} not found` }, { status: 404 }),
  forbiddenResponse: () => Response.json({ error: 'Forbidden' }, { status: 403 }),
  NO_STORE: { headers: { 'Cache-Control': 'no-store' } },
}));

import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth-guard';
import { POST as aimRespond } from '@/app/api/invitations/aim/[id]/respond/route';
import { POST as wbRespond } from '@/app/api/invitations/workblock/[id]/respond/route';

const authed = { session: { user: { id: 'u2', isAdmin: false } }, userId: 'u2' };
const mockRequireAuth = vi.mocked(requireAuth);

function paramsFor(id: string) {
  return { params: Promise.resolve({ id }) };
}

const pendingAimInvitation = {
  id: 'inv-1',
  aimInstanceId: 'inst-1',
  inviterId: 'u1',
  inviteeId: 'u2',
  status: 'PENDING',
  createdAt: new Date(),
  respondedAt: null,
};

const pendingWbInvitation = {
  id: 'wbi-1',
  workBlockId: 'wb-1',
  inviterId: 'u1',
  inviteeId: 'u2',
  status: 'PENDING',
  createdAt: new Date(),
  respondedAt: null,
};

// ---------------------------------------------------------------------------
// AIM respond
// ---------------------------------------------------------------------------
describe('POST /api/invitations/aim/[id]/respond', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue(authed as any);
    vi.mocked(prisma.aimInvitation.findUnique).mockResolvedValue(pendingAimInvitation as any);
    vi.mocked(prisma.aimInvitation.update).mockResolvedValue({
      ...pendingAimInvitation,
      status: 'ACCEPTED',
      respondedAt: new Date(),
    } as any);
  });

  it('returns 401 when not authenticated', async () => {
    mockRequireAuth.mockResolvedValue({ error: 'Unauthorized', status: 401 } as any);
    const req = new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ status: 'ACCEPTED' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await aimRespond(req as any, paramsFor('inv-1'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when invitation not found', async () => {
    vi.mocked(prisma.aimInvitation.findUnique).mockResolvedValue(null);
    const req = new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ status: 'ACCEPTED' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await aimRespond(req as any, paramsFor('inv-1'));
    expect(res.status).toBe(404);
  });

  it('returns 403 when non-invitee responds', async () => {
    mockRequireAuth.mockResolvedValue({ userId: 'u99', session: { user: { id: 'u99', isAdmin: false } } } as any);
    const req = new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ status: 'ACCEPTED' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await aimRespond(req as any, paramsFor('inv-1'));
    expect(res.status).toBe(403);
  });

  it('returns 400 for invalid status', async () => {
    const req = new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ status: 'INVALID' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await aimRespond(req as any, paramsFor('inv-1'));
    expect(res.status).toBe(400);
  });

  it('accepts the invitation and returns 200', async () => {
    const req = new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ status: 'ACCEPTED' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await aimRespond(req as any, paramsFor('inv-1'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(vi.mocked(prisma.aimInvitation.update)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'inv-1' },
        data: expect.objectContaining({ status: 'ACCEPTED' }),
      }),
    );
  });

  it('is idempotent when responding with the same status', async () => {
    vi.mocked(prisma.aimInvitation.findUnique).mockResolvedValue({
      ...pendingAimInvitation,
      status: 'ACCEPTED',
    } as any);
    const req = new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ status: 'ACCEPTED' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await aimRespond(req as any, paramsFor('inv-1'));
    expect(res.status).toBe(200);
    // No update call because status already matches
    expect(vi.mocked(prisma.aimInvitation.update)).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// WorkBlock respond
// ---------------------------------------------------------------------------
describe('POST /api/invitations/workblock/[id]/respond', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue(authed as any);
    vi.mocked(prisma.workBlockInvitation.findUnique).mockResolvedValue(pendingWbInvitation as any);
    vi.mocked(prisma.workBlockInvitation.update).mockResolvedValue({
      ...pendingWbInvitation,
      status: 'DECLINED',
      respondedAt: new Date(),
    } as any);
  });

  it('declines the invitation and returns 200', async () => {
    const req = new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ status: 'DECLINED' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await wbRespond(req as any, paramsFor('wbi-1'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(vi.mocked(prisma.workBlockInvitation.update)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'wbi-1' },
        data: expect.objectContaining({ status: 'DECLINED' }),
      }),
    );
  });

  it('returns 404 when workblock invitation not found', async () => {
    vi.mocked(prisma.workBlockInvitation.findUnique).mockResolvedValue(null);
    const req = new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ status: 'ACCEPTED' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await wbRespond(req as any, paramsFor('wbi-1'));
    expect(res.status).toBe(404);
  });
});
