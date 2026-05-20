// One-shot recompute of every KPI's parent chain via cascadeKpiUpdate.
//
// Why: cascadeKpiUpdate was non-recursive before — weekly → monthly worked
// but monthly → strategic / HHG never fired. Existing rollup rows are stale.
// After deploying the recursive cascade, run this once to snap every parent
// KPI to a correct aggregation from its current linked children.
//
// Strategy:
//   - Iterate KPIs whose parent goal is live (deletedAt: null).
//   - For each KPI, call cascadeKpiUpdate which (a) recalculates the
//     immediate parent and (b) recursively walks upward. Each call is
//     idempotent — re-running this script is safe.
//   - Walk bottom-up by KPI's goal level so a parent is recomputed
//     after all its children have contributed.
//   - One failing KPI does NOT abort the script — log the id, continue,
//     and report a final failure count so the run is operator-resumable
//     instead of "crashed somewhere, no idea where."
//
//   npx tsx scripts/recompute-kpi-rollups.ts [--dry-run]

import { GoalLevel } from '@prisma/client';
import { prisma } from '../src/lib/prisma';
import { cascadeKpiUpdate } from '../src/lib/kpi-progress';

const dryRun = process.argv.includes('--dry-run');

// Bottom-up so each level's update reaches an already-current child.
// HIGH_HARD is intentionally last — nothing above to cascade into.
// DAILY is omitted because KPI_ALLOWED_LEVELS (goal-validation.ts) forbids
// KPIs on DAILY goals; the query would return [] anyway.
const LEVELS_BOTTOM_UP: GoalLevel[] = [
  GoalLevel.WEEKLY,
  GoalLevel.MONTHLY,
  GoalLevel.STRATEGIC,
  GoalLevel.HIGH_HARD,
];

const PROGRESS_EVERY = 100;

async function main() {
  let total = 0;
  let failures = 0;
  for (const level of LEVELS_BOTTOM_UP) {
    const kpis = await prisma.kpi.findMany({
      where: { goal: { level, deletedAt: null }, linkedKpiId: { not: null } },
      select: { id: true },
    });
    if (kpis.length === 0) continue;
    console.log(`${level}: cascading ${kpis.length} KPI(s)…`);
    if (!dryRun) {
      for (let i = 0; i < kpis.length; i++) {
        const k = kpis[i];
        try {
          await cascadeKpiUpdate(k.id);
        } catch (err) {
          failures++;
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`  ✗ ${k.id}: ${msg}`);
        }
        if ((i + 1) % PROGRESS_EVERY === 0) {
          console.log(`  …${i + 1}/${kpis.length}`);
        }
      }
    }
    total += kpis.length;
  }
  const verb = dryRun ? 'Would cascade' : 'Cascaded';
  console.log(`${verb} ${total} KPI(s)${failures > 0 ? `; ${failures} failed` : ''}.`);
  if (failures > 0) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
