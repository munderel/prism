'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { useSession } from 'next-auth/react';
import { BarChart3 } from 'lucide-react';
import dynamic from 'next/dynamic';

const RechartsBar = dynamic(
  () => import('recharts').then((m) => {
    const { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } = m;
    return function Chart({ data }: { data: any[] }) {
      return (
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="name" stroke="#9ca3af" fontSize={12} />
            <YAxis stroke="#9ca3af" fontSize={12} />
            <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8 }} />
            <Bar dataKey="value" fill="#6366f1" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      );
    };
  }),
  { ssr: false }
);

const RechartsPie = dynamic(
  () => import('recharts').then((m) => {
    const { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } = m;
    const COLORS = ['#6366f1', '#06b6d4', '#f59e0b'];
    return function Chart({ data }: { data: any[] }) {
      const total = data.reduce((sum: number, d: any) => sum + d.value, 0);
      if (total === 0) return <div className="text-[var(--text-muted)] text-sm text-center py-8">No task data yet</div>;
      return (
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" innerRadius={60} outerRadius={100} dataKey="value" label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`}>
              {data.map((_: any, i: number) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8 }} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      );
    };
  }),
  { ssr: false }
);

const RechartsLine = dynamic(
  () => import('recharts').then((m) => {
    const { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } = m;
    return function Chart({ data }: { data: any[] }) {
      if (data.length === 0) return <div className="text-[var(--text-muted)] text-sm text-center py-8">No completion data yet</div>;
      return (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="date" stroke="#9ca3af" fontSize={12} tickFormatter={(d: string) => d.slice(5)} />
            <YAxis stroke="#9ca3af" fontSize={12} />
            <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8 }} />
            <Line type="monotone" dataKey="completed" stroke="#10b981" strokeWidth={2} dot={{ fill: '#10b981', r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      );
    };
  }),
  { ssr: false }
);

export default function ReportsPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.isAdmin ?? false;
  const [tab, setTab] = useState<'individual' | 'company'>('individual');
  const { data: report, isLoading: loading } = useSWR(`/api/reports?type=${tab}`);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold text-[var(--text-primary)] flex items-center gap-2">
          <BarChart3 className="h-6 w-6 text-prism-indigo" />
          Reports
        </h1>
        <div className="flex gap-2">
          <button
            onClick={() => setTab('individual')}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              tab === 'individual' ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-600/30' : 'text-[var(--text-secondary)] border border-[var(--surface-raised)]'
            }`}
          >
            Individual
          </button>
          {isAdmin && (
            <button
              onClick={() => setTab('company')}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                tab === 'company' ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-600/30' : 'text-[var(--text-secondary)] border border-[var(--surface-raised)]'
              }`}
            >
              Company
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="text-[var(--text-muted)] py-12 text-center">Loading...</div>
      ) : tab === 'individual' && report ? (
        <div className="space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Completion Rate" value={`${report.completionRate}%`} />
            <StatCard label="Failure Rate" value={`${report.failureRate}%`} />
            <StatCard label="Total Tasks" value={report.totalTasks} />
            <StatCard label="Current Streak" value={`${report.streakHistory?.current ?? 0} days`} />
          </div>

          {/* By type chart */}
          <div className="glass-panel p-6">
            <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Tasks by Type</h3>
            <RechartsBar
              data={(report.byType ?? []).map((t: any) => ({
                name: t.type.replace('_', ' '),
                value: t.completed,
                total: t.total,
              }))}
            />
          </div>

          {/* Task Type Breakdown */}
          <section className="glass-panel p-6">
            <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Task Type Breakdown</h2>
            <RechartsPie data={(report.byType ?? []).map((t: any) => ({ name: t.type.replace('_', ' '), value: t.total }))} />
          </section>

          {/* Daily Completion Trend */}
          {report.dailyCompletion && (
            <section className="glass-panel p-6">
              <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Daily Completion Trend</h2>
              <RechartsLine data={report.dailyCompletion} />
            </section>
          )}
        </div>
      ) : tab === 'company' && report ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <StatCard label="Team Completion" value={`${report.teamCompletion}%`} />
            <StatCard label="Team Members" value={(report.perPerson ?? []).length} />
            <StatCard label="Company Goals" value={(report.goalProgress ?? []).length} />
          </div>

          {/* Per-person */}
          <div className="glass-panel p-6">
            <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Per Person</h3>
            <RechartsBar
              data={(report.perPerson ?? []).map((p: any) => ({
                name: p.name,
                value: p.completionRate,
              }))}
            />
          </div>

          {/* Leverage analysis */}
          {(report.leverageAnalysis ?? []).length > 0 && (
            <div className="glass-panel p-6">
              <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Maintenance Leverage</h3>
              <div className="space-y-2">
                {(report.leverageAnalysis ?? []).map((item: any, i: number) => (
                  <div key={i} className="flex items-center justify-between rounded-lg bg-[var(--surface)] px-4 py-2">
                    <span className="text-sm text-[var(--text-primary)]">{item.title}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-[var(--text-muted)]">{item.frequency}x</span>
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        item.suggestion === 'Automate' ? 'bg-red-600/20 text-red-400' :
                        item.suggestion === 'Delegate' ? 'bg-yellow-600/20 text-yellow-400' :
                        'bg-green-600/20 text-green-400'
                      }`}>
                        {item.suggestion}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="glass-panel p-4">
      <p className="text-xs text-[var(--text-muted)] mb-1">{label}</p>
      <p className="text-2xl font-bold text-[var(--text-primary)]">{value}</p>
    </div>
  );
}
