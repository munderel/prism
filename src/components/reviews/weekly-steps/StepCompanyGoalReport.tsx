'use client';

import { useEffect, useMemo, useState } from 'react';
import { Building2, Target, AlertTriangle, CheckCircle2 } from 'lucide-react';

type ReportStatus = 'on_track' | 'at_risk' | 'blocked';

interface CompanyGoal {
  id: string;
  title: string;
  level: string;
  progressPct: number;
  isAssignedToMe?: boolean;
}

interface GoalReport {
  progressPct: number;
  status: ReportStatus;
  notes: string;
}

interface StepCompanyGoalReportProps {
  reviewId: string;
  isAdmin: boolean;
  onReportsChange?: (reports: Array<{ goalId: string } & GoalReport>) => void;
}

const STATUS_META: Record<ReportStatus, { label: string; className: string; Icon: typeof Target }> = {
  on_track: {
    label: 'On track',
    className: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300',
    Icon: CheckCircle2,
  },
  at_risk: {
    label: 'At risk',
    className: 'bg-amber-500/15 border-amber-500/40 text-amber-300',
    Icon: AlertTriangle,
  },
  blocked: {
    label: 'Blocked',
    className: 'bg-rose-500/15 border-rose-500/40 text-rose-300',
    Icon: AlertTriangle,
  },
};

