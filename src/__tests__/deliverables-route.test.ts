/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Auth mocks ──────────────────────────────────────────────────────────────
vi.mock('@/lib/auth-guard', () => ({
  requireTaskAccess: vi.fn(),
  requireAuth: vi.fn(),
  authError: vi.fn((r: any) => Response.json({ error: r.error }, { status: r.status })),
}));

// ── Prisma mock ─────────────────────────────────────────────────────────────
vi.mock('@/lib/prisma', () => ({
  prisma: {
    deliverableItem: {
      aggregate: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

import { requireTaskAccess, requireAuth } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';
import { POST } from '@/app/api/tasks/[id]/deliverables/route';
import { PATCH, DELETE } from '@/app/api/deliverables/[id]/route';

const mockRequireTaskAccess = vi.mocked(requireTaskAccess);
const mockRequireAuth = vi.mocked(requireAuth);
const mockAggregate = vi.mocked(prisma.deliverableItem.aggregate);
const mockCreate = vi.mocked(prisma.deliverableItem.create);
const mockFindUnique = vi.mocked(prisma.deliverableItem.findUnique);
const mockUpdate = vi.mocked(prisma.deliverableItem.update);
const mockDelete = vi.mocked(prisma.deliverableItem.delete);

const ownerSession = {
  session: { user: { id: 'u-owner', isAdmin: false } },
  userId: 'u-owner',
  task: { id: 't1', ownerId: 'u-owner' },
};

const adminSession = {
  session: { user: { id: 'u-admin', isAdmin: true } },
  userId: 'u-admin',
  task: { id: 't1', ownerId: 'u-owner' },
};

const assigneeSession = {
  session: { user: { id: 'u-assignee', isAdmin: false } },
  userId: 'u-assignee',
  task: { id: 't1', ownerId: 'u-owner' },
};

const strangerSession = {
  session: { user: { id: 'u-stranger', isAdmin: false } },
  userId: 'u-stranger',
};

function taskParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function makeItem(overrides: Partial<{ id: string; taskId: string; text: string; isDone: boolean; position: number }> = {}) {
  return {
    id: 'di-1',
    taskId: 't1',
    text: 'Ship it',
    isDone: false,
    position: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    task: { ownerId: 'u-owner', assigneeId: null as string | null },
    ...overrides,
  };
}

// ── POST /api/tasks/[id]/deliverables ───────────────────────────────────────
describe('POST /api/tasks/[id]/deliverables', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when unauthenticated', async () => {
    mockRequireTaskAccess.mockResolvedValue({ error: 'Unauthorized', status: 401 } as any);
    const req = new Request('http://x/api/tasks/t1/deliverables', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'hi' }),
    });
    const res = await POST(req as any, taskParams('t1'));
    expect(res.status).toBe(401);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('returns 403 for non-owner/non-assignee', async () => {
    mockRequireTaskAccess.mockResolvedValue({ error: 'Forbidden', status: 403 } as any);
    const req = new Request('http://x/api/tasks/t1/deliverables', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'hi' }),
    });
    const res = await POST(req as any, taskParams('t1'));
    expect(res.status).toBe(403);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('returns 400 when text is missing', async () => {
    mockRequireTaskAccess.mockResolvedValue(ownerSession as any);
    const req = new Request('http://x/api/tasks/t1/deliverables', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const res = await POST(req as any, taskParams('t1'));
    expect(res.status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('returns 400 when text is blank', async () => {
    mockRequireTaskAccess.mockResolvedValue(ownerSession as any);
    const req = new Request('http://x/api/tasks/t1/deliverables', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: '   ' }),
    });
    const res = await POST(req as any, taskParams('t1'));
    expect(res.status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('creates item at next position and returns 201', async () => {
    mockRequireTaskAccess.mockResolvedValue(ownerSession as any);
    mockAggregate.mockResolvedValue({ _max: { position: 1 } } as any);
    const created = makeItem({ position: 2 });
    mockCreate.mockResolvedValue(created as any);

    const req = new Request('http://x/api/tasks/t1/deliverables', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'Ship it' }),
    });
    const res = await POST(req as any, taskParams('t1'));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe('di-1');
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ taskId: 't1', text: 'Ship it', position: 2, isDone: false }),
      }),
    );
  });

  it('positions first item at 0 when no items exist', async () => {
    mockRequireTaskAccess.mockResolvedValue(ownerSession as any);
    mockAggregate.mockResolvedValue({ _max: { position: null } } as any);
    mockCreate.mockResolvedValue(makeItem({ position: 0 }) as any);

    const req = new Request('http://x/api/tasks/t1/deliverables', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'First' }),
    });
    await POST(req as any, taskParams('t1'));
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ position: 0 }),
      }),
    );
  });
});

