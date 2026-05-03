import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin, authError } from '@/lib/auth-guard';
import { NO_STORE } from '@/lib/api-helpers';
import { parseBody, adminToggleSchema, adminDeleteUserSchema } from '@/lib/schemas';

export async function GET() {
  const auth = await requireAdmin();
  if ('error' in auth) return authError(auth);

  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      isAdmin: true,
      is2FAEnabled: true,
      isLockedOut: true,
      lockoutUntil: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  return Response.json(users);
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin();
  if ('error' in auth) return authError(auth);

  const parsed = await parseBody(request, adminToggleSchema);
  if ('error' in parsed) return parsed.error;
  const { userId, isAdmin } = parsed.data;

  if (userId === auth.userId && !isAdmin) {
    return Response.json({ error: 'Cannot remove your own admin role' }, { status: 400 });
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { isAdmin },
    select: { id: true, name: true, isAdmin: true },
  });

  return Response.json(updated, NO_STORE);
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAdmin();
  if ('error' in auth) return authError(auth);

  const parsed = await parseBody(request, adminDeleteUserSchema);
  if ('error' in parsed) return parsed.error;
  const { userId } = parsed.data;

  if (userId === auth.userId) {
    return Response.json({ error: 'Cannot delete yourself' }, { status: 400 });
  }

  await prisma.user.delete({ where: { id: userId } });
  return Response.json({ ok: true }, NO_STORE);
}
