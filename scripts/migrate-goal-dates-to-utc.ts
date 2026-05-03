// One-shot migration: rewrite every Goal.{startDate,endDate,dueDate} so the
// stored timestamp is UTC midnight of the calendar date the creator originally
// picked. Pre-convention, Goal date-only fields were stored as local midnight
// (parseLocalDate) or as UTC end-of-day (auto-gen weekly/monthly endDates).
// formatDateOnly anchors display to UTC, so any row that wasn't already UTC
// midnight of its intended local date will display incorrectly until migrated.
//
// Per row × per field:
//   1. Look up the creator's timezone (User.timezone, defaults to America/New_York).
//   2. Compute the YYYY-MM-DD that the stored timestamp represented in the
//      creator's local calendar (Intl.DateTimeFormat with timeZone).
//   3. Re-anchor as UTC midnight of that date.
//   4. Skip the write if the value already matches (idempotent).
//
// Run:
//   npm run migrate-goal-dates              -> dry-run (default)
//   npm run migrate-goal-dates -- --apply   -> actually write

import { prisma } from '../src/lib/prisma';
import { parseDateOnly } from '../src/lib/date-utils';

const APPLY = process.argv.includes('--apply');
const BATCH_SIZE = 500;

type DateField = 'startDate' | 'endDate' | 'dueDate';
const FIELDS: DateField[] = ['startDate', 'endDate', 'dueDate'];

// Cache one Intl.DateTimeFormat per timezone so we don't reconstruct it per row.
const formatterCache = new Map<string, Intl.DateTimeFormat>();
function localDateInTz(d: Date, tz: string): string {
  let fmt = formatterCache.get(tz);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    formatterCache.set(tz, fmt);
  }
  // en-CA returns YYYY-MM-DD which parseDateOnly accepts directly.
  return fmt.format(d);
}

async function main() {
  console.log(
    `[migrate-goal-dates] Scanning Goal rows. Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`,
  );

  const total = await prisma.goal.count({
    where: {
      OR: [
        { startDate: { not: null } },
        { endDate: { not: null } },
        { dueDate: { not: null } },
      ],
    },
  });

  console.log(`[migrate-goal-dates] ${total} candidate row(s) to inspect.`);

  let scanned = 0;
  let updated = 0;
  let unchanged = 0;
  let skip = 0;

  // Cursor through in batches keyed by id to avoid loading the full table.
  let cursorId: string | undefined;
  while (true) {
    const batch = await prisma.goal.findMany({
      where: {
        OR: [
          { startDate: { not: null } },
          { endDate: { not: null } },
          { dueDate: { not: null } },
        ],
      },
      select: {
        id: true,
        startDate: true,
        endDate: true,
        dueDate: true,
        stack: { select: { ownerId: true } },
      },
      take: BATCH_SIZE,
      orderBy: { id: 'asc' },
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
    });
    if (batch.length === 0) break;

    // Resolve creator timezones in one query per batch.
    const ownerIds = Array.from(
      new Set(batch.map((g) => g.stack?.ownerId).filter((x): x is string => !!x)),
    );
    const owners = await prisma.user.findMany({
      where: { id: { in: ownerIds } },
      select: { id: true, timezone: true },
    });
    const tzByOwner = new Map(owners.map((o) => [o.id, o.timezone || 'America/New_York']));

    for (const g of batch) {
      scanned++;
      const tz = (g.stack?.ownerId && tzByOwner.get(g.stack.ownerId)) || 'America/New_York';

      const patch: Partial<Record<DateField, Date>> = {};
      let rowChanged = false;
      for (const field of FIELDS) {
        const current = g[field];
        if (!current) continue;
        const localKey = localDateInTz(current, tz);
        const target = parseDateOnly(localKey);
        if (!target) {
          skip++;
          continue;
        }
        if (current.getTime() !== target.getTime()) {
          patch[field] = target;
          rowChanged = true;
        }
      }

      if (!rowChanged) {
        unchanged++;
        continue;
      }

      if (APPLY) {
        await prisma.goal.update({ where: { id: g.id }, data: patch });
      }
      updated++;
    }

    cursorId = batch[batch.length - 1].id;
    console.log(`[migrate-goal-dates] progress: scanned=${scanned} updated=${updated} unchanged=${unchanged}`);
  }

  console.log(
    `[migrate-goal-dates] Done. scanned=${scanned} updated=${updated} unchanged=${unchanged} skipped_invalid=${skip}` +
      (APPLY ? '' : ' (DRY-RUN: no writes)'),
  );
}

main()
  .catch((err) => {
    console.error('[migrate-goal-dates] Fatal:', err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
