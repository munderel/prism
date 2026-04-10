import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, requireAdmin, authError, checkStackAccess } from '@/lib/auth-guard';
import { notFoundResponse } from '@/lib/api-helpers';
import { parseBody, reorderGoalSchema } from '@/lib/schemas';
import { validateGoalLevel } from '@/lib/goal-validation';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const goal = await prisma.goal.findUnique({
    where: { id },
    include: { stack: true },
  });

  if (!goal || goal.deletedAt) return notFoundResponse('Goal');

  if (goal.stack.isCompany) {
    const adminAuth = await requireAdmin();
    if ('error' in adminAuth) return authError(adminAuth);
  } else {
    const accessDenied = checkStackAccess(goal.stack, auth.userId, auth.session.user.isAdmin);
    if (accessDenied) return accessDenied;
  }

  const parsed = await parseBody(request, reorderGoalSchema);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data;
  const { sortOrder, parentId } = body;

  if (sortOrder === undefined && parentId === undefined) {
    return Response.json({ error: 'sortOrder or parentId is required' }, { status: 400 });
  }

  // If reparenting, validate level constraint
  if (parentId !== undefined && parentId !== goal.parentId) {
    let parentLevel: string | null = null;
    if (parentId !== null) {
      const newParent = await prisma.goal.findUnique({
        where: { id: parentId },
        select: { level: true, stackId: true, deletedAt: true },
      });
      if (!newParent || newParent.deletedAt || newParent.stackId !== goal.stackId) {
        return Response.json({ error: 'Invalid parent' }, { status: 400 });
      }
      parentLevel = newParent.level;
    }

    if (!validateGoalLevel(goal.level, parentLevel)) {
      return Response.json(
        { error: `${goal.level} cannot be a child of ${parentLevel ?? 'root'}` },
        { status: 400 }
      );
    }
  }

  // Update parent if changed
  if (parentId !== undefined) {
    await prisma.goal.update({ where: { id }, data: { parentId } });
  }

  // Renumber siblings using splice-and-reindex approach
  const targetParentId = parentId !== undefined ? parentId : goal.parentId;
  const siblings = await prisma.goal.findMany({
    where: {
      stackId: goal.stackId,
      parentId: targetParentId,
      deletedAt: null,
    },
    orderBy: { sortOrder: 'asc' },
    select: { id: true },
  });

  // Remove the moved goal from the list, then insert at the target position
  const filtered = siblings.filter((s) => s.id !== id);
  const insertAt = sortOrder !== undefined ? Math.max(0, Math.min(sortOrder, filtered.length)) : filtered.length;
  filtered.splice(insertAt, 0, { id });

  // Assign sequential sort orders
  const reorderOps = filtered.map((s, i) =>
    prisma.goal.update({ where: { id: s.id }, data: { sortOrder: i } })
  );

  if (reorderOps.length > 0) {
    await prisma.$transaction(reorderOps);
  }

  const updated = await prisma.goal.findUnique({ where: { id } });
  return Response.json(updated);
}
