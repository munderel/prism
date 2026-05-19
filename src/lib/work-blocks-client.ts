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

export async function fetchTaskLevelClearGoals(taskId: string): Promise<TaskLevelClearGoal[]> {
  const { clearGoals } = await fetchTaskWorkBlockHints(taskId);
  return clearGoals;
}

export interface TaskWorkBlockHints {
  /** task.deliverable free-text, used as the create-mode main-objective default. */
  deliverable: string | null;
  /** Task-level (workBlockId=null) clear goals available to carry into a new workblock. */
  clearGoals: TaskLevelClearGoal[];
}

/**
 * Single fetch for everything the work-block naming modal needs to pre-populate
 * a sensible default. Returns empty fallbacks rather than throwing — the modal
 * is still useful with no hints.
 */
export async function fetchTaskWorkBlockHints(taskId: string): Promise<TaskWorkBlockHints> {
  try {
    const res = await fetch(`/api/tasks/${taskId}`);
    if (!res.ok) return { deliverable: null, clearGoals: [] };
    const task = await res.json();
    const deliverable = typeof task.deliverable === 'string' && task.deliverable.trim().length > 0
      ? task.deliverable
      : null;
    const clearGoals = Array.isArray(task.clearGoals)
      ? task.clearGoals
          .filter((g: { workBlockId?: string | null }) => !g.workBlockId)
          .map((g: { id: string; text: string }): TaskLevelClearGoal => ({ id: g.id, text: g.text }))
      : [];
    return { deliverable, clearGoals };
  } catch {
    return { deliverable: null, clearGoals: [] };
  }
}
