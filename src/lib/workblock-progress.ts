// Pure, client-safe progress helpers for work blocks.
// Kept separate from progress.ts (which imports prisma) so client components can import freely.

export type WorkBlockForProgress = {
  start: Date | string;
  end: Date | string;
  completionStatus: 'PENDING' | 'COMPLETED' | 'PARTIAL' | 'MISSED';
  actualMinutes?: number | null;
};

export type ClearGoalForProgress = { isComplete: boolean };

export type TaskScheduleState =
  | 'UNSCHEDULED'
  | 'PARTIALLY_SCHEDULED'
  | 'FULLY_SCHEDULED'
  | 'OVER_SCHEDULED';

function blockMinutes(b: WorkBlockForProgress): number {
  const startMs = (b.start instanceof Date ? b.start : new Date(b.start)).getTime();
  const endMs = (b.end instanceof Date ? b.end : new Date(b.end)).getTime();
  return Math.max(0, Math.round((endMs - startMs) / 60000));
}

export function computeScheduledMinutes(blocks: WorkBlockForProgress[]): number {
  return blocks.reduce((acc, b) => acc + blockMinutes(b), 0);
}

export function computeCompletedMinutes(blocks: WorkBlockForProgress[]): number {
  return blocks
    .filter((b) => b.completionStatus === 'COMPLETED' || b.completionStatus === 'PARTIAL')
    .reduce((acc, b) => acc + (b.actualMinutes ?? blockMinutes(b)), 0);
}

export function computeTaskTimeProgress(
  blocks: WorkBlockForProgress[],
  estimatedMinutes: number
): { completedMinutes: number; estimatedMinutes: number; percent: number; isOverrun: boolean } {
  const completed = computeCompletedMinutes(blocks);
  const percent = estimatedMinutes > 0 ? Math.round((completed / estimatedMinutes) * 100) : 0;
  return {
    completedMinutes: completed,
    estimatedMinutes,
    percent,
    isOverrun: completed > estimatedMinutes,
  };
}

export function computeTaskGoalsProgress(
  goals: ClearGoalForProgress[]
): { goalsHit: number; goalsDefined: number; percent: number } {
  const goalsDefined = goals.length;
  const goalsHit = goals.filter((g) => g.isComplete).length;
  const percent = goalsDefined > 0 ? Math.round((goalsHit / goalsDefined) * 100) : 0;
  return { goalsHit, goalsDefined, percent };
}

export function computeTaskScheduleState(
  blocks: WorkBlockForProgress[],
  estimatedMinutes: number
): TaskScheduleState {
  const scheduled = computeScheduledMinutes(blocks);
  if (scheduled === 0) return 'UNSCHEDULED';
  if (estimatedMinutes > 0 && scheduled > estimatedMinutes) return 'OVER_SCHEDULED';
  if (estimatedMinutes > 0 && scheduled >= estimatedMinutes) return 'FULLY_SCHEDULED';
  return 'PARTIALLY_SCHEDULED';
}

export function computeNextBlockMinutes(
  blocks: WorkBlockForProgress[],
  estimatedMinutes: number,
  defaultMinutes: number
): number {
  const scheduled = computeScheduledMinutes(blocks);
  const remaining = Math.max(0, estimatedMinutes - scheduled);
  if (remaining === 0) return defaultMinutes;
  return Math.min(defaultMinutes, remaining);
}
