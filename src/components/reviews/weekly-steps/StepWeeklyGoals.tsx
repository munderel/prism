'use client';

import { useState, useEffect } from 'react';
import {
  Target, Plus, Pencil, BarChart3,
  ChevronRight, ChevronDown, Save, Lightbulb,
} from 'lucide-react';
import { getLocalDateString } from '@/lib/date-utils';
import { GoalCreationCoach } from '../shared/GoalCreationCoach';

interface Kpi {
  id: string;
  name: string;
  type: 'NUMERIC' | 'BOOLEAN';
  targetValue: number | null;
  unit: string | null;
  isNew?: boolean;
}

interface WeeklyGoal {
  id: string;
  title: string;
  description: string | null;
  status: string;
  level: string;
  startDate: string | null;
  endDate: string | null;
  parentTitle?: string;
  parentId?: string;
  kpis: Kpi[];
  weekCategory?: 'last' | 'upcoming';
}

interface StepWeeklyGoalsProps {
  reviewId: string;
  onGoalsUpdated?: () => void;
  isTeamReview?: boolean;
}

function getMonday(date: Date): Date {
  const d = new Date(date);
  const dayOfWeek = d.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  d.setDate(d.getDate() + mondayOffset);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getWeekBoundaries(now: Date) {
  const thisMonday = getMonday(now);

  const lastMonday = new Date(thisMonday);
  lastMonday.setDate(thisMonday.getDate() - 7);

  const lastSunday = new Date(thisMonday);
  lastSunday.setDate(thisMonday.getDate() - 1);
  lastSunday.setHours(23, 59, 59, 999);

  const upcomingWeekEnd = new Date(thisMonday);
  upcomingWeekEnd.setDate(thisMonday.getDate() + 6);
  upcomingWeekEnd.setHours(23, 59, 59, 999);

  return { thisMonday, lastMonday, lastSunday, upcomingWeekStart: thisMonday, upcomingWeekEnd };
}

function categorizeGoal(
  g: any,
  bounds: ReturnType<typeof getWeekBoundaries>
): 'last' | 'upcoming' | null {
  if (!g.startDate || !g.endDate) return null;
  const gs = new Date(g.startDate);
  const ge = new Date(g.endDate);
  const isLastWeek = gs <= bounds.lastSunday && ge >= bounds.lastMonday;
  const isUpcomingWeek = gs <= bounds.upcomingWeekEnd && ge >= bounds.upcomingWeekStart;
  if (isUpcomingWeek) return 'upcoming';
  if (isLastWeek) return 'last';
  return null;
}

async function fetchGoalDetails(goalId: string): Promise<{ kpis: Kpi[]; parentTitle: string; parentId: string }> {
  let kpis: Kpi[] = [];
  let parentTitle = '';
  let parentId = '';

  try {
    const kpisRes = await fetch(`/api/goals/${goalId}/kpis`);
    if (kpisRes.ok) { const kpiData = await kpisRes.json(); kpis = kpiData.kpis ?? kpiData; }
  } catch { /* ignore */ }

  try {
    const detailRes = await fetch(`/api/goals/${goalId}?includeParents=true`);
    if (detailRes.ok) {
      const detail = await detailRes.json();
      if (detail.parent) { parentTitle = detail.parent.title; parentId = detail.parent.id; }
    }
  } catch { /* ignore */ }

  return { kpis, parentTitle, parentId };
}

interface GoalSet {
  goals: any[];
  isPersonalStack: boolean;
  stackId: string;
}

async function fetchGoalSets(isTeamReview?: boolean): Promise<GoalSet[] | null> {
  if (isTeamReview) {
    const res = await fetch('/api/goals?isCompany=true&level=WEEKLY');
    if (!res.ok) return null;
    const raw = await res.json();
    return [{ goals: Array.isArray(raw) ? raw : [], isPersonalStack: false, stackId: '' }];
  }

  const stacksRes = await fetch('/api/stacks');
  if (!stacksRes.ok) return null;
  const stacks = await stacksRes.json();

  const results: GoalSet[] = [];
  for (const stack of stacks) {
    const res = await fetch(`/api/goals?stackId=${stack.id}`);
    if (!res.ok) continue;
    const raw = await res.json();
    results.push({
      goals: Array.isArray(raw) ? raw : [],
      isPersonalStack: !stack.isCompany,
      stackId: stack.id,
    });
  }
  return results;
}

function getStatusBadgeClass(status: string): string {
  switch (status) {
    case 'COMPLETED': return 'bg-green-500/20 text-green-400';
    case 'IN_PROGRESS': return 'bg-blue-500/20 text-blue-400';
    case 'ABANDONED': return 'bg-red-500/20 text-red-400';
    default: return 'bg-[var(--surface-raised)] text-[var(--text-muted)]';
  }
}

export function StepWeeklyGoals({ reviewId: _reviewId, onGoalsUpdated, isTeamReview }: StepWeeklyGoalsProps) {
  const [goals, setGoals] = useState<WeeklyGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedGoals, setExpandedGoals] = useState<Set<string>>(new Set());
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [showCoach, setShowCoach] = useState(false);
  const [editDescription, setEditDescription] = useState('');

  // Inline creation state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [creating, setCreating] = useState(false);

  // KPI creation state per goal
  const [addingKpiForGoal, setAddingKpiForGoal] = useState<string | null>(null);
  const [newKpiName, setNewKpiName] = useState('');
  const [newKpiType, setNewKpiType] = useState<'NUMERIC' | 'BOOLEAN'>('NUMERIC');
  const [newKpiTarget, setNewKpiTarget] = useState('');
  const [newKpiUnit, setNewKpiUnit] = useState('');

  const [saving, setSaving] = useState<string | null>(null);
  const [editingStatusGoalId, setEditingStatusGoalId] = useState<string | null>(null);
  const [stackId, setStackId] = useState<string | null>(null);
  const [monthlyParentId, setMonthlyParentId] = useState<string | null>(null);
  const [creatingPlaceholder, setCreatingPlaceholder] = useState(false);

  useEffect(() => {
    fetchWeeklyGoals();
  }, []);

  const fetchWeeklyGoals = async () => {
    try {
      const now = new Date();
      const bounds = getWeekBoundaries(now);
      const result: WeeklyGoal[] = [];

      // Gather all goals from either company or personal stacks
      const allGoalSets = await fetchGoalSets(isTeamReview);
      if (!allGoalSets) { setLoading(false); return; }

      for (const { goals: allGoals, isPersonalStack, stackId: sId } of allGoalSets) {
        // Track personal stack ID for goal creation
        if (isPersonalStack && !stackId) setStackId(sId);

        for (const g of allGoals) {
          // Find monthly goals for the current month to use as parent for new weekly goals
          if (!isTeamReview && g.level === 'MONTHLY' && !monthlyParentId && isPersonalStack) {
            const gs = g.startDate ? new Date(g.startDate) : null;
            const ge = g.endDate ? new Date(g.endDate) : null;
            if (gs && ge && gs <= now && ge >= now) {
              setMonthlyParentId(g.id);
            }
          }

          if (g.level !== 'WEEKLY') continue;
          const weekCategory = categorizeGoal(g, bounds);
          if (!weekCategory) continue;

          const details = await fetchGoalDetails(g.id);
          result.push({
            id: g.id,
            title: g.title,
            description: g.description ?? null,
            status: g.status,
            level: g.level,
            startDate: g.startDate,
            endDate: g.endDate,
            ...details,
            kpis: details.kpis,
            weekCategory,
          });
        }
      }

      setGoals(result);
    } catch (err) {
      console.error('Failed during weekly goals operation:', err);
    }
    setLoading(false);
  };

  const toggleExpand = (goalId: string) => {
    setExpandedGoals((prev) => {
      const next = new Set(prev);
      if (next.has(goalId)) next.delete(goalId);
      else next.add(goalId);
      return next;
    });
  };

  const startEditing = (goal: WeeklyGoal) => {
    setEditingGoalId(goal.id);
    setEditTitle(goal.title);
    setEditDescription(goal.description ?? '');
  };

  const saveEdit = async (goalId: string) => {
    setSaving(goalId);
    try {
      await fetch(`/api/goals/${goalId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editTitle, description: editDescription || null }),
      });
      setGoals((prev) =>
        prev.map((g) =>
          g.id === goalId ? { ...g, title: editTitle, description: editDescription || null } : g
        )
      );
      setEditingGoalId(null);
      onGoalsUpdated?.();
    } catch (err) {
      console.error('Failed during weekly goals operation:', err);
    }
    setSaving(null);
  };

  const saveStatus = async (goalId: string, newStatus: string) => {
    setSaving(goalId);
    try {
      await fetch(`/api/goals/${goalId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      setGoals((prev) =>
        prev.map((g) => g.id === goalId ? { ...g, status: newStatus } : g)
      );
    } catch (err) {
      console.error('Failed to save goal status:', err);
    }
    setSaving(null);
    setEditingStatusGoalId(null);
  };

  const createGoal = async () => {
    if (!newTitle.trim() || !stackId) return;
    setCreating(true);
    try {
      const body: Record<string, any> = {
        stackId,
        level: 'WEEKLY',
        title: newTitle.trim(),
        description: newDescription.trim() || null,
      };
      if (monthlyParentId) body.parentId = monthlyParentId;

      // Set dates for current week
      const weekStart = getMonday(new Date());
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);

      body.startDate = getLocalDateString(weekStart);
      body.endDate = getLocalDateString(weekEnd);

      const res = await fetch('/api/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const created = await res.json();
        setGoals((prev) => [
          ...prev,
          {
            id: created.id,
            title: created.title,
            description: created.description,
            status: created.status ?? 'NOT_STARTED',
            level: 'WEEKLY',
            startDate: created.startDate,
            endDate: created.endDate,
            parentTitle: '',
            kpis: [],
          },
        ]);
        setNewTitle('');
        setNewDescription('');
        setShowCreateForm(false);
        onGoalsUpdated?.();
      }
    } catch (err) {
      console.error('Failed during weekly goals operation:', err);
    }
    setCreating(false);
  };

  const createPlaceholderWeek = async () => {
    if (!stackId) return;
    setCreatingPlaceholder(true);
    try {
      // Find the latest weekly goal end date to determine the next missing week
      let latestEndDate: Date | null = null;
      for (const g of goals) {
        if (g.endDate) {
          const d = new Date(g.endDate);
          if (!latestEndDate || d > latestEndDate) {
            latestEndDate = d;
          }
        }
      }

      let nextWeekStart: Date;
      if (latestEndDate) {
        // Start the day after the latest end date
        nextWeekStart = new Date(latestEndDate);
        nextWeekStart.setDate(nextWeekStart.getDate() + 1);
        nextWeekStart.setHours(0, 0, 0, 0);
      } else {
        // No existing goals -- use the current week's Monday
        nextWeekStart = getMonday(new Date());
      }

      const nextWeekEnd = new Date(nextWeekStart);
      nextWeekEnd.setDate(nextWeekEnd.getDate() + 6);
      nextWeekEnd.setHours(23, 59, 59, 999);

      // Calculate week number within the month
      const weekOfMonth = Math.ceil(nextWeekStart.getDate() / 7);
      const monthName = nextWeekStart.toLocaleString('default', { month: 'long' });
      const year = nextWeekStart.getFullYear();
      const title = `Week ${weekOfMonth} of ${monthName} ${year}`;

      const body: Record<string, any> = {
        stackId,
        level: 'WEEKLY',
        title,
        startDate: getLocalDateString(nextWeekStart),
        endDate: getLocalDateString(nextWeekEnd),
      };
      if (monthlyParentId) body.parentId = monthlyParentId;

      const res = await fetch('/api/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const created = await res.json();
        setGoals((prev) => [
          ...prev,
          {
            id: created.id,
            title: created.title,
            description: created.description,
            status: created.status ?? 'NOT_STARTED',
            level: 'WEEKLY',
            startDate: created.startDate,
            endDate: created.endDate,
            parentTitle: '',
            kpis: [],
          },
        ]);
        onGoalsUpdated?.();
      }
    } catch (err) {
      console.error('Failed during weekly goals operation:', err);
    }
    setCreatingPlaceholder(false);
  };

  const addKpi = async (goalId: string) => {
    if (!newKpiName.trim()) return;
    setSaving(goalId);
    try {
      const body: Record<string, any> = {
        name: newKpiName.trim(),
        type: newKpiType,
      };
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
        setGoals((prev) =>
          prev.map((g) =>
            g.id === goalId
              ? { ...g, kpis: [...g.kpis, { id: created.id, name: created.name, type: created.type, targetValue: created.targetValue, unit: created.unit }] }
              : g
          )
        );
        setAddingKpiForGoal(null);
        setNewKpiName('');
        setNewKpiTarget('');
        setNewKpiUnit('');
        setNewKpiType('NUMERIC');
      }
    } catch (err) {
      console.error('Failed during weekly goals operation:', err);
    }
    setSaving(null);
  };

  const renderGoalCard = (goal: WeeklyGoal) => {
    const isExpanded = expandedGoals.has(goal.id);
    const isEditing = editingGoalId === goal.id;

    return (
      <div
        key={goal.id}
        className="rounded-lg border border-[var(--border-color)] bg-[var(--surface)] overflow-hidden"
      >
        {/* Monthly goal banner */}
        {goal.parentTitle && !isEditing && (
          <div className="flex items-center gap-2 px-4 py-1.5 bg-indigo-500/5 border-b border-indigo-500/10">
            <Target className="h-3 w-3 text-indigo-400 flex-shrink-0" />
            <span className="text-xs text-indigo-400 font-medium">Monthly Goal:</span>
            {goal.parentId ? (
              <a
                href="/goals"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-indigo-300 hover:text-indigo-200 underline underline-offset-2 transition-colors truncate"
                onClick={(e) => e.stopPropagation()}
              >
                {goal.parentTitle}
              </a>
            ) : (
              <span className="text-xs text-[var(--text-muted)] truncate">{goal.parentTitle}</span>
            )}
          </div>
        )}

        {/* Goal header */}
        <div className="flex items-center gap-3 px-4 py-3">
          <button onClick={() => toggleExpand(goal.id)} className="flex-shrink-0">
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 text-[var(--text-muted)]" />
            ) : (
              <ChevronRight className="h-4 w-4 text-[var(--text-muted)]" />
            )}
          </button>

          <Target className="h-4 w-4 text-blue-400 flex-shrink-0" />

          <div className="flex-1 min-w-0">
            {isEditing ? (
              <div className="space-y-2">
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full rounded border border-[var(--border-color)] bg-[var(--surface-raised)] px-2 py-1 text-sm text-[var(--text-primary)] focus:border-indigo-500 focus:outline-none"
                />
                <input
                  type="text"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="Description (optional)"
                  className="w-full rounded border border-[var(--border-color)] bg-[var(--surface-raised)] px-2 py-1 text-xs text-[var(--text-primary)] focus:border-indigo-500 focus:outline-none"
                />
                <div className="flex gap-1">
                  <button
                    onClick={() => saveEdit(goal.id)}
                    disabled={saving === goal.id}
                    className="text-xs bg-indigo-600 text-white px-2 py-1 rounded hover:bg-indigo-500 disabled:opacity-50"
                  >
                    <Save className="h-3 w-3 inline mr-1" />
                    Save
                  </button>
                  <button
                    onClick={() => setEditingGoalId(null)}
                    className="text-xs text-[var(--text-muted)] px-2 py-1 hover:text-[var(--text-secondary)]"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                {goal.title}
              </p>
            )}
          </div>

          {!isEditing && (
            <div className="flex items-center gap-1 flex-shrink-0">
              {editingStatusGoalId === goal.id ? (
                <select
                  autoFocus
                  value={goal.status}
                  onChange={(e) => saveStatus(goal.id, e.target.value)}
                  onBlur={() => setEditingStatusGoalId(null)}
                  className="rounded border border-[var(--border-color)] bg-[var(--surface-raised)] px-1.5 py-0.5 text-xs text-[var(--text-primary)] focus:border-indigo-500 focus:outline-none"
                >
                  {['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'ABANDONED'].map((s) => (
                    <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                  ))}
                </select>
              ) : (
                <button
                  onClick={() => setEditingStatusGoalId(goal.id)}
                  title="Click to change status"
                  className={`flex items-center gap-1 text-xs px-1.5 py-0.5 rounded hover:opacity-80 transition-opacity cursor-pointer ${getStatusBadgeClass(goal.status)}`}
                >
                  {goal.status.replace(/_/g, ' ')}
                  <ChevronDown className="h-3 w-3 opacity-50" />
                </button>
              )}
              <button
                onClick={() => startEditing(goal)}
                className="p-1 text-[var(--text-muted)] hover:text-indigo-400 transition-colors"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Expanded KPI section */}
        {isExpanded && (
          <div className="border-t border-[var(--border-color)] px-4 py-3 bg-[var(--surface-raised)]/30 space-y-3">
            {goal.description && (
              <p className="text-xs text-[var(--text-muted)] italic">{goal.description}</p>
            )}

            {goal.kpis.length > 0 ? (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide flex items-center gap-1">
                  <BarChart3 className="h-3 w-3" />
                  KPIs
                </h4>
                {goal.kpis.map((kpi) => (
                  <div
                    key={kpi.id}
                    className="flex items-center gap-2 text-xs rounded border border-[var(--border-color)] bg-[var(--surface)] px-3 py-2"
                  >
                    <span className="text-[var(--text-primary)] flex-1">{kpi.name}</span>
                    <span className="text-[var(--text-muted)]">
                      {kpi.type === 'NUMERIC'
                        ? `Target: ${kpi.targetValue ?? '?'}${kpi.unit ? ` ${kpi.unit}` : ''}`
                        : 'Yes/No'}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-[var(--text-muted)]">No KPIs yet.</p>
            )}

            {addingKpiForGoal === goal.id ? (
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
                    onClick={() => addKpi(goal.id)}
                    disabled={!newKpiName.trim() || saving === goal.id}
                    className="text-xs bg-emerald-600 text-white px-2 py-1 rounded hover:bg-emerald-500 disabled:opacity-50"
                  >
                    Add KPI
                  </button>
                  <button
                    onClick={() => {
                      setAddingKpiForGoal(null);
                      setNewKpiName('');
                      setNewKpiTarget('');
                      setNewKpiUnit('');
                    }}
                    className="text-xs text-[var(--text-muted)] px-2 py-1 hover:text-[var(--text-secondary)]"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setAddingKpiForGoal(goal.id)}
                className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
              >
                <Plus className="h-3 w-3" />
                Add KPI
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderGoalSection = (
    sectionGoals: WeeklyGoal[],
    title: string,
    titleColor: string,
    renderCard: (goal: WeeklyGoal) => JSX.Element
  ) => {
    if (sectionGoals.length === 0) return null;
    return (
      <div className="space-y-3">
        <h4 className={`text-xs font-bold ${titleColor} uppercase tracking-wider`}>
          {title}
        </h4>
        {sectionGoals.map((goal) => renderCard(goal))}
      </div>
    );
  };

  if (loading) {
    return <div className="text-[var(--text-muted)] text-sm py-4">Loading weekly goals...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[var(--text-secondary)]">
          <Target className="h-4 w-4 text-blue-400" />
          <p className="text-sm">
            Review existing weekly goals and create new ones. Add KPIs to track progress.
          </p>
        </div>
        <button
          onClick={() => setShowCoach(!showCoach)}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
            showCoach ? 'bg-amber-500/15 text-amber-400' : 'text-[var(--text-muted)] hover:text-amber-400'
          }`}
        >
          <Lightbulb className="h-3.5 w-3.5" />
          Coach
        </button>
      </div>
      <GoalCreationCoach goalLevel="WEEKLY" isOpen={showCoach} onToggle={() => setShowCoach(!showCoach)} />

      {/* Existing goals — split by week */}
      {goals.length > 0 ? (
        <div className="space-y-5">
          {renderGoalSection(
            goals.filter((g) => g.weekCategory === 'upcoming'),
            "Upcoming Week's Goals",
            'text-indigo-400',
            renderGoalCard
          )}
          {renderGoalSection(
            goals.filter((g) => g.weekCategory === 'last'),
            "Last Week's Goals",
            'text-[var(--text-muted)]',
            renderGoalCard
          )}
          {goals.filter((g) => !g.weekCategory).map((goal) => renderGoalCard(goal))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-[var(--border-color)] px-4 py-6 text-center">
          <Target className="h-8 w-8 text-[var(--text-muted)] mx-auto mb-2" />
          <p className="text-sm text-[var(--text-muted)]">No weekly goals found for the upcoming week.</p>
          <p className="text-xs text-[var(--text-muted)] mt-1">Create one below to get started.</p>
        </div>
      )}

      {/* Add missing week placeholder */}
      {stackId && (
        <button
          onClick={createPlaceholderWeek}
          disabled={creatingPlaceholder}
          className="flex items-center justify-center gap-2 w-full rounded-lg border border-dashed border-[var(--border-color)] px-4 py-2 text-xs text-[var(--text-muted)] hover:border-indigo-500/30 hover:text-indigo-400 transition-colors disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" />
          {creatingPlaceholder ? 'Creating...' : '+ Add missing week'}
        </button>
      )}

      {/* Create new goal form */}
      {showCreateForm ? (
        <div className="rounded-lg border border-indigo-500/20 bg-indigo-500/5 p-4 space-y-3">
          <h4 className="text-sm font-medium text-[var(--text-primary)]">Create Weekly Goal</h4>
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Goal title"
            className="w-full rounded border border-[var(--border-color)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-indigo-500 focus:outline-none"
          />
          <input
            type="text"
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            placeholder="Description (optional)"
            className="w-full rounded border border-[var(--border-color)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--text-primary)] focus:border-indigo-500 focus:outline-none"
          />
          <div className="flex gap-2">
            <button
              onClick={createGoal}
              disabled={!newTitle.trim() || creating}
              className="text-sm bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-500 disabled:opacity-50"
            >
              {creating ? 'Creating...' : 'Create Goal'}
            </button>
            <button
              onClick={() => { setShowCreateForm(false); setNewTitle(''); setNewDescription(''); }}
              className="text-sm text-[var(--text-muted)] hover:text-[var(--text-secondary)] px-3 py-2"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowCreateForm(true)}
          className="flex items-center justify-center gap-2 w-full rounded-lg border border-dashed border-[var(--border-color)] px-4 py-3 text-sm text-[var(--text-muted)] hover:border-indigo-500/30 hover:text-indigo-400 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Create New Weekly Goal
        </button>
      )}
    </div>
  );
}
