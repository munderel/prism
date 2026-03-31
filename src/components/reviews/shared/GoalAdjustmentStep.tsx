'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Plus, BarChart3, ChevronDown, ChevronRight } from 'lucide-react';
import type { Goal } from './review-types';
import { GOAL_STATUSES } from './review-types';

interface KpiLocal {
  id: string;
  name: string;
  type: 'NUMERIC' | 'BOOLEAN';
  targetValue: number | null;
  unit: string | null;
}

interface GoalAdjustmentStepProps {
  goals: Goal[];
  editingGoals: Record<string, { title: string; description: string; status: string }>;
  onEdit: (goalId: string, field: string, value: string) => void;
  onSave: (goalId: string) => void;
  newGoalTitle: string;
  onNewGoalTitleChange: (v: string) => void;
  onAddGoal: () => void;
  goalLevelLabel?: string;
  showKpis?: boolean;
  childGoals?: Goal[];
}

export function GoalAdjustmentStep({
  goals,
  editingGoals,
  onEdit,
  onSave,
  newGoalTitle,
  onNewGoalTitleChange,
  onAddGoal,
  goalLevelLabel = 'goal',
  showKpis = false,
  childGoals = [],
}: GoalAdjustmentStepProps) {
  const [expandedGoals, setExpandedGoals] = useState<Set<string>>(() => new Set(goals.map((g) => g.id)));
  const [goalKpis, setGoalKpis] = useState<Record<string, KpiLocal[]>>({});
  const [addingKpiFor, setAddingKpiFor] = useState<string | null>(null);
  const [newKpiName, setNewKpiName] = useState('');
  const [newKpiType, setNewKpiType] = useState<'NUMERIC' | 'BOOLEAN'>('NUMERIC');
  const [newKpiTarget, setNewKpiTarget] = useState('');
  const [newKpiUnit, setNewKpiUnit] = useState('');

  // Memoize child grouping
  const childrenByParent = useMemo(() => {
    return childGoals.reduce<Record<string, Goal[]>>((acc, child) => {
      const pid = child.parentId ?? '__orphan__';
      if (!acc[pid]) acc[pid] = [];
      acc[pid].push(child);
      return acc;
    }, {});
  }, [childGoals]);

  // Collect all goal IDs that need KPIs (parents + children)
  const allKpiGoalIds = useMemo(() => {
    if (!showKpis) return [];
    const ids = goals.map((g) => g.id);
    for (const children of Object.values(childrenByParent)) {
      for (const c of children) ids.push(c.id);
    }
    return ids;
  }, [showKpis, goals, childrenByParent]);

  // Batch-load KPIs via useEffect (not during render)
  useEffect(() => {
    if (allKpiGoalIds.length === 0) return;
    let cancelled = false;

    const loadAll = async () => {
      const results = await Promise.all(
        allKpiGoalIds.map(async (goalId) => {
          try {
            const res = await fetch(`/api/goals/${goalId}/kpis`);
            if (res.ok) {
              const data = await res.json();
              return [goalId, data.kpis ?? data ?? []] as [string, KpiLocal[]];
            }
          } catch { /* ignore */ }
          return [goalId, []] as [string, KpiLocal[]];
        })
      );
      if (!cancelled) {
        setGoalKpis(Object.fromEntries(results));
      }
    };

    loadAll();
    return () => { cancelled = true; };
  }, [allKpiGoalIds]);

  const toggleExpand = useCallback((goalId: string) => {
    setExpandedGoals((prev) => {
      const next = new Set(prev);
      if (next.has(goalId)) next.delete(goalId); else next.add(goalId);
      return next;
    });
  }, []);

  // Reset form state when switching which goal gets a new KPI
  const startAddingKpi = useCallback((goalId: string) => {
    setAddingKpiFor(goalId);
    setNewKpiName('');
    setNewKpiTarget('');
    setNewKpiUnit('');
    setNewKpiType('NUMERIC');
  }, []);

  const addKpi = useCallback(async (goalId: string) => {
    if (!newKpiName.trim()) return;
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
        setAddingKpiFor(null);
      }
    } catch { /* ignore */ }
  }, [newKpiName, newKpiType, newKpiTarget, newKpiUnit]);

  const renderKpiSection = (goalId: string) => {
    const kpis = goalKpis[goalId];
    const isAdding = addingKpiFor === goalId;

    if (kpis === undefined) {
      return <p className="text-xs text-[var(--text-muted)]">Loading KPIs...</p>;
    }

    return (
      <div className="space-y-2 mt-2 pl-2 border-l-2 border-[var(--border-color)]">
        <h5 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide flex items-center gap-1">
          <BarChart3 className="h-3 w-3" /> KPIs
        </h5>
        {kpis.length > 0 ? (
          kpis.map((kpi) => (
            <div key={kpi.id} className="flex items-center gap-2 text-xs rounded border border-[var(--border-color)] bg-[var(--surface)] px-3 py-2">
              <span className="text-[var(--text-primary)] flex-1">{kpi.name}</span>
              <span className="text-[var(--text-muted)]">
                {kpi.type === 'NUMERIC' ? `Target: ${kpi.targetValue ?? '?'}${kpi.unit ? ` ${kpi.unit}` : ''}` : 'Yes/No'}
              </span>
            </div>
          ))
        ) : (
          <p className="text-xs text-[var(--text-muted)]">No KPIs yet.</p>
        )}

        {isAdding ? (
          <div className="space-y-2 rounded border border-[var(--border-color)] bg-[var(--surface)] p-3">
            <input type="text" value={newKpiName} onChange={(e) => setNewKpiName(e.target.value)} placeholder="KPI name"
              className="w-full rounded border border-[var(--border-color)] bg-[var(--surface-raised)] px-2 py-1 text-xs text-[var(--text-primary)] focus:border-indigo-500 focus:outline-none" />
            <div className="flex gap-2">
              <select value={newKpiType} onChange={(e) => setNewKpiType(e.target.value as 'NUMERIC' | 'BOOLEAN')}
                className="rounded border border-[var(--border-color)] bg-[var(--surface-raised)] px-2 py-1 text-xs text-[var(--text-primary)] focus:border-indigo-500 focus:outline-none">
                <option value="NUMERIC">Numeric</option>
                <option value="BOOLEAN">Yes/No</option>
              </select>
              {newKpiType === 'NUMERIC' && (
                <>
                  <input type="number" value={newKpiTarget} onChange={(e) => setNewKpiTarget(e.target.value)} placeholder="Target"
                    className="w-20 rounded border border-[var(--border-color)] bg-[var(--surface-raised)] px-2 py-1 text-xs text-[var(--text-primary)] focus:border-indigo-500 focus:outline-none" />
                  <input type="text" value={newKpiUnit} onChange={(e) => setNewKpiUnit(e.target.value)} placeholder="Unit"
                    className="w-16 rounded border border-[var(--border-color)] bg-[var(--surface-raised)] px-2 py-1 text-xs text-[var(--text-primary)] focus:border-indigo-500 focus:outline-none" />
                </>
              )}
            </div>
            <div className="flex gap-1">
              <button onClick={() => addKpi(goalId)} disabled={!newKpiName.trim()}
                className="text-xs bg-emerald-600 text-white px-2 py-1 rounded hover:bg-emerald-500 disabled:opacity-50">Add KPI</button>
              <button onClick={() => setAddingKpiFor(null)}
                className="text-xs text-[var(--text-muted)] px-2 py-1 hover:text-[var(--text-secondary)]">Cancel</button>
            </div>
          </div>
        ) : (
          <button onClick={() => startAddingKpi(goalId)}
            className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 transition-colors">
            <Plus className="h-3 w-3" /> Add KPI
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {goals.map((goal) => {
        const edit = editingGoals[goal.id];
        if (!edit) return null;
        const isExpanded = expandedGoals.has(goal.id);
        const children = childrenByParent[goal.id] ?? [];

        return (
          <div key={goal.id} className="rounded-lg border border-[var(--border-color)] overflow-hidden">
            <div className="px-4 py-3 space-y-3">
              {showKpis && children.length > 0 && (
                <button onClick={() => toggleExpand(goal.id)} className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
                  {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  {children.length} child goals
                </button>
              )}
              <input
                type="text"
                value={edit.title}
                onChange={(e) => onEdit(goal.id, 'title', e.target.value)}
                className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface)] px-3 py-1.5 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none"
              />
              <textarea
                value={edit.description}
                onChange={(e) => onEdit(goal.id, 'description', e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface)] px-3 py-1.5 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none resize-none"
                placeholder="Description (optional)"
              />
              <div className="flex items-center gap-3">
                <select
                  value={edit.status}
                  onChange={(e) => onEdit(goal.id, 'status', e.target.value)}
                  className="rounded-lg border border-[var(--border-color)] bg-[var(--surface)] px-3 py-1.5 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none"
                >
                  {GOAL_STATUSES.map((s) => (
                    <option key={s} value={s}>{s.replace('_', ' ')}</option>
                  ))}
                </select>
                <button
                  onClick={() => onSave(goal.id)}
                  className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 transition-colors"
                >
                  Save Changes
                </button>
              </div>
              {showKpis && renderKpiSection(goal.id)}
            </div>

            {showKpis && isExpanded && children.length > 0 && (
              <div className="border-t border-[var(--border-color)] bg-[var(--surface-raised)]/30 px-4 py-3 space-y-3">
                <p className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide">
                  Child Goals
                </p>
                {children.map((child) => (
                  <div key={child.id} className="rounded border border-[var(--border-color)] bg-[var(--surface)] px-3 py-2 space-y-1">
                    <p className="text-sm text-[var(--text-primary)]">{child.title}</p>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                      child.status === 'COMPLETED' ? 'bg-green-500/20 text-green-400' :
                      child.status === 'IN_PROGRESS' ? 'bg-blue-500/20 text-blue-400' :
                      'bg-[var(--surface-raised)] text-[var(--text-muted)]'
                    }`}>
                      {child.status.replace('_', ' ')}
                    </span>
                    {renderKpiSection(child.id)}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      <div className="border-t border-[var(--border-color)] pt-4">
        <p className="text-xs text-[var(--text-muted)] mb-2">Add a new {goalLevelLabel} goal</p>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newGoalTitle}
            onChange={(e) => onNewGoalTitleChange(e.target.value)}
            className="flex-1 rounded-lg border border-[var(--border-color)] bg-[var(--surface)] px-3 py-2 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none"
            placeholder={`New ${goalLevelLabel} goal title...`}
            onKeyDown={(e) => e.key === 'Enter' && onAddGoal()}
          />
          <button
            onClick={onAddGoal}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
