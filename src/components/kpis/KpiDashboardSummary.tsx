'use client';

import { Target, CheckCircle2, AlertTriangle, TrendingDown } from 'lucide-react';
import { m } from 'framer-motion';

interface KpiData {
  kpiId: string;
  aggregatedValue: number;
  targetValue: number | null;
  progressPct: number | null;
}

interface ProcessKpiAggregation {
  processId: string;
  kpis: KpiData[];
}

interface KpiDashboardSummaryProps {
  processes: ProcessKpiAggregation[];
  daysElapsed: number;
  totalDays: number;
}

interface StatCardProps {
  label: string;
  value: number;
  colorClass: string;
  colorBg: string;
  icon: React.ReactNode;
  index: number;
}

function StatCard({ label, value, colorClass, colorBg, icon, index }: StatCardProps) {
  return (
    <m.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      transition={{ delay: index * 0.05, type: 'spring', stiffness: 400, damping: 25 }}
      className="glass-panel p-4"
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-[var(--text-muted)]">
          {label}
        </span>
        <div className={`rounded-lg p-1.5 ${colorBg}`}>
          <span className={colorClass}>{icon}</span>
        </div>
      </div>
      <p className={`font-display text-3xl font-bold tabular-nums ${colorClass}`}>{value}</p>
    </m.div>
  );
}

export function KpiDashboardSummary({ processes, daysElapsed, totalDays }: KpiDashboardSummaryProps) {
  const allKpis = processes.flatMap((p) => p.kpis);
  const total = allKpis.length;

  let onTrack = 0;
  let atRisk = 0;
  let behind = 0;
  for (const k of allKpis) {
    // Use projection-based status: extrapolate current pace to end of period
    const target = k.targetValue ?? 0;
    if (target <= 0 || daysElapsed <= 0) {
      // No valid target or period hasn't started — fall back to behind
      behind++;
      continue;
    }
    const currentPace = k.aggregatedValue / daysElapsed;
    const projectedTotal = currentPace * totalDays;
    const projectedPct = (projectedTotal / target) * 100;

    if (projectedPct >= 100) onTrack++;
    else if (projectedPct >= 70) atRisk++;
    else behind++;
  }

  const cards = [
    {
      label: 'Total KPIs',
      value: total,
      colorClass: 'text-indigo-400',
      colorBg: 'bg-indigo-500/10',
      icon: <Target className="h-4 w-4" />,
    },
    {
      label: 'On Track',
      value: onTrack,
      colorClass: 'text-green-400',
      colorBg: 'bg-green-500/10',
      icon: <CheckCircle2 className="h-4 w-4" />,
    },
    {
      label: 'At Risk',
      value: atRisk,
      colorClass: 'text-amber-400',
      colorBg: 'bg-amber-500/10',
      icon: <AlertTriangle className="h-4 w-4" />,
    },
    {
      label: 'Behind',
      value: behind,
      colorClass: 'text-red-400',
      colorBg: 'bg-red-500/10',
      icon: <TrendingDown className="h-4 w-4" />,
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {cards.map((card, i) => (
        <StatCard key={card.label} {...card} index={i} />
      ))}
    </div>
  );
}
