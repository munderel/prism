import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { computeIndividualReport, computeLeverageAnalysis } from '@/lib/reports';

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type'); // 'individual' | 'company'

  if (type === 'company') {
    // Company report: use aggregation instead of loading all task rows
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
        select: { status: true, taskType: true, completedAt: true, failedAt: true, recurrenceRule: true, title: true },
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
        completionRate: stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0,
      };
    });

    const goalProgress = companyStacks.flatMap((s) =>
      s.goals.map((g) => ({ title: g.title, progress: g.progressPct }))
    );

    const leverageAnalysis = computeLeverageAnalysis(maintenanceTasks);

    return new Response(JSON.stringify({
      teamCompletion: teamTotal > 0 ? Math.round((teamCompleted / teamTotal) * 100) : 0,
      perPerson,
      goalProgress,
      leverageAnalysis,
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'private, max-age=60, stale-while-revalidate=300',
      },
    });
  }

  // Individual report (default)
  const tasks = await prisma.task.findMany({
    where: { ownerId: auth.userId },
    select: { status: true, taskType: true, completedAt: true, failedAt: true, recurrenceRule: true, title: true },
  });

  const streak = await prisma.streak.findUnique({
    where: { userId_streakType: { userId: auth.userId, streakType: 'daily_completion' } },
  });

  const report = computeIndividualReport(tasks, streak);

  return new Response(JSON.stringify(report), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'private, max-age=60, stale-while-revalidate=300',
    },
  });
}
