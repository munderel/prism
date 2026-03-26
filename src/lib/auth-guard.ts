import { getServerSession, Session } from 'next-auth';
import { createHmac, timingSafeEqual } from 'crypto';
import { authOptions } from './auth';
import { prisma } from './prisma';

export type AuthResult =
  | { session: Session; userId: string; error?: never; status?: never }
  | { session?: never; userId?: never; error: string; status: number };

export async function requireAuth(): Promise<AuthResult> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { error: 'Unauthorized', status: 401 };
  }
  return { session, userId: session.user.id };
}

export async function requireAdmin(): Promise<AuthResult> {
  const result = await requireAuth();
  if ('error' in result) return result;

  if (!result.session.user.isAdmin) {
    return { error: 'Forbidden', status: 403 };
  }
  return result;
}

export async function requireOwnership(ownerId: string): Promise<AuthResult> {
  const result = await requireAuth();
  if ('error' in result) return result;

  if (result.session.user.isAdmin) return result;

  if (result.userId !== ownerId) {
    return { error: 'Forbidden', status: 403 };
  }
  return result;
}

export function authError(result: AuthResult) {
  return Response.json({ error: result.error }, { status: result.status });
}

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
