import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { NO_STORE } from '@/lib/api-helpers';

export async function GET(_request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, image: true },
    orderBy: { name: 'asc' },
  });

  return Response.json(users, NO_STORE);
}
