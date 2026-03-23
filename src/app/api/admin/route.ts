import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin, authError } from '@/lib/auth-guard';

export async function GET(_request: NextRequest) {
  const auth = await requireAdmin();
  if ('error' in auth) return authError(auth);

  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      isAdmin: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  return Response.json(users);
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin();
  if ('error' in auth) return authError(auth);

  const body = await request.json();
  const { userId, isAdmin } = body;

  if (!userId) {
    return Response.json({ error: 'userId is required' }, { status: 400 });
  }

  // Prevent removing own admin
  if (userId === auth.userId && !isAdmin) {
    return Response.json({ error: 'Cannot remove your own admin role' }, { status: 400 });
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { isAdmin },
    select: { id: true, name: true, isAdmin: true },
  });

  return Response.json(updated);
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAdmin();
  if ('error' in auth) return authError(auth);

  const body = await request.json();
  const { userId } = body;

  if (!userId) {
    return Response.json({ error: 'userId is required' }, { status: 400 });
  }

  if (userId === auth.userId) {
    return Response.json({ error: 'Cannot delete yourself' }, { status: 400 });
  }

  await prisma.user.delete({ where: { id: userId } });

  return Response.json({ success: true });
}
