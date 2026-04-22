/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from 'vitest';
import { detectCycle } from '@/lib/goal-cycle';

// Builds a mock `prisma.goal.findUnique` that walks a fixed
// childId -> parentId map. Passing a key->self entry creates a
// self-loop for the cycle-recovery test.
function makeDb(parentById: Record<string, string | null>) {
  const findUnique = vi.fn(async ({ where }: { where: { id: string } }) => {
    if (!(where.id in parentById)) return null;
    return { parentId: parentById[where.id] };
  });
  return { db: { goal: { findUnique } } as any, findUnique };
}

describe('detectCycle (Critical #16)', () => {
  it('returns null when new parent is not in the moving goal descendant chain', async () => {
    // Tree: root -> A -> B (moving); want to move B to a sibling C (child of root)
    const { db } = makeDb({
      root: null,
      A: 'root',
      B: 'A',
      C: 'root',
    });
    const res = await detectCycle(db, 'B', 'C');
    expect(res).toBeNull();
  });

  it('rejects 400 when the new parent IS the moving goal itself', async () => {
    const { db } = makeDb({ A: null });
    const res = await detectCycle(db, 'A', 'A');
    expect(res).not.toBeNull();
    expect(res!.status).toBe(400);
  });

  it('rejects 400 when the new parent is a descendant of the moving goal', async () => {
    // A -> B -> C; try to move A under C
    const { db } = makeDb({
      A: null,
      B: 'A',
      C: 'B',
    });
    const res = await detectCycle(db, 'A', 'C');
    expect(res).not.toBeNull();
    expect(res!.status).toBe(400);
    const body = await res!.json();
    expect(body.error).toMatch(/descendant/i);
  });

  it('returns 500 when the DB already contains a cycle (self-loop)', async () => {
    const { db } = makeDb({ selfloop: 'selfloop' });
    const res = await detectCycle(db, 'moving', 'selfloop');
    expect(res).not.toBeNull();
    expect(res!.status).toBe(500);
    const body = await res!.json();
    expect(body.error).toMatch(/cycle/i);
  });

  it('returns 500 when an existing cycle loops through multiple nodes', async () => {
    const { db } = makeDb({ X: 'Y', Y: 'Z', Z: 'X' });
    const res = await detectCycle(db, 'moving', 'X');
    expect(res).not.toBeNull();
    expect(res!.status).toBe(500);
  });

  it('short-circuits at the root (parentId=null)', async () => {
    const { db, findUnique } = makeDb({ root: null });
    const res = await detectCycle(db, 'moving', 'root');
    expect(res).toBeNull();
    expect(findUnique).toHaveBeenCalledTimes(1);
  });
});
