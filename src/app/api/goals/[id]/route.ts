import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  requireAuth,
  authError,
  checkStackAccess,
} from '@/lib/auth-guard';
import { pickDefined, notFoundResponse } from '@/lib/api-helpers';
import { parseBody, updateGoalSchema } from '@/lib/schemas';
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
      assignees: {
        include: {
          user: { select: { id: true, name: true, email: true, image: true } },
        },
      },
      ...parentInclude,
    },
  });

  if (!goal || goal.deletedAt) return notFoundResponse('Goal');

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

  if (!goal || goal.deletedAt) return notFoundResponse('Goal');

  const accessDenied = checkStackAccess(goal.stack, auth.userId, auth.session.user.isAdmin);
  if (accessDenied) return accessDenied;

  const parsed = await parseBody(request, updateGoalSchema);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data;
  const { status, dueDate, level, startDate, endDate } = body;

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

  const data: Record<string, any> = pickDefined(body, ['title', 'description', 'status', 'level', 'progressPct']);
  if (dueDate !== undefined) data.dueDate = dueDate ? new Date(dueDate) : null;
  if (startDate !== undefined) data.startDate = startDate ? new Date(startDate) : null;
  if (endDate !== undefined) data.endDate = endDate ? new Date(endDate) : null;

  // If marking as COMPLETED, set progress to 100 (overrides any progressPct).
  // If ABANDONED, force progress to 0. Otherwise use progressPct if provided.
  if (status === 'COMPLETED') {
    data.progressPct = 100;
  } else if (status === 'ABANDONED') {
    data.progressPct = 0;
  }

  const updated = await prisma.goal.update({ where: { id }, data });

  await cascadeProgressUp(id);

  return Response.json(updated, { headers: { 'Cache-Control': 'no-store' } });
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

  if (!goal || goal.deletedAt) return notFoundResponse('Goal');

  const accessDenied = checkStackAccess(goal.stack, auth.userId, auth.session.user.isAdmin);
  if (accessDenied) return accessDenied;

  // Soft-delete this goal and all descendants
  const now = new Date();
  await softDeleteDescendants(id, now);

  if (goal.parentId) {
    await cascadeProgressUp(goal.parentId);
  }

  return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
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

  // Hard-delete all tasks linked to goals being deleted
  await prisma.task.deleteMany({
    where: { goalId: { in: idsToDelete } },
  });

  // Soft-delete all goals
  await prisma.goal.updateMany({
    where: { id: { in: idsToDelete } },
    data: { deletedAt: now },
  });
}