// ── PATCH /api/deliverables/[id] ─────────────────────────────────────────────
describe('PATCH /api/deliverables/[id]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when unauthenticated', async () => {
    mockRequireAuth.mockResolvedValue({ error: 'Unauthorized', status: 401 } as any);
    const req = new Request('http://x/api/deliverables/di-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isDone: true }),
    });
    const res = await PATCH(req as any, taskParams('di-1'));
    expect(res.status).toBe(401);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('returns 404 when item not found', async () => {
    mockRequireAuth.mockResolvedValue(ownerSession as any);
    mockFindUnique.mockResolvedValue(null);
    const req = new Request('http://x/api/deliverables/di-missing', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isDone: true }),
    });
    const res = await PATCH(req as any, taskParams('di-missing'));
    expect(res.status).toBe(404);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('returns 403 when user is not owner/assignee/admin', async () => {
    mockRequireAuth.mockResolvedValue(strangerSession as any);
    mockFindUnique.mockResolvedValue(makeItem() as any);
    const req = new Request('http://x/api/deliverables/di-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isDone: true }),
    });
    const res = await PATCH(req as any, taskParams('di-1'));
    expect(res.status).toBe(403);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('allows owner to toggle isDone', async () => {
    mockRequireAuth.mockResolvedValue(ownerSession as any);
    mockFindUnique.mockResolvedValue(makeItem() as any);
    const updated = makeItem({ isDone: true });
    mockUpdate.mockResolvedValue(updated as any);

    const req = new Request('http://x/api/deliverables/di-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isDone: true }),
    });
    const res = await PATCH(req as any, taskParams('di-1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.isDone).toBe(true);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isDone: true }) }),
    );
  });

  it('allows assignee to update text', async () => {
    mockRequireAuth.mockResolvedValue(assigneeSession as any);
    mockFindUnique.mockResolvedValue(makeItem({ task: { ownerId: 'u-owner', assigneeId: 'u-assignee' } }) as any);
    const updated = makeItem({ text: 'Updated text' });
    mockUpdate.mockResolvedValue(updated as any);

    const req = new Request('http://x/api/deliverables/di-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'Updated text' }),
    });
    const res = await PATCH(req as any, taskParams('di-1'));
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ text: 'Updated text' }) }),
    );
  });

  it('allows admin to update any item', async () => {
    mockRequireAuth.mockResolvedValue(adminSession as any);
    mockFindUnique.mockResolvedValue(makeItem() as any);
    mockUpdate.mockResolvedValue(makeItem({ position: 5 }) as any);

    const req = new Request('http://x/api/deliverables/di-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ position: 5 }),
    });
    const res = await PATCH(req as any, taskParams('di-1'));
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ position: 5 }) }),
    );
  });

  it('returns 400 for invalid isDone type', async () => {
    mockRequireAuth.mockResolvedValue(ownerSession as any);
    mockFindUnique.mockResolvedValue(makeItem() as any);

    const req = new Request('http://x/api/deliverables/di-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isDone: 'yes' }),
    });
    const res = await PATCH(req as any, taskParams('di-1'));
    expect(res.status).toBe(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('returns 400 for blank text', async () => {
    mockRequireAuth.mockResolvedValue(ownerSession as any);
    mockFindUnique.mockResolvedValue(makeItem() as any);

    const req = new Request('http://x/api/deliverables/di-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: '  ' }),
    });
    const res = await PATCH(req as any, taskParams('di-1'));
    expect(res.status).toBe(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('returns 400 for negative position', async () => {
    mockRequireAuth.mockResolvedValue(ownerSession as any);
    mockFindUnique.mockResolvedValue(makeItem() as any);

    const req = new Request('http://x/api/deliverables/di-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ position: -1 }),
    });
    const res = await PATCH(req as any, taskParams('di-1'));
    expect(res.status).toBe(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('returns 400 for non-integer position', async () => {
    mockRequireAuth.mockResolvedValue(ownerSession as any);
    mockFindUnique.mockResolvedValue(makeItem() as any);

    const req = new Request('http://x/api/deliverables/di-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ position: 1.5 }),
    });
    const res = await PATCH(req as any, taskParams('di-1'));
    expect(res.status).toBe(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

// ── DELETE /api/deliverables/[id] ────────────────────────────────────────────
describe('DELETE /api/deliverables/[id]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when unauthenticated', async () => {
    mockRequireAuth.mockResolvedValue({ error: 'Unauthorized', status: 401 } as any);
    const req = new Request('http://x/api/deliverables/di-1', { method: 'DELETE' });
    const res = await DELETE(req as any, taskParams('di-1'));
    expect(res.status).toBe(401);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('returns 403 for wrong user', async () => {
    mockRequireAuth.mockResolvedValue(strangerSession as any);
    mockFindUnique.mockResolvedValue(makeItem() as any);
    const req = new Request('http://x/api/deliverables/di-1', { method: 'DELETE' });
    const res = await DELETE(req as any, taskParams('di-1'));
    expect(res.status).toBe(403);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('returns 404 when item not found', async () => {
    mockRequireAuth.mockResolvedValue(ownerSession as any);
    mockFindUnique.mockResolvedValue(null);
    const req = new Request('http://x/api/deliverables/di-missing', { method: 'DELETE' });
    const res = await DELETE(req as any, taskParams('di-missing'));
    expect(res.status).toBe(404);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('deletes the item and returns 204', async () => {
    mockRequireAuth.mockResolvedValue(ownerSession as any);
    mockFindUnique.mockResolvedValue(makeItem() as any);
    mockDelete.mockResolvedValue(makeItem() as any);

    const req = new Request('http://x/api/deliverables/di-1', { method: 'DELETE' });
    const res = await DELETE(req as any, taskParams('di-1'));
    expect(res.status).toBe(204);
    expect(mockDelete).toHaveBeenCalledWith({ where: { id: 'di-1' } });
  });

  it('allows assignee to delete an item', async () => {
    mockRequireAuth.mockResolvedValue(assigneeSession as any);
    mockFindUnique.mockResolvedValue(makeItem({ task: { ownerId: 'u-owner', assigneeId: 'u-assignee' } }) as any);
    mockDelete.mockResolvedValue(makeItem() as any);

    const req = new Request('http://x/api/deliverables/di-1', { method: 'DELETE' });
    const res = await DELETE(req as any, taskParams('di-1'));
    expect(res.status).toBe(204);
    expect(mockDelete).toHaveBeenCalled();
  });
});
