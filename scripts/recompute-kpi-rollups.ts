// One-shot recompute of every KPI's parent chain via cascadeKpiUpdate.
//
// Why: cascadeKpiUpdate was non-recursive before — weekly → monthly worked
// but monthly → quarterly / yearly / HHG never fired. Existing rollup rows
// are stale. After deploying the recursive cascade, run this once to
// snap every parent KPI to a correct aggregation from its current
// linked children.
//
// Strategy:
//   - Iterate KPIs whose parent goal is live (deletedAt: null).
//   - For each KPI, call cascadeKpiUpdate which (a) recalculates the
//     immediate parent and (b) recursively walks upward. Each call is
//     idempotent — re-running this script is safe.
//   - Walk bottom-up by KPI's goal level so a parent is recomputed
//     after all its children have contributed.
//
//   npx tsx scripts/recompute-kpi-rollups.ts [--dry-run]

import { prisma } from '../src/lib/prisma';
import { cascadeKpiUpdate } from '../src/lib/kpi-progress';

const dryRun = process.argv.includes('--dry-run');

// Bottom-up so each level's update reaches an already-current child.
// Mirrors the GoalLevel enum in prisma/schema.prisma; HIGH_HARD is the
// top so it's intentionally last (it has nothing above to cascade into).
const LEVELS_BOTTOM_UP = ['DAILY', 'WEEKLY', 'MONTHLY', 'STRATEGIC', 'HIGH_HARD'] as const;

async function main() {
  let total = 0;
  for (const level of LEVELS_BOTTOM_UP) {
    const kpis = await prisma.kpi.findMany({
      where: { goal: { level, deletedAt: null }, linkedKpiId: { not: null } },
      select: { id: true },
    });
    if (kpis.length === 0) continue;
    console.log(`${level}: cascading ${kpis.length} KPI(s)…`);
    if (!dryRun) {
      for (const k of kpis) {
        await cascadeKpiUpdate(k.id);
      }
    }
    total += kpis.length;
  }
  console.log(`${dryRun ? 'Would cascade' : 'Cascaded'} ${total} KPI(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
