/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth-guard', () => ({
  requireAuth: vi.fn(),
  authError: vi.fn((r: any) => Response.json({ error: r.error }, { status: r.status })),
}));

vi.mock('@/lib/api-helpers', () => ({
  safeParseJson: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    streak: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { requireAuth } from '@/lib/auth-guard';
import { safeParseJson } from '@/lib/api-helpers';
import { prisma } from '@/lib/prisma';
import { PATCH } from '@/app/api/streaks/[id]/route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockSafeParseJson = vi.mocked(safeParseJson);
const mockFindUnique = vi.mocked(prisma.streak.findUnique);
const mockUpdate = vi.mocked(prisma.streak.update);

const authed = { session: { user: { id: 'u1', isAdmin: false } }, userId: 'u1' };

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/streaks/s1', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue(authed as any);
  mockSafeParseJson.mockResolvedValue({ data: { isActive: false } } as any);
  mockFindUnique.mockResolvedValue({ id: 's1', userId: 'u1', isActive: true } as any);
  mockUpdate.mockResolvedValue({ id: 's1', userId: 'u1', isActive: false } as any);
});

describe('PATCH /api/streaks/[id]', () => {
  it('returns 401 when unauthenticated', async () => {
    mockRequireAuth.mockResolvedValue({ error: 'Unauthorized', status: 401 });
    const res = await PATCH(makeRequest({ isActive: false }), makeParams('s1'));
    expect(res.status).toBe(401);
  });

  it('returns 400 when isActive is missing', async () => {
    mockSafeParseJson.mockResolvedValue({ data: {} } as any);
    const res = await PATCH(makeRequest({}), makeParams('s1'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('isActive');
  });

  it('returns 400 when isActive is not a boolean', async () => {
    mockSafeParseJson.mockResolvedValue({ data: { isActive: 'yes' } } as any);
    const res = await PATCH(makeRequest({ isActive: 'yes' }), makeParams('s1'));
    expect(res.status).toBe(400);
  });

  it('returns 404 when streak not found', async () => {
    mockFindUnique.mockResolvedValue(null);
    const res = await PATCH(makeRequest({ isActive: false }), makeParams('s1'));
    expect(res.status).toBe(404);
  });

  it('returns 404 when streak belongs to different user', async () => {
    mockFindUnique.mockResolvedValue({ id: 's1', userId: 'other_user', isActive: true } as any);
    const res = await PATCH(makeRequest({ isActive: false }), makeParams('s1'));
    expect(res.status).toBe(404);
  });

  it('updates isActive to false', async () => {
    const res = await PATCH(makeRequest({ isActive: false }), makeParams('s1'));
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 's1' }, data: { isActive: false } })
    );
  });

  it('updates isActive to true', async () => {
    mockSafeParseJson.mockResolvedValue({ data: { isActive: true } } as any);
    mockUpdate.mockResolvedValue({ id: 's1', userId: 'u1', isActive: true } as any);
    const res = await PATCH(makeRequest({ isActive: true }), makeParams('s1'));
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isActive: true } })
    );
  });
});
