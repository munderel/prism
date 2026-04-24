// Read-only diagnostic: trace a Process + ProcessKpi pair that shows up on the
// KPI dashboard. Defaults to the "lab coat" needle but accepts an override.
// Prints the Process row, its KPIs, per-time-level targets, and entry history
// (count, first/last date, distinct contributors, latest 5 entries).
//
// Falls back to searching ProcessKpi.name when no Process title matches — in
// case the KPI sits under a differently-named process.
//
// Usage:
//   DATABASE_URL=postgres://... npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/investigate-lab-coats.ts [needle]

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

type KpiSummary = {
  id: string;
  name: string;
  type: string;
  unit: string | null;
  targetValue: number | null;
  createdAt: Date;
};

type PrismaLike = PrismaClient;

async function printKpiDetails(prisma: PrismaLike, kpi: KpiSummary) {
  const [count, first, last, distinctUsers, latest, goals] = await Promise.all([
    prisma.processKpiEntry.count({ where: { kpiId: kpi.id } }),
    prisma.processKpiEntry.findFirst({
      where: { kpiId: kpi.id },
      orderBy: { date: 'asc' },
      select: { date: true },
    }),
    prisma.processKpiEntry.findFirst({
      where: { kpiId: kpi.id },
      orderBy: { date: 'desc' },
      select: { date: true },
    }),
    prisma.processKpiEntry.findMany({
      where: { kpiId: kpi.id },
      distinct: ['userId'],
      select: { user: { select: { id: true, name: true, email: true } } },
    }),
    prisma.processKpiEntry.findMany({
      where: { kpiId: kpi.id },
      orderBy: { date: 'desc' },
      take: 5,
      select: {
        date: true,
        value: true,
        notes: true,
        createdAt: true,
        user: { select: { name: true, email: true } },
      },
    }),
    prisma.processKpiGoal.findMany({
      where: { kpiId: kpi.id },
      select: { timeLevel: true, targetValue: true },
      orderBy: { timeLevel: 'asc' },
    }),
  ]);

  console.log(`    KPI ${kpi.id}  name=${JSON.stringify(kpi.name)}`);
  console.log(
    `      type=${kpi.type} unit=${kpi.unit ?? '-'} defaultTarget=${kpi.targetValue ?? '-'} createdAt=${kpi.createdAt.toISOString()}`,
  );
  if (goals.length > 0) {
    const fmt = goals.map((g) => `${g.timeLevel}=${g.targetValue}`).join(', ');
    console.log(`      per-timeLevel targets: ${fmt}`);
  } else {
    console.log(`      per-timeLevel targets: (none — dashboard will show no target)`);
  }
  console.log(
    `      entries: count=${count} firstDate=${first?.date.toISOString() ?? '-'} latestDate=${last?.date.toISOString() ?? '-'}`,
  );
  if (distinctUsers.length > 0) {
    const who = distinctUsers
      .map((e) => `${e.user.name ?? '?'} <${e.user.email}>`)
      .join(', ');
    console.log(`      contributors (${distinctUsers.length}): ${who}`);
  }
  if (latest.length > 0) {
    console.log(`      latest ${latest.length} entries:`);
    for (const e of latest) {
      const by = e.user.name ?? e.user.email;
      const note = e.notes ? ` notes=${JSON.stringify(e.notes)}` : '';
      console.log(
        `        - ${e.date.toISOString()} value=${e.value} by=${by} createdAt=${e.createdAt.toISOString()}${note}`,
      );
    }
  }
}

async function main() {
  const needle = process.argv[2] ?? 'lab coat';
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('[investigate] Missing DATABASE_URL');
    process.exit(1);
  }
  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  console.log(`[investigate] searching Process.title for ${JSON.stringify(needle)} (case-insensitive)\n`);

  const processes = await prisma.process.findMany({
    where: { title: { contains: needle, mode: 'insensitive' } },
    orderBy: { createdAt: 'desc' },
    include: {
      function: { select: { id: true, name: true } },
      assignee: { select: { id: true, name: true, email: true } },
      delegate: { select: { id: true, name: true, email: true } },
      kpis: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          name: true,
          type: true,
          unit: true,
          targetValue: true,
          createdAt: true,
        },
      },
    },
  });

  if (processes.length === 0) {
    console.log(`[investigate] no Process title matches — falling back to ProcessKpi.name search\n`);
    const orphanKpis = await prisma.processKpi.findMany({
      where: { name: { contains: needle, mode: 'insensitive' } },
      orderBy: { createdAt: 'desc' },
      include: {
        process: {
          select: {
            id: true,
            title: true,
            createdAt: true,
            function: { select: { name: true } },
            assignee: { select: { name: true, email: true } },
          },
        },
      },
    });

    if (orphanKpis.length === 0) {
      console.log(`[investigate] no ProcessKpi.name matches either — the dashboard entry may be stale client cache. Try a hard refresh.`);
      await prisma.$disconnect();
      return;
    }

    for (const k of orphanKpis) {
      console.log(
        `KPI ${k.id}  name=${JSON.stringify(k.name)}  under Process ${k.process.id} ${JSON.stringify(k.process.title)}`,
      );
      console.log(
        `  function=${k.process.function.name}  assignee=${k.process.assignee?.name ?? '-'} <${k.process.assignee?.email ?? '-'}>  processCreatedAt=${k.process.createdAt.toISOString()}`,
      );
      await printKpiDetails(prisma, {
        id: k.id,
        name: k.name,
        type: k.type,
        unit: k.unit,
        targetValue: k.targetValue,
        createdAt: k.createdAt,
      });
      console.log('');
    }
    await prisma.$disconnect();
    return;
  }

  console.log(`[investigate] found ${processes.length} matching Process record(s)\n`);

  for (const p of processes) {
    console.log(
      [
        `Process ${p.id}`,
        `title=${JSON.stringify(p.title)}`,
        `function=${p.function.name}`,
        `cadence=${p.cadence}`,
        `mode=${p.mode}`,
      ].join(' | '),
    );
    console.log(
      [
        `  createdAt=${p.createdAt.toISOString()}`,
        `updatedAt=${p.updatedAt.toISOString()}`,
        `lastRunAt=${p.lastRunAt?.toISOString() ?? '-'}`,
        `nextDueAt=${p.nextDueAt?.toISOString() ?? '-'}`,
        `durationEndDate=${p.durationEndDate?.toISOString() ?? '-'}`,
      ].join(' | '),
    );
    console.log(
      `  assignee=${p.assignee ? `${p.assignee.name ?? '?'} <${p.assignee.email}> (id=${p.assignee.id})` : 'unassigned'}`,
    );
    if (p.delegate) {
      console.log(
        `  delegate=${p.delegate.name ?? '?'} <${p.delegate.email}> until ${p.delegateUntil?.toISOString() ?? '-'}`,
      );
    }
    if (p.description) {
      console.log(`  description=${JSON.stringify(p.description)}`);
    }

    if (p.kpis.length === 0) {
      console.log(`  (no KPIs attached)\n`);
      continue;
    }

    console.log(`  ${p.kpis.length} KPI(s):`);
    for (const kpi of p.kpis) {
      await printKpiDetails(prisma, kpi);
    }
    console.log('');
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
