import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, requireAdmin, authError } from '@/lib/auth-guard';
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

  if (!goal || goal.deletedAt) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  if (goal.stack.isCompany) {
    const adminAuth = await requireAdmin();
    if ('error' in adminAuth) return authError(adminAuth);
  } else if (goal.stack.ownerId !== auth.userId && !auth.session.user.isAdmin) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const { sortOrder, parentId } = body;

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

  // Update goal position
  const data: Record<string, any> = {};
  if (sortOrder !== undefined) data.sortOrder = sortOrder;
  if (parentId !== undefined) data.parentId = parentId;

  const updated = await prisma.goal.update({ where: { id }, data });

  // Renumber siblings under the new parent
  const siblings = await prisma.goal.findMany({
    where: {
      stackId: goal.stackId,
      parentId: updated.parentId,
      deletedAt: null,
      id: { not: id },
    },
    orderBy: { sortOrder: 'asc' },
    select: { id: true },
  });

  const reorderOps = siblings.map((s, i) => {
    const order = i >= sortOrder ? i + 1 : i;
    return prisma.goal.update({ where: { id: s.id }, data: { sortOrder: order } });
  });

  if (reorderOps.length > 0) {
    await prisma.$transaction(reorderOps);
  }

  return Response.json(updated);
}
