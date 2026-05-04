/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth-guard', () => ({
  requireAuthFromRequest: vi.fn(),
  requireAdmin: vi.fn(),
  requireAuth: vi.fn(),
  authError: vi.fn((r: any) => Response.json({ error: r.error }, { status: r.status })),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    businessFunction: {
      findMany: vi.fn(),
    },
    process: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    processStep: {
      findMany: vi.fn(),
    },
    processExecution: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('@/lib/schemas', () => ({
  parseBody: vi.fn(),
  createBusinessFunctionSchema: {},
  createProcessStepSchema: {},
  updateProcessSchema: {},
}));

vi.mock('@/lib/process-task-generator', () => ({
  cleanupCurrentPeriodTasks: vi.fn(),
}));

vi.mock('@/lib/google-recurring-sync', () => ({
  syncManagedSeriesOverride: vi.fn(),
}));

vi.mock('@/lib/google-sync-state', () => ({
  parseLocalDateKey: vi.fn(),
}));

vi.mock('@/lib/calendar', () => ({
  deleteGoogleEvent: vi.fn(),
  getGoogleSyncInfo: vi.fn(),
}));

import { requireAuthFromRequest, requireAuth } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';
import { parseBody } from '@/lib/schemas';
import { parseLocalDateKey } from '@/lib/google-sync-state';
import { GET as listGet } from '@/app/api/processes/route';
import { GET as detailGet, PATCH as detailPatch } from '@/app/api/processes/[id]/route';
import { GET as stepsGet } from '@/app/api/processes/[id]/steps/route';

const mockRequireAuthFromRequest = vi.mocked(requireAuthFromRequest);
const mockRequireAuth = vi.mocked(requireAuth);
const mockBfFindMany = vi.mocked(prisma.businessFunction.findMany);
const mockProcessFindUnique = vi.mocked(prisma.process.findUnique);
const mockProcessStepFindMany = vi.mocked(prisma.processStep.findMany);
const mockExecutionFindFirst = vi.mocked(prisma.processExecution.findFirst);
const mockExecutionCreate = vi.mocked(prisma.processExecution.create);
const mockExecutionUpdate = vi.mocked(prisma.processExecution.update);
const mockUserFindUnique = vi.mocked(prisma.user.findUnique);
const mockParseBody = vi.mocked(parseBody);
const mockParseLocalDateKey = vi.mocked(parseLocalDateKey);

const userAuth = { session: { user: { id: 'user-A', isAdmin: false } }, userId: 'user-A' };
const adminAuth = { session: { user: { id: 'admin-1', isAdmin: true } }, userId: 'admin-1' };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/processes', () => {
  it('non-admins get an OR filter scoping to their assigneeId or active delegate', async () => {
    mockRequireAuthFromRequest.mockResolvedValue(userAuth as any);
    mockBfFindMany.mockResolvedValue([] as any);

    const request = new Request('http://localhost/api/processes') as any;
    await listGet(request);

    expect(mockBfFindMany).toHaveBeenCalledOnce();
    const args = mockBfFindMany.mock.calls[0][0] as any;

    // Outer: drop functions with no accessible processes
    expect(args.where).toEqual({
      processes: {
        some: {
          OR: [
            { assigneeId: 'user-A' },
            { delegateId: 'user-A', delegateUntil: { gte: expect.any(Date) } },
          ],
        },
      },
    });

    // Nested: only the user's own processes
    expect(args.include.processes.where).toEqual({
      OR: [
        { assigneeId: 'user-A' },
        { delegateId: 'user-A', delegateUntil: { gte: expect.any(Date) } },
      ],
    });
  });

  it('admins see all processes (no outer filter, empty nested filter)', async () => {
    mockRequireAuthFromRequest.mockResolvedValue(adminAuth as any);
    mockBfFindMany.mockResolvedValue([] as any);

    const request = new Request('http://localhost/api/processes') as any;
    await listGet(request);

    const args = mockBfFindMany.mock.calls[0][0] as any;
    expect(args.where).toBeUndefined();
    expect(args.include.processes.where).toEqual({});
  });

  it('returns 401 when unauthenticated', async () => {
    mockRequireAuthFromRequest.mockResolvedValue({ error: 'Unauthorized', status: 401 } as any);
    const request = new Request('http://localhost/api/processes') as any;
    const response = await listGet(request);
    expect(response.status).toBe(401);
    expect(mockBfFindMany).not.toHaveBeenCalled();
  });
});

describe('GET /api/processes/[id]', () => {
  const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

  it('returns 403 when a non-admin tries to read a process they do not own', async () => {
    mockRequireAuth.mockResolvedValue(userAuth as any);
    mockProcessFindUnique.mockResolvedValue({
      id: 'p-other',
      assigneeId: 'someone-else',
      delegateId: null,
      delegateUntil: null,
    } as any);

    const response = await detailGet({} as any, ctx('p-other') as any);
    expect(response.status).toBe(403);
  });

  it('returns the process when the requester is the assignee', async () => {
    mockRequireAuth.mockResolvedValue(userAuth as any);
    const proc = {
      id: 'p-mine',
      assigneeId: 'user-A',
      delegateId: null,
      delegateUntil: null,
      title: 'Mine',
    };
    mockProcessFindUnique.mockResolvedValue(proc as any);

    const response = await detailGet({} as any, ctx('p-mine') as any);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.id).toBe('p-mine');
  });

  it('returns the process for an admin even when they are not the assignee', async () => {
    mockRequireAuth.mockResolvedValue(adminAuth as any);
    mockProcessFindUnique.mockResolvedValue({
      id: 'p-other',
      assigneeId: 'someone-else',
      delegateId: null,
      delegateUntil: null,
    } as any);

    const response = await detailGet({} as any, ctx('p-other') as any);
    expect(response.status).toBe(200);
  });

  it('returns 404 when the process does not exist', async () => {
    mockRequireAuth.mockResolvedValue(userAuth as any);
    mockProcessFindUnique.mockResolvedValue(null);
    const response = await detailGet({} as any, ctx('p-nope') as any);
    expect(response.status).toBe(404);
  });
});

