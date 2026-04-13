import { getLocalDateString } from '@/lib/date-utils';

export function isTaskOverdue(task: { dueDate?: string | Date | null; status: string }): boolean {
  if (!task.dueDate || task.status === 'DONE') return false;
  const dueDateStr = typeof task.dueDate === 'string'
    ? task.dueDate.split('T')[0]
    : getLocalDateString(task.dueDate);
  return dueDateStr < getLocalDateString();
}

/** Count subtasks with status 'DONE'. */
export function subtaskDoneCount(children: { status: string }[] | undefined | null): number {
  if (!children) return 0;
  return children.filter((c) => c.status === 'DONE').length;
}
