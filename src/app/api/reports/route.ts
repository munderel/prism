import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { computeIndividualReport, computeLeverageAnalysis } from '@/lib/reports';
import { cacheHeaders } from '@/lib/api-helpers';

const TASK_REPORT_SELECT = {
  status: true, taskType: true, completedAt: true, failedAt: true, recurrenceRule: true, title: true,
} as const;

function completionRate(done: number, total: number): number {
  return total > 0 ? Math.round((done / total) * 100) : 0;
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const type = request.nextUrl.searchParams.get('type');

  if (type === 'company') {
    return companyReport();
  }

  return individualReport(auth.userId);
}

async function companyReport(): Promise<Response> {
  const [taskCounts, users, companyStacks, maintenanceTasks] = await Promise.all([
    prisma.task.groupBy({
      by: ['ownerId', 'status'],
      _count: true,
    }),
    prisma.user.findMany({
      select: { id: true, name: true },
    }),
    prisma.goalStack.findMany({
      where: { isCompany: true },
      include: {
        goals: {
          where: { deletedAt: null, parentId: null },
          select: { title: true, progressPct: true },
        },
      },
    }),
    prisma.task.findMany({
      where: { taskType: 'MAINTENANCE' },
      select: TASK_REPORT_SELECT,
    }),
  ]);

  // Build per-person stats from grouped counts
  const perPersonMap = new Map<string, { total: number; done: number }>();
  for (const row of taskCounts) {
    const entry = perPersonMap.get(row.ownerId) ?? { total: 0, done: 0 };
    entry.total += row._count;
    if (row.status === 'DONE') entry.done += row._count;
    perPersonMap.set(row.ownerId, entry);
  }

  let teamTotal = 0;
  let teamCompleted = 0;
  const perPerson = users.map((u) => {
    const stats = perPersonMap.get(u.id) ?? { total: 0, done: 0 };
    teamTotal += stats.total;
    teamCompleted += stats.done;
    return {
      name: u.name ?? 'Unknown',
      total: stats.total,
      completionRate: completionRate(stats.done, stats.total),
    };
  });

  const goalProgress = companyStacks.flatMap((s) =>
    s.goals.map((g) => ({ title: g.title, progress: g.progressPct }))
  );

  return Response.json({
    teamCompletion: completionRate(teamCompleted, teamTotal),
    perPerson,
    goalProgress,
    leverageAnalysis: computeLeverageAnalysis(maintenanceTasks),
  }, {
    headers: cacheHeaders(60, 300),
  });
}

async function individualReport(userId: string): Promise<Response> {
  const [tasks, streak] = await Promise.all([
    prisma.task.findMany({
      where: { ownerId: userId },
      select: TASK_REPORT_SELECT,
    }),
    prisma.streak.findUnique({
      where: { userId_streakType: { userId, streakType: 'daily' } },
    }),
  ]);

  return Response.json(computeIndividualReport(tasks, streak), {
    headers: cacheHeaders(60, 300),
  });
}
