import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  requireAuth,
  authError,
  checkStackAccess,
} from '@/lib/auth-guard';
import { pickDefined } from '@/lib/api-helpers';
import { validateGoalLevel } from '@/lib/goal-validation';
import { cascadeProgressUp } from '@/lib/progress';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const { searchParams } = new URL(request.url);
  const includeParents = searchParams.get('includeParents') === 'true';

  const parentInclude = includeParents
    ? {
        parent: {
          select: {
            id: true, title: true, level: true,
            parent: {
              select: {
                id: true, title: true, level: true,
                parent: {
                  select: { id: true, title: true, level: true, parent: { select: { id: true, title: true, level: true } } },
                },
              },
            },
          },
        },
      }
    : {};

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
      ...parentInclude,
    },
  });

  if (!goal || goal.deletedAt) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  const accessDenied = checkStackAccess(goal.stack, auth.userId, auth.session.user.isAdmin);
  if (accessDenied) return accessDenied;

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

  const accessDeniedPatch = checkStackAccess(goal.stack, auth.userId, auth.session.user.isAdmin);
  if (accessDeniedPatch) return accessDeniedPatch;

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

  const data: Record<string, any> = pickDefined(body, ['title', 'description', 'status', 'level']);
  if (dueDate !== undefined) data.dueDate = dueDate ? new Date(dueDate) : null;

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

  const accessDeniedDel = checkStackAccess(goal.stack, auth.userId, auth.session.user.isAdmin);
  if (accessDeniedDel) return accessDeniedDel;

  // Soft-delete this goal and all descendants
  const now = new Date();
  await softDeleteDescendants(id, now);

  if (goal.parentId) {
    await cascadeProgressUp(goal.parentId);
  }

  return Response.json({ ok: true });
}

async function softDeleteDescendants(goalId: string, now: Date) {
  // Collect all descendant IDs in a single loop instead of recursive queries
  const idsToDelete = [goalId];
  let frontier = [goalId];

  while (frontier.length > 0) {
    const children = await prisma.goal.findMany({
      where: { parentId: { in: frontier }, deletedAt: null },
      select: { id: true },
    });
    frontier = children.map((c) => c.id);
    idsToDelete.push(...frontier);
  }

  // Batch update all descendants at once
  await prisma.goal.updateMany({
    where: { id: { in: idsToDelete } },
    data: { deletedAt: now },
  });
}
