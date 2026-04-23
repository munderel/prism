import type { TaskLevelClearGoal } from '@/components/calendar/WorkBlockObjectiveModal';

export interface CreateWorkBlockPayload {
  taskId: string;
  start: Date;
  end: Date;
  mainObjective: string;
  subGoals?: string[];
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
      subGoals: payload.subGoals ?? [],
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
  try {
    const res = await fetch(`/api/tasks/${taskId}`);
    if (!res.ok) return [];
    const task = await res.json();
    if (!Array.isArray(task.clearGoals)) return [];
    return task.clearGoals
      .filter((g: { workBlockId?: string | null }) => !g.workBlockId)
      .map((g: { id: string; text: string }): TaskLevelClearGoal => ({ id: g.id, text: g.text }));
  } catch {
    return [];
  }
}
