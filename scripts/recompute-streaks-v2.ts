// AIM streak recompute (v2) — daily-vs-weekly split with activeWeekdays support.
//
// Reads every active UserAim, recomputes currentStreak using the new engine,
// and writes the result. bestStreak is never lowered. Idempotent — safe to re-run.
//
// Usage (from prism/):
//   npx tsx scripts/recompute-streaks-v2.ts --dry-run
//   npx tsx scripts/recompute-streaks-v2.ts --user-id=abc123
//   npx tsx scripts/recompute-streaks-v2.ts
//
// Note: This script imports Prisma directly (unlike recompute-streaks.ts which
// calls the HTTP endpoint) because it adds a new code path not yet exposed via
// the cron API. Safe to merge and run before the cron endpoint is updated.

import { prisma } from '../src/lib/prisma';
import { recomputeAimStreaks } from '../src/lib/streak-recompute';

interface CliArgs {
  dryRun: boolean;
  userId?: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { dryRun: false };
  for (const a of argv.slice(2)) {
    if (a === '--dry-run') args.dryRun = true;
    else if (a.startsWith('--user-id=')) args.userId = a.slice('--user-id='.length);
    else {
      console.error(`[recompute-streaks-v2] Unknown arg: ${a}`);
      process.exit(1);
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  console.log(`[recompute-streaks-v2] Starting${args.dryRun ? ' (DRY RUN)' : ''}${args.userId ? ` user=${args.userId}` : ' all-users'}`);

  const userIds = args.userId
    ? [args.userId]
    : (await prisma.user.findMany({ select: { id: true } })).map((u) => u.id);

  let total = 0;
  let changed = 0;

  for (const userId of userIds) {
    const reports = await recomputeAimStreaks(userId, { dryRun: args.dryRun });
    for (const r of reports) {
      total++;
      const diff = r.after.currentStreak - r.before.currentStreak;
      if (diff !== 0) {
        changed++;
        console.log(
          `  ${userId} aim=${r.aimCategoryId} ${r.isDaily ? 'daily' : 'weekly'}: ` +
          `streak ${r.before.currentStreak} → ${r.after.currentStreak}` +
          (args.dryRun ? ' [dry-run]' : ''),
        );
      }
    }
  }

  console.log(
    `[recompute-streaks-v2] done: ${userIds.length} users, ${total} aims, ${changed} changed` +
    (args.dryRun ? ' (dry run — no writes)' : ''),
  );
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('[recompute-streaks-v2] fatal:', err);
  process.exit(1);
});
