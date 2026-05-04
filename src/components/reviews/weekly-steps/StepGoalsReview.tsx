'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Target, Pencil, Save, ChevronDown, ChevronRight, Plus, BarChart3,
  CheckCircle2, XCircle, ArrowRightCircle, Loader2, AlertTriangle, Building2,
} from 'lucide-react';
import { useToast } from '@/components/ui/ToastProvider';
import { getLocalDateString } from '@/lib/date-utils';
import { getStatusBadgeClass, getPriorityBadgeClass } from '../shared/review-types';

/* =============================================================== */
/*  Types                                                           */
/* =============================================================== */

interface Kpi {
  id: string;
  name: string;
  type: 'NUMERIC' | 'BINARY';
  unit: string | null;
  targetValue: number | null;
  actualValue: number | null;
  isComplete: boolean;
}

interface Goal {
  id: string;
  title: string;
  description: string | null;
  level: string;
  status: string;
  progressPct: number;
  startDate: string | null;
  endDate: string | null;
  parentId: string | null;
  isCompany: boolean;
  isAssignedToMe: boolean;
  kpis: Kpi[];
}

interface LastWeekTask {
  id: string;
  title: string;
  status: string;
  priority: string;
  goalId: string | null;
}

type ReportStatus = 'on_track' | 'at_risk' | 'blocked';
interface CompanyReport {
  progressPct: number;
  status: ReportStatus;
  notes: string;
}

interface StepGoalsReviewProps {
  reviewId: string;
  isTeamReview?: boolean;
  isAdmin?: boolean;
  onSummaryChange?: (summary: { editedGoalIds: string[]; doneTaskIds: string[]; abandonedTaskIds: string[]; kpiUpdateCount: number }) => void;
}

/* =============================================================== */
/*  Date helpers                                                    */
/* =============================================================== */

function getMonday(date: Date): Date {
  const d = new Date(date);
  const dayOfWeek = d.getDay();
  const offset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  d.setDate(d.getDate() + offset);
  d.setHours(0, 0, 0, 0);
  return d;
}

function rangesOverlap(start: string | null, end: string | null, refStart: Date, refEnd: Date): boolean {
  if (!start && !end) return true;
  const gs = start ? new Date(start) : new Date(0);
  const ge = end ? new Date(end) : new Date('2099-12-31');
  return gs <= refEnd && ge >= refStart;
}

/* =============================================================== */
/*  Visibility predicate                                            */
/* =============================================================== */

function isGoalVisible(g: Goal, monthStart: Date, monthEnd: Date, weekRangeStart: Date, weekRangeEnd: Date): boolean {
  if (g.status === 'COMPLETED' || g.status === 'ABANDONED') return false;
  if (g.level === 'MONTHLY') return rangesOverlap(g.startDate, g.endDate, monthStart, monthEnd);
  if (g.level === 'WEEKLY') return rangesOverlap(g.startDate, g.endDate, weekRangeStart, weekRangeEnd);
  return false;
}

/* =============================================================== */
/*  Data loaders                                                    */
/* =============================================================== */

async function fetchPersonalGoals(): Promise<Goal[]> {
  const stacksRes = await fetch('/api/stacks');
  if (!stacksRes.ok) return [];
  const stacks: Array<{ id: string; isCompany?: boolean }> = await stacksRes.json();
  const out: Goal[] = [];
  for (const stack of stacks) {
    if (stack.isCompany) continue;
    const res = await fetch(`/api/goals?stackId=${stack.id}`);
    if (!res.ok) continue;
    const raw = await res.json();
    if (Array.isArray(raw)) {
      for (const g of raw) out.push(normalizeGoal(g, false));
    }
  }
  return out;
}

async function fetchCompanyGoals(): Promise<Goal[]> {
  const res = await fetch('/api/goals?isCompany=true');
  if (!res.ok) return [];
  const raw = await res.json();
  return Array.isArray(raw) ? raw.map((g) => normalizeGoal(g, true)) : [];
}

