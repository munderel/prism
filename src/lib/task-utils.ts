export function isTaskOverdue(task: { dueDate?: string | Date | null; status: string }): boolean {
  return !!task.dueDate && new Date(task.dueDate) < new Date() && task.status !== 'DONE';
}

/** Count subtasks with status 'DONE'. */
export function subtaskDoneCount(children: { status: string }[] | undefined | null): number {
  if (!children) return 0;
  return children.filter((c) => c.status === 'DONE').length;
}
