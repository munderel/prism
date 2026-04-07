import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { safeParseJson } from '@/lib/api-helpers';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const { id } = await params;

  const parsed = await safeParseJson(request);
  if ('error' in parsed) return parsed.error;

  const { isActive } = parsed.data;
  if (typeof isActive !== 'boolean') {
    return Response.json({ error: 'isActive (boolean) is required' }, { status: 400 });
  }

  const streak = await prisma.streak.findUnique({ where: { id } });
  if (!streak || streak.userId !== auth.userId) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  const updated = await prisma.streak.update({
    where: { id },
    data: { isActive },
  });

  return Response.json(updated);
}
