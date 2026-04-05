/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth-guard', () => ({
  requireAuth: vi.fn(),
  requireAdmin: vi.fn(),
  authError: vi.fn((r: any) => Response.json({ error: r.error }, { status: r.status })),
}));

vi.mock('@/lib/api-helpers', () => ({
  cacheHeaders: vi.fn(() => ({})),
  notFoundResponse: vi.fn((e: string) => Response.json({ error: `${e} not found` }, { status: 404 })),
  forbiddenResponse: vi.fn(() => Response.json({ error: 'Forbidden' }, { status: 403 })),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    goal: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      count: vi.fn(),
    },
    goalStack: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

vi.mock('@/lib/schemas', () => ({
  parseBody: vi.fn(),
  createGoalSchema: {},
}));

vi.mock('@/lib/goal-validation', () => ({
  validateGoalLevel: vi.fn(),
}));

vi.mock('@/lib/progress', () => ({
  cascadeProgressUp: vi.fn(),
}));

import { requireAuth, requireAdmin } from '@/lib/auth-guard';
import { parseBody } from '@/lib/schemas';
import { validateGoalLevel } from '@/lib/goal-validation';
import { prisma } from '@/lib/prisma';
import { GET, POST } from '@/app/api/goals/route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockRequireAdmin = vi.mocked(requireAdmin);
const mockParseBody = vi.mocked(parseBody);
const mockValidateGoalLevel = vi.mocked(validateGoalLevel);
const mockGoalCreate = vi.mocked(prisma.goal.create);
const mockGoalFindUnique = vi.mocked(prisma.goal.findUnique);
const mockGoalFindMany = vi.mocked(prisma.goal.findMany);
const mockGoalCount = vi.mocked(prisma.goal.count);
const mockStackFindUnique = vi.mocked(prisma.goalStack.findUnique);
const mockStackFindMany = vi.mocked(prisma.goalStack.findMany);

const authedResult = { session: { user: { id: 'user1', isAdmin: false } }, userId: 'user1' };
const adminResult = { session: { user: { id: 'admin1', isAdmin: true } }, userId: 'admin1' };

function createGetRequest(params: Record<string, string> = {}) {
  const url = new URL('http://localhost/api/goals');
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return { url: url.toString(), nextUrl: url } as any;
}

describe('GET /api/goals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue(authedResult as any);
  });

  it('returns 401 when unauthenticated', async () => {
    mockRequireAuth.mockResolvedValue({ error: 'Unauthorized', status: 401 });
    const res = await GET(createGetRequest({ stackId: 'stack-1' }));
    expect(res.status).toBe(401);
  });

  it('returns 400 when stackId is missing and no isCompany/level params', async () => {
    const res = await GET(createGetRequest());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('stackId is required');
  });

  it('returns 404 when stack not found', async () => {
    mockStackFindUnique.mockResolvedValue(null);
    const res = await GET(createGetRequest({ stackId: 'nonexistent' }));
    expect(res.status).toBe(404);
  });

  it('returns 403 when non-admin accesses another user\'s stack', async () => {
    mockStackFindUnique.mockResolvedValue({ id: 'stack-2', ownerId: 'other', isCompany: false } as any);
    const res = await GET(createGetRequest({ stackId: 'stack-2' }));
    expect(res.status).toBe(403);
  });

  it('returns goals for own stack', async () => {
    mockStackFindUnique.mockResolvedValue({ id: 'stack-1', ownerId: 'user1', isCompany: false } as any);
    mockGoalFindMany.mockResolvedValue([{ id: 'g1', title: 'Goal 1' }] as any);
    const res = await GET(createGetRequest({ stackId: 'stack-1' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
  });

  it('returns goals when querying by isCompany without stackId', async () => {
    mockStackFindMany.mockResolvedValue([{ id: 'company-stack' }] as any);
    mockGoalFindMany.mockResolvedValue([{ id: 'g1' }] as any);
    const res = await GET(createGetRequest({ isCompany: 'true' }));
    expect(res.status).toBe(200);
  });

  it('returns empty array when no stacks match isCompany query', async () => {
    mockStackFindMany.mockResolvedValue([]);
    const res = await GET(createGetRequest({ isCompany: 'true' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });
});

describe('POST /api/goals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue(authedResult as any);
    mockRequireAdmin.mockResolvedValue(adminResult as any);
    mockValidateGoalLevel.mockReturnValue(true);
    mockGoalCount.mockResolvedValue(0);
    mockGoalCreate.mockResolvedValue({ id: 'new-goal', title: 'Test Goal' } as any);
  });

  it('returns 401 when unauthenticated', async () => {
    mockRequireAuth.mockResolvedValue({ error: 'Unauthorized', status: 401 });
    const req = new Request('http://localhost/api/goals', { method: 'POST' }) as any;
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('returns 404 when stack not found', async () => {
    mockParseBody.mockResolvedValue({
      data: { stackId: 'nonexistent', level: 'HIGH_HARD', title: 'Goal' },
    } as any);
    mockStackFindUnique.mockResolvedValue(null);
    const req = new Request('http://localhost/api/goals', { method: 'POST' }) as any;
    const res = await POST(req);
    expect(res.status).toBe(404);
  });

  it('requires admin for company stack', async () => {
    mockParseBody.mockResolvedValue({
      data: { stackId: 'company-stack', level: 'HIGH_HARD', title: 'Company Goal' },
    } as any);
    mockStackFindUnique.mockResolvedValue({ id: 'company-stack', isCompany: true, ownerId: 'admin1' } as any);
    mockRequireAdmin.mockResolvedValue({ error: 'Forbidden', status: 403 });

    const req = new Request('http://localhost/api/goals', { method: 'POST' }) as any;
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it('returns 403 when non-admin creates goal in another user\'s stack', async () => {
    mockParseBody.mockResolvedValue({
      data: { stackId: 'other-stack', level: 'HIGH_HARD', title: 'Goal' },
    } as any);
    mockStackFindUnique.mockResolvedValue({ id: 'other-stack', isCompany: false, ownerId: 'other-user' } as any);

    const req = new Request('http://localhost/api/goals', { method: 'POST' }) as any;
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it('rejects invalid level hierarchy', async () => {
    mockParseBody.mockResolvedValue({
      data: { stackId: 'stack-1', level: 'WEEKLY', title: 'Goal', parentId: 'parent-1' },
    } as any);
    mockStackFindUnique.mockResolvedValue({ id: 'stack-1', isCompany: false, ownerId: 'user1' } as any);
    mockGoalFindUnique.mockResolvedValue({ level: 'HIGH_HARD', stackId: 'stack-1', deletedAt: null } as any);
    mockValidateGoalLevel.mockReturnValue(false);

    const req = new Request('http://localhost/api/goals', { method: 'POST' }) as any;
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('cannot be a child of');
  });

  it('rejects deleted parent goal', async () => {
    mockParseBody.mockResolvedValue({
      data: { stackId: 'stack-1', level: 'STRATEGIC', title: 'Goal', parentId: 'deleted-parent' },
    } as any);
    mockStackFindUnique.mockResolvedValue({ id: 'stack-1', isCompany: false, ownerId: 'user1' } as any);
    mockGoalFindUnique.mockResolvedValue({ level: 'HIGH_HARD', stackId: 'stack-1', deletedAt: new Date() } as any);

    const req = new Request('http://localhost/api/goals', { method: 'POST' }) as any;
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Invalid parent');
  });

  it('rejects parent from different stack', async () => {
    mockParseBody.mockResolvedValue({
      data: { stackId: 'stack-1', level: 'STRATEGIC', title: 'Goal', parentId: 'parent-other-stack' },
    } as any);
    mockStackFindUnique.mockResolvedValue({ id: 'stack-1', isCompany: false, ownerId: 'user1' } as any);
    mockGoalFindUnique.mockResolvedValue({ level: 'HIGH_HARD', stackId: 'stack-2', deletedAt: null } as any);

    const req = new Request('http://localhost/api/goals', { method: 'POST' }) as any;
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Invalid parent');
  });

  it('creates goal with valid input', async () => {
    mockParseBody.mockResolvedValue({
      data: { stackId: 'stack-1', level: 'HIGH_HARD', title: 'My Goal' },
    } as any);
    mockStackFindUnique.mockResolvedValue({ id: 'stack-1', isCompany: false, ownerId: 'user1' } as any);

    const req = new Request('http://localhost/api/goals', { method: 'POST' }) as any;
    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(mockGoalCreate).toHaveBeenCalled();
  });
});
