'use client';

import { useState, useCallback, useMemo } from 'react';
import useSWR from 'swr';
import { ListTodo, Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { DailyTaskList } from '@/components/tasks/DailyTaskList';
import { TaskEditor } from '@/components/tasks/TaskEditor';
import { TaskComments } from '@/components/tasks/TaskComments';

type ViewMode = 'day' | 'week' | 'month';

function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date;
}

function getSunday(d: Date): Date {
  const monday = getMonday(d);
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  return sunday;
}

function getFirstOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function getLastOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0];
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatMonthLabel(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function formatWeekLabel(d: Date): string {
  const mon = getMonday(d);
  const sun = getSunday(d);
  const fmt = (dt: Date) => dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${fmt(mon)} – ${fmt(sun)}`;
}

export default function TasksPage() {
  const today = new Date().toISOString().split('T')[0];
  const [date, setDate] = useState(today);
  const [viewMode, setViewMode] = useState<ViewMode>('day');
  const [showEditor, setShowEditor] = useState(false);
  const [editingTask, setEditingTask] = useState<any>(null);
  const [selectedTask, setSelectedTask] = useState<any>(null);

  // Compute date range for current view
  const currentDate = new Date(date + 'T00:00:00');

  const getRange = useCallback((): { start: string; end: string } | null => {
    const d = new Date(date + 'T00:00:00');
    if (viewMode === 'week') {
      return { start: toDateStr(getMonday(d)), end: toDateStr(getSunday(d)) };
    }
    if (viewMode === 'month') {
      return { start: toDateStr(getFirstOfMonth(d)), end: toDateStr(getLastOfMonth(d)) };
    }
    return null;
  }, [date, viewMode]);

  // SWR key for range tasks (week/month views)
  const rangeKey = useMemo(() => {
    if (viewMode === 'day') return null;
    const range = getRange();
    if (!range) return null;
    return `/api/tasks?startDate=${range.start}&endDate=${range.end}`;
  }, [viewMode, getRange]);

  const { data: rangeData, isLoading: rangeLoading, mutate: mutateRange } = useSWR(rangeKey);
  const rangeTasks = useMemo(() => (Array.isArray(rangeData) ? rangeData : []), [rangeData]);

  const refresh = useCallback(() => {
    mutateRange();
    setShowEditor(false);
    setEditingTask(null);
  }, [mutateRange]);

  const handleEdit = useCallback((task: any) => {
    setEditingTask(task);
    setShowEditor(true);
  }, []);

  const handleDelete = useCallback(async (taskId: string) => {
    if (!confirm('Delete this task?')) return;
    const res = await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
    if (res.ok) {
      setSelectedTask((prev: any) => prev?.id === taskId ? null : prev);
      mutateRange();
      setShowEditor(false);
      setEditingTask(null);
    }
  }, [mutateRange]);

  const handleTaskClick = useCallback(async (task: any) => {
    const res = await fetch(`/api/tasks/${task.id}`);
    if (res.ok) {
      setSelectedTask(await res.json());
    }
  }, []);

  // Group tasks by date for range views
  const groupedByDate = useMemo((): Record<string, any[]> => {
    const groups: Record<string, any[]> = {};
    const undated: any[] = [];
    for (const task of rangeTasks) {
      if (task.dueDate) {
        const key = new Date(task.dueDate).toISOString().split('T')[0];
        if (!groups[key]) groups[key] = [];
        groups[key].push(task);
      } else {
        undated.push(task);
      }
    }
    if (undated.length > 0) {
      const range = getRange();
      if (range) {
        if (!groups[range.start]) groups[range.start] = [];
        groups[range.start].push(...undated);
      }
    }
    return groups;
  }, [rangeTasks, getRange]);

  // Get sorted date keys within range
  const dateKeys = useMemo((): string[] => {
    const range = getRange();
    if (!range) return [];
    const keys = Object.keys(groupedByDate).sort();
    return keys.filter((k) => k >= range.start && k <= range.end);
  }, [groupedByDate, getRange]);

  // Navigation
  const navigate = (direction: -1 | 1) => {
    const d = new Date(date + 'T00:00:00');
    if (viewMode === 'day') {
      d.setDate(d.getDate() + direction);
    } else if (viewMode === 'week') {
      d.setDate(d.getDate() + direction * 7);
    } else {
      d.setMonth(d.getMonth() + direction);
    }
    setDate(toDateStr(d));
  };

  const goToToday = () => setDate(today);

  // Label for current period
  const periodLabel = (): string => {
    if (viewMode === 'day') return formatDateLabel(date);
    if (viewMode === 'week') return formatWeekLabel(currentDate);
    return formatMonthLabel(currentDate);
  };

  const VIEW_TABS: { key: ViewMode; label: string }[] = [
    { key: 'day', label: 'Day' },
    { key: 'week', label: 'Week' },
    { key: 'month', label: 'Month' },
  ];

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold text-[var(--text-primary)] flex items-center gap-2">
          <ListTodo className="h-6 w-6 text-prism-indigo" />
          Tasks
        </h1>
        <button
          onClick={() => { setEditingTask(null); setShowEditor(true); }}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Task
        </button>
      </div>

      {/* View mode tabs */}
      <div className="mb-4 flex items-center gap-2">
        {VIEW_TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setViewMode(key)}
            className={`rounded-lg px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
              viewMode === key
                ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-600/30'
                : 'text-[var(--text-secondary)] border border-[var(--surface-raised)] hover:border-[var(--border-color)] hover:text-[var(--text-primary)]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Date navigation bar */}
      <div className="mb-6 flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] p-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--glass-border)] transition-colors"
          title={`Previous ${viewMode}`}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          onClick={() => navigate(1)}
          className="rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] p-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--glass-border)] transition-colors"
          title={`Next ${viewMode}`}
        >
          <ChevronRight className="h-4 w-4" />
        </button>

        <span className="text-sm font-medium text-[var(--text-primary)] min-w-[180px]">
          {periodLabel()}
        </span>

        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-indigo-500 focus:outline-none"
        />
        <button
          onClick={goToToday}
          className={`rounded-lg px-3 py-2 text-sm transition-colors ${
            date === today
              ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-600/30'
              : 'text-[var(--text-secondary)] border border-[var(--border-color)] hover:border-[var(--glass-border)]'
          }`}
        >
          Today
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Task list area */}
        <div className="lg:col-span-2">
          {viewMode === 'day' ? (
            /* Day view: single DailyTaskList */
            <DailyTaskList
              date={date}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onClick={handleTaskClick}
              onStatusChange={() => mutateRange()}
            />
          ) : rangeLoading ? (
            <div className="text-[var(--text-muted)] text-sm py-4">Loading tasks...</div>
          ) : (
            /* Week / Month view: grouped by date */
            <div className="space-y-6">
              {dateKeys.length === 0 ? (
                <div className="glass-panel p-8 text-center">
                  <p className="text-[var(--text-muted)] text-sm">No tasks in this {viewMode}</p>
                </div>
              ) : (
                dateKeys.map((dateKey) => {
                  const dayTasks = groupedByDate[dateKey] || [];
                  const isToday = dateKey === today;
                  return (
                    <div key={dateKey}>
                      <div className={`mb-2 flex items-center gap-2 text-sm font-semibold ${
                        isToday ? 'text-indigo-400' : 'text-[var(--text-secondary)]'
                      }`}>
                        <span>{formatDateLabel(dateKey)}</span>
                        {isToday && (
                          <span className="rounded bg-indigo-600/20 px-2 py-0.5 text-xs text-indigo-400 border border-indigo-600/30">
                            Today
                          </span>
                        )}
                        <span className="text-xs text-[var(--text-muted)]">({dayTasks.length})</span>
                      </div>
                      <DailyTaskList
                        date={dateKey}
                        prefetchedTasks={dayTasks}
                        onEdit={handleEdit}
                        onDelete={handleDelete}
                        onClick={handleTaskClick}
                        onStatusChange={() => mutateRange()}
                      />
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Detail panel */}
        <div className="lg:col-span-1">
          {selectedTask ? (
            <div className="glass-panel p-4 space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-[var(--text-primary)]">{selectedTask.title}</h3>
                {selectedTask.description && (
                  <p className="text-sm text-[var(--text-secondary)] mt-1">{selectedTask.description}</p>
                )}
                <div className="flex items-center gap-3 mt-2 text-xs text-[var(--text-muted)]">
                  <span>{selectedTask.taskType.replace('_', ' ')}</span>
                  <span>{selectedTask.priority}</span>
                  <span>{selectedTask.status.replace('_', ' ')}</span>
                </div>
              </div>
              <TaskComments taskId={selectedTask.id} />
            </div>
          ) : (
            <div className="glass-panel p-8 text-center">
              <p className="text-[var(--text-muted)] text-sm">Select a task to view details and comments</p>
            </div>
          )}
        </div>
      </div>

      {/* Editor modal */}
      {showEditor && (
        <TaskEditor
          task={editingTask}
          onSave={refresh}
          onClose={() => { setShowEditor(false); setEditingTask(null); }}
        />
      )}
    </div>
  );
}
