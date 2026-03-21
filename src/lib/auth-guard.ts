import { getServerSession } from 'next-auth';
import { authOptions } from './auth';

type AuthResult =
  | { session: any; userId: string; error?: never; status?: never }
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

export function authError(result: { error: string; status: number }) {
  return Response.json({ error: result.error }, { status: result.status });
}

export function requireCronSecret(request: Request): boolean {
  const authHeader = request.headers.get('authorization');
  return authHeader === `Bearer ${process.env.CRON_SECRET}`;
}
