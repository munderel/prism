'use client';

import { useState, useEffect } from 'react';
import { Brain, Star, CheckCircle2, Circle } from 'lucide-react';

interface Task {
  id: string;
  title: string;
}

interface StepDeepWorkBlocksProps {
  reviewId: string;
  top3TaskIds: string[];
  initialChecked?: boolean;
  onCheckedChange: (checked: boolean) => void;
}

export function StepDeepWorkBlocks({
  reviewId: _reviewId,
  top3TaskIds,
  initialChecked,
  onCheckedChange,
}: StepDeepWorkBlocksProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [checked, setChecked] = useState(initialChecked ?? false);

  useEffect(() => {
    if (initialChecked !== undefined) setChecked(initialChecked);
  }, [initialChecked]);

  useEffect(() => {
    fetchTop3Tasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [top3TaskIds]);

  const fetchTop3Tasks = async () => {
    if (top3TaskIds.length === 0) {
      setTasks([]);
      setLoading(false);
      return;
    }

    try {
      const fetched: Task[] = [];
      for (const id of top3TaskIds) {
        const res = await fetch(`/api/tasks/${id}`);
        if (res.ok) {
          const data = await res.json();
          fetched.push({ id: data.id, title: data.title });
        }
      }
      setTasks(fetched);
    } catch (err) {
      console.error('Failed to fetch top tasks:', err);
    }
    setLoading(false);
  };

  const handleToggle = () => {
    const newVal = !checked;
    setChecked(newVal);
    onCheckedChange(newVal);
  };

  if (loading) {
    return <div className="text-[var(--text-muted)] text-sm py-4">Loading tasks...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-[var(--text-secondary)]">
        <Brain className="h-4 w-4 text-purple-400" />
        <p className="text-sm">
          Assign your most important tasks to dedicated deep work blocks on your calendar.
        </p>
      </div>

      {tasks.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide">
            Your Top 3 Tasks
          </h3>
          {tasks.map((task, idx) => (
            <div
              key={task.id}
              className="flex items-center gap-3 rounded-lg border border-yellow-500/20 bg-yellow-500/5 px-4 py-3"
            >
              <div className="flex items-center justify-center h-6 w-6 rounded-full bg-yellow-500 text-black text-xs font-bold flex-shrink-0">
                {idx + 1}
              </div>
              <Star className="h-4 w-4 text-yellow-400 fill-yellow-400 flex-shrink-0" />
              <p className="text-sm text-[var(--text-primary)] truncate">{task.title}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-[var(--border-color)] px-4 py-6 text-center">
          <Star className="h-8 w-8 text-[var(--text-muted)] mx-auto mb-2" />
          <p className="text-sm text-[var(--text-muted)]">
            No top tasks selected in the previous step.
          </p>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Go back and select your most important tasks first.
          </p>
        </div>
      )}

      <div className="rounded-lg border border-purple-500/20 bg-purple-500/5 px-6 py-4">
        <p className="text-sm text-[var(--text-secondary)] text-center">
          Open your calendar and ensure each top task has a dedicated, uninterrupted
          deep work block scheduled for this week.
        </p>
      </div>

      <button
        onClick={handleToggle}
        className="flex items-center gap-4 w-full text-left rounded-lg px-4 py-4 border border-[var(--border-color)] hover:bg-[var(--surface-raised)] transition-colors"
      >
        {checked ? (
          <CheckCircle2 className="h-6 w-6 text-green-400 flex-shrink-0" />
        ) : (
          <Circle className="h-6 w-6 text-[var(--text-muted)] flex-shrink-0" />
        )}
        <span className={`text-sm ${checked ? 'text-green-400' : 'text-[var(--text-primary)]'}`}>
          {checked
            ? 'Deep work blocks assigned!'
            : "I've assigned tasks to deep work blocks"}
        </span>
      </button>
    </div>
  );
}
