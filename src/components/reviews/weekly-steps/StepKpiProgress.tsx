'use client';

import { useState, useEffect, useRef } from 'react';
import { BarChart3, Target, CheckCircle2 } from 'lucide-react';
import { formatGoalDateRange } from '@/lib/goal-constants';

interface Kpi {
  id: string;
  name: string;
  type: string;
  unit: string | null;
  targetValue: number | null;
  actualValue: number | null;
  isComplete: boolean;
  goalId: string;
}

interface GoalWithKpis {
  id: string;
  title: string;
  level: string;
  status: string;
  progressPct: number;
  startDate: string | null;
  endDate: string | null;
  kpis: Kpi[];
}

interface StepKpiProgressProps {
  reviewId: string;
  initialNotes?: string;
  onNotesChange: (notes: string) => void;
  isTeamReview?: boolean;
}

/**
 * Fetch all goals from either company endpoint or personal stacks.
 * Returns null if the initial fetch fails.
 */
async function fetchAllGoalsForKpis(isTeamReview?: boolean): Promise<any[] | null> {
  if (isTeamReview) {
    const res = await fetch('/api/goals?isCompany=true');
    if (!res.ok) return null;
    const raw = await res.json();
    return Array.isArray(raw) ? raw : [];
  }

  const stacksRes = await fetch('/api/stacks');
  if (!stacksRes.ok) return null;
  const stacks = await stacksRes.json();

  const allGoals: any[] = [];
  for (const stack of stacks) {
    const res = await fetch(`/api/goals?stackId=${stack.id}`);
    if (!res.ok) continue;
    const raw = await res.json();
    const goals = Array.isArray(raw) ? raw : [];
    allGoals.push(...goals);
  }
  return allGoals;
}

