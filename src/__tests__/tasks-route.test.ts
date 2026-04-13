/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth-guard', () => ({
  requireAuth: vi.fn(),
  authError: vi.fn((r: any) => Response.json({ error: r.error }, { status: r.status })),
  checkStackAccess: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    task: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    goal: { findUnique: vi.fn(), findMany: vi.fn() },
    goalStack: { findMany: vi.fn() },
    process: { findUnique: vi.fn() },
  },
}));

vi.mock('@/lib/schemas', () => ({
  parseBody: vi.fn(),
  createTaskSchema: {},
  updateTaskSchema: {},
}));

vi.mock('@/lib/recurrence', () => ({
  parseRRule: vi.fn(),
  getNextOccurrence: vi.fn(),
}));

vi.mock('@/lib/date-utils', () => ({
  parseLocalDate: vi.fn((d: string) => new Date(d)),
}));

vi.mock('@/lib/calendar', () => ({
  syncTaskCalendarEvent: vi.fn(),
  createGoogleEvent: vi.fn(),
  updateGoogleEvent: vi.fn(),
  deleteGoogleEvent: vi.fn(),
  getGoogleSyncInfo: vi.fn(() => Promise.resolve({ hasGoogle: false })),
}));

vi.mock('@/lib/task-helpers', () => ({
  unflagOtherWinTheDay: vi.fn(),
}));

vi.mock('@/lib/process-task-checker', () => ({
  checkAndCreateDueProcessTasks: vi.fn(),
}));

vi.mock('@/lib/progress', () => ({
  cascadeProgressUp: vi.fn(),
}));

vi.mock('@/lib/api-helpers', () => ({
  cacheHeaders: vi.fn(() => ({})),
  notFoundResponse: vi.fn((e: string) => Response.json({ error: `${e} not found` }, { status: 404 })),
  forbiddenResponse: vi.fn(() => Response.json({ error: 'Forbidden' }, { status: 403 })),
  hasAccess: vi.fn((ownerId: string, userId: string, isAdmin: boolean) => isAdmin || ownerId === userId),
  pickDefined: vi.fn((obj: any, fields: string[]) => {
    const r: any = {};
    for (const f of fields) { if (obj[f] !== undefined) r[f] = obj[f]; }
    return r;
  }),
  USER_SUMMARY_SELECT: { id: true, name: true, image: true },
}));

import { requireAuth, checkStackAccess } from '@/lib/auth-guard';
import { parseBody } from '@/lib/schemas';
import { prisma } from '@/lib/prisma';
import { parseRRule, getNextOccurrence } from '@/lib/recurrence';
import { syncTaskCalendarEvent } from '@/lib/calendar';
import { unflagOtherWinTheDay } from '@/lib/task-helpers';
import { cascadeProgressUp } from '@/lib/progress';

const mockRequireAuth = vi.mocked(requireAuth);
const mockCheckStackAccess = vi.mocked(checkStackAccess);
const mockParseBody = vi.mocked(parseBody);
const mockTaskCreate = vi.mocked(prisma.task.create);
const mockTaskFindMany = vi.mocked(prisma.task.findMany);
const mockTaskFindUnique = vi.mocked(prisma.task.findUnique);
const mockTaskUpdate = vi.mocked(prisma.task.update);
const mockTaskDelete = vi.mocked(prisma.task.delete);
const mockGoalFindUnique = vi.mocked(prisma.goal.findUnique);
const mockGoalFindMany = vi.mocked(prisma.goal.findMany);
const mockGoalStackFindMany = vi.mocked(prisma.goalStack.findMany);
const mockProcessFindUnique = vi.mocked(prisma.process.findUnique);
const mockParseRRule = vi.mocked(parseRRule);
const mockSyncTaskCalendar = vi.mocked(syncTaskCalendarEvent);
const mockUnflagWinTheDay = vi.mocked(unflagOtherWinTheDay);

const authedResult = { session: { user: { id: 'user1', isAdmin: false } }, userId: 'user1' };
const adminResult = { session: { user: { id: 'admin1', isAdmin: true } }, userId: 'admin1' };

// We need to import the route handlers
// GET/POST are from the main route, PATCH/DELETE from [id] route
import { GET, POST } from '@/app/api/tasks/route';

