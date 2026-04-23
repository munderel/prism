import { NextRequest } from 'next/server';
import { GoalLevel, KpiTimeLevel, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';

// Map the KPI dashboard's timeLevel to the goal level we scope to.
// Only WEEKLY / MONTHLY / YEARLY map; FIVE_YEAR / HHG are not exposed on the page.
const TIME_LEVEL_TO_GOAL_LEVEL: Partial<Record<KpiTimeLevel, GoalLevel>> = {
  [KpiTimeLevel.WEEKLY]: GoalLevel.WEEKLY,
  [KpiTimeLevel.MONTHLY]: GoalLevel.MONTHLY,
  [KpiTimeLevel.YEARLY]: GoalLevel.STRATEGIC,
};

interface GoalScopeKpi {
  id: string;
  name: string;
  type: string;
  unit: string | null;
  targetValue: number | null;
  actualValue: number | null;
  isComplete: boolean;
  completedAt: string | null;
  owner: { id: string; name: string | null; email: string; image: string | null } | null;
}

interface GoalScopeResponse {
  goal:
    | null
    | {
        id: string;
        title: string;
        level: GoalLevel;
        status: 'IN_PROGRESS';
        startDate: string;
        endDate: string;
        progressPct: number;
        stack: { id: string; name: string };
      };
  kpis: GoalScopeKpi[];
  meta: { timeLevel: string; mappedLevel: GoalLevel | null };
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const { searchParams } = request.nextUrl;

  const timeLevelParam = searchParams.get('timeLevel');
  const validTimeLevels = Object.values(KpiTimeLevel) as string[];
  if (!timeLevelParam || !validTimeLevels.includes(timeLevelParam)) {
    return Response.json(
      { error: `timeLevel is required and must be one of: ${validTimeLevels.join(', ')}` },
      { status: 400 },
    );
  }
  const timeLevel = timeLevelParam as KpiTimeLevel;
  const mappedLevel = TIME_LEVEL_TO_GOAL_LEVEL[timeLevel] ?? null;

  const empty: GoalScopeResponse = {
    goal: null,
    kpis: [],
    meta: { timeLevel, mappedLevel },
  };

  if (!mappedLevel) {
    return Response.json(empty);
  }

  const now = new Date();
  const isAdmin = auth.session.user.isAdmin ?? false;

  // Mirror checkStackReadAccess(): admins see all; otherwise owned | isCompany |
  // stack-level CompanyGoalAssignment | per-goal GoalAssignee.
  const stackAccessClause: Prisma.GoalWhereInput | undefined = isAdmin
    ? undefined
    : {
        OR: [
          { stack: { ownerId: auth.userId } },
          { stack: { isCompany: true } },
          { stack: { assignments: { some: { userId: auth.userId } } } },
          { assignees: { some: { userId: auth.userId } } },
        ],
      };

  const goal = await prisma.goal.findFirst({
    where: {
      level: mappedLevel,
      status: 'IN_PROGRESS',
      deletedAt: null,
      startDate: { lte: now },
      endDate: { gte: now },
      ...(stackAccessClause ?? {}),
    },
    orderBy: { updatedAt: 'desc' },
    include: {
      stack: { select: { id: true, name: true } },
      kpis: {
        orderBy: { sortOrder: 'asc' },
        include: {
          owner: { select: { id: true, name: true, email: true, image: true } },
        },
      },
    },
  });

  if (!goal || !goal.startDate || !goal.endDate) {
    return Response.json(empty);
  }

  const response: GoalScopeResponse = {
    goal: {
      id: goal.id,
      title: goal.title,
      level: goal.level,
      status: 'IN_PROGRESS',
      startDate: goal.startDate.toISOString(),
      endDate: goal.endDate.toISOString(),
      progressPct: goal.progressPct,
      stack: goal.stack,
    },
    kpis: goal.kpis.map((k) => ({
      id: k.id,
      name: k.name,
      type: k.type,
      unit: k.unit,
      targetValue: k.targetValue,
      actualValue: k.actualValue,
      isComplete: k.isComplete,
      completedAt: k.completedAt ? k.completedAt.toISOString() : null,
      owner: k.owner,
    })),
    meta: { timeLevel, mappedLevel },
  };

  return Response.json(response);
}
