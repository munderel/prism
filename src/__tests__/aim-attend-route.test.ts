/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Prisma mock ---
vi.mock('@/lib/prisma', () => ({
  prisma: {
    aimInstance: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    aimInstanceDismissal: {
      deleteMany: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

// --- Auth mock ---
vi.mock('@/lib/auth-guard', () => ({
  requireAuth: vi.fn(),
  authError: (a: any) => Response.json({ error: a.error }, { status: a.status ?? 401 }),
}));

// --- api-helpers mock ---
vi.mock('@/lib/api-helpers', () => ({
  notFoundResponse: (entity: string) => Response.json({ error: `${entity} not found` }, { status: 404 }),
  NO_STORE: { headers: { 'Cache-Control': 'no-store' } },
}));

import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth-guard';
import { POST } from '@/app/api/aims/instances/[id]/attend/route';

const authed = { session: { user: { id: 'u1', isAdmin: false } }, userId: 'u1' };
const mockRequireAuth = vi.mocked(requireAuth);

const baseInstance = {
  id: 'inst-t1',
  userId: 'u2', // teammate's instance
  aimCategoryId: 'cat-1',
  scheduledDate: new Date('2026-05-20T00:00:00.000Z'),
  timeBlockStart: new Date('2026-05-20T18:00:00.000Z'),
  timeBlockEnd: new Date('2026-05-20T19:00:00.000Z'),
};

function paramsFor(id: string) {
  return { params: Promise.resolve({ id }) };
}

function makeRequest(body: unknown) {
  return new Request('http://localhost', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('POST /api/aims/instances/[id]/attend', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue(authed as any);
    vi.mocked(prisma.aimInstance.findUnique).mockResolvedValue(baseInstance as any);
    vi.mocked(prisma.aimInstance.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.aimInstance.create).mockResolvedValue({ id: 'own-inst-1' } as any);
    vi.mocked(prisma.aimInstance.update).mockResolvedValue({ id: 'existing-inst' } as any);
    vi.mocked(prisma.aimInstanceDismissal.deleteMany).mockResolvedValue({ count: 0 } as any);
    vi.mocked(prisma.aimInstanceDismissal.upsert).mockResolvedValue({} as any);
  });

  it('returns 401 when not authenticated', async () => {
    mockRequireAuth.mockResolvedValue({ error: 'Unauthorized', status: 401 } as any);
    const res = await POST(makeRequest({ status: 'GOING' }) as any, paramsFor('inst-t1'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when instance not found', async () => {
    vi.mocked(prisma.aimInstance.findUnique).mockResolvedValue(null);
    const res = await POST(makeRequest({ status: 'GOING' }) as any, paramsFor('inst-t1'));
    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid status', async () => {
    const res = await POST(makeRequest({ status: 'UNSURE' }) as any, paramsFor('inst-t1'));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/status must be one of/i);
  });

  it('returns 400 when status is missing', async () => {
    const res = await POST(makeRequest({}) as any, paramsFor('inst-t1'));
    expect(res.status).toBe(400);
  });

  it('returns 400 when attending own AIM instance', async () => {
    // Source instance belongs to u1 (the auth'd user). Self-attend has no
    // valid use case and would duplicate the user's own instance on GOING.
    vi.mocked(prisma.aimInstance.findUnique).mockResolvedValue({
      ...baseInstance,
      userId: 'u1',
    } as any);
    const res = await POST(makeRequest({ status: 'GOING' }) as any, paramsFor('inst-t1'));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/own AIM instance/i);
  });

  describe('GOING', () => {
    it('creates own AimInstance and removes any dismissal', async () => {
      const res = await POST(makeRequest({ status: 'GOING' }) as any, paramsFor('inst-t1'));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.ownInstanceId).toBe('own-inst-1');

      // Creates with the correct data
      expect(vi.mocked(prisma.aimInstance.create)).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'u1',
          aimCategoryId: 'cat-1',
          scheduledDate: baseInstance.scheduledDate,
          status: 'SCHEDULED',
        }),
        select: { id: true },
      });

      // Cleans up prior dismissal
      expect(vi.mocked(prisma.aimInstanceDismissal.deleteMany)).toHaveBeenCalledWith({
        where: { aimInstanceId: 'inst-t1', userId: 'u1' },
      });
    });

    it('is idempotent — returns existing own instance if already exists', async () => {
      vi.mocked(prisma.aimInstance.findFirst).mockResolvedValue({ id: 'existing-inst' } as any);

      const res = await POST(makeRequest({ status: 'GOING' }) as any, paramsFor('inst-t1'));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ownInstanceId).toBe('existing-inst');
      expect(vi.mocked(prisma.aimInstance.create)).not.toHaveBeenCalled();
    });
  });

  describe('NOT_GOING', () => {
    it('upserts dismissal with NOT_GOING status', async () => {
      const res = await POST(makeRequest({ status: 'NOT_GOING' }) as any, paramsFor('inst-t1'));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(vi.mocked(prisma.aimInstanceDismissal.upsert)).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { aimInstanceId_userId: { aimInstanceId: 'inst-t1', userId: 'u1' } },
          create: { aimInstanceId: 'inst-t1', userId: 'u1', status: 'NOT_GOING' },
          update: { status: 'NOT_GOING' },
        }),
      );
      expect(vi.mocked(prisma.aimInstance.create)).not.toHaveBeenCalled();
    });
  });

  describe('MAYBE', () => {
    it('upserts dismissal with MAYBE status without creating own instance', async () => {
      const res = await POST(makeRequest({ status: 'MAYBE' }) as any, paramsFor('inst-t1'));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(vi.mocked(prisma.aimInstanceDismissal.upsert)).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ status: 'MAYBE' }),
          update: { status: 'MAYBE' },
        }),
      );
      expect(vi.mocked(prisma.aimInstance.create)).not.toHaveBeenCalled();
    });
  });
});
