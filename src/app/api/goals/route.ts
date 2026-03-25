import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  requireAuth,
  requireAdmin,
  authError,
} from '@/lib/auth-guard';
import { goalLimiter, getClientIp } from '@/lib/rate-limit';
import { validateGoalLevel } from '@/lib/goal-validation';
import { cascadeProgressUp } from '@/lib/progress';

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const { searchParams } = new URL(request.url);
  const stackId = searchParams.get('stackId');

  if (!stackId) {
    return Response.json({ error: 'stackId is required' }, { status: 400 });
  }

  const stack = await prisma.goalStack.findUnique({ where: { id: stackId } });
  if (!stack) {
    return Response.json({ error: 'Stack not found' }, { status: 404 });
  }

  if (!stack.isCompany && stack.ownerId !== auth.userId && !auth.session.user.isAdmin) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const goals = await prisma.goal.findMany({
    where: { stackId, deletedAt: null },
    orderBy: { sortOrder: 'asc' },
    include: {
      children: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } },
      tasks: {
        select: {
          id: true, title: true, status: true, priority: true,
          dueDate: true, deliverable: true, taskType: true, description: true,
        },
        orderBy: [{ priority: 'desc' }, { dueDate: 'asc' }],
      },
      _count: { select: { kpis: true } },
      companyGoalLinks: {
        include: {
          individualGoal: {
            include: { stack: { include: { owner: { select: { id: true, name: true, image: true } } } } },
          },
        },
      },
    },
  });

  return Response.json(goals);
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const limit = goalLimiter.check(ip);
  if (!limit.success) {
    return Response.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const body = await request.json();
  const { stackId, parentId, level, title, description, dueDate } = body;

  if (!stackId || !level || !title) {
    return Response.json(
      { error: 'stackId, level, and title are required' },
      { status: 400 }
    );
  }

  // Verify stack access
  const stack = await prisma.goalStack.findUnique({ where: { id: stackId } });
  if (!stack) {
    return Response.json({ error: 'Stack not found' }, { status: 404 });
  }

  if (stack.isCompany) {
    const adminAuth = await requireAdmin();
    if ('error' in adminAuth) return authError(adminAuth);
  } else if (stack.ownerId !== auth.userId && !auth.session.user.isAdmin) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Validate level hierarchy
  let parentLevel: string | null = null;
  if (parentId) {
    const parent = await prisma.goal.findUnique({
      where: { id: parentId },
      select: { level: true, stackId: true, deletedAt: true },
    });
    if (!parent || parent.deletedAt || parent.stackId !== stackId) {
      return Response.json({ error: 'Invalid parent' }, { status: 400 });
    }
    parentLevel = parent.level;
  }

  if (!validateGoalLevel(level, parentLevel)) {
    return Response.json(
      { error: `${level} cannot be a child of ${parentLevel ?? 'root'}` },
      { status: 400 }
    );
  }

  // Determine sortOrder
  const siblingCount = await prisma.goal.count({
    where: { stackId, parentId: parentId ?? null, deletedAt: null },
  });

  const goal = await prisma.goal.create({
    data: {
      stackId,
      parentId: parentId ?? null,
      level,
      title,
      description: description ?? null,
      dueDate: dueDate ? new Date(dueDate) : null,
      sortOrder: siblingCount,
    },
  });

  if (goal.parentId) {
    await cascadeProgressUp(goal.parentId);
  }

  return Response.json(goal, { status: 201 });
}
