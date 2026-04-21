import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from './prisma';

// Postgres requires pg_advisory_xact_lock arguments to fit in int8 (bigint).
// hashtext(text) returns int4, which PG widens transparently, so we use it
// to derive a stable lock id from any string key.

/**
 * Race-safe conditional update. Wraps `updateMany` and reports whether THIS
 * caller won the race (count === 1). Other concurrent callers whose predicate
 * no longer matches get count === 0.
 *
 * Example:
 *   const won = await conditionalUpdate(prisma.review, {
 *     where: { id, completedAt: null },
 *     data: { completedAt: new Date() },
 *   });
 *   if (!won) return; // another caller completed first
 */
export async function conditionalUpdate<
  Model extends { updateMany: (args: Args) => Promise<{ count: number }> },
  Args,
>(model: Model, args: Args): Promise<boolean> {
  const result = await model.updateMany(args);
  return result.count === 1;
}

/**
 * Postgres transaction-scoped advisory lock keyed by a string or number.
 * Serializes any concurrent execution that acquires the same key. The lock
 * auto-releases at commit or rollback — safe against leaks from panics or
 * aborted serverless invocations.
 *
 * Use for cron idempotency, generator race windows, and any
 * read-decide-write sequence that would otherwise need application-level
 * locking.
 *
 * Example:
 *   await advisoryLock(`process-gen:${processId}`, async (tx) => {
 *     const existing = await tx.task.count({ where: { processId, periodStart } });
 *     if (existing > 0) return;
 *     await tx.task.createMany({ data: rows, skipDuplicates: true });
 *   });
 */
export async function advisoryLock<T>(
  key: string | number,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  client: PrismaClient = defaultPrisma,
): Promise<T> {
  return client.$transaction(async (tx) => {
    if (typeof key === 'number') {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${BigInt(key)})`;
    } else {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key})::bigint)`;
    }
    return fn(tx);
  });
}
