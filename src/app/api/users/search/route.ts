import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q')?.trim();

  if (!q || q.length < 1) {
    return Response.json([]);
  }

  // Non-admins can only search by name (prevents email enumeration).
  // Admins can also search by email for user management.
  const isAdmin = auth.session.user.isAdmin;
  const where = isAdmin
    ? { OR: [
        { name: { contains: q, mode: 'insensitive' as const } },
        { email: { contains: q, mode: 'insensitive' as const } },
      ] }
    : { name: { contains: q, mode: 'insensitive' as const } };

  const users = await prisma.user.findMany({
    where,
    select: { id: true, name: true, image: true },
    take: 10,
  });

  return Response.json(users);
}
