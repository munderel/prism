/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  requireAuth,
  requireAdmin,
  requireOwnership,
  requireCronSecret,
  requireTaskAccess,
  checkStackReadAccess,
  checkStackWriteAccess,
  authError,
} from '@/lib/auth-guard';

// Mock next-auth
vi.mock('next-auth', () => ({
  getServerSession: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  authOptions: {},
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    task: {
      findUnique: vi.fn(),
    },
    goalAssignee: {
      findUnique: vi.fn(),
    },
    companyGoalAssignment: {
      findUnique: vi.fn(),
    },
  },
}));

import { getServerSession } from 'next-auth';
const mockGetServerSession = vi.mocked(getServerSession);

import { prisma } from '@/lib/prisma';
const mockTaskFindUnique = vi.mocked(prisma.task.findUnique);
const mockGoalAssigneeFindUnique = vi.mocked(prisma.goalAssignee.findUnique);
const mockCompanyAssignmentFindUnique = vi.mocked(prisma.companyGoalAssignment.findUnique);

beforeEach(() => {
  mockGoalAssigneeFindUnique.mockReset();
  mockCompanyAssignmentFindUnique.mockReset();
});

describe('requireAuth', () => {
  it('returns 401 when no session', async () => {
    mockGetServerSession.mockResolvedValue(null);
    const result = await requireAuth();
    expect(result.error).toBe('Unauthorized');
    expect(result.status).toBe(401);
  });

  it('returns session when authenticated', async () => {
    const session = { user: { id: 'user1', isAdmin: false } };
    mockGetServerSession.mockResolvedValue(session as any);
    const result = await requireAuth();
    expect(result.session).toEqual(session);
    expect(result.userId).toBe('user1');
  });
});

describe('requireAdmin', () => {
  it('returns 403 when not admin', async () => {
    const session = { user: { id: 'user1', isAdmin: false } };
    mockGetServerSession.mockResolvedValue(session as any);
    const result = await requireAdmin();
    expect(result.error).toBe('Forbidden');
    expect(result.status).toBe(403);
  });

  it('returns session when admin', async () => {
    const session = { user: { id: 'admin1', isAdmin: true } };
    mockGetServerSession.mockResolvedValue(session as any);
    const result = await requireAdmin();
    expect(result.session).toEqual(session);
    expect(result.userId).toBe('admin1');
  });
});

describe('requireOwnership', () => {
  it('returns 403 when ownerId does not match', async () => {
    const session = { user: { id: 'user1', isAdmin: false } };
    mockGetServerSession.mockResolvedValue(session as any);
    const result = await requireOwnership('user2');
    expect(result.error).toBe('Forbidden');
    expect(result.status).toBe(403);
  });

  it('allows admin to access any resource', async () => {
    const session = { user: { id: 'admin1', isAdmin: true } };
    mockGetServerSession.mockResolvedValue(session as any);
    const result = await requireOwnership('user2');
    expect(result.session).toEqual(session);
  });

  it('allows owner to access own resource', async () => {
    const session = { user: { id: 'user1', isAdmin: false } };
    mockGetServerSession.mockResolvedValue(session as any);
    const result = await requireOwnership('user1');
    expect(result.session).toEqual(session);
  });
});

// Mock the environment variable
vi.stubEnv('CRON_SECRET', 'test-cron-secret');

describe('requireCronSecret', () => {
  it('returns true for valid cron secret', () => {
    const request = new Request('http://localhost/api/cron/test', {
      headers: { authorization: 'Bearer test-cron-secret' },
    });
    expect(requireCronSecret(request)).toBe(true);
  });

  it('returns false for invalid cron secret', () => {
    const request = new Request('http://localhost/api/cron/test', {
      headers: { authorization: 'Bearer wrong-secret' },
    });
    expect(requireCronSecret(request)).toBe(false);
  });

  it('returns false for missing authorization header', () => {
    const request = new Request('http://localhost/api/cron/test');
    expect(requireCronSecret(request)).toBe(false);
  });

  it('returns false for mismatched length', () => {
    const request = new Request('http://localhost/api/cron/test', {
      headers: { authorization: 'Bearer x' },
    });
    expect(requireCronSecret(request)).toBe(false);
  });
});

describe('requireTaskAccess', () => {
  it('returns 404 when task not found', async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: 'user1', isAdmin: false } } as any);
    mockTaskFindUnique.mockResolvedValue(null);
    const result = await requireTaskAccess('task-xyz');
    expect(result.error).toBe('Task not found');
    expect(result.status).toBe(404);
  });

  it('returns 403 when user does not own task', async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: 'user1', isAdmin: false } } as any);
    mockTaskFindUnique.mockResolvedValue({ id: 'task-xyz', ownerId: 'user2' } as any);
    const result = await requireTaskAccess('task-xyz');
    expect(result.error).toBe('Forbidden');
    expect(result.status).toBe(403);
  });

  it('allows owner to access task', async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: 'user1', isAdmin: false } } as any);
    mockTaskFindUnique.mockResolvedValue({ id: 'task-xyz', ownerId: 'user1' } as any);
    const result = await requireTaskAccess('task-xyz');
    expect(result.session).toBeDefined();
  });

  it('allows admin to access any task', async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: 'admin1', isAdmin: true } } as any);
    mockTaskFindUnique.mockResolvedValue({ id: 'task-xyz', ownerId: 'user2' } as any);
    const result = await requireTaskAccess('task-xyz');
    expect(result.session).toBeDefined();
  });

  it('allows assignee to access task they do not own', async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: 'assignee1', isAdmin: false } } as any);
    mockTaskFindUnique.mockResolvedValue({ id: 'task-xyz', ownerId: 'user2', assigneeId: 'assignee1' } as any);
    const result = await requireTaskAccess('task-xyz');
    expect(result.session).toBeDefined();
    expect(result.task).toBeDefined();
  });
});

