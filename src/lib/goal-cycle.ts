import type { PrismaClient } from '@prisma/client';

// Walk the ancestor chain from `newParentId` upward. If `movingId` appears in
// the chain, the move would form a cycle (A -> ... -> moving -> A). Uses a
// visited set so a pre-existing cycle in the DB (e.g. from a bad direct
// write) surfaces as a diagnostic error instead of an infinite loop.
// Returns null when safe, or a Response with the appropriate status/body.

export const CYCLE_WALK_CAP = 128; // matches real tree depth with huge safety margin

export async function detectCycle(
  db: Pick<PrismaClient, 'goal'>,
  movingId: string,
  newParentId: string,
): Promise<Response | null> {
  const seen = new Set<string>();
  let cursor: string | null = newParentId;
  let hops = 0;
  while (cursor) {
    if (cursor === movingId) {
      return Response.json(
        { error: 'Cannot reparent a goal under its own descendant' },
        { status: 400 },
      );
    }
    if (seen.has(cursor)) {
      return Response.json(
        { error: 'Pre-existing cycle detected in goal tree' },
        { status: 500 },
      );
    }
    seen.add(cursor);
    if (++hops > CYCLE_WALK_CAP) {
      return Response.json(
        { error: 'Goal tree depth exceeds safety cap' },
        { status: 500 },
      );
    }
    const parent: { parentId: string | null } | null = await db.goal.findUnique({
      where: { id: cursor },
      select: { parentId: true },
    });
    cursor = parent?.parentId ?? null;
  }
  return null;
}
