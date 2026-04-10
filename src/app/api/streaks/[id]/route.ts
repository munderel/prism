import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { parseBody, updateStreakSchema } from '@/lib/schemas';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const { id } = await params;

  const parsed = await parseBody(request, updateStreakSchema);
  if ('error' in parsed) return parsed.error;

  const { isActive } = parsed.data;

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
