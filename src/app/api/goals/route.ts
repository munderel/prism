import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cacheHeaders } from '@/lib/api-helpers';
import {
  requireAuth,
  requireAdmin,
  authError,
} from '@/lib/auth-guard';

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

  return new Response(JSON.stringify(goals), {
    headers: cacheHeaders(10, 60),
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const body = await request.json();
  const { stackId, parentId, level, title, description, dueDate, startDate, endDate, autoGenerate } = body;

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

  // Auto-generate yearly + monthly children for HHG
  if (autoGenerate && level === 'HIGH_HARD' && startDate && endDate) {
    const hhgStart = new Date(startDate);
    const hhgEnd = new Date(endDate);

    const result = await prisma.$transaction(async (tx) => {
      const hhg = await tx.goal.create({
        data: {
          stackId,
          parentId: parentId ?? null,
          level,
          title,
          description: description ?? null,
          dueDate: dueDate ? new Date(dueDate) : null,
          startDate: hhgStart,
          endDate: hhgEnd,
          sortOrder: siblingCount,
        },
      });

      const startYear = hhgStart.getFullYear();
      const endYear = hhgEnd.getFullYear();
      const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December',
      ];

      // Build year goals first, then batch-create monthly goals per year
      const yearGoals: { id: string; year: number }[] = [];
      let yearOrder = 0;
      for (let year = startYear; year <= endYear; year++) {
        const yearGoal = await tx.goal.create({
          data: {
            stackId,
            parentId: hhg.id,
            level: 'STRATEGIC',
            title: `Yearly Goal ${yearOrder + 1}`,
            startDate: new Date(year, 0, 1),
            endDate: new Date(year, 11, 31, 23, 59, 59, 999),
            sortOrder: yearOrder++,
          },
        });
        yearGoals.push({ id: yearGoal.id, year });
      }

      // Determine week start day from stack settings (0 = Sunday, 1 = Monday)
      const weekStartDay = stack.weekStartDay ?? 0;

      // Batch-create ALL monthly goals across all years in one pass
      const allMonthData: {
        stackId: string;
        parentId: string;
        level: 'MONTHLY';
        title: string;
        startDate: Date;
        endDate: Date;
        sortOrder: number;
      }[] = [];

      const yearGoalIds = yearGoals.map((yg) => yg.id);

      for (const { id: yearGoalId, year } of yearGoals) {
        const firstMonth = year === startYear ? hhgStart.getMonth() : 0;
        const lastMonth = year === endYear ? hhgEnd.getMonth() : 11;

        for (let month = firstMonth; month <= lastMonth; month++) {
          allMonthData.push({
            stackId,
            parentId: yearGoalId,
            level: 'MONTHLY' as const,
            title: `${monthNames[month]} ${year}`,
            startDate: new Date(year, month, 1),
            endDate: new Date(year, month + 1, 0, 23, 59, 59, 999),
            sortOrder: month - firstMonth,
          });
        }
      }

      if (allMonthData.length > 0) {
        await tx.goal.createMany({ data: allMonthData });
      }

      // Single query to get ALL monthly goals for this HHG
      const allMonthlyGoals = await tx.goal.findMany({
        where: {
          stackId,
          parentId: { in: yearGoalIds },
          level: 'MONTHLY',
          deletedAt: null,
        },
        orderBy: { sortOrder: 'asc' },
        select: { id: true, startDate: true, endDate: true },
      });

      // Generate weekly goals for each month
      const allWeekData: {
        stackId: string;
        parentId: string;
        level: 'WEEKLY';
        title: string;
        startDate: Date;
        endDate: Date;
        sortOrder: number;
      }[] = [];

      for (const monthGoal of allMonthlyGoals) {
        if (!monthGoal.startDate || !monthGoal.endDate) continue;

        const monthStart = new Date(monthGoal.startDate);
        const monthEnd = new Date(monthGoal.endDate);
        let weekNum = 1;

        // Find the first week start day on or before the 1st of the month
        let cursor = new Date(monthStart);
        const cursorDay = cursor.getDay(); // 0=Sun..6=Sat
        // Rewind to the previous week start day (or stay if already on it)
        const diff = (cursorDay - weekStartDay + 7) % 7;
        if (diff > 0) {
          cursor.setDate(cursor.getDate() - diff);
        }
        // Clamp to month start (first week begins no earlier than the 1st)
        if (cursor < monthStart) {
          cursor = new Date(monthStart);
        }

        while (cursor <= monthEnd) {
          const weekStart = new Date(cursor);

          // Week end = 6 days after the week start day, or month end
          const naturalEnd = new Date(cursor);
          naturalEnd.setDate(naturalEnd.getDate() + 6);
          const weekEnd = naturalEnd > monthEnd ? new Date(monthEnd) : naturalEnd;
          weekEnd.setHours(23, 59, 59, 999);

          allWeekData.push({
            stackId,
            parentId: monthGoal.id,
            level: 'WEEKLY' as const,
            title: `Week ${weekNum}`,
            startDate: weekStart,
            endDate: weekEnd,
            sortOrder: weekNum - 1,
          });

          weekNum++;
          // Move cursor to next week start
          cursor.setDate(cursor.getDate() + 7);
        }
      }

      if (allWeekData.length > 0) {
        await tx.goal.createMany({ data: allWeekData });
      }

      return hhg;
    });

    return Response.json(result, { status: 201 });
  }

  const goal = await prisma.goal.create({
    data: {
      stackId,
      parentId: parentId ?? null,
      level,
      title,
      description: description ?? null,
      dueDate: dueDate ? new Date(dueDate) : null,
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      sortOrder: siblingCount,
    },
  });

  if (goal.parentId) {
    await cascadeProgressUp(goal.parentId);
  }

  return Response.json(goal, { status: 201 });
}
