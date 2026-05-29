import { prisma } from '@/lib/prisma';
import { getChildLevel } from '@/lib/goal-validation';

/**
 * Resolve the goal level that a parent KPI's rollup should aggregate from:
 * exactly one hierarchy level below the parent KPI's own goal
 * (HIGH_HARD←STRATEGIC, STRATEGIC←MONTHLY, MONTHLY←WEEKLY). Returns null when
 * the parent has no goal/level, in which case callers fall back to no level
 * constraint. This keeps a rollup from picking up grandchildren or skip-level
 * links — each KPI sums only the goals directly below it.
 */
async function expectedChildLevel(parentKpiId: string) {
  const parent = await prisma.kpi.findUnique({
    where: { id: parentKpiId },
    select: { goal: { select: { level: true } } },
  });
  return parent?.goal?.level ? getChildLevel(parent.goal.level) : null;
}

/**
 * Recalculate a monthly numeric KPI's actualValue from all linked weekly KPIs
 * whose parent goal is still live AND exactly one hierarchy level below.
 * actualValue = SUM of linked weekly KPIs' actualValue (null treated as 0).
 * Trashed-goal children are excluded so a deleted weekly doesn't continue
 * inflating the live monthly's rollup (ADR 11 — soft delete is Goal-only).
 */
export async function recalculateMonthlyNumericKpi(monthlyKpiId: string): Promise<void> {
  const childLevel = await expectedChildLevel(monthlyKpiId);

  const weeklyKpis = await prisma.kpi.findMany({
    where: {
      linkedKpiId: monthlyKpiId,
      goal: { deletedAt: null, ...(childLevel ? { level: childLevel } : {}) },
    },
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
 * If false → check if any other linked weekly KPIs (on live goals) are still
 *   complete; if none, revert monthly to incomplete. Children whose goal was
 *   soft-deleted are ignored — a trashed weekly shouldn't keep its monthly
 *   green (ADR 11).
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
    const childLevel = await expectedChildLevel(monthlyKpiId);
    const anyStillComplete = await prisma.kpi.findFirst({
      where: {
        linkedKpiId: monthlyKpiId,
        isComplete: true,
        goal: { deletedAt: null, ...(childLevel ? { level: childLevel } : {}) },
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
 * Recompute a KPI's linked parent, then chain upward through the full link
 * tree (weekly → monthly → strategic → HHG). The visited set is scoped to
 * this call so cycles in misconfigured data can't loop. Parents whose own
 * goal has been soft-deleted are skipped (no point recomputing a rollup the
 * UI never displays — ADR 11), but the walk continues upward so a live
 * grandparent above a trashed parent still gets refreshed.
 *
 * Each walk step pulls the parent's goal.deletedAt via the `linkedKpi`
 * relation in the same findUnique, avoiding an extra round-trip per level.
 *
 * Returns the ordered list of parent KPI ids that were actually recalculated
 * (immediate parent first, then up). Trashed-parent levels are not included
 * because their value didn't change. Clients use this to refresh the
 * displayed values of every parent in the chain in one round-trip.
 */
export async function cascadeKpiUpdate(kpiId: string): Promise<string[]> {
  const visited = new Set<string>();
  const chain: string[] = [];

  async function walk(id: string): Promise<void> {
    if (visited.has(id)) return;
    visited.add(id);

    const kpi = await prisma.kpi.findUnique({
      where: { id },
      select: {
        linkedKpiId: true,
        type: true,
        isComplete: true,
        // Peek at the parent's goal in the same query so we can skip the
        // recalc when the parent's goal is trashed.
        linkedKpi: {
          select: { goal: { select: { deletedAt: true } } },
        },
      },
    });
    if (!kpi || !kpi.linkedKpiId) return;

    const parentGoalAlive = kpi.linkedKpi?.goal?.deletedAt === null;
    if (parentGoalAlive) {
      if (kpi.type === 'NUMERIC') {
        await recalculateMonthlyNumericKpi(kpi.linkedKpiId);
      } else if (kpi.type === 'BINARY') {
        await recalculateBinaryKpi(kpi.linkedKpiId, kpi.isComplete);
      }
      chain.push(kpi.linkedKpiId);
    }

    await walk(kpi.linkedKpiId);
  }

  await walk(kpiId);
  return chain;
}
