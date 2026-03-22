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
    // Company report: all users
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        tasks: { select: { status: true, taskType: true, completedAt: true, failedAt: true, recurrenceRule: true, title: true } },
      },
    });

    const teamTotal = users.reduce((sum, u) => sum + u.tasks.length, 0);
    const teamCompleted = users.reduce((sum, u) => sum + u.tasks.filter((t) => t.status === 'DONE').length, 0);

    const perPerson = users.map((u) => ({
      name: u.name ?? 'Unknown',
      total: u.tasks.length,
      completionRate: u.tasks.length > 0
        ? Math.round((u.tasks.filter((t) => t.status === 'DONE').length / u.tasks.length) * 100)
        : 0,
    }));

    // Company goal progress
    const companyStacks = await prisma.goalStack.findMany({
      where: { isCompany: true },
      include: {
        goals: {
          where: { deletedAt: null, parentId: null },
          select: { title: true, progressPct: true },
        },
      },
    });

    const goalProgress = companyStacks.flatMap((s) =>
      s.goals.map((g) => ({ title: g.title, progress: g.progressPct }))
    );

    // Leverage analysis for maintenance tasks
    const allMaintenance = users.flatMap((u) =>
      u.tasks.filter((t) => t.taskType === 'MAINTENANCE')
    );
    const leverageAnalysis = computeLeverageAnalysis(allMaintenance);

    return Response.json({
      teamCompletion: teamTotal > 0 ? Math.round((teamCompleted / teamTotal) * 100) : 0,
      perPerson,
      goalProgress,
      leverageAnalysis,
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

  return Response.json(report);
}
