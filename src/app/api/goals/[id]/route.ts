import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  requireAuth,
  requireAdmin,
  authError,
} from '@/lib/auth-guard';
import { validateGoalLevel } from '@/lib/goal-validation';
import { cascadeProgressUp } from '@/lib/progress';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const goal = await prisma.goal.findUnique({
    where: { id },
    include: {
      stack: true,
      children: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } },
      tasks: { select: { id: true, status: true, title: true } },
      companyGoalLinks: {
        include: {
          individualGoal: {
            include: { stack: { include: { owner: { select: { id: true, name: true, image: true } } } } },
          },
        },
      },
      individualGoalLinks: {
        include: {
          companyGoal: { select: { id: true, title: true } },
        },
      },
    },
  });

  if (!goal || goal.deletedAt) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  // Ownership check: non-admins can only see own stacks and company stacks
  if (!goal.stack.isCompany && goal.stack.ownerId !== auth.userId && !auth.session.user.isAdmin) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  return Response.json(goal);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const goal = await prisma.goal.findUnique({
    where: { id },
    include: { stack: true, parent: { select: { level: true } } },
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
  const { title, description, status, dueDate, level } = body;

  // Validate level change if provided
  if (level && level !== goal.level) {
    const parentLevel = goal.parent?.level ?? null;
    if (!validateGoalLevel(level, parentLevel)) {
      return Response.json(
        { error: `${level} cannot be a child of ${parentLevel ?? 'root'}` },
        { status: 400 }
      );
    }
  }

  const data: Record<string, any> = {};
  if (title !== undefined) data.title = title;
  if (description !== undefined) data.description = description;
  if (status !== undefined) data.status = status;
  if (dueDate !== undefined) data.dueDate = dueDate ? new Date(dueDate) : null;
  if (level !== undefined) data.level = level;

  // If marking as COMPLETED, set progress to 100
  if (status === 'COMPLETED') {
    data.progressPct = 100;
  } else if (status === 'ABANDONED') {
    data.progressPct = 0;
  }

  const updated = await prisma.goal.update({ where: { id }, data });

  await cascadeProgressUp(id);

  return Response.json(updated);
}

export async function DELETE(
  _request: NextRequest,
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

  // Soft-delete this goal and all descendants
  const now = new Date();
  await softDeleteDescendants(id, now);

  if (goal.parentId) {
    await cascadeProgressUp(goal.parentId);
  }

  return Response.json({ ok: true });
}

const MAX_GOAL_DEPTH = 20;

async function softDeleteDescendants(goalId: string, now: Date, depth = 0) {
  if (depth > MAX_GOAL_DEPTH) {
    console.warn(`softDeleteDescendants: max depth ${MAX_GOAL_DEPTH} exceeded at goal ${goalId}, stopping recursion`);
    return;
  }

  await prisma.goal.update({
    where: { id: goalId },
    data: { deletedAt: now },
  });

  const children = await prisma.goal.findMany({
    where: { parentId: goalId, deletedAt: null },
    select: { id: true },
  });

  for (const child of children) {
    await softDeleteDescendants(child.id, now, depth + 1);
  }
}
