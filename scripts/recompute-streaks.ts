// One-shot recovery: walks each user's PowerdownSession history and rewrites
// their `daily` and `powerdown` Streak rows from the source of truth. Idempotent
// — safe to re-run, safe to invoke from CI. Posts to /api/cron/streaks-recompute
// (which uses the same CRON_SECRET-bearer auth as the rest of /api/cron) so
// the connection pool / Prisma adapter config stays in one place.
//
// Usage (from prism/):
//   CRON_SECRET=... BASE_URL=https://your-app.vercel.app \
//     npx tsx scripts/recompute-streaks.ts --dry-run
//
//   CRON_SECRET=... BASE_URL=https://your-app.vercel.app \
//     npx tsx scripts/recompute-streaks.ts --user-id=abc123
//
// Defaults to writing (no --dry-run) against all users.

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
      console.error(`[recompute-streaks] Unknown arg: ${a}`);
      process.exit(1);
    }
  }
  return args;
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`[recompute-streaks] Missing required env: ${name}`);
    process.exit(1);
  }
  return v;
}

async function main() {
  const args = parseArgs(process.argv);
  const baseUrl = requireEnv('BASE_URL').replace(/\/$/, '');
  const secret = requireEnv('CRON_SECRET');

  const url = `${baseUrl}/api/cron/streaks-recompute`;
  console.log(`[recompute-streaks] POST ${url} ${args.dryRun ? '(dry-run)' : '(WRITE)'}${args.userId ? ` user=${args.userId}` : ' all-users'}`);

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'authorization': `Bearer ${secret}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ dryRun: args.dryRun, userId: args.userId }),
  });

  const body = await res.text();
  if (!res.ok) {
    console.error(`[recompute-streaks] HTTP ${res.status}:`, body);
    process.exit(1);
  }

  const json = JSON.parse(body) as {
    total: number;
    applied: number;
    dryRun: boolean;
    reports: Array<{
      userId: string;
      computed: { currentCount: number; bestCount: number; lastStamp: string | null };
      before: {
        daily: { currentCount: number; bestCount: number } | null;
        powerdown: { currentCount: number; bestCount: number } | null;
      };
    }>;
  };

  let drift = 0;
  for (const r of json.reports) {
    const beforeDaily = r.before.daily?.currentCount ?? 0;
    const beforePowerdown = r.before.powerdown?.currentCount ?? 0;
    const computed = r.computed.currentCount;
    if (beforeDaily !== computed || beforePowerdown !== computed) {
      drift++;
      console.log(
        `  ${r.userId}: daily ${beforeDaily} → ${computed}, powerdown ${beforePowerdown} → ${computed}` +
        ` (best=${r.computed.bestCount}, lastStamp=${r.computed.lastStamp ?? 'none'})`
      );
    }
  }

  console.log(`[recompute-streaks] total=${json.total} applied=${json.applied} dryRun=${json.dryRun} drift=${drift}`);
}

main().catch((err) => {
  console.error('[recompute-streaks] fatal:', err);
  process.exit(1);
});