describe('GET /api/tasks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue(authedResult as any);
    mockTaskFindMany.mockResolvedValue([] as any);
    mockGoalStackFindMany.mockResolvedValue([] as any);
    mockGoalFindMany.mockResolvedValue([] as any);
  });

  it('limits individual scope to assigned tasks and own unassigned tasks', async () => {
    const req = new Request('http://localhost/api/tasks?includeUnscheduled=true') as any;
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(mockTaskFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({
              OR: [
                { assigneeId: 'user1' },
                { ownerId: 'user1', assigneeId: null },
              ],
            }),
          ]),
        }),
      }),
    );
  });

  it('includes tasks scheduled into the requested date by time block', async () => {
    const req = new Request('http://localhost/api/tasks?date=2026-04-05') as any;
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(mockTaskFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({
              OR: expect.arrayContaining([
                { dueDate: { gte: new Date('2026-04-05'), lt: new Date('2026-04-06') } },
                { timeBlockStart: { gte: new Date('2026-04-05'), lt: new Date('2026-04-06') } },
              ]),
            }),
          ]),
        }),
      }),
    );
  });

  it('applies the same individual scope for admins by default', async () => {
    mockRequireAuth.mockResolvedValue(adminResult as any);

    const req = new Request('http://localhost/api/tasks?date=2026-04-05') as any;
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(mockTaskFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({
              OR: [
                { assigneeId: 'admin1' },
                { ownerId: 'admin1', assigneeId: null },
              ],
            }),
          ]),
        }),
      }),
    );
  });

  it('uses company scope only when explicitly requested', async () => {
    mockGoalStackFindMany.mockResolvedValue([{ id: 'stack-1' }] as any);
    mockTaskFindMany.mockResolvedValue([] as any);
    mockGoalFindMany.mockResolvedValue([{ id: 'goal-1' }] as any);

    const req = new Request('http://localhost/api/tasks?scope=company') as any;
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(mockTaskFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({
              OR: expect.arrayContaining([
                { goalId: { in: ['goal-1'] }, assigneeId: null },
                { goalId: { in: ['goal-1'] }, assigneeId: 'user1' },
              ]),
            }),
          ]),
        }),
      }),
    );
  });
});

