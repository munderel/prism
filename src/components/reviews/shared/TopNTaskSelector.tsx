'use client';

import { useMemo } from 'react';
import { Star, Check } from 'lucide-react';
import { getTaskTypeColor } from '@/lib/prism-colors';

interface TopNTaskSelectorProps {
  tasks: Array<{
    id: string;
    title: string;
    taskType?: string;
    priority?: string;
  }>;
  n: number;
  selectedIds: string[];
  onSelect: (selectedIds: string[]) => void;
  label?: string;
}

const ORDINAL_LABELS = [
  '1st Most Important',
  '2nd Most Important',
  '3rd Most Important',
  '4th Most Important',
  '5th Most Important',
];

export function TopNTaskSelector({
  tasks,
  n,
  selectedIds,
  onSelect,
  label,
}: TopNTaskSelectorProps) {
  const currentStep = selectedIds.length;

  const availableTasks = useMemo(
    () => tasks.filter((t) => !selectedIds.includes(t.id)),
    [tasks, selectedIds]
  );

  const handleSelectTask = (taskId: string) => {
    if (selectedIds.length >= n) return;
    onSelect([...selectedIds, taskId]);
  };

  const handleDeselectStep = (stepIndex: number) => {
    // Remove this selection and everything after it
    onSelect(selectedIds.slice(0, stepIndex));
  };

  return (
    <div className="space-y-6">
      {label && (
        <p className="text-sm font-medium text-gray-700">{label}</p>
      )}

      {/* Step indicators */}
      <div className="space-y-3">
        {Array.from({ length: n }, (_, i) => {
          const isCompleted = i < selectedIds.length;
          const isCurrent = i === currentStep;
          const selectedTask = isCompleted
            ? tasks.find((t) => t.id === selectedIds[i])
            : null;

          let stepClass: string;
          if (isCurrent) {
            stepClass = 'border-blue-400 bg-blue-50 ring-1 ring-blue-200';
          } else if (isCompleted) {
            stepClass = 'border-gray-200 bg-white';
          } else {
            stepClass = 'border-gray-100 bg-gray-50 opacity-60';
          }

          let badgeClass: string;
          if (isCompleted) {
            badgeClass = 'bg-blue-600 text-white';
          } else if (isCurrent) {
            badgeClass = 'border-2 border-blue-400 bg-white text-blue-600';
          } else {
            badgeClass = 'border border-gray-300 bg-white text-gray-400';
          }

          return (
            <div
              key={i}
              className={`flex items-center gap-3 rounded-lg border p-3 transition-all ${stepClass}`}
            >
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${badgeClass}`}
              >
                {i === 0 && isCompleted ? (
                  <Star className="h-4 w-4 fill-current" />
                ) : isCompleted ? (
                  <Check className="h-4 w-4" />
                ) : (
                  i + 1
                )}
              </div>

              <div className="flex-1">
                <p
                  className={`text-xs font-medium uppercase tracking-wide ${
                    isCurrent ? 'text-blue-600' : 'text-gray-400'
                  }`}
                >
                  {ORDINAL_LABELS[i] || `${i + 1}th Most Important`}
                </p>

                {selectedTask && (
                  <button
                    type="button"
                    onClick={() => handleDeselectStep(i)}
                    className="mt-1 flex items-center gap-2 text-left text-sm text-gray-800 hover:text-red-600"
                    title="Click to deselect and re-pick from this step"
                  >
                    {selectedTask.taskType && (
                      <span
                        className="inline-block h-2 w-2 rounded-full"
                        style={{
                          backgroundColor: getTaskTypeColor(
                            selectedTask.taskType
                          ).color,
                        }}
                      />
                    )}
                    <span>{selectedTask.title}</span>
                  </button>
                )}

                {isCurrent && (
                  <p className="mt-1 text-xs text-blue-500">
                    Select from the list below
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Available tasks list */}
      {currentStep < n && (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
            Available Tasks
          </p>

          {availableTasks.length === 0 ? (
            <p className="py-4 text-center text-sm text-gray-400">
              No more tasks available to select.
            </p>
          ) : (
            <div className="max-h-72 space-y-1.5 overflow-y-auto">
              {availableTasks.map((task) => {
                const typeColor = task.taskType
                  ? getTaskTypeColor(task.taskType).color
                  : undefined;

                return (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => handleSelectTask(task.id)}
                    className="flex w-full items-center gap-3 rounded-md border border-gray-200 bg-white px-3 py-2.5 text-left text-sm transition-colors hover:border-blue-300 hover:bg-blue-50"
                  >
                    {typeColor && (
                      <span
                        className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: typeColor }}
                      />
                    )}
                    <span className="flex-1 text-gray-800">{task.title}</span>
                    {task.priority && (
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">
                        {task.priority}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Completion message */}
      {currentStep >= n && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-center">
          <p className="text-sm font-medium text-green-700">
            All {n} tasks selected. Click any selection above to change it.
          </p>
        </div>
      )}
    </div>
  );
}
