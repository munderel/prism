'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';

interface SubPeriod {
  label: string;
  aggregatedValue: number;
  targetValue: number | null;
}

interface KpiSubPeriodChartProps {
  subPeriods: SubPeriod[];
  unit: string | null;
  kpiName: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
  unit: string | null;
}

function CustomTooltip({ active, payload, label, unit }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-[var(--border-color)] bg-[var(--surface)] px-3 py-2 shadow-lg text-xs">
      <p className="font-semibold text-[var(--text-primary)] mb-1">{label}</p>
      {payload.map((entry) => (
        <p key={entry.name} style={{ color: entry.color }}>
          {entry.value}
          {unit ? ` ${unit}` : ''}
        </p>
      ))}
    </div>
  );
}

export function KpiSubPeriodChart({ subPeriods, unit, kpiName }: KpiSubPeriodChartProps) {
  if (!subPeriods || subPeriods.length === 0) return null;

  // Determine if there's a consistent target across sub-periods
  const targets = subPeriods.map((s) => s.targetValue).filter((t): t is number => t !== null);
  const referenceTarget = targets.length > 0 ? Math.max(...targets) : null;

  return (
    <div className="mt-3">
      <p className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide mb-2">
        {kpiName} — Sub-period Breakdown
      </p>
      <ResponsiveContainer width="100%" height={140}>
        <BarChart data={subPeriods} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
          <XAxis
            dataKey="label"
            tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip unit={unit} />} />
          <Bar
            dataKey="aggregatedValue"
            name="Actual"
            fill="#6366f1"
            radius={[3, 3, 0, 0]}
            maxBarSize={40}
          />
          {referenceTarget !== null && (
            <ReferenceLine
              y={referenceTarget}
              stroke="#ef4444"
              strokeDasharray="4 3"
              strokeWidth={1.5}
            />
          )}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