describe('POST /api/tasks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue(authedResult as any);
    mockCheckStackAccess.mockReturnValue(null);
    mockTaskCreate.mockResolvedValue({ id: 'task-1', title: 'Test' } as any);
  });

  it('creates IMPROVE task with valid goalId', async () => {
    mockParseBody.mockResolvedValue({
      data: { taskType: 'IMPROVE', title: 'Build feature', goalId: 'goal-1' },
    } as any);
    mockGoalFindUnique.mockResolvedValue({ id: 'goal-1', deletedAt: null, stack: { ownerId: 'user1', isCompany: false } } as any);

    const req = new Request('http://localhost/api/tasks', { method: 'POST' }) as any;
    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(mockTaskCreate).toHaveBeenCalled();
  });

  it('rejects IMPROVE task without goalId', async () => {
    mockParseBody.mockResolvedValue({
      data: { taskType: 'IMPROVE', title: 'Build feature' },
    } as any);

    const req = new Request('http://localhost/api/tasks', { method: 'POST' }) as any;
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('goalId is required');
  });

  it('returns 404 for IMPROVE task with deleted goal', async () => {
    mockParseBody.mockResolvedValue({
      data: { taskType: 'IMPROVE', title: 'Build feature', goalId: 'goal-deleted' },
    } as any);
    mockGoalFindUnique.mockResolvedValue({ id: 'goal-deleted', deletedAt: new Date(), stack: {} } as any);

    const req = new Request('http://localhost/api/tasks', { method: 'POST' }) as any;
    const res = await POST(req);
    expect(res.status).toBe(404);
  });

  it('returns 403 for IMPROVE task when non-admin on company stack', async () => {
    mockParseBody.mockResolvedValue({
      data: { taskType: 'IMPROVE', title: 'Build feature', goalId: 'goal-1' },
    } as any);
    mockGoalFindUnique.mockResolvedValue({ id: 'goal-1', deletedAt: null, stack: { ownerId: 'other', isCompany: true } } as any);
    mockCheckStackAccess.mockReturnValue(Response.json({ error: 'Forbidden' }, { status: 403 }));

    const req = new Request('http://localhost/api/tasks', { method: 'POST' }) as any;
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it('rejects MAINTENANCE task with invalid recurrence rule', async () => {
    mockParseBody.mockResolvedValue({
      data: { taskType: 'MAINTENANCE', title: 'Clean up', recurrenceRule: 'INVALID_RULE' },
    } as any);
    mockParseRRule.mockImplementation(() => { throw new Error('Invalid'); });

    const req = new Request('http://localhost/api/tasks', { method: 'POST' }) as any;
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Invalid recurrence rule');
  });

  it('creates REACT task without goalId', async () => {
    mockParseBody.mockResolvedValue({
      data: { taskType: 'REACT', title: 'Handle bug report' },
    } as any);

    const req = new Request('http://localhost/api/tasks', { method: 'POST' }) as any;
    const res = await POST(req);
    expect(res.status).toBe(201);
  });

  it('non-admin cannot set ownerId', async () => {
    mockParseBody.mockResolvedValue({
      data: { taskType: 'REACT', title: 'Task', ownerId: 'other-user' },
    } as any);

    const req = new Request('http://localhost/api/tasks', { method: 'POST' }) as any;
    await POST(req);
    expect(mockTaskCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ownerId: 'user1', // should use auth userId, not the provided ownerId
        }),
      })
    );
  });

  it('admin can set ownerId', async () => {
    mockRequireAuth.mockResolvedValue(adminResult as any);
    mockParseBody.mockResolvedValue({
      data: { taskType: 'REACT', title: 'Task', ownerId: 'other-user' },
    } as any);

    const req = new Request('http://localhost/api/tasks', { method: 'POST' }) as any;
    await POST(req);
    expect(mockTaskCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ownerId: 'other-user',
        }),
      })
    );
  });

  it('unflags other win-the-day tasks when isWinTheDay is true', async () => {
    mockParseBody.mockResolvedValue({
      data: { taskType: 'REACT', title: 'Task', isWinTheDay: true, dueDate: '2026-04-04' },
    } as any);

    const req = new Request('http://localhost/api/tasks', { method: 'POST' }) as any;
    await POST(req);
    expect(mockUnflagWinTheDay).toHaveBeenCalledWith('user1', '2026-04-04');
  });

  it('syncs to Google Calendar when time blocks provided', async () => {
    mockParseBody.mockResolvedValue({
      data: {
        taskType: 'REACT', title: 'Task',
        timeBlockStart: '2026-04-04T09:00:00Z',
        timeBlockEnd: '2026-04-04T10:00:00Z',
      },
    } as any);
    mockSyncTaskCalendar.mockResolvedValue('gcal-event-1');

    const req = new Request('http://localhost/api/tasks', { method: 'POST' }) as any;
    await POST(req);
    expect(mockSyncTaskCalendar).toHaveBeenCalledWith('user1', expect.anything(), 'create');
  });

  it('validates processId exists when provided', async () => {
    mockParseBody.mockResolvedValue({
      data: { taskType: 'MAINTENANCE', title: 'Process task', processId: 'proc-123' },
    } as any);
    mockProcessFindUnique.mockResolvedValue(null);

    const req = new Request('http://localhost/api/tasks', { method: 'POST' }) as any;
    const res = await POST(req);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain('Process not found');
  });

  it('returns 401 when unauthenticated', async () => {
    mockRequireAuth.mockResolvedValue({ error: 'Unauthorized', status: 401 });
    const req = new Request('http://localhost/api/tasks', { method: 'POST' }) as any;
    const res = await POST(req);
    expect(res.status).toBe(401);
  });
});

// Import PATCH/DELETE/GET from the [id] route
import { PATCH, DELETE as TaskDelete, GET as TaskGet } from '@/app/api/tasks/[id]/route';

