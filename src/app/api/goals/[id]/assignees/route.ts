import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError, checkStackAccess } from '@/lib/auth-guard';
import { parseBody } from '@/lib/schemas';
import { notFoundResponse } from '@/lib/api-helpers';

const addAssigneeSchema = z.object({
  userId: z.string().min(1),
});

/** GET — list current assignees for a goal. Any viewer with stack access. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: goalId } = await params;
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const goal = await prisma.goal.findUnique({
    where: { id: goalId },
    include: { stack: true },
  });
  if (!goal || goal.deletedAt) return notFoundResponse('Goal');

  const accessDenied = checkStackAccess(goal.stack, auth.userId, auth.session.user.isAdmin);
  if (accessDenied) return accessDenied;

  const assignees = await prisma.goalAssignee.findMany({
    where: { goalId },
    include: {
      user: { select: { id: true, name: true, email: true, image: true } },
    },
    orderBy: { createdAt: 'asc' },
  });
  return Response.json({ assignees });
}

/** POST — add a user as assignee. Admin or stack owner only. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: goalId } = await params;
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const goal = await prisma.goal.findUnique({
    where: { id: goalId },
    include: { stack: true },
  });
  if (!goal || goal.deletedAt) return notFoundResponse('Goal');

  const accessDenied = checkStackAccess(goal.stack, auth.userId, auth.session.user.isAdmin);
  if (accessDenied) return accessDenied;

  const parsed = await parseBody(request, addAssigneeSchema);
  if ('error' in parsed) return parsed.error;
  const { userId } = parsed.data;

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (!target) {
    return Response.json({ error: 'User not found' }, { status: 400 });
  }

  // Upsert-by-unique rather than create so the endpoint is idempotent.
  const assignee = await prisma.goalAssignee.upsert({
    where: { goalId_userId: { goalId, userId } },
    create: { goalId, userId },
    update: {},
    include: {
      user: { select: { id: true, name: true, email: true, image: true } },
    },
  });
  return Response.json(assignee);
}
