/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth-guard', () => ({
  requireAuth: vi.fn(),
  requireTaskAccess: vi.fn(),
  authError: vi.fn((r: any) => Response.json({ error: r.error }, { status: r.status ?? 401 })),
}));

vi.mock('@/lib/schemas', () => ({
  parseBody: vi.fn(),
  updateWorkBlockSchema: {},
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    workBlock: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      // update returns a real promise so that .catch() chained on it in the route works.
      update: vi.fn().mockResolvedValue({}),
      delete: vi.fn(),
    },
    clearGoal: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('@/lib/calendar', () => ({
  createGoogleEvent: vi.fn(),
  updateGoogleEvent: vi.fn(),
  deleteGoogleEvent: vi.fn(),
  getGoogleSyncInfo: vi.fn(() => Promise.resolve({ hasGoogle: false, calendarId: 'primary' })),
}));

vi.mock('@/lib/work-block-sync', () => ({
  buildWorkBlockEventBody: vi.fn(() => ({ summary: 'Test', description: 'Desc' })),
}));

vi.mock('@/lib/api-helpers', () => ({
  NO_STORE: { headers: { 'Cache-Control': 'no-store' } },
}));

import { requireAuth, requireTaskAccess } from '@/lib/auth-guard';
import { parseBody } from '@/lib/schemas';
import { prisma } from '@/lib/prisma';
import { GET, PATCH, DELETE } from '@/app/api/work-blocks/[id]/route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockRequireTaskAccess = vi.mocked(requireTaskAccess);
const mockParseBody = vi.mocked(parseBody);

const authed = { session: { user: { id: 'u1', isAdmin: false } }, userId: 'u1' };

function paramsFor(id: string) {
  return { params: Promise.resolve({ id }) };
}

const baseBlock = {
  id: 'wb-1',
  taskId: 't-1',
  userId: 'u1',
  start: new Date('2026-05-20T10:00:00Z'),
  end: new Date('2026-05-20T11:00:00Z'),
  mainObjective: 'Write the spec',
  completionStatus: 'PENDING',
  actualMinutes: null,
  notes: null,
  calendarEventId: null,
  task: {
    id: 't-1',
    title: 'Big task',
    taskType: 'IMPROVE',
    priority: 'MEDIUM',
    estimatedMinutes: 90,
    status: 'TODO',
    dueDate: null,
    goal: { id: 'g-1', title: 'My Goal' },
  },
  clearGoals: [
    { id: 'cg-1', text: 'Outline drafted', isComplete: false, sortOrder: 0, workBlockId: 'wb-1', taskId: 't-1' },
  ],
};

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

describe('GET /api/work-blocks/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue(authed as any);
  });

  it('returns 404 when block does not exist', async () => {
    vi.mocked(prisma.workBlock.findFirst).mockResolvedValue(null);
    const req = new Request('http://localhost/api/work-blocks/wb-1');
    const res = await GET(req as any, paramsFor('wb-1'));
    expect(res.status).toBe(404);
  });

  it('returns the block with task and goal enrichment', async () => {
    vi.mocked(prisma.workBlock.findFirst).mockResolvedValue(baseBlock as any);
    const req = new Request('http://localhost/api/work-blocks/wb-1');
    const res = await GET(req as any, paramsFor('wb-1'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.id).toBe('wb-1');
    expect(json.task.goal.title).toBe('My Goal');
    expect(json.clearGoals).toHaveLength(1);
  });

  it('returns 401 when not authenticated', async () => {
    mockRequireAuth.mockResolvedValue({ error: 'Unauthorized', status: 401 } as any);
    const req = new Request('http://localhost/api/work-blocks/wb-1');
    const res = await GET(req as any, paramsFor('wb-1'));
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// PATCH
// ---------------------------------------------------------------------------

describe('PATCH /api/work-blocks/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue(authed as any);
    mockRequireTaskAccess.mockResolvedValue({ task: { id: 't-1', ownerId: 'u1' } } as any);
    vi.mocked(prisma.workBlock.findFirst).mockResolvedValue(baseBlock as any);
    // $transaction returns the last step's value (findUnique)
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => {
      // Simulate transaction: provide a tx proxy that returns updated block
      const txProxy = {
        workBlock: {
          update: vi.fn().mockResolvedValue(baseBlock),
          findUnique: vi.fn().mockResolvedValue({ ...baseBlock, mainObjective: 'Updated' }),
        },
        clearGoal: {
          deleteMany: vi.fn().mockResolvedValue({}),
          createMany: vi.fn().mockResolvedValue({}),
        },
      };
      return fn(txProxy);
    });
    vi.mocked(prisma.workBlock.findUnique).mockResolvedValue({ ...baseBlock, mainObjective: 'Updated' } as any);
  });

  it('returns 404 when block does not exist', async () => {
    vi.mocked(prisma.workBlock.findFirst).mockResolvedValue(null);
    mockParseBody.mockResolvedValue({ data: { mainObjective: 'X' } } as any);
    const req = new Request('http://localhost/api/work-blocks/wb-1', { method: 'PATCH' });
    const res = await PATCH(req as any, paramsFor('wb-1'));
    expect(res.status).toBe(404);
  });

  it('returns 400 when body is invalid', async () => {
    mockParseBody.mockResolvedValue({
      error: Response.json({ error: 'Validation failed' }, { status: 400 }),
    } as any);
    const req = new Request('http://localhost/api/work-blocks/wb-1', { method: 'PATCH' });
    const res = await PATCH(req as any, paramsFor('wb-1'));
    expect(res.status).toBe(400);
  });

  it('patches all editable fields including notes and actualMinutes', async () => {
    mockParseBody.mockResolvedValue({
      data: {
        mainObjective: 'Updated',
        notes: 'Great session',
        actualMinutes: 55,
        completionStatus: 'COMPLETED',
        clearGoals: ['Goal A', 'Goal B'],
      },
    } as any);
    const req = new Request('http://localhost/api/work-blocks/wb-1', { method: 'PATCH' });
    const res = await PATCH(req as any, paramsFor('wb-1'));
    // Should not error (200 or the mock returns the block)
    expect([200, 201]).toContain(res.status);
  });

  it('returns 400 when end is not after start', async () => {
    // Both start and end provided with end <= start
    mockParseBody.mockResolvedValue({
      data: {
        start: '2026-05-20T11:00:00.000Z',
        end: '2026-05-20T10:00:00.000Z',
      },
    } as any);
    const req = new Request('http://localhost/api/work-blocks/wb-1', { method: 'PATCH' });
    const res = await PATCH(req as any, paramsFor('wb-1'));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/end must be after start/i);
  });
});

// ---------------------------------------------------------------------------
// DELETE
// ---------------------------------------------------------------------------

describe('DELETE /api/work-blocks/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue(authed as any);
    mockRequireTaskAccess.mockResolvedValue({ task: { id: 't-1', ownerId: 'u1' } } as any);
    vi.mocked(prisma.workBlock.findFirst).mockResolvedValue(baseBlock as any);
    vi.mocked(prisma.workBlock.delete).mockResolvedValue(baseBlock as any);
  });

  it('deletes the block and returns ok', async () => {
    const req = new Request('http://localhost/api/work-blocks/wb-1', { method: 'DELETE' });
    const res = await DELETE(req as any, paramsFor('wb-1'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });

  it('returns 404 when block does not exist', async () => {
    vi.mocked(prisma.workBlock.findFirst).mockResolvedValue(null);
    const req = new Request('http://localhost/api/work-blocks/wb-1', { method: 'DELETE' });
    const res = await DELETE(req as any, paramsFor('wb-1'));
    expect(res.status).toBe(404);
  });
});
