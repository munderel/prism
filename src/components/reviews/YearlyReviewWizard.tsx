'use client';

import { useState } from 'react';
import {
  Target, Edit3, Calendar, FileText, Star, Trophy, Eye, CheckCircle2,
  ChevronDown, ChevronRight, Plus, Save, BarChart3,
} from 'lucide-react';
import { PeriodReviewWizard } from './PeriodReviewWizard';
import type { Goal, HhgGroup, StepConfig } from './shared/review-types';
import { GOAL_STATUSES, getStatusBadgeClass } from './shared/review-types';

// Yearly review steps — updated 2026-03-30
// Removed: Review Monthly Goals, Monthly KPI Progress
// 1. HHG Assessment → 2. Current Year Overview → 3. Successes & Difficulties →
// 4. On-Track Assessment → 5. Modify Goals → 6. Create Monthly Goals → 7. Notes
const STEPS: StepConfig[] = [
  { key: 'hhg-assessment', title: 'High Hard Goal Assessment', icon: Star },
  { key: 'current-goals', title: 'Current Year Overview', icon: Eye },
  { key: 'successes-difficulties', title: 'Successes & Difficulties', icon: Trophy },
  { key: 'on-track', title: 'On-Track Assessment', icon: CheckCircle2 },
  { key: 'goal-adjustment', title: 'Modify Goals', icon: Edit3 },
  { key: 'plan-next-year', title: 'Create Monthly Goals', icon: Calendar },
  { key: 'notes-completion', title: 'Notes & Completion', icon: FileText },
];

const STEP_DESCRIPTIONS: Record<string, string> = {
  'hhg-assessment': 'Is your High Hard Goal still the right one? Review and adjust if needed.',
  'current-goals': 'Review yearly goals expandable to monthly breakdowns.',
  'successes-difficulties': 'Capture your biggest wins and reflect on challenges faced this year.',
  'on-track': 'Assess each monthly goal. This auto-fills the yearly on-track status.',
  'goal-adjustment': 'Edit yearly and monthly goals, add new monthly goals, and manage KPIs.',
  'plan-next-year': 'Create monthly goals with KPIs for the upcoming year. Goal creation coach available.',
  'notes-completion': 'Add any final reflections or notes, then complete the review.',
};

/**
 * Custom current-goals renderer for the yearly review.
 * Now uses the hierarchy built by PeriodReviewWizard to show HHG -> Yearly -> Monthly structure.
 */
function renderCurrentGoals(strategicGoals: Goal[], parentGoal: Goal | null, hierarchy: HhgGroup[]) {
  // If we have a hierarchy, use it for a richer display
  if (hierarchy.length > 0) {
    return <YearlyCurrentGoalsHierarchy groups={hierarchy} />;
  }
  // Fallback to flat display
  return <YearlyCurrentGoals strategicGoals={strategicGoals} hhgGoal={parentGoal} />;
}

