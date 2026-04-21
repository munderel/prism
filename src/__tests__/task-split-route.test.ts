/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth-guard', () => ({
  requireAuth: vi.fn(),
  authError: vi.fn((r: any) => Response.json({ error: r.error }, { status: r.status })),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    task: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock('@/lib/schemas', () => ({
  parseBody: vi.fn(),
  splitTaskSchema: {},
}));

vi.mock('@/lib/api-helpers', () => ({
  notFoundResponse: vi.fn((e: string) => Response.json({ error: `${e} not found` }, { status: 404 })),
  forbiddenResponse: vi.fn(() => Response.json({ error: 'Forbidden' }, { status: 403 })),
  hasAccess: vi.fn((ownerId: string, userId: string, isAdmin: boolean) => isAdmin || ownerId === userId),
}));

import { requireAuth } from '@/lib/auth-guard';
import { parseBody } from '@/lib/schemas';
import { prisma } from '@/lib/prisma';
import { POST } from '@/app/api/tasks/[id]/split/route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockParseBody = vi.mocked(parseBody);
const mockFindUnique = vi.mocked(prisma.task.findUnique);
const mockTransaction = vi.mocked(prisma.$transaction);

const authed = { session: { user: { id: 'user1', isAdmin: false } }, userId: 'user1' };
const params = Promise.resolve({ id: 'task-1' });

const basicParent = {
  id: 'task-1',
  ownerId: 'user1',
  assigneeId: null,
  goalId: null,
  processId: null,
  parentId: null,
  taskType: 'IMPROVE',
  priority: 'MEDIUM',
  description: null,
  _count: { workBlocks: 0, children: 0 },
  completionSnapshot: null,
};

describe('POST /api/tasks/[id]/split', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue(authed as any);
    mockParseBody.mockResolvedValue({
      data: {
        sessions: [
          { title: 'One', durationMinutes: 30 },
          { title: 'Two', durationMinutes: 45 },
        ],
      },
    } as any);
  });

  it('rejects when the parent has existing work blocks (409 with actionable message)', async () => {
    mockFindUnique.mockResolvedValue({ ...basicParent, _count: { workBlocks: 2, children: 0 } } as any);
    const req = new Request('http://localhost/api/tasks/task-1/split', { method: 'POST' }) as any;
    const res = await POST(req, { params });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/work blocks/i);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('rejects when the parent has existing children', async () => {
    mockFindUnique.mockResolvedValue({ ...basicParent, _count: { workBlocks: 0, children: 3 } } as any);
    const req = new Request('http://localhost/api/tasks/task-1/split', { method: 'POST' }) as any;
    const res = await POST(req, { params });
    expect(res.status).toBe(409);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('rejects when the parent has a completion snapshot', async () => {
    mockFindUnique.mockResolvedValue({ ...basicParent, completionSnapshot: { taskId: 'task-1' } } as any);
    const req = new Request('http://localhost/api/tasks/task-1/split', { method: 'POST' }) as any;
    const res = await POST(req, { params });
    expect(res.status).toBe(409);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('rejects when the parent is itself a subtask', async () => {
    mockFindUnique.mockResolvedValue({ ...basicParent, parentId: 'task-0' } as any);
    const req = new Request('http://localhost/api/tasks/task-1/split', { method: 'POST' }) as any;
    const res = await POST(req, { params });
    expect(res.status).toBe(409);
  });

  it('creates children sequentially (preserving input order) when all checks pass', async () => {
    mockFindUnique.mockResolvedValue(basicParent as any);
    // Simulate $transaction executing the callback and returning what it produces.
    const created: any[] = [];
    mockTransaction.mockImplementation(async (cb: any) => {
      const tx = {
        task: {
          create: vi.fn(async ({ data }: any) => {
            const rec = { id: `child-${created.length}`, createdAt: new Date(), ...data };
            created.push(rec);
            return rec;
          }),
          update: vi.fn(async () => ({})),
        },
      };
      return cb(tx);
    });

    const req = new Request('http://localhost/api/tasks/task-1/split', { method: 'POST' }) as any;
    const res = await POST(req, { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.subtasks).toHaveLength(2);
    expect(body.subtasks.map((s: any) => s.title)).toEqual(['One', 'Two']);
  });
});