describe('GET /api/processes/[id]/steps', () => {
  const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

  it('returns 403 when the parent process is not accessible', async () => {
    mockRequireAuth.mockResolvedValue(userAuth as any);
    mockProcessFindUnique.mockResolvedValue({
      id: 'p-other',
      assigneeId: 'someone-else',
      delegateId: null,
      delegateUntil: null,
    } as any);

    const response = await stepsGet({} as any, ctx('p-other') as any);
    expect(response.status).toBe(403);
    expect(mockProcessStepFindMany).not.toHaveBeenCalled();
  });

  it('returns steps when the requester is the assignee', async () => {
    mockRequireAuth.mockResolvedValue(userAuth as any);
    mockProcessFindUnique.mockResolvedValue({
      id: 'p-mine',
      assigneeId: 'user-A',
      delegateId: null,
      delegateUntil: null,
    } as any);
    mockProcessStepFindMany.mockResolvedValue([{ id: 's1' }] as any);

    const response = await stepsGet({} as any, ctx('p-mine') as any);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual([{ id: 's1' }]);
  });
});

describe('PATCH /api/processes/[id]', () => {
  const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
  const fastPathBody = {
    scheduledDate: '2026-05-04',
    timeBlockStart: '2026-05-04T09:00:00.000Z',
    timeBlockEnd: '2026-05-04T10:00:00.000Z',
  };

  it('returns 403 and does not touch ProcessExecution when a non-owner hits the fast path', async () => {
    mockRequireAuth.mockResolvedValue(userAuth as any);
    mockParseBody.mockResolvedValue({ data: fastPathBody } as any);
    mockProcessFindUnique.mockResolvedValue({
      id: 'p-other',
      assigneeId: 'someone-else',
      delegateId: null,
      delegateUntil: null,
    } as any);

    const response = await detailPatch({} as any, ctx('p-other') as any);

    expect(response.status).toBe(403);
    expect(mockExecutionFindFirst).not.toHaveBeenCalled();
    expect(mockExecutionCreate).not.toHaveBeenCalled();
    expect(mockExecutionUpdate).not.toHaveBeenCalled();
  });

  it('allows the assignee to retime an execution via the fast path', async () => {
    mockRequireAuth.mockResolvedValue(userAuth as any);
    mockParseBody.mockResolvedValue({ data: fastPathBody } as any);
    mockProcessFindUnique.mockResolvedValue({
      id: 'p-mine',
      assigneeId: 'user-A',
      delegateId: null,
      delegateUntil: null,
    } as any);
    mockUserFindUnique.mockResolvedValue({ timezone: 'America/New_York' } as any);
    mockParseLocalDateKey.mockReturnValue(new Date('2026-05-04T04:00:00.000Z'));
    mockExecutionFindFirst.mockResolvedValue(null);
    mockExecutionCreate.mockResolvedValue({ id: 'exec-new', scheduledDate: new Date('2026-05-04T04:00:00.000Z') } as any);
    mockExecutionUpdate.mockResolvedValue({
      id: 'exec-new',
      scheduledDate: new Date('2026-05-04T04:00:00.000Z'),
      timeBlockStart: new Date(fastPathBody.timeBlockStart),
      timeBlockEnd: new Date(fastPathBody.timeBlockEnd),
    } as any);

    const response = await detailPatch({} as any, ctx('p-mine') as any);

    expect(response.status).toBe(200);
    expect(mockExecutionUpdate).toHaveBeenCalledOnce();
  });

  it('allows an admin to retime any process via the fast path', async () => {
    mockRequireAuth.mockResolvedValue(adminAuth as any);
    mockParseBody.mockResolvedValue({ data: fastPathBody } as any);
    mockProcessFindUnique.mockResolvedValue({
      id: 'p-other',
      assigneeId: 'someone-else',
      delegateId: null,
      delegateUntil: null,
    } as any);
    mockUserFindUnique.mockResolvedValue({ timezone: 'UTC' } as any);
    mockParseLocalDateKey.mockReturnValue(new Date('2026-05-04T00:00:00.000Z'));
    mockExecutionFindFirst.mockResolvedValue({ id: 'exec-existing' } as any);
    mockExecutionUpdate.mockResolvedValue({
      id: 'exec-existing',
      scheduledDate: new Date('2026-05-04T00:00:00.000Z'),
      timeBlockStart: new Date(fastPathBody.timeBlockStart),
      timeBlockEnd: new Date(fastPathBody.timeBlockEnd),
    } as any);

    const response = await detailPatch({} as any, ctx('p-other') as any);

    expect(response.status).toBe(200);
    expect(mockExecutionCreate).not.toHaveBeenCalled();
    expect(mockExecutionUpdate).toHaveBeenCalledOnce();
  });
});