function YearlyCurrentGoalsHierarchy({ groups }: { groups: HhgGroup[] }) {
  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <div key={group.hhg.id} className="space-y-4">
          {/* HHG header */}
          {group.hhg.id !== '__ungrouped__' && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
              <div className="flex items-start gap-3">
                <Star className="h-5 w-5 text-amber-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-amber-400 uppercase tracking-wide font-medium mb-1">High Hard Goal</p>
                  <p className="text-sm font-medium text-[var(--text-primary)]">{group.hhg.title}</p>
                  {group.hhg.description && (
                    <p className="text-xs text-[var(--text-muted)] mt-1">{group.hhg.description}</p>
                  )}
                  <div className="flex items-center gap-3 mt-2">
                    <div className="flex-1 h-1.5 rounded-full bg-[var(--surface-raised)]">
                      <div
                        className="h-full rounded-full bg-amber-500 transition-all"
                        style={{ width: `${group.hhg.progressPct}%` }}
                      />
                    </div>
                    <span className="text-xs text-[var(--text-muted)]">{Math.round(group.hhg.progressPct)}%</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Yearly strategic goals under this HHG */}
          {group.yearlyGoals.map((yearlyGroup) => (
            <div key={yearlyGroup.yearly.id} className="ml-4 space-y-3">
              {/* Yearly goal card */}
              <div className="flex items-start gap-3 rounded-lg border border-indigo-500/30 bg-indigo-500/5 px-4 py-3">
                <Target className="h-5 w-5 text-indigo-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-indigo-400 uppercase tracking-wide font-medium mb-0.5">Yearly Goal</p>
                  <p className="text-sm font-medium text-[var(--text-primary)]">{yearlyGroup.yearly.title}</p>
                  {yearlyGroup.yearly.description && (
                    <p className="text-xs text-[var(--text-muted)] mt-1">{yearlyGroup.yearly.description}</p>
                  )}
                  <div className="flex items-center gap-3 mt-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${getStatusBadgeClass(yearlyGroup.yearly.status)}`}>
                      {yearlyGroup.yearly.status.replace('_', ' ')}
                    </span>
                    {yearlyGroup.yearly.startDate && (
                      <span className="text-xs text-[var(--text-muted)]">
                        {new Date(yearlyGroup.yearly.startDate).getFullYear()}
                      </span>
                    )}
                    <div className="flex-1 h-1.5 rounded-full bg-[var(--surface-raised)]">
                      <div
                        className="h-full rounded-full bg-indigo-500 transition-all"
                        style={{ width: `${yearlyGroup.yearly.progressPct}%` }}
                      />
                    </div>
                    <span className="text-xs text-[var(--text-muted)]">{Math.round(yearlyGroup.yearly.progressPct)}%</span>
                  </div>
                </div>
              </div>

              {/* Monthly goals summary under this yearly */}
              {yearlyGroup.monthlyGoals.length > 0 && (
                <div className="ml-4 space-y-1">
                  <p className="text-xs text-[var(--text-muted)] font-medium uppercase tracking-wide mb-1">
                    Monthly Goals ({yearlyGroup.monthlyGoals.length})
                  </p>
                  {yearlyGroup.monthlyGoals.slice(0, 6).map((mg) => (
                    <div key={mg.id} className="flex items-center gap-2 text-xs text-[var(--text-secondary)] py-1 px-2 rounded bg-[var(--surface-raised)]/50">
                      <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 flex-shrink-0" />
                      <span className="flex-1 truncate">{mg.title}</span>
                      <span className="text-[var(--text-muted)]">{Math.round(mg.progressPct)}%</span>
                    </div>
                  ))}
                  {yearlyGroup.monthlyGoals.length > 6 && (
                    <p className="text-xs text-[var(--text-muted)] pl-2">
                      +{yearlyGroup.monthlyGoals.length - 6} more
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** Fallback flat display when hierarchy is not available */
function YearlyCurrentGoals({ strategicGoals, hhgGoal }: { strategicGoals: Goal[]; hhgGoal: Goal | null }) {
  return (
    <div className="space-y-6">
      {/* HHG section */}
      <div>
        <h3 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wide mb-3">
          High Hard Goals
        </h3>
        {!hhgGoal ? (
          <p className="text-[var(--text-muted)] text-sm italic">No HHG goals found.</p>
        ) : (
          <div className="space-y-3">
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
              <div className="flex items-start gap-3">
                <Star className="h-5 w-5 text-amber-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--text-primary)]">{hhgGoal.title}</p>
                  {hhgGoal.description && (
                    <p className="text-xs text-[var(--text-muted)] mt-1">{hhgGoal.description}</p>
                  )}
                  <div className="flex items-center gap-3 mt-2">
                    <div className="flex-1 h-1.5 rounded-full bg-[var(--surface-raised)]">
                      <div
                        className="h-full rounded-full bg-amber-500 transition-all"
                        style={{ width: `${hhgGoal.progressPct}%` }}
                      />
                    </div>
                    <span className="text-xs text-[var(--text-muted)]">{Math.round(hhgGoal.progressPct)}%</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Strategic goals section */}
      <div>
        <h3 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wide mb-3">
          Yearly Strategic Goals
        </h3>
        {strategicGoals.length === 0 ? (
          <p className="text-[var(--text-muted)] text-sm italic">No strategic goals found.</p>
        ) : (
          <div className="space-y-3">
            {strategicGoals.map((goal) => (
              <div key={goal.id} className="flex items-start gap-3 rounded-lg border border-[var(--border-color)] px-4 py-3">
                <Target className="h-5 w-5 text-blue-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--text-primary)]">{goal.title}</p>
                  {goal.description && (
                    <p className="text-xs text-[var(--text-muted)] mt-1">{goal.description}</p>
                  )}
                  <div className="flex items-center gap-3 mt-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${getStatusBadgeClass(goal.status)}`}>
                      {goal.status.replace('_', ' ')}
                    </span>
                    <div className="flex-1 h-1.5 rounded-full bg-[var(--surface-raised)]">
                      <div
                        className="h-full rounded-full bg-indigo-500 transition-all"
                        style={{ width: `${goal.progressPct}%` }}
                      />
                    </div>
                    <span className="text-xs text-[var(--text-muted)]">{Math.round(goal.progressPct)}%</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Yearly Goal Adjustment Step — hierarchical yearly → monthly editor  */
/* ------------------------------------------------------------------ */

interface GoalAdjustmentContext {
  allGoals: Goal[];
  primaryGoals: Goal[];
  childGoals: Goal[];
  stackId: string | null;
  editingGoals: Record<string, { title: string; description: string; status: string }>;
  onEdit: (goalId: string, field: string, value: string) => void;
  onSave: (goalId: string) => void;
  newGoalTitle: string;
  onNewGoalTitleChange: (v: string) => void;
  onAddGoal: () => void;
  goalLevelLabel: string;
}

interface KpiLocal {
  id: string;
  name: string;
  type: 'NUMERIC' | 'BOOLEAN';
  targetValue: number | null;
  unit: string | null;
}

function YearlyGoalAdjustmentStep(ctx: GoalAdjustmentContext) {
  const { primaryGoals, childGoals, stackId, editingGoals, onEdit, onSave } = ctx;

  const [expandedGoals, setExpandedGoals] = useState<Set<string>>(new Set(primaryGoals.map((g) => g.id)));
  const [localMonthly, setLocalMonthly] = useState<Goal[]>(childGoals);
  const [monthlyEdits, setMonthlyEdits] = useState<Record<string, { title: string; description: string; status: string }>>(() => {
    const edits: Record<string, { title: string; description: string; status: string }> = {};
    for (const g of childGoals) {
      edits[g.id] = { title: g.title, description: g.description ?? '', status: g.status };
    }
    return edits;
  });
  const [savingId, setSavingId] = useState<string | null>(null);

  // Add monthly goal form
  const [addingMonthlyFor, setAddingMonthlyFor] = useState<string | null>(null);
  const [newMonthlyTitle, setNewMonthlyTitle] = useState('');

  // KPI state
  const [goalKpis, setGoalKpis] = useState<Record<string, KpiLocal[]>>({});
  const [loadedKpis, setLoadedKpis] = useState<Set<string>>(new Set());
  const [addingKpiFor, setAddingKpiFor] = useState<string | null>(null);
  const [newKpiName, setNewKpiName] = useState('');
  const [newKpiType, setNewKpiType] = useState<'NUMERIC' | 'BOOLEAN'>('NUMERIC');
  const [newKpiTarget, setNewKpiTarget] = useState('');
  const [newKpiUnit, setNewKpiUnit] = useState('');

  const toggleExpand = (goalId: string) => {
    setExpandedGoals((prev) => {
      const next = new Set(prev);
      if (next.has(goalId)) next.delete(goalId); else next.add(goalId);
      return next;
    });
  };

  const fetchKpis = async (goalId: string) => {
    if (loadedKpis.has(goalId)) return;
    try {
      const res = await fetch(`/api/goals/${goalId}/kpis`);
      if (res.ok) {
        const data = await res.json();
        setGoalKpis((prev) => ({ ...prev, [goalId]: data.kpis ?? data ?? [] }));
      }
    } catch { /* ignore */ }
    setLoadedKpis((prev) => new Set(prev).add(goalId));
  };

  const saveMonthlyEdit = async (goalId: string) => {
    const edit = monthlyEdits[goalId];
    if (!edit) return;
    setSavingId(goalId);
    try {
      await fetch(`/api/goals/${goalId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: edit.title, description: edit.description || null, status: edit.status }),
      });
      setLocalMonthly((prev) => prev.map((g) =>
        g.id === goalId ? { ...g, title: edit.title, description: edit.description, status: edit.status } : g
      ));
    } catch (err) {
      console.error('Failed to save monthly goal:', err);
    }
    setSavingId(null);
  };

  const addMonthlyGoal = async (parentId: string) => {
    if (!newMonthlyTitle.trim() || !stackId) return;
    setSavingId('creating');
    try {
      const res = await fetch('/api/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stackId, parentId, level: 'MONTHLY', title: newMonthlyTitle.trim() }),
      });
      if (res.ok) {
        const created = await res.json();
        setLocalMonthly((prev) => [...prev, created]);
        setMonthlyEdits((prev) => ({
          ...prev,
          [created.id]: { title: created.title, description: '', status: created.status ?? 'NOT_STARTED' },
        }));
        setNewMonthlyTitle('');
        setAddingMonthlyFor(null);
      }
    } catch (err) {
      console.error('Failed to add monthly goal:', err);
    }
    setSavingId(null);
  };

  const resetKpiForm = () => {
    setAddingKpiFor(null);
    setNewKpiName('');
    setNewKpiTarget('');
    setNewKpiUnit('');
    setNewKpiType('NUMERIC');
  };

  const addKpi = async (goalId: string) => {
    if (!newKpiName.trim()) return;
    setSavingId(goalId);
    try {
      const body: Record<string, any> = { name: newKpiName.trim(), type: newKpiType };
      if (newKpiType === 'NUMERIC') {
        body.targetValue = parseFloat(newKpiTarget) || null;
        body.unit = newKpiUnit.trim() || null;
      }
      const res = await fetch(`/api/goals/${goalId}/kpis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const created = await res.json();
        setGoalKpis((prev) => ({
          ...prev,
          [goalId]: [...(prev[goalId] ?? []), { id: created.id, name: created.name, type: created.type, targetValue: created.targetValue, unit: created.unit }],
        }));
        resetKpiForm();
      }
    } catch (err) {
      console.error('Failed to add KPI:', err);
    }
    setSavingId(null);
  };

  const renderKpiSection = (goalId: string) => {
    const kpis = goalKpis[goalId] ?? [];
    const isLoaded = loadedKpis.has(goalId);

    return (
      <div className="space-y-2 mt-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-3 w-3 text-emerald-400" />
          <h5 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide">KPIs</h5>
          {!isLoaded && (
            <button onClick={() => fetchKpis(goalId)} className="text-xs text-indigo-400 hover:text-indigo-300">
              Load KPIs
            </button>
          )}
        </div>

        {isLoaded && kpis.length === 0 && (
          <p className="text-xs text-[var(--text-muted)]">No KPIs yet.</p>
        )}

        {kpis.map((kpi) => (
          <div key={kpi.id} className="flex items-center gap-2 text-xs rounded border border-[var(--border-color)] bg-[var(--surface)] px-3 py-2">
            <span className="text-[var(--text-primary)] flex-1">{kpi.name}</span>
            <span className="text-[var(--text-muted)]">
              {kpi.type === 'NUMERIC'
                ? `Target: ${kpi.targetValue ?? '?'}${kpi.unit ? ` ${kpi.unit}` : ''}`
                : 'Yes/No'}
            </span>
          </div>
        ))}

        {addingKpiFor === goalId ? (
          <div className="space-y-2 rounded border border-[var(--border-color)] bg-[var(--surface)] p-3">
            <input
              type="text"
              value={newKpiName}
              onChange={(e) => setNewKpiName(e.target.value)}
              placeholder="KPI name"
              className="w-full rounded border border-[var(--border-color)] bg-[var(--surface-raised)] px-2 py-1 text-xs text-[var(--text-primary)] focus:border-indigo-500 focus:outline-none"
            />
            <div className="flex gap-2">
              <select
                value={newKpiType}
                onChange={(e) => setNewKpiType(e.target.value as 'NUMERIC' | 'BOOLEAN')}
                className="rounded border border-[var(--border-color)] bg-[var(--surface-raised)] px-2 py-1 text-xs text-[var(--text-primary)] focus:border-indigo-500 focus:outline-none"
              >
                <option value="NUMERIC">Numeric</option>
                <option value="BOOLEAN">Yes/No</option>
              </select>
              {newKpiType === 'NUMERIC' && (
                <>
                  <input
                    type="number"
                    value={newKpiTarget}
                    onChange={(e) => setNewKpiTarget(e.target.value)}
                    placeholder="Target"
                    className="w-20 rounded border border-[var(--border-color)] bg-[var(--surface-raised)] px-2 py-1 text-xs text-[var(--text-primary)] focus:border-indigo-500 focus:outline-none"
                  />
                  <input
                    type="text"
                    value={newKpiUnit}
                    onChange={(e) => setNewKpiUnit(e.target.value)}
                    placeholder="Unit"
                    className="w-16 rounded border border-[var(--border-color)] bg-[var(--surface-raised)] px-2 py-1 text-xs text-[var(--text-primary)] focus:border-indigo-500 focus:outline-none"
                  />
                </>
              )}
            </div>
            <div className="flex gap-1">
              <button
                onClick={() => addKpi(goalId)}
                disabled={!newKpiName.trim() || savingId === goalId}
                className="text-xs bg-emerald-600 text-white px-2 py-1 rounded hover:bg-emerald-500 disabled:opacity-50"
              >
                Add KPI
              </button>
              <button
                onClick={resetKpiForm}
                className="text-xs text-[var(--text-muted)] px-2 py-1 hover:text-[var(--text-secondary)]"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => { setAddingKpiFor(goalId); fetchKpis(goalId); }}
            className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
          >
            <Plus className="h-3 w-3" />
            Add KPI
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {primaryGoals.map((yearly) => {
        const isExpanded = expandedGoals.has(yearly.id);
        const edit = editingGoals[yearly.id];
        const monthlyGoals = localMonthly.filter((g) => g.parentId === yearly.id);

        return (
          <div key={yearly.id} className="rounded-lg border border-indigo-500/30 overflow-hidden">
            {/* Yearly goal header */}
            <div className="bg-indigo-500/10 px-4 py-3">
              <div className="flex items-center gap-2">
                <button onClick={() => toggleExpand(yearly.id)} className="flex-shrink-0">
                  {isExpanded ? <ChevronDown className="h-4 w-4 text-indigo-400" /> : <ChevronRight className="h-4 w-4 text-indigo-400" />}
                </button>
                <Target className="h-5 w-5 text-indigo-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-indigo-400 uppercase tracking-wide font-medium">Yearly Goal</p>
                  {edit ? (
                    <input
                      type="text"
                      value={edit.title}
                      onChange={(e) => onEdit(yearly.id, 'title', e.target.value)}
                      className="w-full mt-1 rounded border border-[var(--border-color)] bg-[var(--surface)] px-2 py-1 text-sm text-[var(--text-primary)] focus:border-indigo-500 focus:outline-none"
                    />
                  ) : (
                    <p className="text-sm font-medium text-[var(--text-primary)]">{yearly.title}</p>
                  )}
                </div>
              </div>

              {edit && (
                <div className="mt-2 ml-11 space-y-2">
                  <textarea
                    value={edit.description}
                    onChange={(e) => onEdit(yearly.id, 'description', e.target.value)}
                    rows={2}
                    className="w-full rounded border border-[var(--border-color)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--text-primary)] focus:border-indigo-500 focus:outline-none resize-none"
                    placeholder="Description (optional)"
                  />
                  <div className="flex items-center gap-2">
                    <select
                      value={edit.status}
                      onChange={(e) => onEdit(yearly.id, 'status', e.target.value)}
                      className="rounded border border-[var(--border-color)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--text-primary)] focus:border-indigo-500 focus:outline-none"
                    >
                      {GOAL_STATUSES.map((s) => (
                        <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => onSave(yearly.id)}
                      className="text-xs bg-indigo-600 text-white px-3 py-1 rounded hover:bg-indigo-500"
                    >
                      <Save className="h-3 w-3 inline mr-1" />
                      Save
                    </button>
                  </div>
                </div>
              )}

              {/* Yearly KPIs */}
              {isExpanded && <div className="ml-11">{renderKpiSection(yearly.id)}</div>}
            </div>

            {/* Monthly goals nested under this yearly */}
            {isExpanded && (
              <div className="px-4 py-3 space-y-3">
                <p className="text-xs text-[var(--text-muted)] font-medium uppercase tracking-wide">
                  Monthly Goals ({monthlyGoals.length})
                </p>

                {monthlyGoals.map((mg) => {
                  const mEdit = monthlyEdits[mg.id];
                  return (
                    <div key={mg.id} className="rounded-lg border border-[var(--border-color)] px-4 py-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <Target className="h-4 w-4 text-violet-400 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          {mEdit ? (
                            <input
                              type="text"
                              value={mEdit.title}
                              onChange={(e) => setMonthlyEdits((prev) => ({ ...prev, [mg.id]: { ...prev[mg.id], title: e.target.value } }))}
                              className="w-full rounded border border-[var(--border-color)] bg-[var(--surface-raised)] px-2 py-1 text-sm text-[var(--text-primary)] focus:border-indigo-500 focus:outline-none"
                            />
                          ) : (
                            <p className="text-sm text-[var(--text-primary)]">{mg.title}</p>
                          )}
                        </div>
                        {mg.startDate && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-400 flex-shrink-0">
                            {new Date(mg.startDate).toLocaleString('default', { month: 'short', year: 'numeric' })}
                          </span>
                        )}
                      </div>

                      {mEdit && (
                        <>
                          <textarea
                            value={mEdit.description}
                            onChange={(e) => setMonthlyEdits((prev) => ({ ...prev, [mg.id]: { ...prev[mg.id], description: e.target.value } }))}
                            rows={2}
                            className="w-full rounded border border-[var(--border-color)] bg-[var(--surface-raised)] px-2 py-1 text-xs text-[var(--text-primary)] focus:border-indigo-500 focus:outline-none resize-none"
                            placeholder="Description (optional)"
                          />
                          <div className="flex items-center gap-2">
                            <select
                              value={mEdit.status}
                              onChange={(e) => setMonthlyEdits((prev) => ({ ...prev, [mg.id]: { ...prev[mg.id], status: e.target.value } }))}
                              className="rounded border border-[var(--border-color)] bg-[var(--surface-raised)] px-2 py-1 text-xs text-[var(--text-primary)] focus:border-indigo-500 focus:outline-none"
                            >
                              {GOAL_STATUSES.map((s) => (
                                <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                              ))}
                            </select>
                            <button
                              onClick={() => saveMonthlyEdit(mg.id)}
                              disabled={savingId === mg.id}
                              className="text-xs bg-indigo-600 text-white px-3 py-1 rounded hover:bg-indigo-500 disabled:opacity-50"
                            >
                              <Save className="h-3 w-3 inline mr-1" />
                              Save
                            </button>
                          </div>
                        </>
                      )}

                      {renderKpiSection(mg.id)}
                    </div>
                  );
                })}

                {/* Add monthly goal form */}
                {addingMonthlyFor === yearly.id ? (
                  <div className="rounded-lg border border-dashed border-indigo-500/30 bg-indigo-500/5 p-3 space-y-2">
                    <input
                      type="text"
                      value={newMonthlyTitle}
                      onChange={(e) => setNewMonthlyTitle(e.target.value)}
                      placeholder="New monthly goal title..."
                      autoFocus
                      className="w-full rounded border border-[var(--border-color)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-indigo-500 focus:outline-none"
                      onKeyDown={(e) => { if (e.key === 'Enter') addMonthlyGoal(yearly.id); }}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => addMonthlyGoal(yearly.id)}
                        disabled={!newMonthlyTitle.trim() || savingId === 'creating'}
                        className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded hover:bg-indigo-500 disabled:opacity-50"
                      >
                        {savingId === 'creating' ? 'Creating...' : 'Add Monthly Goal'}
                      </button>
                      <button
                        onClick={() => { setAddingMonthlyFor(null); setNewMonthlyTitle(''); }}
                        className="text-xs text-[var(--text-muted)] px-2 py-1.5 hover:text-[var(--text-secondary)]"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setAddingMonthlyFor(yearly.id)}
                    className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add Monthly Goal
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function YearlyReviewWizard({ reviewId, isTeamReview }: { reviewId: string; isTeamReview?: boolean }) {
  return (
    <PeriodReviewWizard
      reviewId={reviewId}
      isTeamReview={isTeamReview}
      goalLevel="STRATEGIC"
      parentGoalLevel="HIGH_HARD"
      childGoalLevel="MONTHLY"
      periodLabel="year"
      steps={STEPS}
      stepDescriptions={STEP_DESCRIPTIONS}
      completionTitle="Yearly Review Complete!"
      completionMessage="Incredible work completing your annual review. This level of strategic reflection is what separates exceptional performers from the rest."
      goalLevelLabel="strategic"
      childGoalLabel="monthly"
      difficultiesPlaceholder="What were the biggest challenges, blockers, and friction points this year? Think about systemic issues, not just individual events..."
      difficultiesRows={8}
      notesPlaceholder="What defined this year? What are you most proud of? What will you change going forward?"
      notesRows={8}
      kpiEmptyMessage="No KPIs found for your yearly goals."
      onTrackEmptyMessage="No strategic goals to assess."
      planNextPeriodDescription="Refine monthly goals for the upcoming year. Align these with your HHG and strategic objectives."
      planNextPeriodPlaceholder="New monthly goal for next year..."
      renderCurrentGoals={renderCurrentGoals}
      renderGoalAdjustment={(ctx) => <YearlyGoalAdjustmentStep {...ctx} />}
      getKpiGoals={(primaryGoals, allGoals) => {
        const hhgGoals = allGoals.filter((g) => g.level === 'HIGH_HARD');
        return [...hhgGoals, ...primaryGoals];
      }}
      findNextPeriodParent={(primaryGoals) => {
        const nextYear = new Date().getFullYear() + 1;
        const match = primaryGoals.find((g) => {
          if (!g.startDate) return false;
          return new Date(g.startDate).getFullYear() === nextYear;
        });
        return match?.id ?? (primaryGoals.length > 0 ? primaryGoals[primaryGoals.length - 1].id : null);
      }}
    />
  );
}
