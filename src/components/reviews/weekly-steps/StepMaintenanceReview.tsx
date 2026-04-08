'use client';

import { useState, useEffect } from 'react';
import { Settings, Zap, Trash2, Check, Wrench } from 'lucide-react';
import { getWeekBoundaries } from '@/lib/date-utils';

interface Task {
  id: string;
  title: string;
  status: string;
  description: string | null;
  recurrenceRule: string | null;
}

type MaintenanceDecision = 'keep' | 'automate' | 'eliminate';

interface DecisionMap {
  [taskId: string]: {
    decision: MaintenanceDecision;
    reason?: string;
  };
}

interface StepMaintenanceReviewProps {
  reviewId: string;
  initialDecisions?: DecisionMap;
  onDecisionsChange: (decisions: DecisionMap) => void;
  onTaskCountChange?: (count: number) => void;
  isTeamReview?: boolean;
}

export function StepMaintenanceReview({ reviewId: _reviewId, initialDecisions, onDecisionsChange, onTaskCountChange, isTeamReview }: StepMaintenanceReviewProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [decisions, setDecisions] = useState<DecisionMap>(initialDecisions ?? {});
  const [eliminateReason, setEliminateReason] = useState<Record<string, string>>({});
  const [processing, setProcessing] = useState<string | null>(null);

  useEffect(() => {
    fetchMaintenanceTasks();
  }, []);

  useEffect(() => {
    if (initialDecisions) setDecisions(initialDecisions);
  }, [initialDecisions]);

  const fetchMaintenanceTasks = async () => {
    try {
      const scopeParam = isTeamReview ? '&scope=company' : '';
      // Limit to tasks due this week or overdue — exclude future-week tasks.
      // The API needs startDate+endDate together; use a far-past startDate to include all overdue tasks.
      // endDate is exclusive, so +1 day from Sunday captures the full week.
      const { end: weekEnd } = getWeekBoundaries();
      const weekEndDate = new Date(weekEnd);
      weekEndDate.setDate(weekEndDate.getDate() + 1);
      const endDateParam = weekEndDate.toISOString().split('T')[0];
      const res = await fetch(`/api/tasks?taskType=MAINTENANCE&status=TODO&startDate=2000-01-01&endDate=${endDateParam}${scopeParam}`);
      if (res.ok) {
        const data = await res.json();
        setTasks(data);
        onTaskCountChange?.(data.length);
      }
    } catch (err) {
      console.error('Failed to fetch maintenance tasks:', err);
    }
    setLoading(false);
  };

  const setDecision = (taskId: string, decision: MaintenanceDecision) => {
    const updated = {
      ...decisions,
      [taskId]: { decision, reason: decisions[taskId]?.reason },
    };
    setDecisions(updated);
    onDecisionsChange(updated);
  };

  const handleAutomate = async (task: Task) => {
    setProcessing(task.id);
    try {
      // Automation tasks have no goal, so use REACT type directly
      await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskType: 'REACT',
          title: `Automate: ${task.title}`,
          description: `Create automation for the maintenance task: "${task.title}"`,
          priority: 'MEDIUM',
          estimatedMinutes: 120,
        }),
      });
    } catch (err) {
      console.error('Failed to create automation task:', err);
    }

    const updated = {
      ...decisions,
      [task.id]: { decision: 'automate' as MaintenanceDecision },
    };
    setDecisions(updated);
    onDecisionsChange(updated);
    setProcessing(null);
  };

  const handleEliminate = async (task: Task) => {
    const reason = eliminateReason[task.id] ?? '';
    setProcessing(task.id);

    try {
      // Soft-delete by setting status to DROPPED
      await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'DROPPED' }),
      });

      // Add reason as comment if provided
      if (reason.trim()) {
        await fetch(`/api/tasks/${task.id}/comments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: `Eliminated during weekly review: ${reason}`,
          }),
        });
      }

      setTasks((prev) => prev.filter((t) => t.id !== task.id));
    } catch (err) {
      console.error('Failed to eliminate task:', err);
    }

    const updated = {
      ...decisions,
      [task.id]: { decision: 'eliminate' as MaintenanceDecision, reason },
    };
    setDecisions(updated);
    onDecisionsChange(updated);
    setProcessing(null);
  };

  if (loading) {
    return <div className="text-[var(--text-muted)] text-sm py-4">Loading maintenance tasks...</div>;
  }

  if (tasks.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--border-color)] px-4 py-8 text-center">
        <Settings className="h-8 w-8 text-[var(--text-muted)] mx-auto mb-2" />
        <p className="text-sm text-[var(--text-muted)]">No maintenance tasks to review.</p>
        <p className="text-xs text-[var(--text-muted)] mt-1">All clear! Move on to the next step.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-[var(--text-secondary)]">
        <Wrench className="h-4 w-4 text-purple-400" />
        <p className="text-sm">
          For each maintenance task, decide: Keep, Automate, or Eliminate.
        </p>
      </div>

      <div className="space-y-3">
        {tasks.map((task) => {
          const decision = decisions[task.id]?.decision;
          return (
            <div
              key={task.id}
              className="rounded-lg border border-[var(--border-color)] bg-[var(--surface)] p-4 space-y-3"
            >
              <div>
                <p className="text-sm font-medium text-[var(--text-primary)]">{task.title}</p>
                {task.description && (
                  <p className="text-xs text-[var(--text-muted)] mt-0.5 line-clamp-2">
                    {task.description}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setDecision(task.id, 'keep')}
                  disabled={processing === task.id}
                  className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-all ${
                    decision === 'keep'
                      ? 'border-green-500/50 bg-green-500/10 text-green-400'
                      : 'border-[var(--border-color)] text-[var(--text-muted)] hover:border-green-500/30 hover:text-green-400'
                  }`}
                >
                  <Check className="h-3.5 w-3.5" />
                  Keep
                </button>
                <button
                  onClick={() => handleAutomate(task)}
                  disabled={processing === task.id}
                  className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-all ${
                    decision === 'automate'
                      ? 'border-blue-500/50 bg-blue-500/10 text-blue-400'
                      : 'border-[var(--border-color)] text-[var(--text-muted)] hover:border-blue-500/30 hover:text-blue-400'
                  }`}
                >
                  <Zap className="h-3.5 w-3.5" />
                  {processing === task.id && decision !== 'automate' ? 'Creating...' : 'Automate'}
                </button>
                <button
                  onClick={() => setDecision(task.id, 'eliminate')}
                  disabled={processing === task.id}
                  className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-all ${
                    decision === 'eliminate'
                      ? 'border-red-500/50 bg-red-500/10 text-red-400'
                      : 'border-[var(--border-color)] text-[var(--text-muted)] hover:border-red-500/30 hover:text-red-400'
                  }`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Eliminate
                </button>
              </div>

              {/* Eliminate reason form */}
              {decision === 'eliminate' && (
                <div className="space-y-2 ml-0 mt-1">
                  <input
                    type="text"
                    value={eliminateReason[task.id] ?? ''}
                    onChange={(e) => setEliminateReason((prev) => ({
                      ...prev,
                      [task.id]: e.target.value,
                    }))}
                    placeholder="Why are you eliminating this task?"
                    className="w-full rounded border border-[var(--border-color)] bg-[var(--surface)] px-2 py-1.5 text-xs text-[var(--text-primary)] focus:border-red-500 focus:outline-none"
                  />
                  <button
                    onClick={() => handleEliminate(task)}
                    disabled={processing === task.id}
                    className="text-xs bg-red-600 text-white px-3 py-1 rounded hover:bg-red-500 transition-colors disabled:opacity-50"
                  >
                    {processing === task.id ? 'Removing...' : 'Confirm Eliminate'}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
