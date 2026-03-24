'use client';

import useSWR from 'swr';
import { useMemo } from 'react';
import {
  AreaChart,
  Area,
  Tooltip,
  ResponsiveContainer,
  TooltipProps,
} from 'recharts';

function CustomTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const { date, count } = payload[0].payload;
  return (
    <div className="glass-panel px-3 py-2 text-xs">
      <p className="text-gray-400">{date}</p>
      <p className="text-white font-semibold">{count} completed</p>
    </div>
  );
}

export function WeeklySparkline() {
  const { data: reportData } = useSWR('/api/reports?type=individual');

  const chartData = useMemo(() => {
    if (!reportData?.dailyCompletion) return [];
    // Take last 7 days
    const entries = reportData.dailyCompletion.slice(-7);
    return entries.map((entry: any) => ({
      date: new Date(entry.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
      count: entry.count ?? entry.completed ?? 0,
    }));
  }, [reportData]);

  if (chartData.length === 0) return null;

  return (
    <div className="mb-8">
      <h2 className="font-display text-lg font-semibold text-white mb-4">Weekly Trend</h2>
      <div className="glass-panel p-4" style={{ height: 160 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
            <defs>
              <linearGradient id="prismAreaFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6366f1" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
            </defs>
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="count"
              stroke="#6366f1"
              strokeWidth={2}
              fill="url(#prismAreaFill)"
              dot={{ r: 3, fill: '#6366f1', stroke: '#050510', strokeWidth: 2 }}
              activeDot={{ r: 5, fill: '#8b5cf6', stroke: '#050510', strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
