import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError, checkStackAccess } from '@/lib/auth-guard';
import { notFoundResponse } from '@/lib/api-helpers';

/** DELETE — remove a user's assignment on a goal. Admin or stack owner only. */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> },
) {
  const { id: goalId, userId } = await params;
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const goal = await prisma.goal.findUnique({
    where: { id: goalId },
    include: { stack: true },
  });
  if (!goal || goal.deletedAt) return notFoundResponse('Goal');

  const accessDenied = checkStackAccess(goal.stack, auth.userId, auth.session.user.isAdmin);
  if (accessDenied) return accessDenied;

  const existing = await prisma.goalAssignee.findUnique({
    where: { goalId_userId: { goalId, userId } },
  });
  if (!existing) return notFoundResponse('Assignment');

  await prisma.goalAssignee.delete({ where: { id: existing.id } });
  return Response.json({ ok: true });
}
