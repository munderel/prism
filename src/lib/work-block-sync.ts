/**
 * Shared body builder for the Google Calendar event that mirrors a workblock.
 *
 * Both the create path (work-blocks/route.ts POST) and the update path
 * (work-blocks/[id]/route.ts PATCH — including the self-heal create-fallback
 * for older blocks that pre-date sync) need the same `summary` / `description`
 * shape. Keeping them in one place prevents the kind of drift that lost a
 * task title from the description in the PATCH fallback branch (issue from
 * PR #29 review).
 */
export function buildWorkBlockEventBody(opts: {
  taskTitle: string | null | undefined;
  mainObjective: string;
}): { summary: string; description: string } {
  const taskTitle = opts.taskTitle ?? 'Work block';
  return {
    // The workblock's user-authored objective is the canonical title across
    // every surface (Prism calendar, Google Calendar).
    summary: opts.mainObjective,
    // The task title surfaces in the description; mainObjective repeats so
    // the description is self-explanatory when read in Google Calendar away
    // from Prism's UI.
    description: `${taskTitle}\n${opts.mainObjective}`,
  };
}
