import { useEffect, useState } from 'react';

/**
 * Relation fields that list-row callers often omit when passing a Task prop
 * to TaskEditor. The editor fetches the full task once on mount and uses
 * whichever side is defined (fetched > prop) for these specific keys only.
 *
 * Typed as `any[]` / `any` to match the surrounding TaskEditor surface area
 * (which is also `any`-typed for the task prop). Tightening these would
 * require a coordinated typing pass through TaskEditor — out of scope here.
 */
export interface TaskHydrationRelations {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  workBlocks?: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  deliverableItems?: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  assignee?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  goal?: any;
}

/**
 * Fetch a task's relation fields when the caller passed a partial task.
 *
 * Behavior: if `task.id` is present but `workBlocks` or `deliverableItems`
 * are undefined, fetches /api/tasks/{id} once and stores the relation
 * subset. Failures are swallowed — the editor falls back to whatever the
 * prop already had.
 *
 * Returns:
 * - `fetchedRelations`: the network result (or null when not yet fetched
 *   or no hydration was needed). Use this to detect arrival inside effects.
 * - `hydratedTask`: the input task merged with fetched relations (fetched
 *   values win when defined). Use this for relation-heavy computed values
 *   like hours summary and the deliverable checklist.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useTaskHydration(task: any | undefined | null): {
  fetchedRelations: TaskHydrationRelations | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  hydratedTask: any | null;
} {
  const [fetchedRelations, setFetchedRelations] = useState<TaskHydrationRelations | null>(null);

  useEffect(() => {
    if (!task?.id) return;
    const needsHydration =
      task.workBlocks === undefined || task.deliverableItems === undefined;
    if (!needsHydration) return;
    let cancelled = false;
    fetch(`/api/tasks/${task.id}`, { signal: AbortSignal.timeout(10000) })
      .then((r) => (r.ok ? r.json() : null))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((data: any) => {
        if (cancelled || !data) return;
        setFetchedRelations({
          workBlocks: data.workBlocks,
          deliverableItems: data.deliverableItems,
          assignee: data.assignee,
          goal: data.goal,
        });
      })
      .catch(() => {
        /* ignore; editor falls back to the partial task */
      });
    return () => {
      cancelled = true;
    };
  }, [task?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const hydratedTask = task
    ? {
        ...task,
        workBlocks: fetchedRelations?.workBlocks ?? task.workBlocks,
        deliverableItems: fetchedRelations?.deliverableItems ?? task.deliverableItems,
        assignee: fetchedRelations?.assignee ?? task.assignee,
        goal: fetchedRelations?.goal ?? task.goal,
      }
    : null;

  return { fetchedRelations, hydratedTask };
}
