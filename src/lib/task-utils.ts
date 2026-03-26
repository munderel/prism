export function isTaskOverdue(task: { dueDate?: string | Date | null; status: string }): boolean {
  return !!task.dueDate && new Date(task.dueDate) < new Date() && task.status !== 'DONE';
}
