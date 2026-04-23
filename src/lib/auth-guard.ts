import { getServerSession, Session } from 'next-auth';
import { getToken } from 'next-auth/jwt';
import { createHmac, timingSafeEqual } from 'crypto';
import type { NextRequest } from 'next/server';
import { authOptions } from './auth';
import { prisma } from './prisma';

export type AuthResult =
  | { session: Session; userId: string; error?: never; status?: never }
  | { session?: never; userId?: never; error: string; status: number };

/**
 * Verifies that a valid session exists for the current request.
 * Returns `{ session, userId }` on success, or `{ error, status: 401 }` if unauthenticated.
 * Use this as the baseline check in any authenticated API route.
 */
export async function requireAuth(): Promise<AuthResult> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { error: 'Unauthorized', status: 401 };
  }
  return { session, userId: session.user.id };
}

/**
 * Fast auth check for API route handlers.
 * Uses getToken() (pure JWT decode from cookie) instead of getServerSession(),
 * skipping the NextAuth callback chain and any conditional DB calls.
 * Prefer this in GET routes that only need userId/isAdmin from the token.
 */
export async function requireAuthFromRequest(request: NextRequest): Promise<AuthResult> {
  const token = await getToken({ req: request });
  if (!token?.id || (token as { isLockedOut?: boolean }).isLockedOut) {
    return { error: 'Unauthorized', status: 401 };
  }
  const session: Session = {
    user: { id: token.id, isAdmin: token.isAdmin ?? false },
    expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  };
  return { session, userId: token.id };
}

/**
 * Extends `requireAuth` by also asserting the user has `isAdmin: true`.
 * Returns the same `AuthResult` on success, or `{ error, status: 403 }` if not an admin.
 * Use this for admin-only routes instead of checking `isAdmin` manually.
 */
export async function requireAdmin(): Promise<AuthResult> {
  const result = await requireAuth();
  if ('error' in result) return result;

  if (!result.session.user.isAdmin) {
    return { error: 'Forbidden', status: 403 };
  }
  return result;
}

/**
 * Asserts the current user either owns the resource (`ownerId`) or is an admin.
 * Returns `AuthResult` on success, or `{ error, status: 403 }` if access is denied.
 * Prefer this over `requireAdmin` when admins and owners both need write access.
 */
export async function requireOwnership(ownerId: string): Promise<AuthResult> {
  const result = await requireAuth();
  if ('error' in result) return result;

  if (result.session.user.isAdmin) return result;

  if (result.userId !== ownerId) {
    return { error: 'Forbidden', status: 403 };
  }
  return result;
}

/**
 * Converts a failed `AuthResult` into a JSON `Response` with the appropriate status code.
 * Call this at the top of route handlers after a failed auth check, then `return authError(result)`.
 */
export function authError(result: AuthResult) {
  return Response.json({ error: result.error }, { status: result.status });
}

/**
 * Verifies the current user can access a specific task (owner or admin).
 * Returns `AuthResult & { task }` on success, or an error result with status 404/403/401.
 * Use this in task-specific routes to combine auth and existence checks in one call.
 */
export async function requireTaskAccess(taskId: string): Promise<AuthResult & { task?: { id: string; ownerId: string } }> {
  const result = await requireAuth();
  if ('error' in result) return result;

  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) {
    return { error: 'Task not found', status: 404 };
  }

  if (task.ownerId !== result.userId && task.assigneeId !== result.userId && !result.session.user.isAdmin) {
    return { error: 'Forbidden', status: 403 };
  }

  return { ...result, task };
}

/**
 * Read access to a goal stack. Returns `null` if allowed, or a 403 `Response`.
 * Allowed for:
 * - admins,
 * - the stack owner,
 * - any authed user if `stack.isCompany` (company goals are readable org-wide),
 * - a user with a `CompanyGoalAssignment` on the stack,
 * - a user with a `GoalAssignee` row on the specific goal (when `goalId` is passed).
 */
