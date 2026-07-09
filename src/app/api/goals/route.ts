import { NextRequest } from 'next/server';
import { Prisma, GoalLevel, GoalStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { NO_STORE, notFoundResponse, forbiddenResponse } from '@/lib/api-helpers';
import { parseBody, createGoalSchema } from '@/lib/schemas';
import { enforceRateLimit, WRITE_RATE_LIMIT, WRITE_RATE_WINDOW_MS } from '@/lib/rate-limit';
import {
  requireAuth,
  requireAdmin,
  authError,
} from '@/lib/auth-guard';

import { validateGoalLevel } from '@/lib/goal-validation';
import { ACTIVE_GOAL_WHERE } from '@/lib/goal-constants';
import { cascadeProgressUp } from '@/lib/progress';
import { parseLocalDate, parseDateOnly, toUtcDateOnly } from '@/lib/date-utils';

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const { searchParams } = new URL(request.url);
  const stackId = searchParams.get('stackId');
  const isCompanyParam = searchParams.get('isCompany');
  const levelParam = searchParams.get('level');
  const statusParam = searchParams.get('status');

  // Support querying by isCompany/level without stackId (for reviews)
  if (!stackId && (isCompanyParam || levelParam)) {
    let stackIds: string[];
    if (isCompanyParam === 'true') {
      const stacks = await prisma.goalStack.findMany({
        where: { isCompany: true },
        select: { id: true },
      });
      stackIds = stacks.map((s) => s.id);
    } else {
      // Personal scope: stacks the caller owns PLUS stacks where they are a
      // GoalAssignee on at least one goal. Without the assignee path,
      // assignees on someone else's personal stack would never see the goal
      // they're assigned to — defeating the assignment feature.
      const [ownedStacks, assignedGoals] = await Promise.all([
        prisma.goalStack.findMany({
          where: { ownerId: auth.userId, isCompany: false },
          select: { id: true },
        }),
        prisma.goalAssignee.findMany({
          where: { userId: auth.userId },
          select: { goal: { select: { stackId: true, stack: { select: { isCompany: true } } } } },
        }),
      ]);
      const ownedIds = ownedStacks.map((s) => s.id);
      const assignedIds = assignedGoals
        .filter((a) => !a.goal.stack.isCompany)
        .map((a) => a.goal.stackId);
      stackIds = Array.from(new Set([...ownedIds, ...assignedIds]));
    }

    if (stackIds.length === 0) {
      return Response.json([], NO_STORE);
    }

    const goalWhere: Prisma.GoalWhereInput = { stackId: { in: stackIds }, ...ACTIVE_GOAL_WHERE };
    if (levelParam) goalWhere.level = levelParam as GoalLevel;
    if (statusParam) goalWhere.status = statusParam as GoalStatus;

    const goals = await prisma.goal.findMany({
      where: goalWhere,
      orderBy: { sortOrder: 'asc' },
      include: {
        children: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } },
        tasks: {
          select: { id: true, title: true, status: true, priority: true, dueDate: true, taskType: true },
          orderBy: [{ priority: 'desc' }, { dueDate: 'asc' }],
        },
        _count: { select: { kpis: true } },
        kpis: true,
        stack: { select: { id: true, name: true, isCompany: true, ownerId: true } },
        assignees: { include: { user: { select: { id: true, name: true, email: true, image: true } } } },
      },
    });

    // Derive isAssignedToMe. For individual-goal assignees, the caller is
    // "assigned" if their userId appears in assignees. For company stacks, we
    // also look at the stack-level CompanyGoalAssignment table so users see
    // "Assigned to you" on company goals where an admin assigned them at the
    // stack level.
    const companyStackIds = goals
      .filter((g) => g.stack.isCompany)
      .map((g) => g.stack.id);
    const companyAssignments = companyStackIds.length
      ? await prisma.companyGoalAssignment.findMany({
          where: { userId: auth.userId, goalStackId: { in: companyStackIds } },
          select: { goalStackId: true },
        })
      : [];
    const assignedStackSet = new Set(companyAssignments.map((a) => a.goalStackId));

    const enriched = goals.map((g) => ({
      ...g,
      isAssignedToMe:
        g.assignees.some((a) => a.user.id === auth.userId) ||
        (g.stack.isCompany && assignedStackSet.has(g.stack.id)),
    }));

    return Response.json(enriched, NO_STORE);
  }

  if (!stackId) {
    return Response.json({ error: 'stackId is required' }, { status: 400 });
  }

  const stack = await prisma.goalStack.findUnique({ where: { id: stackId } });
  if (!stack) return notFoundResponse('Stack');

  if (!stack.isCompany && stack.ownerId !== auth.userId && !auth.session.user.isAdmin) {
    return forbiddenResponse();
  }

  const goals = await prisma.goal.findMany({
    where: { stackId, ...ACTIVE_GOAL_WHERE },
    orderBy: { sortOrder: 'asc' },
    include: {
      children: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } },
      tasks: {
        select: {
          id: true, title: true, status: true, priority: true,
          dueDate: true, taskType: true, description: true,
          assigneeId: true,
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
      assignees: { include: { user: { select: { id: true, name: true, email: true, image: true } } } },
    },
  });

  if (stack.isCompany) {
    // Stack owner and admin are implicit stack assignees — skip the lookup.
    const isPrivileged = stack.ownerId === auth.userId || auth.session.user.isAdmin;
    const isStackAssignee =
      isPrivileged ||
      Boolean(
        await prisma.companyGoalAssignment.findUnique({
          where: { goalStackId_userId: { goalStackId: stackId, userId: auth.userId } },
          select: { id: true },
        }),
      );

    const enriched = goals.map((g) => ({
      ...g,
      isAssignedToMe:
        g.assignees.some((a) => a.user.id === auth.userId) || isStackAssignee,
    }));
    return Response.json(enriched, NO_STORE);
  }

  return Response.json(goals, NO_STORE);
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const limited = await enforceRateLimit(`goals:${auth.userId}`, WRITE_RATE_LIMIT, WRITE_RATE_WINDOW_MS);
  if (limited) return limited;

  const parsed = await parseBody(request, createGoalSchema);
  if ('error' in parsed) return parsed.error;
  const { stackId, parentId, level, title, description, startDate, endDate, autoGenerate } = parsed.data;

  const stack = await prisma.goalStack.findUnique({ where: { id: stackId } });
  if (!stack) return notFoundResponse('Stack');

  if (stack.isCompany) {
    const adminAuth = await requireAdmin();
    if ('error' in adminAuth) return authError(adminAuth);
  } else if (stack.ownerId !== auth.userId && !auth.session.user.isAdmin) {
    return forbiddenResponse();
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
    where: { stackId, parentId: parentId ?? null, ...ACTIVE_GOAL_WHERE },
  });

  // --- Auto-generate clear goals based on duration ---
  if (autoGenerate && startDate && endDate) {
    const goalStart = parseLocalDate(startDate);
    const goalEnd = parseLocalDate(endDate);
    const weekStartDay = stack.weekStartDay ?? 0;

    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];

    // Helper: generate weekly goal data for a date range under a parent
    const generateWeeks = (
      parentId: string,
      rangeStart: Date,
      rangeEnd: Date,
      isFirstRange: boolean,
    ) => {
      const weeks: {
        stackId: string; parentId: string; level: 'WEEKLY';
        title: string; startDate: Date; endDate: Date; sortOrder: number;
      }[] = [];
      let weekNum = 1;
      const cursor = new Date(rangeStart);
      const cursorDay = cursor.getDay();
      const diff = (cursorDay - weekStartDay + 7) % 7;
      if (diff > 0) cursor.setDate(cursor.getDate() - diff);
      if (cursor < rangeStart && !isFirstRange) {
        cursor.setDate(cursor.getDate() + 7);
      }
      while (cursor <= rangeEnd) {
        const weekEndCursor = new Date(cursor);
        weekEndCursor.setDate(weekEndCursor.getDate() + 6);
        weeks.push({
          stackId, parentId, level: 'WEEKLY' as const,
          title: `Week ${weekNum}`,
          startDate: toUtcDateOnly(cursor),
          endDate: toUtcDateOnly(weekEndCursor),
          sortOrder: weekNum - 1,
        });
        weekNum++;
        cursor.setDate(cursor.getDate() + 7);
      }
      return weeks;
    }

    const result = await prisma.$transaction(async (tx) => {
      // Create the root goal
      const rootGoal = await tx.goal.create({
        data: {
          stackId,
          parentId: parentId ?? null,
          level,
          title,
          description: description ?? null,
          startDate: toUtcDateOnly(goalStart),
          endDate: toUtcDateOnly(goalEnd),
          sortOrder: siblingCount,
        },
      });

      // MONTHLY root: generate weekly goals directly underneath
      if (level === 'MONTHLY') {
        const weeks = generateWeeks(rootGoal.id, goalStart, goalEnd, true);
        if (weeks.length > 0) await tx.goal.createMany({ data: weeks });
        return rootGoal;
      }

      // HIGH_HARD (multi-year): STRATEGIC → MONTHLY → WEEKLY
      const startYear = goalStart.getFullYear();
      const endYear = goalEnd.getFullYear();

      const yearGoals: { id: string; year: number }[] = [];
      let yearOrder = 0;
      for (let year = startYear; year <= endYear; year++) {
        const yearGoal = await tx.goal.create({
          data: {
            stackId,
            parentId: rootGoal.id,
            level: 'STRATEGIC',
            title: `Yearly Goal ${yearOrder + 1}`,
            startDate: new Date(Date.UTC(year, 0, 1)),
            endDate: new Date(Date.UTC(year, 11, 31)),
            sortOrder: yearOrder++,
          },
        });
        yearGoals.push({ id: yearGoal.id, year });
      }

      // Batch-create monthly goals across all years
      const allMonthData: {
        stackId: string; parentId: string; level: 'MONTHLY';
        title: string; startDate: Date; endDate: Date; sortOrder: number;
      }[] = [];

      for (const { id: yearGoalId, year } of yearGoals) {
        const firstMonth = year === startYear ? goalStart.getMonth() : 0;
        const lastMonth = year === endYear ? goalEnd.getMonth() : 11;
        for (let month = firstMonth; month <= lastMonth; month++) {
          allMonthData.push({
            stackId,
            parentId: yearGoalId,
            level: 'MONTHLY' as const,
            title: `${monthNames[month]} ${year}`,
            startDate: new Date(Date.UTC(year, month, 1)),
            endDate: new Date(Date.UTC(year, month + 1, 0)),
            sortOrder: month - firstMonth,
          });
        }
      }

      if (allMonthData.length > 0) {
        await tx.goal.createMany({ data: allMonthData });
      }

      // Fetch all monthly goals, then generate weekly goals
      const yearGoalIds = yearGoals.map((yg) => yg.id);
      const allMonthlyGoals = await tx.goal.findMany({
        where: { stackId, parentId: { in: yearGoalIds }, level: 'MONTHLY', deletedAt: null },
        orderBy: { sortOrder: 'asc' },
        select: { id: true, startDate: true, endDate: true },
      });

      const allWeekData: {
        stackId: string; parentId: string; level: 'WEEKLY';
        title: string; startDate: Date; endDate: Date; sortOrder: number;
      }[] = [];

      for (let mi = 0; mi < allMonthlyGoals.length; mi++) {
        const mg = allMonthlyGoals[mi];
        if (!mg.startDate || !mg.endDate) continue;
        allWeekData.push(
          ...generateWeeks(mg.id, new Date(mg.startDate), new Date(mg.endDate), mi === 0)
        );
      }

      if (allWeekData.length > 0) {
        await tx.goal.createMany({ data: allWeekData });
      }

      return rootGoal;
    });

    return Response.json(result, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  }

  const goal = await prisma.goal.create({
    data: {
      stackId,
      parentId: parentId ?? null,
      level,
      title,
      description: description ?? null,
      startDate: parseDateOnly(startDate ?? null),
      endDate: parseDateOnly(endDate ?? null),
      sortOrder: siblingCount,
    },
  });

  if (goal.parentId) {
    await cascadeProgressUp(goal.parentId);
  }

  return Response.json(goal, { status: 201, headers: { 'Cache-Control': 'no-store' } });
}
