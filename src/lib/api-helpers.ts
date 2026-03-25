/**
 * Pick only defined (non-undefined) fields from an input object.
 * Useful in PATCH handlers to build partial update payloads.
 */
export function pickDefined<T extends Record<string, unknown>>(
  input: Record<string, unknown>,
  fields: string[]
): Partial<T> {
  const data: Record<string, unknown> = {};
  for (const field of fields) {
    if (input[field] !== undefined) {
      data[field] = input[field];
    }
  }
  return data as Partial<T>;
}

/**
 * Enrich a training item (with included trainingTasks→task) with progress counts.
 */
export function enrichTrainingProgress<
  T extends { trainingTasks: { task: { status: string } }[] }
>(item: T) {
  const totalTasks = item.trainingTasks.length;
  const completedTasks = item.trainingTasks.filter(
    (tt) => tt.task.status === 'DONE'
  ).length;
  return {
    ...item,
    totalTasks,
    completedTasks,
    progressPct: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
  };
}