export function StepCompanyGoalReport({ reviewId, isAdmin, onReportsChange }: StepCompanyGoalReportProps) {
  const [goals, setGoals] = useState<CompanyGoal[] | null>(null);
  const [reports, setReports] = useState<Record<string, GoalReport>>({});
  const [savingGoalId, setSavingGoalId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<{ goalId: string; message: string } | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/goals?isCompany=true');
      if (!res.ok) {
        setGoals([]);
        return;
      }
      const raw = await res.json();
      const list: CompanyGoal[] = Array.isArray(raw)
        ? raw.filter((g: CompanyGoal) => g.level === 'MONTHLY' || g.level === 'STRATEGIC' || g.level === 'HIGH_HARD' || g.level === 'WEEKLY')
        : [];
      setGoals(list);
    })();
  }, []);

  useEffect(() => {
    // Hydrate any prior answer for this step so the form picks up where the
    // user left off on reopen.
    (async () => {
      const res = await fetch(`/api/reviews/${reviewId}/answers`);
      if (!res.ok) return;
      const rows: Array<{ stepKey: string; answerData: { reports?: Array<{ goalId: string } & GoalReport> } }> = await res
        .json()
        .catch(() => []);
      const prior = rows.find((r) => r.stepKey === 'company_goal_report');
      const list = prior?.answerData?.reports ?? [];
      if (list.length) {
        const map: Record<string, GoalReport> = {};
        for (const r of list) {
          map[r.goalId] = { progressPct: r.progressPct, status: r.status, notes: r.notes };
        }
        setReports(map);
      }
    })();
  }, [reviewId]);

  const reportableGoals = useMemo(() => {
    if (!goals) return [];
    return isAdmin ? goals : goals.filter((g) => g.isAssignedToMe);
  }, [goals, isAdmin]);

  const updateReport = (goalId: string, patch: Partial<GoalReport>) => {
    setReports((prev) => {
      const current = prev[goalId] ?? {
        progressPct: reportableGoals.find((g) => g.id === goalId)?.progressPct ?? 0,
        status: 'on_track' as ReportStatus,
        notes: '',
      };
      const next = { ...prev, [goalId]: { ...current, ...patch } };
      onReportsChange?.(
        Object.entries(next).map(([goalId, report]) => ({ goalId, ...report })),
      );
      return next;
    });
  };

  const persistProgress = async (goalId: string) => {
    // Snapshot the latest reports map so this save reflects whatever the user
    // most-recently edited across any goal, not a closure-stale copy.
    setReports((latest) => {
      const report = latest[goalId];
      if (!report) return latest;
      setSavingGoalId(goalId);
      setSaveError(null);
      void (async () => {
        try {
          const goalRes = await fetch(`/api/goals/${goalId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ progressPct: report.progressPct }),
          });
          if (!goalRes.ok) {
            const body = await goalRes.json().catch(() => ({}));
            throw new Error(body.error ?? `Failed to save progress (${goalRes.status})`);
          }
          const answerRes = await fetch(`/api/reviews/${reviewId}/answers`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              stepKey: 'company_goal_report',
              answerType: 'company_goal_report',
              answerData: {
                reports: Object.entries(latest).map(([gid, r]) => ({ goalId: gid, ...r })),
              },
            }),
          });
          if (!answerRes.ok) {
            const body = await answerRes.json().catch(() => ({}));
            throw new Error(body.error ?? `Failed to save report (${answerRes.status})`);
          }
        } catch (err) {
          setSaveError({
            goalId,
            message: err instanceof Error ? err.message : 'Unknown error',
          });
        } finally {
          setSavingGoalId(null);
        }
      })();
      return latest;
    });
  };

  if (goals === null) {
    return <div className="text-[var(--text-muted)] text-sm py-4">Loading company goals...</div>;
  }

  if (reportableGoals.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--border-color)] px-4 py-8 text-center">
        <Building2 className="h-8 w-8 text-[var(--text-muted)] mx-auto mb-2" />
        <p className="text-sm text-[var(--text-muted)]">
          {isAdmin
            ? 'No company goals to report on yet.'
            : 'No company goals are assigned to you. Admins can assign you from the goals page.'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 text-[var(--text-secondary)]">
        <Building2 className="h-4 w-4 mt-0.5 text-indigo-400" />
        <p className="text-sm">
          Report on {isAdmin ? 'each company goal' : 'the company goals assigned to you'}. Updates are saved to
          the goal and to this week&apos;s review log.
        </p>
      </div>

      {reportableGoals.map((g) => {
        const report = reports[g.id] ?? {
          progressPct: g.progressPct,
          status: 'on_track' as ReportStatus,
          notes: '',
        };
        const meta = STATUS_META[report.status];
        const StatusIcon = meta.Icon;
        return (
          <div
            key={g.id}
            className="rounded-lg border border-[var(--border-color)] bg-[var(--surface)] p-4 space-y-3"
          >
            <div className="flex items-start gap-2">
              <Target className="h-4 w-4 mt-1 text-indigo-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[var(--text-primary)]">{g.title}</p>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  {g.level.replace('_', ' ')}
                  {g.isAssignedToMe && (
                    <span className="ml-2 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-300">
                      Assigned to you
                    </span>
                  )}
                </p>
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <label className="text-[var(--text-secondary)]">Progress</label>
                <span className="font-medium text-[var(--text-primary)]">{Math.round(report.progressPct)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={report.progressPct}
                onChange={(e) => updateReport(g.id, { progressPct: Number(e.target.value) })}
                className="w-full accent-indigo-500"
              />
            </div>

            <div className="flex items-center gap-2">
              {(Object.keys(STATUS_META) as ReportStatus[]).map((s) => {
                const m = STATUS_META[s];
                const SIcon = m.Icon;
                const active = report.status === s;
                return (
                  <button
                    key={s}
                    onClick={() => updateReport(g.id, { status: s })}
                    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                      active
                        ? m.className
                        : 'border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <SIcon className="h-3 w-3" />
                    {m.label}
                  </button>
                );
              })}
              {report.status !== 'on_track' && (
                <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] ${meta.className}`}>
                  <StatusIcon className="h-3 w-3" />
                  Flagged
                </span>
              )}
            </div>

            <textarea
              value={report.notes}
              onChange={(e) => updateReport(g.id, { notes: e.target.value })}
              placeholder="Short note (blockers, wins, next step)…"
              rows={2}
              className="w-full rounded-lg border border-white/[0.08] bg-[var(--hover-bg)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-indigo-500 focus:outline-none"
            />

            <div className="flex justify-end items-center gap-3">
              {saveError?.goalId === g.id && (
                <span className="text-xs text-rose-300" role="alert">
                  {saveError.message}
                </span>
              )}
              <button
                onClick={() => persistProgress(g.id)}
                disabled={savingGoalId === g.id}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
              >
                {savingGoalId === g.id ? 'Saving…' : 'Save progress'}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