function createPatchRequest(body: any) {
  return new Request('http://localhost/api/tasks/task-1', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as any;
}

const taskFixture = {
  id: 'task-1',
  ownerId: 'user1',
  assigneeId: null,
  title: 'Original Task',
  description: null,
  taskType: 'REACT',
  priority: 'MEDIUM',
  status: 'TODO',
  dueDate: null,
  goalId: null,
  recurrenceRule: null,
  calendarEventId: null,
  startedAt: null,
  completedAt: null,
  failedAt: null,
  timeBlockStart: null,
  timeBlockEnd: null,
  processId: null,
  deliverable: null,
  estimatedMinutes: null,
  preferredTimeStart: null,
  preferredTimeEnd: null,
  isWinTheDay: false,
};

const params = Promise.resolve({ id: 'task-1' });

describe('PATCH /api/tasks/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue(authedResult as any);
    mockTaskFindUnique.mockResolvedValue({ ...taskFixture } as any);
    mockTaskUpdate.mockResolvedValue({ ...taskFixture, status: 'IN_PROGRESS' } as any);
  });

  it('allows owner to update', async () => {
    mockParseBody.mockResolvedValue({ data: { status: 'IN_PROGRESS' } } as any);
    const res = await PATCH(createPatchRequest({ status: 'IN_PROGRESS' }), { params });
    expect(res.status).toBe(200);
  });

  it('allows assignee to update', async () => {
    mockTaskFindUnique.mockResolvedValue({ ...taskFixture, ownerId: 'other', assigneeId: 'user1' } as any);
    mockParseBody.mockResolvedValue({ data: { status: 'IN_PROGRESS' } } as any);
    const res = await PATCH(createPatchRequest({ status: 'IN_PROGRESS' }), { params });
    expect(res.status).toBe(200);
  });

  it('returns 403 for non-owner non-assignee', async () => {
    mockTaskFindUnique.mockResolvedValue({ ...taskFixture, ownerId: 'other', assigneeId: 'someone-else' } as any);
    mockParseBody.mockResolvedValue({ data: { status: 'IN_PROGRESS' } } as any);
    const res = await PATCH(createPatchRequest({ status: 'IN_PROGRESS' }), { params });
    expect(res.status).toBe(403);
  });

  it('returns 404 when task not found', async () => {
    mockTaskFindUnique.mockResolvedValue(null);
    const res = await PATCH(createPatchRequest({ status: 'IN_PROGRESS' }), { params });
    expect(res.status).toBe(404);
  });

  it('sets startedAt on IN_PROGRESS transition', async () => {
    mockParseBody.mockResolvedValue({ data: { status: 'IN_PROGRESS' } } as any);
    await PATCH(createPatchRequest({ status: 'IN_PROGRESS' }), { params });
    expect(mockTaskUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'IN_PROGRESS',
          startedAt: expect.any(Date),
        }),
      })
    );
  });

  it('sets completedAt on DONE transition', async () => {
    mockParseBody.mockResolvedValue({ data: { status: 'DONE' } } as any);
    mockTaskUpdate.mockResolvedValue({ ...taskFixture, status: 'DONE' } as any);
    await PATCH(createPatchRequest({ status: 'DONE' }), { params });
    expect(mockTaskUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'DONE',
          completedAt: expect.any(Date),
        }),
      })
    );
  });

  it('sets failedAt on DROPPED transition', async () => {
    mockParseBody.mockResolvedValue({ data: { status: 'DROPPED' } } as any);
    mockTaskUpdate.mockResolvedValue({ ...taskFixture, status: 'DROPPED' } as any);
    await PATCH(createPatchRequest({ status: 'DROPPED' }), { params });
    expect(mockTaskUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'DROPPED',
          failedAt: expect.any(Date),
        }),
      })
    );
  });

  it('does not overwrite existing startedAt on IN_PROGRESS', async () => {
    const existingStart = new Date('2026-01-01');
    mockTaskFindUnique.mockResolvedValue({ ...taskFixture, startedAt: existingStart } as any);
    mockParseBody.mockResolvedValue({ data: { status: 'IN_PROGRESS' } } as any);
    await PATCH(createPatchRequest({ status: 'IN_PROGRESS' }), { params });
    // startedAt should NOT be in the update data since it already exists
    const updateCall = mockTaskUpdate.mock.calls[0][0] as any;
    expect(updateCall.data.startedAt).toBeUndefined();
  });
});

describe('DELETE /api/tasks/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue(authedResult as any);
    mockTaskFindUnique.mockResolvedValue({ ...taskFixture } as any);
    mockTaskDelete.mockResolvedValue({} as any);
  });

  it('allows owner to delete', async () => {
    const req = new Request('http://localhost/api/tasks/task-1', { method: 'DELETE' }) as any;
    const res = await TaskDelete(req, { params });
    expect(res.status).toBe(200);
    expect(mockTaskDelete).toHaveBeenCalled();
  });

  it('returns 403 when assignee tries to delete', async () => {
    mockTaskFindUnique.mockResolvedValue({ ...taskFixture, ownerId: 'other', assigneeId: 'user1' } as any);
    const req = new Request('http://localhost/api/tasks/task-1', { method: 'DELETE' }) as any;
    const res = await TaskDelete(req, { params });
    expect(res.status).toBe(403);
  });

  it('allows admin to delete any task', async () => {
    mockRequireAuth.mockResolvedValue(adminResult as any);
    mockTaskFindUnique.mockResolvedValue({ ...taskFixture, ownerId: 'other' } as any);
    const req = new Request('http://localhost/api/tasks/task-1', { method: 'DELETE' }) as any;
    const res = await TaskDelete(req, { params });
    expect(res.status).toBe(200);
  });

  it('returns 404 when task not found', async () => {
    mockTaskFindUnique.mockResolvedValue(null);
    const req = new Request('http://localhost/api/tasks/task-1', { method: 'DELETE' }) as any;
    const res = await TaskDelete(req, { params });
    expect(res.status).toBe(404);
  });
});
