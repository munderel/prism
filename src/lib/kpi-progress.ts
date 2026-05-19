import { prisma } from '@/lib/prisma';

/**
 * Recalculate a monthly numeric KPI's actualValue from all linked weekly KPIs.
 * actualValue = SUM of linked weekly KPIs' actualValue (null treated as 0).
 */
export async function recalculateMonthlyNumericKpi(monthlyKpiId: string): Promise<void> {
  const weeklyKpis = await prisma.kpi.findMany({
    where: { linkedKpiId: monthlyKpiId },
    select: { actualValue: true },
  });

  const total = weeklyKpis.reduce((sum, kpi) => sum + (kpi.actualValue ?? 0), 0);

  await prisma.kpi.update({
    where: { id: monthlyKpiId },
    data: { actualValue: total },
  });
}

/**
 * Recalculate a monthly binary KPI's isComplete status from linked weekly KPIs.
 * If weeklyIsComplete is true → auto-complete monthly.
 * If false → check if any other linked weekly KPIs are still complete;
 *   if none, revert monthly to incomplete.
 */
export async function recalculateBinaryKpi(
  monthlyKpiId: string,
  weeklyIsComplete: boolean
): Promise<void> {
  if (weeklyIsComplete) {
    await prisma.kpi.update({
      where: { id: monthlyKpiId },
      data: { isComplete: true, completedAt: new Date() },
    });
  } else {
    const anyStillComplete = await prisma.kpi.findFirst({
      where: {
        linkedKpiId: monthlyKpiId,
        isComplete: true,
      },
    });

    if (!anyStillComplete) {
      await prisma.kpi.update({
        where: { id: monthlyKpiId },
        data: { isComplete: false, completedAt: null },
      });
    }
  }
}

/**
 * Recompute a KPI's linked parent, then chain upward through the full
 * link tree (weekly → monthly → quarterly → yearly → HHG). `visited`
 * guards against cycles in misconfigured data.
 */
export async function cascadeKpiUpdate(kpiId: string, visited: Set<string> = new Set()): Promise<void> {
  if (visited.has(kpiId)) return;
  visited.add(kpiId);

  const kpi = await prisma.kpi.findUnique({
    where: { id: kpiId },
    select: { linkedKpiId: true, type: true, actualValue: true, isComplete: true },
  });

  if (!kpi || !kpi.linkedKpiId) return;

  if (kpi.type === 'NUMERIC') {
    await recalculateMonthlyNumericKpi(kpi.linkedKpiId);
  } else if (kpi.type === 'BINARY') {
    await recalculateBinaryKpi(kpi.linkedKpiId, kpi.isComplete);
  }

  await cascadeKpiUpdate(kpi.linkedKpiId, visited);
}
