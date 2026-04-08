'use client';

import { useMemo } from 'react';
import { PRIORITY_DOT_COLORS } from '@/lib/goal-constants';
import { ClearGoalsDisplay } from '@/components/tasks/ClearGoalsDisplay';

interface FocusViewProps {
  tasks: any[];
  onStatusChange: (taskId: string, newStatus: string) => void;
}

const PRIORITY_ORDER: Record<string, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

export function FocusView({ tasks, onStatusChange }: FocusViewProps) {
  const focusTasks = useMemo(() => {
    return tasks
      .filter((t) => t.status !== 'DONE' && t.status !== 'DROPPED')
      .sort((a, b) => {
        // Win-the-day first
        if (a.isWinTheDay && !b.isWinTheDay) return -1;
        if (!a.isWinTheDay && b.isWinTheDay) return 1;
        // Then by priority
        return (PRIORITY_ORDER[a.priority] ?? 2) - (PRIORITY_ORDER[b.priority] ?? 2);
      });
  }, [tasks]);

  if (focusTasks.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-lg text-[var(--text-muted)]">Nothing to do right now.</p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5 max-w-xl">
      {focusTasks.map((task) => (
        <div key={task.id}>
          <button
            onClick={() => onStatusChange(task.id, task.status === 'IN_PROGRESS' ? 'DONE' : 'IN_PROGRESS')}
            className="flex items-center gap-3 w-full text-left rounded-lg px-4 py-3 border border-[var(--border-color)] bg-[var(--glass-bg)] hover:border-white/[0.1] transition-colors group"
          >
            <div
              className={`h-5 w-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                task.status === 'IN_PROGRESS'
                  ? 'border-indigo-500 bg-indigo-500/20'
                  : 'border-[var(--border-color)] group-hover:border-[var(--text-muted)]'
              }`}
            >
              {task.status === 'IN_PROGRESS' && (
                <div className="h-2 w-2 rounded-full bg-indigo-400" />
              )}
            </div>
            <span className="flex-1 text-sm text-[var(--text-primary)] truncate">
              {task.isWinTheDay && <span className="text-yellow-400 mr-1.5">★</span>}
              {task.title}
            </span>
            <span className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${PRIORITY_DOT_COLORS[task.priority] ?? ''}`} />
          </button>
          <div className="pl-16 pr-4">
            <ClearGoalsDisplay taskId={task.id} editable={false} compact />
          </div>
        </div>
      ))}
    </div>
  );
}
