'use client';

import { useState, useCallback } from 'react';
import { Plus, Check, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import useSWR from 'swr';

interface Subtask {
  id: string;
  title: string;
  status: 'TODO' | 'IN_PROGRESS' | 'DONE' | 'DROPPED';
  priority: string;
  dueDate: string | null;
  completedAt: string | null;
}

interface SubtaskListProps {
  parentId: string;
  /** Pre-loaded children from parent task (avoids extra fetch) */
  initialChildren?: Subtask[];
  compact?: boolean;
  onMutate?: () => void;
}

export function SubtaskList({ parentId, initialChildren, compact, onMutate }: SubtaskListProps) {
  const { data: fetchedChildren, mutate } = useSWR<any[]>(
    `/api/tasks?parentId=${parentId}`,
    { fallbackData: initialChildren },
  );
  const subtasks: Subtask[] = fetchedChildren ?? [];
  const [newTitle, setNewTitle] = useState('');
  const [adding, setAdding] = useState(false);
  const [expanded, setExpanded] = useState(true);

  const doneCount = subtasks.filter((s) => s.status === 'DONE').length;
  const total = subtasks.length;

  const toggleSubtask = useCallback(async (subtask: Subtask) => {
    const newStatus = subtask.status === 'DONE' ? 'TODO' : 'DONE';
    const res = await fetch(`/api/tasks/${subtask.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    if (res.ok) { mutate(); onMutate?.(); }
  }, [mutate, onMutate]);

  const addSubtask = useCallback(async () => {
    const title = newTitle.trim();
    if (!title) return;
    setAdding(true);
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        taskType: 'MAINTENANCE',
        parentId,
      }),
    });
    if (res.ok) setNewTitle('');
    setAdding(false);
    mutate();
    onMutate?.();
  }, [newTitle, parentId, mutate, onMutate]);

  const deleteSubtask = useCallback(async (id: string) => {
    const res = await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
    if (res.ok) { mutate(); onMutate?.(); }
  }, [mutate, onMutate]);

  if (total === 0 && compact) {
    return null;
  }

  return (
    <div className={compact ? '' : 'mt-2'}>
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors mb-1"
      >
        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        Subtasks
        {total > 0 && (
          <span className="text-[var(--text-muted)]">
            ({doneCount}/{total})
          </span>
        )}
        {total > 0 && (
          <span
            className="inline-block h-1.5 rounded-full bg-[var(--border-color)] ml-1"
            style={{ width: '48px' }}
          >
            <span
              className="block h-full rounded-full bg-green-500 transition-all"
              style={{ width: `${(doneCount / total) * 100}%` }}
            />
          </span>
        )}
      </button>

      {expanded && (
        <div className="space-y-1 ml-2">
          {subtasks.map((st) => {
            const isDone = st.status === 'DONE';
            return (
              <div key={st.id} className="flex items-center gap-2 group/sub py-0.5">
                <button
                  onClick={() => toggleSubtask(st)}
                  className={`flex-shrink-0 h-4 w-4 rounded border transition-colors ${
                    isDone
                      ? 'bg-green-600 border-green-600'
                      : 'border-[var(--border-color)] hover:border-indigo-500'
                  }`}
                >
                  {isDone && <Check className="h-full w-full text-white p-px" />}
                </button>
                <span className={`text-sm flex-1 ${isDone ? 'text-[var(--text-muted)] line-through' : 'text-[var(--text-primary)]'}`}>
                  {st.title}
                </span>
                <button
                  onClick={() => deleteSubtask(st.id)}
                  className="opacity-0 group-hover/sub:opacity-100 text-[var(--text-muted)] hover:text-red-400 transition-all p-0.5"
                  title="Delete subtask"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            );
          })}

          {/* Add subtask inline */}
          <div className="flex items-center gap-2 pt-1">
            <Plus className="h-3.5 w-3.5 text-[var(--text-muted)] flex-shrink-0" />
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addSubtask();
              }}
              placeholder="Add subtask..."
              disabled={adding}
              className="flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none border-b border-transparent focus:border-[var(--border-color)] py-0.5"
            />
            {newTitle.trim() && (
              <button
                onClick={addSubtask}
                disabled={adding}
                className="text-xs text-indigo-400 hover:text-indigo-300 font-medium"
              >
                Add
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
