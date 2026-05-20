'use client';

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import useSWR, { mutate } from 'swr';
import { ListTodo, ChevronLeft, ChevronRight, CalendarRange, Inbox, ChevronDown } from 'lucide-react';
import { ReviewDueBanner } from '@/components/reviews/ReviewDueBanner';
import { DailyTaskList } from '@/components/tasks/DailyTaskList';
import { InlineTaskCreator } from '@/components/tasks/InlineTaskCreator';
import { AgendaView } from '@/components/tasks/AgendaView';
import { TaskEditor } from '@/components/tasks/TaskEditor';
import { TaskComments } from '@/components/tasks/TaskComments';
import { ClearGoalsDisplay } from '@/components/tasks/ClearGoalsDisplay';
import { QuickAddMenu } from '@/components/dashboard/QuickAddMenu';
import { PRISM_COLORS } from '@/lib/prism-colors';
import { PowerDownStatusCard } from '@/components/powerdown/PowerDownStatusCard';
import { getLocalDateString, toLocalDateKey, toDateOnlyInputValue, eachLocalDateInRange } from '@/lib/date-utils';
import { useUserSettings } from '@/hooks/useUserSettings';

type ViewMode = 'day' | 'week' | 'month' | 'agenda';

// Week starts on Sunday (consistent across app)
function getWeekStart(d: Date): Date {
  const date = new Date(d);
  date.setDate(date.getDate() - date.getDay());
  return date;
}

function getWeekEnd(d: Date): Date {
  const start = getWeekStart(d);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return end;
}

function getFirstOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function getLastOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatMonthLabel(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function formatWeekLabel(d: Date): string {
  const mon = getWeekStart(d);
  const sun = getWeekEnd(d);
  const fmt = (dt: Date) => dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${fmt(mon)} – ${fmt(sun)}`;
}

export default function TasksPage() {
  const today = getLocalDateString();
  const [date, setDate] = useState(today);
  const [viewMode, setViewMode] = useState<ViewMode>('day');
  const [showEditor, setShowEditor] = useState(false);
  const [editingTask, setEditingTask] = useState<any>(null);
  const [selectedTask, setSelectedTask] = useState<any>(null);
  useEffect(() => { setSelectedTask(null); }, [date, viewMode]);
  const [showUnscheduled, setShowUnscheduled] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Fetch AIM instances for the current date range
  const aimRangeKey = useMemo(() => {
    const d = new Date(date + 'T00:00:00');
    let rangeStart: Date;
    let rangeEnd: Date;
    if (viewMode === 'week') {
      rangeStart = new Date(getLocalDateString(getWeekStart(d)) + 'T00:00:00');
      rangeEnd = new Date(getLocalDateString(getWeekEnd(d)) + 'T23:59:59.999');
    } else if (viewMode === 'month') {
      rangeStart = new Date(getLocalDateString(getFirstOfMonth(d)) + 'T00:00:00');
      rangeEnd = new Date(getLocalDateString(getLastOfMonth(d)) + 'T23:59:59.999');
    } else {
      // day + agenda fallback
      rangeStart = new Date(date + 'T00:00:00');
      rangeEnd = new Date(date + 'T23:59:59.999');
    }
    return `/api/aims/instances?start=${rangeStart.toISOString()}&end=${rangeEnd.toISOString()}`;
  }, [date, viewMode]);
  const { data: aimInstancesData, mutate: mutateAims } = useSWR(aimRangeKey);
  const aimInstances = useMemo(() => (Array.isArray(aimInstancesData) ? aimInstancesData : []), [aimInstancesData]);

  const getRange = useCallback((): { start: string; end: string } | null => {
    const d = new Date(date + 'T00:00:00');
    if (viewMode === 'week') {
      return { start: getLocalDateString(getWeekStart(d)), end: getLocalDateString(getWeekEnd(d)) };
    }
    if (viewMode === 'month') {
      return { start: getLocalDateString(getFirstOfMonth(d)), end: getLocalDateString(getLastOfMonth(d)) };
    }
    return null;
  }, [date, viewMode]);

  // PowerDown: fetch user settings + sessions for current view range
  const { data: userSettings } = useUserSettings();
  const powerdownKey = useMemo(() => {
    if (viewMode === 'day' || viewMode === 'agenda') return '/api/powerdown';
    const range = getRange();
    return range ? `/api/powerdown?start=${range.start}&end=${range.end}` : null;
  }, [viewMode, getRange]);
  const { data: powerdownData } = useSWR(powerdownKey);
  const powerdownSessions = useMemo(() => {
    if (viewMode === 'day' || viewMode === 'agenda') {
      return powerdownData ? [powerdownData] : [];
    }
    return Array.isArray(powerdownData) ? powerdownData : [];
  }, [powerdownData, viewMode]);

  // SWR key for range tasks (week/month views)
  const rangeKey = useMemo(() => {
    const range = getRange();
    if (!range) return null;
    return `/api/tasks?startDate=${range.start}&endDate=${range.end}`;
  }, [getRange]);

  const { data: rangeData, isLoading: rangeLoading, mutate: mutateRange } = useSWR(rangeKey);
  const rangeTasks = useMemo(() => (Array.isArray(rangeData) ? rangeData : []), [rangeData]);

  // Unscheduled tasks (no date, no time block)
  const { data: unscheduledData, mutate: mutateUnscheduled } = useSWR('/api/tasks?unscheduledOnly=true');
  const unscheduledTasks = useMemo(() => (Array.isArray(unscheduledData) ? unscheduledData : []), [unscheduledData]);

  // Reviews due on the currently-viewed date (weekly/monthly/yearly). Surfaces
  // the review in the Tasks view so it's not only visible on the calendar.
  const reviewsKey = useMemo(() => {
    if (viewMode !== 'day' && viewMode !== 'agenda') return null;
    return `/api/reviews?scope=individual&from=${date}&to=${date}`;
  }, [date, viewMode]);
  const { data: reviewsData } = useSWR<Array<{ id: string; reviewType: string; completedAt: string | null; isTeamReview: boolean }>>(reviewsKey);
  const reviewsDueToday = useMemo(() => {
    if (!Array.isArray(reviewsData)) return [];
    const open = reviewsData.filter((r) => !r.completedAt && !r.isTeamReview);
    // Safety net for historical duplicate rows (same week, different
    // scheduledDate timestamps that slipped past the unique constraint):
    // surface only one banner per cadence.
    const seen = new Set<string>();
    return open.filter((r) => {
      if (seen.has(r.reviewType)) return false;
      seen.add(r.reviewType);
      return true;
    });
  }, [reviewsData]);

  const refresh = useCallback(() => {
    mutateRange();
    mutateUnscheduled();
    setShowEditor(false);
    setEditingTask(null);
  }, [mutateRange, mutateUnscheduled]);

  const handleEdit = useCallback((task: any) => {
    setEditingTask(task);
    setShowEditor(true);
  }, []);

  const handleDelete = useCallback(async (taskId: string) => {
    // Look the task up from local state to detect a process-linked task —
    // deleting one stops the recurring process, so the confirmation must
    // make that consequence explicit.
    const candidate =
      rangeTasks.find((t: any) => t.id === taskId)
      ?? unscheduledTasks.find((t: any) => t.id === taskId)
      ?? (selectedTask?.id === taskId ? selectedTask : null);
    const isProcessTask = !!candidate?.processId;
    const message = isProcessTask
      ? `Delete this task and stop the recurring process "${candidate.title}"? You can re-enable it later by clearing the end date on the process.`
      : 'Delete this task?';
    if (!confirm(message)) return;
    const res = await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
    if (res.ok) {
      setSelectedTask((prev: any) => prev?.id === taskId ? null : prev);
      mutateRange();
      mutateUnscheduled();
      if (isProcessTask) {
        // Process row was updated (durationEndDate); revalidate any open
        // process list/detail SWR keys so the stopped state is reflected.
        mutate((key) => typeof key === 'string' && key.startsWith('/api/processes'));
      }
      setShowEditor(false);
      setEditingTask(null);
    }
  }, [mutateRange, mutateUnscheduled, rangeTasks, unscheduledTasks, selectedTask]);

  const toggleSelection = useCallback((taskId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }, []);

  const handleBulkDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} task${selectedIds.size > 1 ? 's' : ''}?`)) return;
    const ids = Array.from(selectedIds);
    try {
      const res = await fetch('/api/tasks/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', taskIds: ids }),
      });
      if (res.ok) {
        setSelectedIds(new Set());
        setSelectionMode(false);
        mutateRange();
        mutateUnscheduled();
      }
    } catch {
      // silent
    }
  }, [selectedIds, mutateRange, mutateUnscheduled]);

  const handleTaskClick = useCallback(async (task: any) => {
    const res = await fetch(`/api/tasks/${task.id}`);
    if (res.ok) {
      setSelectedTask(await res.json());
    }
  }, []);

  // Group tasks by date for range views. Tasks with both startTime and
  // dueDate appear in every bucket between them, clamped to the visible
  // window.
  const groupedByDate = useMemo((): Record<string, any[]> => {
    const groups: Record<string, any[]> = {};
    const undated: any[] = [];
    const range = getRange();
    for (const task of rangeTasks) {
      // dueDate is UTC-anchored midnight (PR #27); extract its calendar day
      // via getUTC* components so the bucket key matches what the dashboard
      // shows. startTime is a real instant — toLocalDateKey is correct there.
      const dueKey = task.dueDate ? toDateOnlyInputValue(task.dueDate) : null;
      const startKey = task.startTime ? toLocalDateKey(task.startTime) : null;

      if (startKey && dueKey && range) {
        const clampedStart = startKey < range.start ? range.start : startKey;
        const clampedEnd = dueKey > range.end ? range.end : dueKey;
        for (const key of eachLocalDateInRange(clampedStart, clampedEnd)) {
          if (!groups[key]) groups[key] = [];
          groups[key].push(task);
        }
      } else if (dueKey) {
        if (!groups[dueKey]) groups[dueKey] = [];
        groups[dueKey].push(task);
      } else {
        undated.push(task);
      }
    }
    if (undated.length > 0 && range) {
      if (!groups[range.start]) groups[range.start] = [];
      groups[range.start].push(...undated);
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
    setDate(getLocalDateString(d));
  };

  const goToToday = () => setDate(today);

  // Label for current period
  const periodLabel = (): string => {
    const d = new Date(date + 'T00:00:00');
    switch (viewMode) {
      case 'day': return formatDateLabel(date);
      case 'week': return formatWeekLabel(d);
      default: return formatMonthLabel(d);
    }
  };

  const VIEW_TABS: { key: ViewMode; label: string; icon?: React.ReactNode }[] = [
    { key: 'day', label: 'Day' },
    { key: 'week', label: 'Week' },
    { key: 'month', label: 'Month' },
    { key: 'agenda', label: 'Agenda', icon: <CalendarRange className="h-3.5 w-3.5" /> },
  ];

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold text-[var(--text-primary)] flex items-center gap-2">
          <ListTodo className="h-6 w-6 text-prism-indigo" />
          Tasks
        </h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setSelectionMode(!selectionMode);
              setSelectedIds(new Set());
            }}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              selectionMode
                ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                : 'text-[var(--text-secondary)] border border-[var(--border-color)] hover:text-[var(--text-primary)]'
            }`}
          >
            {selectionMode ? 'Cancel' : 'Select'}
          </button>
          <QuickAddMenu />
        </div>
      </div>

      {/* View mode tabs */}
      <div className="mb-4 flex items-center gap-2">
        {VIEW_TABS.map(({ key, label, icon }) => (
          <button
            key={key}
            onClick={() => setViewMode(key)}
            className={`rounded-lg px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
              viewMode === key
                ? 'bg-indigo-600 text-white border border-indigo-600'
                : 'text-[var(--text-secondary)] border border-[var(--surface-raised)] hover:border-[var(--border-color)] hover:text-[var(--text-primary)]'
            }`}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>

      {/* Date navigation bar (hidden in agenda view — agenda is always anchored to today) */}
      {viewMode !== 'agenda' && <div className="mb-6 flex items-center gap-3">
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
              ? 'bg-indigo-600 text-white border border-indigo-600'
              : 'text-[var(--text-secondary)] border border-[var(--border-color)] hover:border-[var(--glass-border)]'
          }`}
        >
          Today
        </button>
      </div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Task list area */}
        <div className="lg:col-span-2">
          {viewMode === 'agenda' ? (
            <AgendaView
              onEdit={handleEdit}
              onDelete={handleDelete}
              onClick={handleTaskClick}
              onStatusChange={() => mutateRange()}
            />
          ) : viewMode === 'day' ? (
            /* Day view: single DailyTaskList */
            <>
              <ReviewDueBanner reviews={reviewsDueToday} />
              <div className="mb-3">
                <InlineTaskCreator defaultDate={date} onCreated={() => mutateRange()} />
              </div>
              <DailyTaskList
                date={date}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onClick={handleTaskClick}
                onStatusChange={() => mutateRange()}
                selectionMode={selectionMode}
                selectedIds={selectedIds}
                onSelect={toggleSelection}
              />
            </>
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
                        selectionMode={selectionMode}
                        selectedIds={selectedIds}
                        onSelect={toggleSelection}
                      />
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* Unscheduled Tasks */}
          {unscheduledTasks.length > 0 && (
            <div className="mt-6">
              <button
                onClick={() => setShowUnscheduled(!showUnscheduled)}
                className="flex items-center gap-2 text-sm font-semibold text-[var(--text-muted)] mb-2 hover:text-[var(--text-secondary)] transition-colors"
              >
                <Inbox className="h-4 w-4" />
                Unscheduled ({unscheduledTasks.length})
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showUnscheduled ? 'rotate-180' : ''}`} />
              </button>
              {showUnscheduled && (
                <div className="space-y-2 border-l-2 border-dashed border-[var(--border-color)] pl-4">
                  {unscheduledTasks.map((task: any) => (
                    <div
                      key={task.id}
                      className={`glass-panel p-3 flex items-center gap-3 cursor-pointer hover:border-[var(--glass-border)] transition-colors ${
                        task.status === 'DONE' ? 'opacity-50' : ''
                      }`}
                      onClick={() => handleTaskClick(task)}
                    >
                      <span className={`text-sm font-medium flex-1 ${task.status === 'DONE' ? 'text-gray-500 line-through' : 'text-[var(--text-primary)]'}`}>
                        {task.title}
                      </span>
                      <span className="text-xs text-[var(--text-muted)]">{task.taskType}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* AIMs Section */}
          {aimInstances.length > 0 && (
            <div className="mt-6">
              <h2 className={`text-sm font-semibold mb-3 flex items-center gap-1.5 ${PRISM_COLORS.AIM.textClass}`}>
                <span>{PRISM_COLORS.AIM.emoji}</span> AIMs
                <span className="text-xs text-[var(--text-muted)] font-normal">({aimInstances.length})</span>
              </h2>
              <div className="space-y-2">
                {aimInstances.map((aim: any) => (
                  <div
                    key={aim.id}
                    className="glass-panel p-3 flex items-center gap-3"
                  >
                    <input
                      type="checkbox"
                      checked={aim.status === 'COMPLETED'}
                      onChange={async () => {
                        await fetch(`/api/aims/instances/${aim.id}`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ status: aim.status === 'COMPLETED' ? 'SCHEDULED' : 'COMPLETED' }),
                        });
                        mutateAims();
                      }}
                      className="h-5 w-5 rounded border-[var(--border-color)] bg-[var(--input-bg)] text-teal-600 focus:ring-teal-500"
                    />
                    <div className="flex-1">
                      <span className={`text-sm font-medium ${aim.status === 'COMPLETED' ? 'text-gray-500 line-through' : 'text-[var(--text-primary)]'}`}>
                        {aim.aimCategory?.name ?? 'AIM'}
                        {aim.selectedActivity && ` — ${aim.selectedActivity}`}
                      </span>
                    </div>
                    {aim.timeBlockStart && aim.timeBlockEnd && (
                      <span className={`text-xs rounded px-2 py-0.5 ${PRISM_COLORS.AIM.bgClass} ${PRISM_COLORS.AIM.textClass}`}>
                        {new Date(aim.timeBlockStart).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}–
                        {new Date(aim.timeBlockEnd).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Power Down Section */}
          {(userSettings?.powerdownTime || powerdownSessions.length > 0) && (
            <div className="mt-6">
              <h2 className={`text-sm font-semibold mb-3 flex items-center gap-1.5 ${PRISM_COLORS.POWER_DOWN.textClass}`}>
                <span>{PRISM_COLORS.POWER_DOWN.emoji}</span> Power Down
              </h2>
              <div className="space-y-2">
                {viewMode === 'day' || viewMode === 'agenda' ? (
                  <PowerDownStatusCard
                    session={powerdownSessions[0] ?? null}
                    powerdownTime={userSettings?.powerdownTime ?? null}
                    date={date}
                    compact
                  />
                ) : (
                  (() => {
                    const range = getRange();
                    if (!range) return null;
                    const start = new Date(range.start + 'T00:00:00');
                    const end = new Date(range.end + 'T00:00:00');
                    const days: string[] = [];
                    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                      days.push(getLocalDateString(d));
                    }
                    const sessionsByDate = new Map<string, any>();
                    for (const s of powerdownSessions) {
                      const key = getLocalDateString(new Date(s.sessionDate));
                      sessionsByDate.set(key, s);
                    }
                    return days.map((dayKey) => (
                      <div key={dayKey} className="flex items-center gap-2">
                        <span className={`text-xs w-20 shrink-0 ${dayKey === today ? 'text-indigo-400 font-semibold' : 'text-[var(--text-muted)]'}`}>
                          {formatDateLabel(dayKey)}
                        </span>
                        <div className="flex-1">
                          <PowerDownStatusCard
                            session={sessionsByDate.get(dayKey) ?? null}
                            powerdownTime={userSettings?.powerdownTime ?? null}
                            date={dayKey}
                            compact
                          />
                        </div>
                      </div>
                    ));
                  })()
                )}
              </div>
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
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)] mb-2">Clear Goals</h4>
                <ClearGoalsDisplay taskId={selectedTask.id} editable collapsible defaultExpanded />
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

      {/* Bulk action bar */}
      {selectionMode && selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 glass-panel px-5 py-3 shadow-2xl border-red-500/30">
          <span className="text-sm text-[var(--text-primary)] font-medium">{selectedIds.size} selected</span>
          <button
            onClick={handleBulkDelete}
            className="rounded-lg px-4 py-2 text-sm font-medium text-white bg-red-500 hover:bg-red-600 transition-colors"
          >
            Delete Selected
          </button>
          <button
            onClick={() => { setSelectionMode(false); setSelectedIds(new Set()); }}
            className="rounded-lg px-3 py-2 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

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