function normalizeGoal(g: any, isCompany: boolean): Goal {
  return {
    id: g.id,
    title: g.title,
    description: g.description ?? null,
    level: g.level,
    status: g.status,
    progressPct: g.progressPct ?? 0,
    startDate: g.startDate ?? null,
    endDate: g.endDate ?? null,
    parentId: g.parentId ?? null,
    isCompany,
    isAssignedToMe: Boolean(g.isAssignedToMe),
    kpis: [],
  };
}

async function hydrateKpis(goals: Goal[]): Promise<Goal[]> {
  const enriched = await Promise.all(
    goals.map(async (g) => {
      try {
        const res = await fetch(`/api/goals/${g.id}/kpis`);
        if (!res.ok) return g;
        const data = await res.json();
        const kpis: Kpi[] = data.kpis ?? data;
        return { ...g, kpis: Array.isArray(kpis) ? kpis : [] };
      } catch {
        return g;
      }
    }),
  );
  return enriched;
}

async function fetchLastWeekTasks(isTeamReview: boolean, weekStartDay: number): Promise<LastWeekTask[]> {
  const now = new Date();
  const dow = now.getDay();
  const diff = (dow - weekStartDay + 7) % 7;
  const thisWeekStart = new Date(now);
  thisWeekStart.setDate(now.getDate() - diff);
  thisWeekStart.setHours(0, 0, 0, 0);
  const lastWeekStart = new Date(thisWeekStart);
  lastWeekStart.setDate(thisWeekStart.getDate() - 7);
  const lastWeekEnd = new Date(thisWeekStart);
  lastWeekEnd.setDate(thisWeekStart.getDate() - 1);
  lastWeekEnd.setHours(23, 59, 59, 999);

  const start = getLocalDateString(lastWeekStart);
  const end = getLocalDateString(lastWeekEnd);
  const scope = isTeamReview ? '&scope=company' : '&scope=individual';
  const res = await fetch(`/api/tasks?startDate=${start}&endDate=${end}${scope}`);
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data)
    ? data.map((t: any) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        goalId: t.goal?.id ?? null,
      }))
    : [];
}

async function fetchWeekStartDay(): Promise<number> {
  try {
    const res = await fetch('/api/stacks');
    if (res.ok) {
      const stacks = await res.json();
      const personal = Array.isArray(stacks) ? stacks.find((s: { isCompany?: boolean }) => !s.isCompany) : null;
      if (personal?.weekStartDay !== undefined) return personal.weekStartDay;
    }
  } catch { /* fall through */ }
  return 1;
}

/* =============================================================== */
/*  Main component                                                  */
/* =============================================================== */

