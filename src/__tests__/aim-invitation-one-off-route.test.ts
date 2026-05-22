/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Prisma mock ---
vi.mock('@/lib/prisma', () => ({
  prisma: {
    aimInvitation: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    aimInstance: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
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
  forbiddenResponse: () => Response.json({ error: 'Forbidden' }, { status: 403 }),
  NO_STORE: { headers: { 'Cache-Control': 'no-store' } },
}));

import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth-guard';
import { POST } from '@/app/api/aims/invitations/[id]/one-off/route';

const authed = { session: { user: { id: 'u1', isAdmin: false } }, userId: 'u1' };
const mockRequireAuth = vi.mocked(requireAuth);

const baseInvitation = {
  id: 'inv-1',
  aimInstanceId: 'inst-t1',
  inviterId: 'u2',
  inviteeId: 'u1',
  status: 'PENDING',
  linkedUserAimId: null,
  isOneOff: false,
  aimInstance: {
    aimCategoryId: 'cat-source',
    scheduledDate: new Date('2026-05-20T00:00:00.000Z'),
  },
};

function paramsFor(id: string) {
  return { params: Promise.resolve({ id }) };
}

function makeRequest() {
  return new Request('http://localhost', {
    method: 'POST',
    body: JSON.stringify({}),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('POST /api/aims/invitations/[id]/one-off', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue(authed as any);
    vi.mocked(prisma.aimInvitation.findUnique).mockResolvedValue(baseInvitation as any);
    vi.mocked(prisma.aimInvitation.update).mockImplementation(async ({ data }: any) => ({
      ...baseInvitation,
      ...data,
    }));
    vi.mocked(prisma.aimInstance.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.aimInstance.create).mockResolvedValue({ id: 'inst-new' } as any);
    vi.mocked(prisma.aimInstance.update).mockResolvedValue({} as any);
  });

  it('returns 401 when not authenticated', async () => {
    mockRequireAuth.mockResolvedValue({ error: 'Unauthorized', status: 401 } as any);
    const res = await POST(makeRequest() as any, paramsFor('inv-1'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when invitation is missing', async () => {
    vi.mocked(prisma.aimInvitation.findUnique).mockResolvedValue(null);
    const res = await POST(makeRequest() as any, paramsFor('inv-1'));
    expect(res.status).toBe(404);
  });

  it('returns 403 when invitation belongs to another user', async () => {
    vi.mocked(prisma.aimInvitation.findUnique).mockResolvedValue({
      ...baseInvitation,
      inviteeId: 'u-other',
    } as any);
    const res = await POST(makeRequest() as any, paramsFor('inv-1'));
    expect(res.status).toBe(403);
  });

  it('marks invitation ACCEPTED + isOneOff and creates a COMPLETED instance', async () => {
    const res = await POST(makeRequest() as any, paramsFor('inv-1'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.aimInstanceId).toBe('inst-new');

    expect(vi.mocked(prisma.aimInvitation.update)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'inv-1' },
        data: expect.objectContaining({
          status: 'ACCEPTED',
          isOneOff: true,
          linkedUserAimId: null,
        }),
      }),
    );

    expect(vi.mocked(prisma.aimInstance.create)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'u1',
          aimCategoryId: 'cat-source',
          scheduledDate: baseInvitation.aimInstance.scheduledDate,
          status: 'COMPLETED',
        }),
        select: { id: true },
      }),
    );
  });

  it('reuses an existing AimInstance and marks it COMPLETED when needed', async () => {
    vi.mocked(prisma.aimInstance.findFirst).mockResolvedValue({
      id: 'inst-existing',
      status: 'SCHEDULED',
    } as any);
    const res = await POST(makeRequest() as any, paramsFor('inv-1'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.aimInstanceId).toBe('inst-existing');

    expect(vi.mocked(prisma.aimInstance.create)).not.toHaveBeenCalled();
    expect(vi.mocked(prisma.aimInstance.update)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'inst-existing' },
        data: expect.objectContaining({ status: 'COMPLETED' }),
      }),
    );
  });
});
