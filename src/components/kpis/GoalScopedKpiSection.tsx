'use client';

import { m } from 'framer-motion';
import { Target, Check, Users } from 'lucide-react';
import { KpiProgressBar } from '@/components/goals/KpiProgressBar';
import { LEVEL_COLORS, LEVEL_LABELS, formatGoalDateRange } from '@/lib/goal-constants';

interface Owner {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
}

interface GoalScopeKpi {
  id: string;
  name: string;
  type: string;
  unit: string | null;
  targetValue: number | null;
  actualValue: number | null;
  isComplete: boolean;
  completedAt: string | null;
  owner: Owner | null;
}

interface GoalScopeGoal {
  id: string;
  title: string;
  level: string;
  status: 'IN_PROGRESS';
  startDate: string;
  endDate: string;
  progressPct: number;
  stack: { id: string; name: string };
}

interface GoalScopedKpiSectionProps {
  goal: GoalScopeGoal | null;
  kpis: GoalScopeKpi[];
  mappedLevel: string | null;
}

function OwnerBadge({ owner }: { owner: Owner | null }) {
  if (!owner) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-gray-500/15 px-2 py-0.5 text-[10px] font-medium text-[var(--text-muted)] border border-gray-500/20"
        title="No individual owner — team-shared"
      >
        <Users className="h-3 w-3" />
        Team
      </span>
    );
  }
  const label = owner.name ?? owner.email;
  const initials =
    label
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('') ||
    label[0]?.toUpperCase() ||
    '?';
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full bg-indigo-500/15 px-2 py-0.5 text-[10px] font-medium text-indigo-300 border border-indigo-500/20"
      title={`Owned by ${label}`}
    >
      {owner.image ? (
        <img src={owner.image} alt="" className="h-3.5 w-3.5 rounded-full object-cover" />
      ) : (
        <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-indigo-500/40 text-[8px] font-semibold text-white">
          {initials}
        </span>
      )}
      <span className="max-w-[90px] truncate">{label}</span>
    </span>
  );
}

export function GoalScopedKpiSection({ goal, kpis, mappedLevel }: GoalScopedKpiSectionProps) {
  if (!mappedLevel) return null;

  const levelLabel = LEVEL_LABELS[mappedLevel] ?? mappedLevel;

  if (!goal) {
    return (
      <m.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        className="glass-panel p-4"
      >
        <div className="flex items-center gap-2 mb-2">
          <Target className="h-4 w-4 text-indigo-400" />
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Goal KPIs</h2>
        </div>
        <p className="text-xs text-[var(--text-muted)] italic">
          No in-progress {levelLabel.toLowerCase()} goal spans today.
        </p>
      </m.div>
    );
  }

  const dateLabel = formatGoalDateRange(goal.level, goal.startDate, goal.endDate);
  const levelChipClass = LEVEL_COLORS[goal.level] ?? LEVEL_COLORS.WEEKLY;

  return (
    <m.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -1 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className="glass-panel p-4"
    >
      <div className="flex items-start justify-between mb-4 gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Target className="h-4 w-4 text-indigo-400 flex-shrink-0" />
            <span
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${levelChipClass}`}
            >
              {levelLabel}
            </span>
            {dateLabel && (
              <span className="text-[11px] text-[var(--text-muted)] truncate">{dateLabel}</span>
            )}
          </div>
          <h3 className="text-sm font-semibold text-[var(--text-primary)] truncate">
            {goal.title}
          </h3>
          <p className="text-[11px] text-[var(--text-muted)] mt-0.5">{goal.stack.name}</p>
        </div>
        <span className="flex-shrink-0 text-xs tabular-nums text-[var(--text-secondary)]">
          {Math.round(goal.progressPct)}%
        </span>
      </div>

      {kpis.length === 0 ? (
        <p className="text-xs text-[var(--text-muted)] italic">
          This goal has no KPIs yet — add them from the Goal Stack.
        </p>
      ) : (
        <div className="space-y-4">
          {kpis.map((kpi) => (
            <div key={kpi.id}>
              <div className="flex items-center justify-between mb-1.5 gap-2">
                <span className="text-sm text-[var(--text-primary)] truncate flex-1 min-w-0">
                  {kpi.name}
                </span>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <OwnerBadge owner={kpi.owner} />
                </div>
              </div>

              {kpi.type === 'BINARY' ? (
                <div>
                  {kpi.isComplete ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-green-500/15 px-2 py-0.5 text-xs font-medium text-green-400 border border-green-500/20">
                      <Check className="h-3 w-3" />
                      Complete
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-gray-500/15 px-2 py-0.5 text-xs font-medium text-[var(--text-secondary)] border border-gray-500/20">
                      Not Complete
                    </span>
                  )}
                  {kpi.completedAt && (
                    <span className="ml-2 text-[11px] text-[var(--text-muted)]">
                      Completed {new Date(kpi.completedAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
              ) : (
                <KpiProgressBar
                  actual={kpi.actualValue ?? 0}
                  target={kpi.targetValue ?? 0}
                  unit={kpi.unit}
                  showValues
                />
              )}
            </div>
          ))}
        </div>
      )}
    </m.div>
  );
}
