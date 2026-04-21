/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth-guard', () => ({
  requireTaskAccess: vi.fn(),
  authError: vi.fn((r: any) => Response.json({ error: r.error }, { status: r.status })),
}));

vi.mock('@/lib/schemas', () => ({
  parseBody: vi.fn(),
  createClearGoalSchema: {},
  updateClearGoalsSchema: {},
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    clearGoal: {
      findMany: vi.fn(),
      aggregate: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(async (ops: unknown[]) => ops),
  },
}));

import { requireTaskAccess } from '@/lib/auth-guard';
import { parseBody } from '@/lib/schemas';
import { prisma } from '@/lib/prisma';
import {
  GET,
  POST,
  PATCH,
  DELETE,
} from '@/app/api/tasks/[id]/clear-goals/route';

const mockRequireTaskAccess = vi.mocked(requireTaskAccess);
const mockParseBody = vi.mocked(parseBody);
const mockFindMany = vi.mocked(prisma.clearGoal.findMany);
const mockAggregate = vi.mocked(prisma.clearGoal.aggregate);
const mockCreate = vi.mocked(prisma.clearGoal.create);
const mockUpdateMany = vi.mocked(prisma.clearGoal.updateMany);
const mockDeleteMany = vi.mocked(prisma.clearGoal.deleteMany);

const ownerSession = {
  session: { user: { id: 'u-owner', isAdmin: false } },
  userId: 'u-owner',
  task: { id: 't1', ownerId: 'u-owner' },
};

function paramsFor(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('clear-goals route — ownership enforcement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('when requireTaskAccess rejects', () => {
    const forbidden = { error: 'Forbidden', status: 403 as const };

    it('GET returns 403 for non-owner/non-assignee/non-admin', async () => {
      mockRequireTaskAccess.mockResolvedValue(forbidden as any);
      const res = await GET(new Request('http://x/api/tasks/t1/clear-goals') as any, paramsFor('t1'));
      expect(res.status).toBe(403);
      expect(mockFindMany).not.toHaveBeenCalled();
    });

    it('POST returns 403', async () => {
      mockRequireTaskAccess.mockResolvedValue(forbidden as any);
      const req = new Request('http://x/api/tasks/t1/clear-goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'hi' }),
      });
      const res = await POST(req as any, paramsFor('t1'));
      expect(res.status).toBe(403);
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('PATCH returns 403', async () => {
      mockRequireTaskAccess.mockResolvedValue(forbidden as any);
      const req = new Request('http://x/api/tasks/t1/clear-goals', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goals: [] }),
      });
      const res = await PATCH(req as any, paramsFor('t1'));
      expect(res.status).toBe(403);
      expect(mockUpdateMany).not.toHaveBeenCalled();
    });

    it('DELETE returns 403', async () => {
      mockRequireTaskAccess.mockResolvedValue(forbidden as any);
      const req = new Request('http://x/api/tasks/t1/clear-goals?goalId=cg1', {
        method: 'DELETE',
      });
      const res = await DELETE(req as any, paramsFor('t1'));
      expect(res.status).toBe(403);
      expect(mockDeleteMany).not.toHaveBeenCalled();
    });

    it('GET returns 404 when task does not exist', async () => {
      mockRequireTaskAccess.mockResolvedValue({ error: 'Task not found', status: 404 } as any);
      const res = await GET(new Request('http://x/api/tasks/missing/clear-goals') as any, paramsFor('missing'));
      expect(res.status).toBe(404);
      expect(mockFindMany).not.toHaveBeenCalled();
    });

    it('DELETE returns 401 when unauthenticated', async () => {
      mockRequireTaskAccess.mockResolvedValue({ error: 'Unauthorized', status: 401 } as any);
      const res = await DELETE(
        new Request('http://x/api/tasks/t1/clear-goals?goalId=cg1', { method: 'DELETE' }) as any,
        paramsFor('t1'),
      );
      expect(res.status).toBe(401);
    });
  });

  describe('when requireTaskAccess grants', () => {
    beforeEach(() => {
      mockRequireTaskAccess.mockResolvedValue(ownerSession as any);
    });

    it('GET returns clear goals scoped to the task', async () => {
      mockFindMany.mockResolvedValue([{ id: 'cg1', taskId: 't1', text: 'a', sortOrder: 0 }] as any);
      const res = await GET(new Request('http://x/api/tasks/t1/clear-goals') as any, paramsFor('t1'));
      expect(res.status).toBe(200);
      expect(mockFindMany).toHaveBeenCalledWith({
        where: { taskId: 't1' },
        orderBy: { sortOrder: 'asc' },
      });
    });

    it('PATCH scopes each update with both {id, taskId}', async () => {
      // Hostile input: an id that lives on a different task. Composite
      // predicate ensures updateMany returns count=0, so nothing changes.
      mockParseBody.mockResolvedValue({
        data: {
          goals: [
            { id: 'cg1', text: 'ok' },
            { id: 'cg-belongs-to-attacker', isComplete: true },
          ],
        },
      } as any);
      mockFindMany.mockResolvedValue([] as any);
      const req = new Request('http://x/api/tasks/t1/clear-goals', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      await PATCH(req as any, paramsFor('t1'));
      expect(mockUpdateMany).toHaveBeenCalledTimes(2);
      for (const call of mockUpdateMany.mock.calls) {
        expect((call[0] as any).where.taskId).toBe('t1');
      }
    });

    it('DELETE scopes deleteMany to {id, taskId}', async () => {
      const req = new Request('http://x/api/tasks/t1/clear-goals?goalId=cg1', { method: 'DELETE' });
      const res = await DELETE(req as any, paramsFor('t1'));
      expect(res.status).toBe(200);
      expect(mockDeleteMany).toHaveBeenCalledWith({ where: { id: 'cg1', taskId: 't1' } });
    });

    it('DELETE returns 400 when goalId missing', async () => {
      const req = new Request('http://x/api/tasks/t1/clear-goals', { method: 'DELETE' });
      const res = await DELETE(req as any, paramsFor('t1'));
      expect(res.status).toBe(400);
      expect(mockDeleteMany).not.toHaveBeenCalled();
    });

    it('POST writes a clearGoal scoped to the task', async () => {
      mockParseBody.mockResolvedValue({ data: { text: 'hello' } } as any);
      mockAggregate.mockResolvedValue({ _max: { sortOrder: 2 } } as any);
      mockCreate.mockResolvedValue({ id: 'cg-new', taskId: 't1', text: 'hello', sortOrder: 3 } as any);
      const req = new Request('http://x/api/tasks/t1/clear-goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'hello' }),
      });
      const res = await POST(req as any, paramsFor('t1'));
      expect(res.status).toBe(201);
      expect((mockCreate.mock.calls[0][0] as any).data.taskId).toBe('t1');
    });
  });
});
