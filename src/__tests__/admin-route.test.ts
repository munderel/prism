/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth-guard', () => ({
  requireAdmin: vi.fn(),
  authError: vi.fn((r: any) => Response.json({ error: r.error }, { status: r.status })),
}));

vi.mock('@/lib/api-helpers', () => ({
  safeParseJson: vi.fn(),
  NO_STORE: { headers: { 'Cache-Control': 'no-store' } },
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

import { requireAdmin } from '@/lib/auth-guard';
import { safeParseJson } from '@/lib/api-helpers';
import { prisma } from '@/lib/prisma';
import { GET, PATCH, DELETE } from '@/app/api/admin/route';

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockSafeParseJson = vi.mocked(safeParseJson);
const mockUserFindMany = vi.mocked(prisma.user.findMany);
const mockUserUpdate = vi.mocked(prisma.user.update);
const mockUserDelete = vi.mocked(prisma.user.delete);

const adminSession = { session: { user: { id: 'admin1', isAdmin: true } }, userId: 'admin1' };

function createRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/admin', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as any;
}

describe('GET /api/admin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 403 for non-admin', async () => {
    mockRequireAdmin.mockResolvedValue({ error: 'Forbidden', status: 403 });
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it('returns all users for admin', async () => {
    mockRequireAdmin.mockResolvedValue(adminSession as any);
    const users = [
      { id: 'u1', name: 'User 1', email: 'u1@test.com', isAdmin: false, createdAt: new Date() },
    ];
    mockUserFindMany.mockResolvedValue(users as any);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
  });
});

describe('PATCH /api/admin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(adminSession as any);
  });

  it('returns 400 when userId is missing', async () => {
    mockSafeParseJson.mockResolvedValue({ data: { isAdmin: true } } as any);
    const res = await PATCH(createRequest({ isAdmin: true }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('userId is required');
  });

  it('blocks self-demotion', async () => {
    mockSafeParseJson.mockResolvedValue({ data: { userId: 'admin1', isAdmin: false } } as any);
    const res = await PATCH(createRequest({ userId: 'admin1', isAdmin: false }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Cannot remove your own admin role');
  });

  it('promotes user to admin', async () => {
    mockSafeParseJson.mockResolvedValue({ data: { userId: 'user1', isAdmin: true } } as any);
    mockUserUpdate.mockResolvedValue({ id: 'user1', name: 'User', isAdmin: true } as any);
    const res = await PATCH(createRequest({ userId: 'user1', isAdmin: true }));
    expect(res.status).toBe(200);
    expect(mockUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user1' },
        data: { isAdmin: true },
      })
    );
  });

  it('demotes another user', async () => {
    mockSafeParseJson.mockResolvedValue({ data: { userId: 'user2', isAdmin: false } } as any);
    mockUserUpdate.mockResolvedValue({ id: 'user2', name: 'User', isAdmin: false } as any);
    const res = await PATCH(createRequest({ userId: 'user2', isAdmin: false }));
    expect(res.status).toBe(200);
  });

  it('returns 403 for non-admin', async () => {
    mockRequireAdmin.mockResolvedValue({ error: 'Forbidden', status: 403 });
    const res = await PATCH(createRequest({ userId: 'user1', isAdmin: true }));
    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/admin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(adminSession as any);
  });

  it('returns 400 when userId is missing', async () => {
    mockSafeParseJson.mockResolvedValue({ data: {} } as any);
    const res = await DELETE(createRequest({}));
    expect(res.status).toBe(400);
  });

  it('blocks self-deletion', async () => {
    mockSafeParseJson.mockResolvedValue({ data: { userId: 'admin1' } } as any);
    const res = await DELETE(createRequest({ userId: 'admin1' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Cannot delete yourself');
  });

  it('deletes another user', async () => {
    mockSafeParseJson.mockResolvedValue({ data: { userId: 'user1' } } as any);
    mockUserDelete.mockResolvedValue({} as any);
    const res = await DELETE(createRequest({ userId: 'user1' }));
    expect(res.status).toBe(200);
    expect(mockUserDelete).toHaveBeenCalledWith({ where: { id: 'user1' } });
  });

  it('returns 403 for non-admin', async () => {
    mockRequireAdmin.mockResolvedValue({ error: 'Forbidden', status: 403 });
    const res = await DELETE(createRequest({ userId: 'user1' }));
    expect(res.status).toBe(403);
  });
});
