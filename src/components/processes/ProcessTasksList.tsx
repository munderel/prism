'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { INPUT_CLASSES } from '@/lib/process-constants';
import { formatDateOnly } from '@/lib/date-utils';

interface ProcessTasksListProps {
  tasks: any[];
  processId: string;
  onAddTask: (processId: string, title: string, parentId?: string) => Promise<void>;
}

export function ProcessTasksList({ tasks, processId, onAddTask }: ProcessTasksListProps) {
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [addingSubtaskFor, setAddingSubtaskFor] = useState<string | null>(null);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');

  return (
    <div>
      <h4 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
        Current Tasks
      </h4>

      {tasks.length > 0 ? (
        <div className="space-y-1">
          {tasks.map((task: any) => (
            <div key={task.id}>
              <div className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-[var(--hover-bg)] transition-colors">
                <span
                  className={`h-2 w-2 rounded-full flex-shrink-0 ${
                    task.status === 'DONE'
                      ? 'bg-emerald-500'
                      : task.status === 'IN_PROGRESS'
                        ? 'bg-blue-500'
                        : 'bg-gray-400 dark:bg-gray-500'
                  }`}
                />
                <span
                  className={`text-sm flex-1 ${
                    task.status === 'DONE'
                      ? 'line-through text-[var(--text-muted)]'
                      : 'text-[var(--text-primary)]'
                  }`}
                >
                  {task.title}
                </span>
                {task.dueDate && (
                  <span className="text-[10px] text-[var(--text-muted)]">
                    {formatDateOnly(task.dueDate, { year: 'numeric', month: 'numeric', day: 'numeric' })}
                  </span>
                )}
                <button
                  onClick={() => {
                    setAddingSubtaskFor(
                      addingSubtaskFor === task.id ? null : task.id
                    );
                    setNewSubtaskTitle('');
                  }}
                  className="text-[10px] text-[var(--text-muted)] hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                  title="Add subtask"
                >
                  <Plus className="h-3 w-3" />
                </button>
              </div>

              {/* Children / subtasks */}
              {task.children?.length > 0 && (
                <div className="ml-6 border-l border-[var(--border-color)] pl-2 space-y-0.5">
                  {task.children.map((child: any) => (
                    <div key={child.id} className="flex items-center gap-2 py-1 px-1">
                      <span
                        className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${
                          child.status === 'DONE'
                            ? 'bg-emerald-500'
                            : 'bg-gray-400 dark:bg-gray-500'
                        }`}
                      />
                      <span
                        className={`text-xs flex-1 ${
                          child.status === 'DONE'
                            ? 'line-through text-[var(--text-muted)]'
                            : 'text-[var(--text-secondary)]'
                        }`}
                      >
                        {child.title}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Inline subtask creation */}
              {addingSubtaskFor === task.id && (
                <div className="ml-6 mt-1 flex items-center gap-2">
                  <input
                    type="text"
                    value={newSubtaskTitle}
                    onChange={(e) => setNewSubtaskTitle(e.target.value)}
                    placeholder="Subtask title..."
                    className={`flex-1 ${INPUT_CLASSES} py-1 text-xs`}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newSubtaskTitle.trim()) {
                        onAddTask(processId, newSubtaskTitle, task.id);
                        setNewSubtaskTitle('');
                      }
                      if (e.key === 'Escape') {
                        setAddingSubtaskFor(null);
                        setNewSubtaskTitle('');
                      }
                    }}
                  />
                  <button
                    onClick={() => {
                      onAddTask(processId, newSubtaskTitle, task.id);
                      setNewSubtaskTitle('');
                    }}
                    disabled={!newSubtaskTitle.trim()}
                    className="rounded bg-indigo-600 px-2 py-1 text-xs text-white disabled:opacity-50"
                  >
                    Add
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-[var(--text-muted)]">
          No tasks yet for this process.
        </p>
      )}

      {/* Add new top-level task */}
      <div className="mt-2 flex items-center gap-2">
        <input
          type="text"
          value={newTaskTitle}
          onChange={(e) => setNewTaskTitle(e.target.value)}
          placeholder="Add a task..."
          className={`flex-1 ${INPUT_CLASSES} py-1.5 text-xs`}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && newTaskTitle.trim()) {
              onAddTask(processId, newTaskTitle);
              setNewTaskTitle('');
            }
          }}
        />
        <button
          onClick={() => {
            onAddTask(processId, newTaskTitle);
            setNewTaskTitle('');
          }}
          disabled={!newTaskTitle.trim()}
          className="rounded bg-cyan-600 dark:bg-cyan-600 px-3 py-1.5 text-xs text-white disabled:opacity-50 hover:bg-cyan-500 transition-colors"
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
