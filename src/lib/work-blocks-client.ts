import type { TaskLevelClearGoal } from '@/components/calendar/WorkBlockObjectiveModal';

export interface CreateWorkBlockPayload {
  taskId: string;
  start: Date;
  end: Date;
  mainObjective: string;
  clearGoals?: string[];
}

export async function createWorkBlock(payload: CreateWorkBlockPayload): Promise<Response> {
  return fetch('/api/work-blocks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      taskId: payload.taskId,
      start: payload.start.toISOString(),
      end: payload.end.toISOString(),
      mainObjective: payload.mainObjective,
      clearGoals: payload.clearGoals ?? [],
    }),
  });
}

export async function patchWorkBlock(id: string, body: Record<string, unknown>): Promise<Response> {
  return fetch(`/api/work-blocks/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function deleteWorkBlock(id: string): Promise<Response> {
  return fetch(`/api/work-blocks/${id}`, { method: 'DELETE' });
}

export interface TaskWorkBlockHints {
  /** task.deliverable free-text, used as the create-mode main-objective default. */
  deliverable: string | null;
  /** Task-level (workBlockId=null) clear goals available to carry into a new workblock. */
  clearGoals: TaskLevelClearGoal[];
  /** Total minutes already scheduled across this task's existing workblocks. */
  scheduledMinutes: number;
  /** Task's stored estimatedMinutes; null when the task didn't provide one. */
  estimatedMinutes: number | null;
}

/**
 * Single fetch for everything the work-block naming modal needs to pre-populate
 * a sensible default — deliverable for the main-objective seed, clear goals to
 * carry over, and the schedule arithmetic so callers can derive a proposed
 * duration. Returns safe fallbacks rather than throwing.
 */
export async function fetchTaskWorkBlockHints(taskId: string): Promise<TaskWorkBlockHints> {
  const empty: TaskWorkBlockHints = {
    deliverable: null,
    clearGoals: [],
    scheduledMinutes: 0,
    estimatedMinutes: null,
  };
  try {
    const res = await fetch(`/api/tasks/${taskId}`);
    if (!res.ok) return empty;
    const task = await res.json();
    const deliverable = typeof task.deliverable === 'string' && task.deliverable.trim().length > 0
      ? task.deliverable
      : null;
    const clearGoals = Array.isArray(task.clearGoals)
      ? task.clearGoals
          .filter((g: { workBlockId?: string | null }) => !g.workBlockId)
          .map((g: { id: string; text: string }): TaskLevelClearGoal => ({ id: g.id, text: g.text }))
      : [];
    const scheduledMinutes = Array.isArray(task.workBlocks)
      ? task.workBlocks.reduce((acc: number, b: { start: string; end: string }) => {
          const dur = Math.max(0, Math.round((new Date(b.end).getTime() - new Date(b.start).getTime()) / 60000));
          return acc + dur;
        }, 0)
      : 0;
    const estimatedMinutes = typeof task.estimatedMinutes === 'number' ? task.estimatedMinutes : null;
    return { deliverable, clearGoals, scheduledMinutes, estimatedMinutes };
  } catch {
    return empty;
  }
}
