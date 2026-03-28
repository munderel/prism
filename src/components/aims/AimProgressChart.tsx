'use client';

import { useMemo } from 'react';
import useSWR from 'swr';
import dynamic from 'next/dynamic';

// ---- Dynamic Recharts import (avoids SSR issues, same pattern as reports page) ----

const AimChart = dynamic(
  () =>
    import('recharts').then((m) => {
      const {
        ComposedChart,
        Line,
        Area,
        XAxis,
        YAxis,
        Tooltip,
        ResponsiveContainer,
        CartesianGrid,
        ReferenceLine,
      } = m;

      return function Chart({
        data,
        expectedPerDay,
      }: {
        data: ChartPoint[];
        expectedPerDay: number;
      }) {
        if (data.length === 0) {
          return (
            <div className="text-[var(--text-muted)] text-sm text-center py-8">
              No history data yet
            </div>
          );
        }

        return (
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis
                dataKey="date"
                stroke="#9ca3af"
                fontSize={11}
                tickFormatter={(d: string) => d.slice(5)}
              />
              <YAxis
                stroke="#9ca3af"
                fontSize={11}
                domain={[0, 'auto']}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1f2937',
                  border: '1px solid #374151',
                  borderRadius: 8,
                }}
                labelFormatter={(d) => String(d)}
              />
              {/* Red zone (derailing): 0 to expectedMin */}
              <Area
                type="monotone"
                dataKey="expectedMin"
                stroke="none"
                fill="#ef4444"
                fillOpacity={0.08}
                isAnimationActive={false}
              />
              {/* Green zone (on-track): expectedMin to expectedMax */}
              <Area
                type="monotone"
                dataKey="expectedMax"
                stroke="none"
                fill="#22c55e"
                fillOpacity={0.1}
                isAnimationActive={false}
              />
              {/* Expected rate reference line */}
              <ReferenceLine
                y={expectedPerDay}
                stroke="#6b7280"
                strokeDasharray="4 4"
                label={{
                  value: 'Target',
                  position: 'right',
                  fill: '#6b7280',
                  fontSize: 10,
                }}
              />
              {/* Actual completions */}
              <Line
                type="monotone"
                dataKey="completed"
                stroke="#6366f1"
                strokeWidth={2}
                dot={{ fill: '#6366f1', r: 2.5 }}
                activeDot={{ r: 4 }}
                name="Completed"
              />
              {/* Cumulative trend */}
              <Line
                type="monotone"
                dataKey="cumulative"
                stroke="#14b8a6"
                strokeWidth={1.5}
                strokeDasharray="5 3"
                dot={false}
                name="Cumulative"
              />
            </ComposedChart>
          </ResponsiveContainer>
        );
      };
    }),
  { ssr: false, loading: () => <div className="h-[220px] flex items-center justify-center text-[var(--text-muted)] text-sm">Loading chart...</div> },
);

// ---- Types ----

interface ChartPoint {
  date: string;
  completed: number;
  cumulative: number;
  expectedMin: number;
  expectedMax: number;
}

interface HistoryEntry {
  date: string;
  completed: boolean;
  status: string;
}

interface Props {
  aimCategoryId: string;
  userId?: string;
  days?: number;
}

// ---- Component ----

export function AimProgressChart({ aimCategoryId, days = 30 }: Props) {
  const { data, isLoading } = useSWR<{
    history: HistoryEntry[];
    derailInfo: any;
    expectedPerDay: number;
  }>(`/api/aims/history?aimCategoryId=${aimCategoryId}&days=${days}`);

  const chartData = useMemo<ChartPoint[]>(() => {
    if (!data?.history) return [];

    let cumulative = 0;
    return data.history.map((entry) => {
      const completed = entry.completed ? 1 : 0;
      cumulative += completed;
      const expectedPerDay = data.expectedPerDay ?? 1;
      return {
        date: entry.date,
        completed,
        cumulative,
        expectedMin: expectedPerDay * 0.5,
        expectedMax: expectedPerDay * 1.2,
      };
    });
  }, [data]);

  if (isLoading) {
    return (
      <div className="h-[220px] flex items-center justify-center">
        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-[var(--accent-primary)]" />
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-2">
      <AimChart data={chartData} expectedPerDay={data.expectedPerDay} />
      <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)] px-1">
        <span>Last {days} days</span>
        <span>
          Completion rate:{' '}
          <span className="font-medium text-[var(--text-secondary)]">
            {Math.round((data.derailInfo?.completionRate ?? 0) * 100)}%
          </span>
        </span>
      </div>
    </div>
  );
}
