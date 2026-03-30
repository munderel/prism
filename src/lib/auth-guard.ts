import { getServerSession, Session } from 'next-auth';
import { createHmac, timingSafeEqual } from 'crypto';
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

  if (task.ownerId !== result.userId && !result.session.user.isAdmin) {
    return { error: 'Forbidden', status: 403 };
  }

  return { ...result, task };
}

/**
 * Checks whether a user may read/write a goal stack based on its `isCompany` flag and ownership.
 * Returns `null` if access is allowed, or a 403 `Response` if it is not.
 * Use this in stack routes after fetching the stack, before performing mutations.
 */
export function checkStackAccess(
  stack: { isCompany: boolean; ownerId: string },
  userId: string,
  isAdmin: boolean
): Response | null {
  if (stack.isCompany && !isAdmin) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!stack.isCompany && stack.ownerId !== userId && !isAdmin) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }
  return null;
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