describe('checkStackReadAccess', () => {
  const personalStack = { id: 'stack1', isCompany: false, ownerId: 'owner1' };
  const companyStack = { id: 'stack2', isCompany: true, ownerId: 'owner2' };

  it('allows admin', async () => {
    const r = await checkStackReadAccess(personalStack, 'randomUser', true);
    expect(r).toBeNull();
  });

  it('allows stack owner', async () => {
    const r = await checkStackReadAccess(personalStack, 'owner1', false);
    expect(r).toBeNull();
  });

  it('allows any authed user to read a company stack', async () => {
    const r = await checkStackReadAccess(companyStack, 'randomUser', false);
    expect(r).toBeNull();
  });

  it('denies non-owner non-admin on a personal stack when no assignment', async () => {
    mockGoalAssigneeFindUnique.mockResolvedValue(null);
    mockCompanyAssignmentFindUnique.mockResolvedValue(null);
    const r = await checkStackReadAccess(personalStack, 'randomUser', false, { goalId: 'g1' });
    expect(r).not.toBeNull();
    expect(r!.status).toBe(403);
  });

  it('allows non-owner non-admin on a personal stack when they have a GoalAssignee row', async () => {
    mockGoalAssigneeFindUnique.mockResolvedValue({ id: 'ga1' } as any);
    const r = await checkStackReadAccess(personalStack, 'assignee1', false, { goalId: 'g1' });
    expect(r).toBeNull();
  });

  it('allows a user with a CompanyGoalAssignment on a personal-but-assigned stack', async () => {
    mockGoalAssigneeFindUnique.mockResolvedValue(null);
    mockCompanyAssignmentFindUnique.mockResolvedValue({ id: 'cga1' } as any);
    const r = await checkStackReadAccess(personalStack, 'assignee2', false);
    expect(r).toBeNull();
  });
});

describe('checkStackWriteAccess', () => {
  const personalStack = { id: 'stack1', isCompany: false, ownerId: 'owner1' };
  const companyStack = { id: 'stack2', isCompany: true, ownerId: 'owner2' };

  it('allows admin', async () => {
    const r = await checkStackWriteAccess(personalStack, 'randomUser', true);
    expect(r).toBeNull();
  });

  it('allows stack owner', async () => {
    const r = await checkStackWriteAccess(personalStack, 'owner1', false);
    expect(r).toBeNull();
  });

  it('denies non-owner non-admin on a personal stack (default restricted=false)', async () => {
    const r = await checkStackWriteAccess(personalStack, 'randomUser', false);
    expect(r).not.toBeNull();
    expect(r!.status).toBe(403);
  });

  it('denies non-owner non-admin on a company stack when not restricted', async () => {
    const r = await checkStackWriteAccess(companyStack, 'randomUser', false);
    expect(r).not.toBeNull();
    expect(r!.status).toBe(403);
  });

  it('allows company-goal-assignee when restricted=true on a company stack', async () => {
    mockCompanyAssignmentFindUnique.mockResolvedValue({ id: 'cga1' } as any);
    const r = await checkStackWriteAccess(companyStack, 'assignee1', false, { restricted: true });
    expect(r).toBeNull();
  });

  it('denies when restricted=true but user has no assignment anywhere', async () => {
    mockCompanyAssignmentFindUnique.mockResolvedValue(null);
    mockGoalAssigneeFindUnique.mockResolvedValue(null);
    const r = await checkStackWriteAccess(companyStack, 'randomUser', false, {
      goalId: 'g1',
      restricted: true,
    });
    expect(r).not.toBeNull();
    expect(r!.status).toBe(403);
  });

  it('allows GoalAssignee on personal stack when restricted=true', async () => {
    mockGoalAssigneeFindUnique.mockResolvedValue({ id: 'ga1' } as any);
    const r = await checkStackWriteAccess(personalStack, 'assignee1', false, {
      goalId: 'g1',
      restricted: true,
    });
    expect(r).toBeNull();
  });

  it('denies GoalAssignee when restricted=false (structural write)', async () => {
    mockGoalAssigneeFindUnique.mockResolvedValue({ id: 'ga1' } as any);
    const r = await checkStackWriteAccess(personalStack, 'assignee1', false, {
      goalId: 'g1',
      restricted: false,
    });
    expect(r).not.toBeNull();
    expect(r!.status).toBe(403);
  });
});

describe('authError', () => {
  it('converts 401 AuthResult to a 401 Response', async () => {
    const result = authError({ error: 'Unauthorized', status: 401 });
    expect(result.status).toBe(401);
    const body = await result.json();
    expect(body).toEqual({ error: 'Unauthorized' });
  });

  it('converts 403 AuthResult to a 403 Response', async () => {
    const result = authError({ error: 'Forbidden', status: 403 });
    expect(result.status).toBe(403);
    const body = await result.json();
    expect(body).toEqual({ error: 'Forbidden' });
  });
});
