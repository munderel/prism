'use client';

import { Target, CheckCircle2, AlertTriangle, TrendingDown } from 'lucide-react';
import { m } from 'framer-motion';

interface KpiData {
  kpiId: string;
  progressPct: number | null;
}

interface ProcessKpiAggregation {
  processId: string;
  kpis: KpiData[];
}

interface KpiDashboardSummaryProps {
  processes: ProcessKpiAggregation[];
}

interface StatCardProps {
  label: string;
  value: number;
  colorClass: string;
  icon: React.ReactNode;
  index: number;
}

function StatCard({ label, value, colorClass, icon, index }: StatCardProps) {
  return (
    <m.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="glass-panel p-3"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide">
          {label}
        </span>
        <span className={`${colorClass} opacity-70`}>{icon}</span>
      </div>
      <p className={`text-3xl font-bold ${colorClass}`}>{value}</p>
    </m.div>
  );
}

export function KpiDashboardSummary({ processes }: KpiDashboardSummaryProps) {
  const allKpis = processes.flatMap((p) => p.kpis);
  const total = allKpis.length;

  let onTrack = 0;
  let atRisk = 0;
  let behind = 0;
  for (const k of allKpis) {
    const pct = k.progressPct ?? 0;
    if (pct >= 70) onTrack++;
    else if (pct >= 40) atRisk++;
    else behind++;
  }

  const cards = [
    {
      label: 'Total KPIs',
      value: total,
      colorClass: 'text-indigo-400',
      icon: <Target className="h-4 w-4" />,
    },
    {
      label: 'On Track',
      value: onTrack,
      colorClass: 'text-green-400',
      icon: <CheckCircle2 className="h-4 w-4" />,
    },
    {
      label: 'At Risk',
      value: atRisk,
      colorClass: 'text-amber-400',
      icon: <AlertTriangle className="h-4 w-4" />,
    },
    {
      label: 'Behind',
      value: behind,
      colorClass: 'text-red-400',
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