export function StepKpiProgress({ reviewId: _reviewId, initialNotes, onNotesChange, isTeamReview }: StepKpiProgressProps) {
  const [goalsWithKpis, setGoalsWithKpis] = useState<GoalWithKpis[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [notes, setNotes] = useState(initialNotes ?? '');
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    fetchGoalsWithKpis();
  }, []);

  useEffect(() => {
    if (initialNotes !== undefined && initialNotes !== notes) {
      setNotes(initialNotes);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialNotes]);

  const fetchGoalsWithKpis = async () => {
    try {
      const allGoals = await fetchAllGoalsForKpis(isTeamReview);
      if (!allGoals) { setLoading(false); return; }

      // Calculate date boundaries for filtering
      const now = new Date();
      const dow = now.getDay();
      const mondayOffset = dow === 0 ? -6 : 1 - dow;
      const thisMonday = new Date(now);
      thisMonday.setDate(now.getDate() + mondayOffset);
      thisMonday.setHours(0, 0, 0, 0);

      const lastMonday = new Date(thisMonday);
      lastMonday.setDate(thisMonday.getDate() - 7);

      const upcomingWeekEnd = new Date(thisMonday);
      upcomingWeekEnd.setDate(thisMonday.getDate() + 6);
      upcomingWeekEnd.setHours(23, 59, 59, 999);

      const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

      const result: GoalWithKpis[] = [];
      for (const goal of allGoals) {
        if (goal.level !== 'WEEKLY' && goal.level !== 'MONTHLY') continue;
        if (goal._count?.kpis === 0) continue;

        // Date filtering: only show relevant time periods
        if (goal.startDate && goal.endDate) {
          const gs = new Date(goal.startDate);
          const ge = new Date(goal.endDate);

          if (goal.level === 'WEEKLY') {
            // Show current week and previous week only
            const inCurrentWeek = gs <= upcomingWeekEnd && ge >= thisMonday;
            const inLastWeek = gs <= new Date(thisMonday.getTime() - 1) && ge >= lastMonday;
            if (!inCurrentWeek && !inLastWeek) continue;
          } else if (goal.level === 'MONTHLY') {
            // Show current month only
            const inCurrentMonth = gs <= currentMonthEnd && ge >= currentMonthStart;
            if (!inCurrentMonth) continue;
          }
        }

        const kpisRes = await fetch(`/api/goals/${goal.id}/kpis`);
        if (!kpisRes.ok) continue;
        const kpisData = await kpisRes.json();
        const kpis = kpisData.kpis ?? kpisData;
        if (kpis.length > 0) {
          result.push({
            id: goal.id,
            title: goal.title,
            level: goal.level,
            status: goal.status,
            progressPct: goal.progressPct,
            startDate: goal.startDate ?? null,
            endDate: goal.endDate ?? null,
            kpis,
          });
        }
      }

      setGoalsWithKpis(result);
    } catch (err) {
      console.error('Failed to update KPI data:', err);
    }
    setLoading(false);
  };

  const updateKpiActual = async (kpiId: string, actualValue: number) => {
    setSaving(kpiId);
    try {
      await fetch(`/api/kpis/${kpiId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actualValue }),
      });

      setGoalsWithKpis((prev) =>
        prev.map((g) => ({
          ...g,
          kpis: g.kpis.map((k) => (k.id === kpiId ? { ...k, actualValue } : k)),
        }))
      );
    } catch (err) {
      console.error('Failed to update KPI data:', err);
    }
    setSaving(null);
  };

  const markGoalComplete = async (goalId: string) => {
    setSaving(goalId);
    try {
      await fetch(`/api/goals/${goalId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'COMPLETED' }),
      });

      setGoalsWithKpis((prev) =>
        prev.map((g) => (g.id === goalId ? { ...g, status: 'COMPLETED', progressPct: 100 } : g))
      );
    } catch (err) {
      console.error('Failed to update KPI data:', err);
    }
    setSaving(null);
  };

  const handleNotesChange = (value: string) => {
    setNotes(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onNotesChange(value);
    }, 600);
  };

  const handleNotesBlur = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    onNotesChange(notes);
  };

  if (loading) {
    return <div className="text-[var(--text-muted)] text-sm py-4">Loading KPI progress...</div>;
  }

  if (goalsWithKpis.length === 0) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-dashed border-[var(--border-color)] px-4 py-8 text-center">
          <BarChart3 className="h-8 w-8 text-[var(--text-muted)] mx-auto mb-2" />
          <p className="text-sm text-[var(--text-muted)]">No goals with KPIs found.</p>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Add KPIs to your weekly or monthly goals to track progress here.
          </p>
        </div>

        <div>
          <label className="block text-xs text-[var(--text-secondary)] mb-1">Progress Notes</label>
          <textarea
            value={notes}
            onChange={(e) => handleNotesChange(e.target.value)}
            onBlur={handleNotesBlur}
            rows={3}
            className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface)] px-3 py-2 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none resize-none"
            placeholder="Any notes about your progress this week..."
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-[var(--text-secondary)]">
        <BarChart3 className="h-4 w-4 text-emerald-400" />
        <p className="text-sm">Update your KPI actuals and review goal progress.</p>
      </div>

      <div className="space-y-4">
        {goalsWithKpis.map((goal) => (
          <div
            key={goal.id}
            className="rounded-lg border border-[var(--border-color)] bg-[var(--surface)] p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 flex-wrap">
                <Target className="h-4 w-4 text-blue-400" />
                <span className="text-sm font-medium text-[var(--text-primary)]">{goal.title}</span>
                <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--surface-raised)] text-[var(--text-muted)]">
                  {goal.level}
                </span>
                {goal.startDate && goal.endDate && (
                  <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                    goal.level === 'MONTHLY'
                      ? 'bg-violet-500/20 text-violet-400'
                      : 'bg-cyan-500/20 text-cyan-400'
                  }`}>
                    {formatGoalDateRange(goal.level, goal.startDate, goal.endDate)}
                  </span>
                )}
              </div>
              {goal.status !== 'COMPLETED' && (
                <button
                  onClick={() => markGoalComplete(goal.id)}
                  disabled={saving === goal.id}
                  className="flex items-center gap-1 text-xs text-green-400 hover:text-green-300 transition-colors px-2 py-1 rounded hover:bg-green-500/10"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Mark Complete
                </button>
              )}
              {goal.status === 'COMPLETED' && (
                <span className="text-xs text-green-400 flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Completed
                </span>
              )}
            </div>

            {/* KPIs */}
            <div className="space-y-2 ml-6">
              {goal.kpis.map((kpi) => (
                <div key={kpi.id} className="flex items-center gap-3">
                  <span className="text-xs text-[var(--text-secondary)] w-32 truncate">
                    {kpi.name}
                  </span>

                  {kpi.type === 'NUMERIC' ? (
                    <div className="flex items-center gap-2 flex-1">
                      <input
                        type="number"
                        defaultValue={kpi.actualValue ?? ''}
                        onBlur={(e) => {
                          const val = parseFloat(e.target.value);
                          if (!isNaN(val) && val !== kpi.actualValue) {
                            updateKpiActual(kpi.id, val);
                          }
                        }}
                        className="w-20 rounded border border-[var(--border-color)] bg-[var(--surface-raised)] px-2 py-1 text-xs text-[var(--text-primary)] focus:border-indigo-500 focus:outline-none text-right"
                        placeholder="Actual"
                      />
                      <span className="text-xs text-[var(--text-muted)]">
                        / {kpi.targetValue ?? '?'} {kpi.unit ?? ''}
                      </span>
                      {kpi.targetValue && kpi.actualValue !== null && (
                        <div className="w-16 h-1.5 bg-[var(--surface-raised)] rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              (kpi.actualValue / kpi.targetValue) >= 1
                                ? 'bg-green-500'
                                : 'bg-indigo-500'
                            }`}
                            style={{ width: `${Math.min(100, ((kpi.actualValue ?? 0) / kpi.targetValue) * 100)}%` }}
                          />
                        </div>
                      )}
                    </div>
                  ) : (
                    <span className={`text-xs ${kpi.isComplete ? 'text-green-400' : 'text-[var(--text-muted)]'}`}>
                      {kpi.isComplete ? 'Complete' : 'Incomplete'}
                    </span>
                  )}

                  {saving === kpi.id && (
                    <span className="text-xs text-[var(--text-muted)]">Saving...</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div>
        <label className="block text-xs text-[var(--text-secondary)] mb-1">Progress Notes</label>
        <textarea
          value={notes}
          onChange={(e) => handleNotesChange(e.target.value)}
          onBlur={handleNotesBlur}
          rows={3}
          className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface)] px-3 py-2 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none resize-none"
          placeholder="Any notes about your progress this week..."
        />
      </div>
    </div>
  );
}