export function StepGoalsReview({ reviewId, isTeamReview, isAdmin, onSummaryChange }: StepGoalsReviewProps) {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [personalGoals, setPersonalGoals] = useState<Goal[]>([]);
  const [companyGoals, setCompanyGoals] = useState<Goal[]>([]);
  const [lastWeekTasks, setLastWeekTasks] = useState<LastWeekTask[]>([]);
  const [companyReports, setCompanyReports] = useState<Record<string, CompanyReport>>({});

  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editingStatusGoalId, setEditingStatusGoalId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savingTaskIds, setSavingTaskIds] = useState<Set<string>>(() => new Set());
  const [savingKpiId, setSavingKpiId] = useState<string | null>(null);
  const [savingReportId, setSavingReportId] = useState<string | null>(null);
  const [expandedMonthly, setExpandedMonthly] = useState<Set<string>>(() => new Set());
  const [editedGoalIds, setEditedGoalIds] = useState<Set<string>>(() => new Set());
  const [kpiUpdateCount, setKpiUpdateCount] = useState(0);

  const [addingKpiForGoal, setAddingKpiForGoal] = useState<string | null>(null);
  const [newKpiName, setNewKpiName] = useState('');
  const [newKpiType, setNewKpiType] = useState<'NUMERIC' | 'BINARY'>('NUMERIC');
  const [newKpiTarget, setNewKpiTarget] = useState('');
  const [newKpiUnit, setNewKpiUnit] = useState('');

  // Window boundaries
  const now = useMemo(() => new Date(), []);
  const monthStart = useMemo(() => new Date(now.getFullYear(), now.getMonth(), 1), [now]);
  const monthEnd = useMemo(() => new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999), [now]);
  const thisWeekStart = useMemo(() => getMonday(now), [now]);
  const lastWeekStart = useMemo(() => {
    const d = new Date(thisWeekStart);
    d.setDate(thisWeekStart.getDate() - 7);
    return d;
  }, [thisWeekStart]);
  const upcomingSundayEnd = useMemo(() => {
    const d = new Date(thisWeekStart);
    d.setDate(thisWeekStart.getDate() + 6);
    d.setHours(23, 59, 59, 999);
    return d;
  }, [thisWeekStart]);

  // Initial load
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const wsd = await fetchWeekStartDay();
        // Each fetch defaults to its empty shape on failure so a single
        // network hiccup can't blank the entire step.
        const [personal, company, tasks, reports] = await Promise.all([
          isTeamReview ? Promise.resolve([] as Goal[]) : fetchPersonalGoals().catch(() => [] as Goal[]),
          fetchCompanyGoals().catch(() => [] as Goal[]),
          fetchLastWeekTasks(Boolean(isTeamReview), wsd).catch(() => [] as LastWeekTask[]),
          (async () => {
            // Read prior `company_goal_report` answers (legacy step) so resuming
            // a partially-finished review keeps the user's progress notes.
            try {
              const res = await fetch(`/api/reviews/${reviewId}/answers`);
              if (!res.ok) return {} as Record<string, CompanyReport>;
              const rows: Array<{ stepKey: string; answerData?: { reports?: Array<{ goalId: string } & CompanyReport> } }> =
                await res.json().catch(() => []);
              const prior = rows.find((r) => r.stepKey === 'company_goal_report');
              const map: Record<string, CompanyReport> = {};
              for (const r of prior?.answerData?.reports ?? []) {
                map[r.goalId] = { progressPct: r.progressPct, status: r.status, notes: r.notes };
              }
              return map;
            } catch {
              return {} as Record<string, CompanyReport>;
            }
          })(),
        ]);
        if (cancelled) return;

        const visiblePersonal = personal.filter((g) => isGoalVisible(g, monthStart, monthEnd, lastWeekStart, upcomingSundayEnd));
        const visibleCompany = company.filter(
          (g) => (isAdmin || g.isAssignedToMe) && isGoalVisible(g, monthStart, monthEnd, lastWeekStart, upcomingSundayEnd),
        );

        const [hydPersonal, hydCompany] = await Promise.all([
          hydrateKpis(visiblePersonal),
          hydrateKpis(visibleCompany),
        ]);
        if (cancelled) return;

        setPersonalGoals(hydPersonal);
        setCompanyGoals(hydCompany);
        setLastWeekTasks(tasks);
        setCompanyReports(reports);

        // Auto-expand all monthly goals so users see the nested children
        const allMonthlyIds = [...hydPersonal, ...hydCompany]
          .filter((g) => g.level === 'MONTHLY')
          .map((g) => g.id);
        setExpandedMonthly(new Set(allMonthlyIds));
      } catch (err) {
        console.error('[StepGoalsReview] load failed:', err);
        if (!cancelled) toast.error("Couldn't load goals.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isAdmin, isTeamReview, reviewId, monthStart, monthEnd, lastWeekStart, upcomingSundayEnd, toast]);

  // Publish summary to parent for persistence
  useEffect(() => {
    onSummaryChange?.({
      editedGoalIds: Array.from(editedGoalIds),
      doneTaskIds: lastWeekTasks.filter((t) => t.status === 'DONE').map((t) => t.id),
      abandonedTaskIds: lastWeekTasks.filter((t) => t.status === 'DROPPED').map((t) => t.id),
      kpiUpdateCount,
    });
  }, [editedGoalIds, lastWeekTasks, kpiUpdateCount, onSummaryChange]);

  /* ---------- Goal mutators ---------- */

  const updateGoalLocally = (id: string, isCompany: boolean, patch: Partial<Goal>) => {
    const setter = isCompany ? setCompanyGoals : setPersonalGoals;
    setter((prev) => prev.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  };

  const saveGoalEdit = async (goal: Goal) => {
    setSavingId(goal.id);
    try {
      const res = await fetch(`/api/goals/${goal.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editTitle, description: editDescription || null }),
      });
      if (!res.ok) throw new Error(`PATCH /api/goals/${goal.id} → ${res.status}`);
      updateGoalLocally(goal.id, goal.isCompany, { title: editTitle, description: editDescription || null });
      setEditingGoalId(null);
      setEditedGoalIds((prev) => new Set(prev).add(goal.id));
    } catch (err) {
      console.error('[StepGoalsReview] save edit failed:', err);
      toast.error("Couldn't save goal — try again.");
    } finally {
      setSavingId(null);
    }
  };

  const saveStatus = async (goal: Goal, newStatus: string) => {
    setSavingId(goal.id);
    try {
      const res = await fetch(`/api/goals/${goal.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error(`PATCH status ${res.status}`);
      updateGoalLocally(goal.id, goal.isCompany, { status: newStatus });
      setEditedGoalIds((prev) => new Set(prev).add(goal.id));
    } catch (err) {
      console.error('[StepGoalsReview] save status failed:', err);
      toast.error("Couldn't save status — try again.");
    } finally {
      setSavingId(null);
      setEditingStatusGoalId(null);
    }
  };

  const updateKpiActual = async (goal: Goal, kpi: Kpi, actualValue: number) => {
    setSavingKpiId(kpi.id);
    try {
      const res = await fetch(`/api/kpis/${kpi.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actualValue }),
      });
      if (!res.ok) throw new Error(`PUT kpi ${res.status}`);
      const setter = goal.isCompany ? setCompanyGoals : setPersonalGoals;
      setter((prev) =>
        prev.map((g) =>
          g.id === goal.id
            ? { ...g, kpis: g.kpis.map((k) => (k.id === kpi.id ? { ...k, actualValue } : k)) }
            : g,
        ),
      );
      setKpiUpdateCount((c) => c + 1);
    } catch (err) {
      console.error('[StepGoalsReview] update KPI failed:', err);
      toast.error("Couldn't save KPI — try again.");
    } finally {
      setSavingKpiId(null);
    }
  };

  const addKpi = async (goal: Goal) => {
    if (!newKpiName.trim()) return;
    setSavingKpiId(goal.id);
    try {
      const body: Record<string, unknown> = { name: newKpiName.trim(), type: newKpiType };
      if (newKpiType === 'NUMERIC') {
        const t = parseFloat(newKpiTarget);
        body.targetValue = isNaN(t) ? null : t;
        body.unit = newKpiUnit.trim() || null;
      }
      const res = await fetch(`/api/goals/${goal.id}/kpis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`POST kpi ${res.status}`);
      const created = await res.json();
      const newKpi: Kpi = {
        id: created.id,
        name: created.name,
        type: created.type,
        unit: created.unit ?? null,
        targetValue: created.targetValue ?? null,
        actualValue: created.actualValue ?? null,
        isComplete: created.isComplete ?? false,
      };
      const setter = goal.isCompany ? setCompanyGoals : setPersonalGoals;
      setter((prev) => prev.map((g) => (g.id === goal.id ? { ...g, kpis: [...g.kpis, newKpi] } : g)));
      setAddingKpiForGoal(null);
      setNewKpiName('');
      setNewKpiTarget('');
      setNewKpiUnit('');
      setNewKpiType('NUMERIC');
    } catch (err) {
      console.error('[StepGoalsReview] add KPI failed:', err);
      toast.error("Couldn't add KPI — try again.");
    } finally {
      setSavingKpiId(null);
    }
  };

  const updateTaskStatus = async (taskId: string, currentStatus: string, newStatus: 'DONE' | 'DROPPED' | 'TODO') => {
    const target = currentStatus === newStatus ? 'TODO' : newStatus;
    const prev = currentStatus;
    setLastWeekTasks((list) => list.map((t) => (t.id === taskId ? { ...t, status: target } : t)));
    setSavingTaskIds((s) => { const n = new Set(s); n.add(taskId); return n; });
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: target }),
      });
      if (!res.ok) throw new Error(`PATCH task ${res.status}`);
    } catch (err) {
      console.error('[StepGoalsReview] task status failed:', err);
      setLastWeekTasks((list) => list.map((t) => (t.id === taskId ? { ...t, status: prev } : t)));
      toast.error("Couldn't update task — try again.");
    } finally {
      setSavingTaskIds((s) => { const n = new Set(s); n.delete(taskId); return n; });
    }
  };

  /* ---------- Company report mutators ---------- */

  const updateReport = (goalId: string, patch: Partial<CompanyReport>, baseProgress: number) => {
    setCompanyReports((prev) => {
      const current = prev[goalId] ?? { progressPct: baseProgress, status: 'on_track' as ReportStatus, notes: '' };
      return { ...prev, [goalId]: { ...current, ...patch } };
    });
  };

  const persistReport = async (goalId: string) => {
    setSavingReportId(goalId);
    try {
      const report = companyReports[goalId];
      if (!report) return;
      const goalRes = await fetch(`/api/goals/${goalId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ progressPct: report.progressPct }),
      });
      if (!goalRes.ok) throw new Error(`PATCH progress ${goalRes.status}`);
      updateGoalLocally(goalId, true, { progressPct: report.progressPct });

      const answerRes = await fetch(`/api/reviews/${reviewId}/answers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stepKey: 'company_goal_report',
          answerType: 'company_goal_report',
          answerData: {
            reports: Object.entries(companyReports).map(([gid, r]) => ({ goalId: gid, ...r })),
          },
        }),
      });
      if (!answerRes.ok) throw new Error(`POST answer ${answerRes.status}`);
    } catch (err) {
      console.error('[StepGoalsReview] persist report failed:', err);
      toast.error("Couldn't save report — try again.");
    } finally {
      setSavingReportId(null);
    }
  };

  /* ---------- Render helpers ---------- */

  const tasksForWeeklyGoal = (goalId: string) => lastWeekTasks.filter((t) => t.goalId === goalId);
  const weeklyChildrenOf = (goals: Goal[], monthlyId: string) =>
    goals.filter((g) => g.level === 'WEEKLY' && g.parentId === monthlyId);

  const renderKpiList = (goal: Goal) => (
    <div className="space-y-2 ml-6 mt-2">
      <h4 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide flex items-center gap-1">
        <BarChart3 className="h-3 w-3" />
        KPIs
      </h4>
      {goal.kpis.length === 0 && (
        <p className="text-xs text-[var(--text-muted)]">No KPIs yet.</p>
      )}
      {goal.kpis.map((kpi) => (
        <div key={kpi.id} className="flex items-center gap-3 text-xs">
          <span className="text-[var(--text-secondary)] w-32 truncate">{kpi.name}</span>
          {kpi.type === 'NUMERIC' ? (
            <div className="flex items-center gap-2 flex-1">
              <input
                type="number"
                defaultValue={kpi.actualValue ?? ''}
                onBlur={(e) => {
                  const val = parseFloat(e.target.value);
                  if (!isNaN(val) && val !== kpi.actualValue) updateKpiActual(goal, kpi, val);
                }}
                className="w-20 rounded border border-[var(--border-color)] bg-[var(--surface-raised)] px-2 py-1 text-xs text-[var(--text-primary)] focus:border-indigo-500 focus:outline-none text-right"
                placeholder="Actual"
              />
              <span className="text-[var(--text-muted)]">
                / {kpi.targetValue ?? '?'} {kpi.unit ?? ''}
              </span>
              {kpi.targetValue && kpi.actualValue !== null && (
                <div className="w-16 h-1.5 bg-[var(--surface-raised)] rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      (kpi.actualValue / kpi.targetValue) >= 1 ? 'bg-green-500' : 'bg-indigo-500'
                    }`}
                    style={{ width: `${Math.min(100, ((kpi.actualValue ?? 0) / kpi.targetValue) * 100)}%` }}
                  />
                </div>
              )}
            </div>
          ) : (
            <span className={kpi.isComplete ? 'text-green-400' : 'text-[var(--text-muted)]'}>
              {kpi.isComplete ? 'Complete' : 'Incomplete'}
            </span>
          )}
          {savingKpiId === kpi.id && <span className="text-[var(--text-muted)]">Saving...</span>}
        </div>
      ))}

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
              onChange={(e) => setNewKpiType(e.target.value as 'NUMERIC' | 'BINARY')}
              className="rounded border border-[var(--border-color)] bg-[var(--surface-raised)] px-2 py-1 text-xs text-[var(--text-primary)] focus:border-indigo-500 focus:outline-none"
            >
              <option value="NUMERIC">Numeric</option>
              <option value="BINARY">Yes/No</option>
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
              onClick={() => addKpi(goal)}
              disabled={!newKpiName.trim() || savingKpiId === goal.id}
              className="text-xs bg-emerald-600 text-white px-2 py-1 rounded hover:bg-emerald-500 disabled:opacity-50"
            >
              Add KPI
            </button>
            <button
              onClick={() => { setAddingKpiForGoal(null); setNewKpiName(''); setNewKpiTarget(''); setNewKpiUnit(''); }}
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
  );

  const renderGoalEditableHeader = (goal: Goal) => {
    const isEditing = editingGoalId === goal.id;
    return (
      <div className="flex items-center gap-3">
        <Target className={`h-4 w-4 flex-shrink-0 ${goal.isCompany ? 'text-indigo-400' : 'text-blue-400'}`} />
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
                  onClick={() => saveGoalEdit(goal)}
                  disabled={savingId === goal.id}
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
            <div>
              <p className="text-sm font-medium text-[var(--text-primary)] truncate">{goal.title}</p>
              {goal.description && (
                <p className="text-xs text-[var(--text-muted)] mt-0.5 line-clamp-2">{goal.description}</p>
              )}
            </div>
          )}
        </div>

        {!isEditing && (
          <div className="flex items-center gap-1 flex-shrink-0">
            {editingStatusGoalId === goal.id ? (
              <select
                autoFocus
                value={goal.status}
                onChange={(e) => saveStatus(goal, e.target.value)}
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
                className={`flex items-center gap-1 text-xs px-1.5 py-0.5 rounded hover:opacity-80 transition-opacity cursor-pointer ${getStatusBadgeClass(goal.status)}`}
              >
                {goal.status.replace(/_/g, ' ')}
                <ChevronDown className="h-3 w-3 opacity-50" />
              </button>
            )}
            <button
              onClick={() => { setEditingGoalId(goal.id); setEditTitle(goal.title); setEditDescription(goal.description ?? ''); }}
              className="p-1 text-[var(--text-muted)] hover:text-indigo-400 transition-colors"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    );
  };

  const renderTaskList = (weeklyGoal: Goal) => {
    const tasks = tasksForWeeklyGoal(weeklyGoal.id);
    if (tasks.length === 0) return null;
    return (
      <div className="ml-6 mt-3 space-y-2">
        <h5 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide">Last Week's Tasks</h5>
        {tasks.map((task) => {
          const saving = savingTaskIds.has(task.id);
          const isDone = task.status === 'DONE';
          const isAbandoned = task.status === 'DROPPED';
          return (
            <div
              key={task.id}
              className="flex items-center gap-3 rounded-lg border border-[var(--border-color)] bg-[var(--surface)] px-3 py-2"
            >
              <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center">
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin text-[var(--text-muted)]" />
                ) : isDone ? (
                  <CheckCircle2 className="h-5 w-5 text-green-400" />
                ) : isAbandoned ? (
                  <XCircle className="h-5 w-5 text-red-400" />
                ) : (
                  <ArrowRightCircle className="h-5 w-5 text-amber-400" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className={`truncate text-sm ${isDone || isAbandoned ? 'text-[var(--text-muted)] line-through' : 'text-[var(--text-primary)]'}`}>
                  {task.title}
                </p>
                <span className={`mt-1 inline-block rounded px-1.5 py-0.5 text-xs ${getPriorityBadgeClass(task.priority)}`}>
                  {task.priority}
                </span>
              </div>
              <div className="flex flex-shrink-0 items-center gap-1">
                <TaskStatusButton
                  active={isDone}
                  disabled={saving}
                  onClick={() => updateTaskStatus(task.id, task.status, 'DONE')}
                  Icon={CheckCircle2}
                  label="Done"
                  tone="green"
                />
                <TaskStatusButton
                  active={isAbandoned}
                  disabled={saving}
                  onClick={() => updateTaskStatus(task.id, task.status, 'DROPPED')}
                  Icon={XCircle}
                  label="Abandon"
                  tone="red"
                />
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderCompanyReportRow = (monthly: Goal) => {
    const baseProgress = monthly.progressPct;
    const report = companyReports[monthly.id] ?? { progressPct: baseProgress, status: 'on_track' as ReportStatus, notes: '' };
    return (
      <div className="ml-6 mt-3 rounded-lg border border-indigo-500/20 bg-indigo-500/5 p-3 space-y-3">
        <h5 className="text-xs font-semibold text-indigo-300 uppercase tracking-wide flex items-center gap-1">
          <Building2 className="h-3 w-3" />
          Company Goal Report
        </h5>
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
            onChange={(e) => updateReport(monthly.id, { progressPct: Number(e.target.value) }, baseProgress)}
            className="w-full accent-indigo-500"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(['on_track', 'at_risk', 'blocked'] as ReportStatus[]).map((s) => {
            const meta = STATUS_META[s];
            const SIcon = meta.Icon;
            const active = report.status === s;
            return (
              <button
                key={s}
                onClick={() => updateReport(monthly.id, { status: s }, baseProgress)}
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                  active ? meta.className : 'border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                <SIcon className="h-3 w-3" />
                {meta.label}
              </button>
            );
          })}
        </div>
        <textarea
          value={report.notes}
          onChange={(e) => updateReport(monthly.id, { notes: e.target.value }, baseProgress)}
          placeholder="Short note (blockers, wins, next step)…"
          rows={2}
          className="w-full rounded-lg border border-white/[0.08] bg-[var(--hover-bg)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-indigo-500 focus:outline-none"
        />
        <div className="flex justify-end">
          <button
            onClick={() => persistReport(monthly.id)}
            disabled={savingReportId === monthly.id}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
          >
            {savingReportId === monthly.id ? 'Saving…' : 'Save report'}
          </button>
        </div>
      </div>
    );
  };

  const renderMonthlyCard = (monthly: Goal, sectionGoals: Goal[]) => {
    const isExpanded = expandedMonthly.has(monthly.id);
    const weeklyChildren = weeklyChildrenOf(sectionGoals, monthly.id);
    const childCount = weeklyChildren.length;

    return (
      <div key={monthly.id} className="rounded-lg border border-violet-500/20 overflow-hidden">
        <button
          onClick={() => setExpandedMonthly((prev) => {
            const next = new Set(prev);
            if (next.has(monthly.id)) next.delete(monthly.id);
            else next.add(monthly.id);
            return next;
          })}
          className="flex items-center gap-3 w-full px-4 py-3 bg-violet-500/5 hover:bg-violet-500/10 transition-colors text-left"
        >
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-violet-400 flex-shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 text-violet-400 flex-shrink-0" />
          )}
          <Target className="h-4 w-4 text-violet-400 flex-shrink-0" />
          <p className="text-sm font-medium text-[var(--text-primary)] flex-1 truncate">{monthly.title}</p>
          <span className={`text-xs px-1.5 py-0.5 rounded flex-shrink-0 ${getStatusBadgeClass(monthly.status)}`}>
            {monthly.status.replace(/_/g, ' ')}
          </span>
          <span className="text-xs text-[var(--text-muted)] flex-shrink-0">
            {childCount} weekly {childCount === 1 ? 'goal' : 'goals'}
          </span>
        </button>

        {isExpanded && (
          <div className="border-t border-violet-500/10 px-4 py-3 space-y-3">
            <div className="rounded-lg border border-[var(--border-color)] bg-[var(--surface)] p-3 space-y-3">
              {renderGoalEditableHeader(monthly)}
              {renderKpiList(monthly)}
            </div>

            {monthly.isCompany && renderCompanyReportRow(monthly)}

            {childCount === 0 ? (
              <p className="text-xs text-[var(--text-muted)] italic ml-2">
                No weekly goals linked to this monthly goal yet.
              </p>
            ) : (
              <div className="space-y-3">
                {weeklyChildren.map((wg) => (
                  <div key={wg.id} className="rounded-lg border border-[var(--border-color)] bg-[var(--surface)] p-3 space-y-2">
                    {renderGoalEditableHeader(wg)}
                    {renderKpiList(wg)}
                    {renderTaskList(wg)}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  /* ---------- Sections ---------- */

  const renderSection = (
    label: 'PERSONAL' | 'COMPANY',
    accent: 'emerald' | 'indigo',
    sectionGoals: Goal[],
  ) => {
    const monthlyGoals = sectionGoals.filter((g) => g.level === 'MONTHLY');
    if (monthlyGoals.length === 0 && sectionGoals.length === 0) return null;

    const accentText = accent === 'indigo' ? 'text-indigo-400' : 'text-emerald-400';
    const accentFrom = accent === 'indigo' ? 'from-indigo-500/40' : 'from-emerald-500/40';
    const accentTo = accent === 'indigo' ? 'to-indigo-500/40' : 'to-emerald-500/40';

    // Weekly goals whose monthly parent isn't visible (orphans)
    const orphanWeeklies = sectionGoals.filter(
      (g) => g.level === 'WEEKLY' && !monthlyGoals.some((m) => m.id === g.parentId),
    );

    return (
      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <div className={`h-px flex-1 bg-gradient-to-r ${accentFrom} to-transparent`} />
          <h2 className={`text-sm font-bold uppercase tracking-[0.2em] ${accentText} whitespace-nowrap`}>
            {label}
          </h2>
          <div className={`h-px flex-1 bg-gradient-to-l ${accentTo} to-transparent`} />
        </div>

        {monthlyGoals.length === 0 ? (
          <p className="text-xs text-[var(--text-muted)] italic">
            No active monthly goals for this period.
          </p>
        ) : (
          monthlyGoals.map((mg) => renderMonthlyCard(mg, sectionGoals))
        )}

        {orphanWeeklies.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">
              Unlinked Weekly Goals
            </h4>
            {orphanWeeklies.map((wg) => (
              <div key={wg.id} className="rounded-lg border border-[var(--border-color)] bg-[var(--surface)] p-3 space-y-2">
                {renderGoalEditableHeader(wg)}
                {renderKpiList(wg)}
                {renderTaskList(wg)}
              </div>
            ))}
          </div>
        )}
      </section>
    );
  };

  if (loading) {
    return <div className="text-[var(--text-muted)] text-sm py-4">Loading goals...</div>;
  }

  const hasAny = personalGoals.length > 0 || companyGoals.length > 0;

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-2 text-[var(--text-secondary)]">
        <Target className="h-4 w-4" />
        <p className="text-sm">
          Review and edit your current goals. Update KPIs, tick last week's tasks, and report on company goals.
        </p>
      </div>

      {!hasAny && (
        <div className="rounded-lg border border-dashed border-[var(--border-color)] px-4 py-8 text-center">
          <Target className="h-8 w-8 text-[var(--text-muted)] mx-auto mb-2" />
          <p className="text-sm text-[var(--text-muted)]">No active goals for the current period.</p>
          <p className="text-xs text-[var(--text-muted)] mt-1">Set goals in the Goal Stack page.</p>
        </div>
      )}

      {!isTeamReview && renderSection('PERSONAL', 'emerald', personalGoals)}
      {renderSection('COMPANY', 'indigo', companyGoals)}
    </div>
  );
}

function TaskStatusButton({
  active, disabled, onClick, Icon, label, tone,
}: {
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  Icon: typeof Target;
  label: string;
  tone: 'green' | 'red';
}) {
  const activeClass = tone === 'green'
    ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
    : 'bg-red-500/20 text-red-400 hover:bg-red-500/30';
  const idleClass = tone === 'green'
    ? 'text-[var(--text-muted)] hover:bg-green-500/10 hover:text-green-400'
    : 'text-[var(--text-muted)] hover:bg-red-500/10 hover:text-red-400';
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors disabled:opacity-50 ${active ? activeClass : idleClass}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
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

