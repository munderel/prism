import { prisma } from '@/lib/prisma';

type TaskLike = { status: string };
type GoalLike = { progressPct: number };
type LinkLike = { weight: number; individualGoal: { progressPct: number } };

/**
 * Compute progress for a leaf goal (no children) based on its tasks.
 * DROPPED tasks are excluded from the total count.
 */
export function computeLeafProgress(tasks: TaskLike[]): number {
  const activeTasks = tasks.filter((t) => t.status !== 'DROPPED');
  if (activeTasks.length === 0) return 0;
  const done = activeTasks.filter((t) => t.status === 'DONE').length;
  return Math.round((done / activeTasks.length) * 100);
}

/**
 * Compute progress for a parent goal as the average of its children.
 */
export function computeParentProgress(children: GoalLike[]): number {
  if (children.length === 0) return 0;
  const sum = children.reduce((acc, c) => acc + c.progressPct, 0);
  return Math.round(sum / children.length);
}

/**
 * Compute progress for a company goal from weighted GoalLinks.
 */
export function computeLinkedProgress(links: LinkLike[]): number {
  if (links.length === 0) return 0;
  const totalWeight = links.reduce((acc, l) => acc + l.weight, 0);
  if (totalWeight === 0) return 0;
  const weightedSum = links.reduce(
    (acc, l) => acc + l.individualGoal.progressPct * l.weight,
    0
  );
  return Math.round(weightedSum / totalWeight);
}

const MAX_CASCADE_DEPTH = 20;

/**
 * Recompute a goal's progress from current DB state and persist it.
 * Then cascade upward through all ancestors in a loop (avoids recursive N+1 queries).
 */
export async function cascadeProgressUp(goalId: string): Promise<void> {
  let currentId: string | null = goalId;

  for (let depth = 0; currentId && depth < MAX_CASCADE_DEPTH; depth++) {
    const goal = await prisma.goal.findUnique({
      where: { id: currentId },
      select: {
        id: true,
        parentId: true,
        status: true,
        deletedAt: true,
        children: { where: { deletedAt: null }, select: { progressPct: true } },
        tasks: { select: { status: true } },
        companyGoalLinks: {
          include: { individualGoal: { select: { progressPct: true } } },
        },
      },
    });

    if (!goal || goal.deletedAt) return;

    let progress: number;

    // Priority: children > companyGoalLinks > tasks.
    if (goal.children.length > 0) {
      progress = computeParentProgress(goal.children);
    } else if (goal.companyGoalLinks.length > 0) {
      progress = computeLinkedProgress(goal.companyGoalLinks);
    } else if (goal.tasks.length > 0) {
      progress = computeLeafProgress(goal.tasks);
    } else {
      progress = 0;
    }

    // Auto-update status based on progress (never override manual COMPLETED or ABANDONED)
    const statusUpdate: Record<string, string> = {};
    if (progress === 100 && (goal.status === 'NOT_STARTED' || goal.status === 'IN_PROGRESS')) {
      statusUpdate.status = 'COMPLETED';
    } else if (progress > 0 && goal.status === 'NOT_STARTED') {
      statusUpdate.status = 'IN_PROGRESS';
    }

    await prisma.goal.update({
      where: { id: currentId },
      data: { progressPct: progress, ...statusUpdate },
    });

    currentId = goal.parentId as string | null;
  }
}