export async function checkStackReadAccess(
  stack: { id: string; isCompany: boolean; ownerId: string },
  userId: string,
  isAdmin: boolean,
  opts?: { goalId?: string }
): Promise<Response | null> {
  if (isAdmin) return null;
  if (stack.ownerId === userId) return null;
  if (stack.isCompany) return null;

  if (opts?.goalId) {
    const assignee = await prisma.goalAssignee.findUnique({
      where: { goalId_userId: { goalId: opts.goalId, userId } },
      select: { id: true },
    });
    if (assignee) return null;
  }

  const companyAssignment = await prisma.companyGoalAssignment.findUnique({
    where: { goalStackId_userId: { goalStackId: stack.id, userId } },
    select: { id: true },
  });
  if (companyAssignment) return null;

  return Response.json({ error: 'Forbidden' }, { status: 403 });
}

/**
 * Write access to a goal stack. Returns `null` if allowed, or a 403 `Response`.
 * Two modes via `opts.restricted`:
 * - `restricted: false` (default) — structural writes: admins and stack owner only.
 *   Use for delete, reorder, level changes, creating/deleting assignees etc.
 * - `restricted: true` — progress-like writes: admins, stack owner, and
 *   users with a `CompanyGoalAssignment` (company stacks) or a `GoalAssignee`
 *   row on the specific goal. Use for progress, actualValue, creating tasks
 *   under an assigned goal.
 */
export async function checkStackWriteAccess(
  stack: { id: string; isCompany: boolean; ownerId: string },
  userId: string,
  isAdmin: boolean,
  opts?: { goalId?: string; restricted?: boolean }
): Promise<Response | null> {
  if (isAdmin) return null;
  if (stack.ownerId === userId) return null;

  if (opts?.restricted) {
    if (stack.isCompany) {
      const assignment = await prisma.companyGoalAssignment.findUnique({
        where: { goalStackId_userId: { goalStackId: stack.id, userId } },
        select: { id: true },
      });
      if (assignment) return null;
    }
    if (opts.goalId) {
      const assignee = await prisma.goalAssignee.findUnique({
        where: { goalId_userId: { goalId: opts.goalId, userId } },
        select: { id: true },
      });
      if (assignee) return null;
    }
  }

  return Response.json({ error: 'Forbidden' }, { status: 403 });
}

/**
 * Returns true if `targetUserId` is a legitimate member of the stack:
 * stack owner, any authed user on a company stack, a `CompanyGoalAssignment`
 * holder for the stack, or a `GoalAssignee` row on the given `goalId`. Use
 * this when deciding whether a user can be named as an owner/assignee of a
 * goal or KPI — we don't want to assign a KPI to someone who has no
 * visibility into the stack. Company stacks are team-wide (they short-circuit
 * in `checkStackReadAccess` too), so any authenticated user is a valid
 * member; the caller is still gated by `checkStackWriteAccess` for who can
 * perform the assignment.
 */
export async function verifyStackMembership(
  stack: { id: string; isCompany: boolean; ownerId: string },
  targetUserId: string,
  goalId?: string,
): Promise<boolean> {
  if (stack.ownerId === targetUserId) return true;
  if (stack.isCompany) return true;

  const companyAssignment = await prisma.companyGoalAssignment.findUnique({
    where: { goalStackId_userId: { goalStackId: stack.id, userId: targetUserId } },
    select: { id: true },
  });
  if (companyAssignment) return true;

  if (goalId) {
    const goalAssignee = await prisma.goalAssignee.findUnique({
      where: { goalId_userId: { goalId, userId: targetUserId } },
      select: { id: true },
    });
    if (goalAssignee) return true;
  }

  return false;
}

export function requireCronSecret(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // No secret configured = deny all

  const authHeader = request.headers.get('authorization');
  if (!authHeader) return false;

  const expected = `Bearer ${secret}`;

  // HMAC both values to fixed-length digests, avoiding length-based timing leaks
  const hmacKey = 'cron-secret-compare';
  const hashA = createHmac('sha256', hmacKey).update(authHeader).digest();
  const hashB = createHmac('sha256', hmacKey).update(expected).digest();

  return timingSafeEqual(hashA, hashB);
}
