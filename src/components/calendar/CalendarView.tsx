'use client';

import { useState, useRef } from 'react';
import { useTheme } from 'next-themes';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { autoSchedule, autoScheduleWithPeriods, type ProposedSlot, type CalendarEvent as ScheduleEvent, type SchedulableTask, type ScheduleSettings } from '@/lib/scheduling-engine';
import { Sparkles, Check, X, ListTodo, Save, Loader2 } from 'lucide-react';
import { ActivitySelectModal } from './ActivitySelectModal';

interface AimTask {
  id: string;
  title: string;
  status: string;
}

interface SelectedAimInstance {
  aimInstanceId: string;
  title: string;
  tasks: AimTask[];
}

interface CalendarViewProps {
  onEventClick?: (info: any) => void;
  onDateSelect?: (info: any) => void;
  onExternalDrop?: (itemId: string, start: Date, end: Date, itemType?: string) => void;
  unscheduledTasks?: any[];
  onBatchScheduleConfirm?: (slots: Array<{ id: string; timeBlockStart: string; timeBlockEnd: string; isAutoScheduled: boolean; isPinned: boolean; itemType?: string }>) => void;
  scheduleSettings?: {
    autoScheduleEnabled: boolean;
    workingHoursStart: string;
    workingHoursEnd: string;
    casualHoursStart: string;
    casualHoursEnd: string;
    taskSchedulePeriod: string;
  };
}

const SOURCE_FILTERS = [
  { key: 'tasks', label: 'My Tasks', color: 'bg-indigo-500' },
  { key: 'reviews', label: 'Reviews', color: 'bg-yellow-500' },
  { key: 'meetings', label: 'Meetings', color: 'bg-emerald-500' },
  { key: 'aims', label: 'Aims', color: 'bg-teal-500' },
  { key: 'google', label: 'Google Calendar', color: 'bg-purple-500' },
];

export function CalendarView({ onEventClick, onDateSelect, onExternalDrop, unscheduledTasks, onBatchScheduleConfirm, scheduleSettings }: CalendarViewProps) {
  const calendarRef = useRef<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const { resolvedTheme } = useTheme();
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set(['tasks', 'reviews', 'meetings', 'aims', 'google']));
  const [ghostEvents, setGhostEvents] = useState<ProposedSlot[]>([]);
  const [showGhosts, setShowGhosts] = useState(false);

  // Activity selection modal state
  const [showActivityModal, setShowActivityModal] = useState(false);
  const [pendingAimDrop, setPendingAimDrop] = useState<{ info: any; startISO: string; endISO: string } | null>(null);
  const [pendingActivities, setPendingActivities] = useState<string[]>([]);
  const [pendingAimName, setPendingAimName] = useState('');

  // Task assignment panel state (Deep Work as task container)
  const [selectedAimInstance, setSelectedAimInstance] = useState<SelectedAimInstance | null>(null);
  const [showTaskAssignment, setShowTaskAssignment] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [savingTasks, setSavingTasks] = useState(false);

  const fetchEvents = async (start: string, end: string) => {
    const res = await fetch(`/api/calendar?start=${start}&end=${end}&source=all`);
    if (res.ok) {
      setEvents(await res.json());
    }
  };

  const refreshCalendar = () => {
    if (calendarRef.current) {
      const api = calendarRef.current.getApi();
      const { activeStart, activeEnd } = api.view;
      fetchEvents(activeStart.toISOString(), activeEnd.toISOString());
    }
  };

  const handleDatesSet = (info: any) => {
    fetchEvents(info.startStr, info.endStr);
  };

  const toggleFilter = (key: string) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // --- Task assignment handlers ---
  const handleEventClick = (info: any) => {
    const props = info.event.extendedProps || {};

    // If this is an aim event, open the task assignment panel
    if (props.aimInstanceId) {
      const aimData: SelectedAimInstance = {
        aimInstanceId: props.aimInstanceId,
        title: props.aimCategoryName || info.event.title,
        tasks: props.tasks || [],
      };
      setSelectedAimInstance(aimData);
      // Pre-select currently assigned tasks
      const currentIds = new Set<string>((aimData.tasks || []).map((t: AimTask) => t.id));
      setSelectedTaskIds(currentIds);
      setShowTaskAssignment(true);
      return;
    }

    // Otherwise, delegate to parent handler
    onEventClick?.(info);
  };

  const handleCloseTaskAssignment = () => {
    setShowTaskAssignment(false);
    setSelectedAimInstance(null);
    setSelectedTaskIds(new Set());
  };

  const toggleTaskSelection = (taskId: string) => {
    setSelectedTaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  const handleSaveTaskAssignment = async () => {
    if (!selectedAimInstance) return;
    setSavingTasks(true);
    try {
      const res = await fetch(`/api/aims/instances/${selectedAimInstance.aimInstanceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskIds: Array.from(selectedTaskIds) }),
      });
      if (res.ok) {
        handleCloseTaskAssignment();
        refreshCalendar();
      }
    } finally {
      setSavingTasks(false);
    }
  };

  // --- Event receive / drop handlers ---
  const handleEventReceive = async (info: any) => {
    const props = info.event.extendedProps || {};
    const itemType = props.itemType || 'task';
    const start = info.event.start;
    const end = info.event.end || new Date(start.getTime() + 60 * 60 * 1000);
    const startISO = start.toISOString();
    const endISO = end.toISOString();

    if (itemType === 'aim') {
      const aimInstanceId = props.aimInstanceId;
      const aimCategoryId = props.aimCategoryId;

      // Check if this aim has activities that need selection
      let activities: string[] = [];
      try {
        const activitiesRaw = props.activities;
        if (activitiesRaw) {
          activities = JSON.parse(activitiesRaw);
        }
      } catch {
        // ignore parse errors
      }

      if (activities.length > 0) {
        // Store the drop info and show the activity selection modal
        setPendingAimDrop({ info, startISO, endISO });
        setPendingActivities(activities);
        setPendingAimName(info.event.title);
        setShowActivityModal(true);
        return;
      }

      if (aimInstanceId) {
        // Update existing instance with time block
        await fetch(`/api/aims/instances/${aimInstanceId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ timeBlockStart: startISO, timeBlockEnd: endISO }),
        });
      } else if (aimCategoryId) {
        // Create new instance with time block
        await fetch('/api/aims/instances', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            aimCategoryId,
            scheduledDate: startISO,
            timeBlockStart: startISO,
            timeBlockEnd: endISO,
          }),
        });
      }

      refreshCalendar();
      onExternalDrop?.(info.event.id, start, end, 'aim');
    } else if (itemType === 'review') {
      const reviewId = props.reviewId;
      if (reviewId) {
        await fetch(`/api/reviews/${reviewId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ timeBlockStart: startISO, timeBlockEnd: endISO }),
        });
      }

      refreshCalendar();
      onExternalDrop?.(info.event.id, start, end, 'review');
    } else {
      // Task (existing behavior)
      const taskId = props.taskId || info.event.id?.replace('task-', '');
      if (!taskId) return;

      await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timeBlockStart: startISO,
          timeBlockEnd: endISO,
          dueDate: startISO,
        }),
      });

      refreshCalendar();
      onExternalDrop?.(taskId, start, end, 'task');
    }
  };

  const handleEventDrop = async (info: any) => {
    const eventId = info.event.id;
    const newStart = info.event.start?.toISOString();
    const newEnd = info.event.end?.toISOString();

    if (eventId.startsWith('aim-instance-') || eventId.startsWith('aim-new-')) {
      // Aim instance drag on calendar
      const aimInstanceId = info.event.extendedProps?.aimInstanceId;
      if (aimInstanceId) {
        await fetch(`/api/aims/instances/${aimInstanceId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ timeBlockStart: newStart, timeBlockEnd: newEnd }),
        });
      }
    } else if (eventId.startsWith('review-')) {
      const reviewId = info.event.extendedProps?.reviewId || eventId.replace('review-', '');
      await fetch(`/api/reviews/${reviewId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeBlockStart: newStart, timeBlockEnd: newEnd }),
      });
    } else if (eventId.startsWith('task-')) {
      const taskId = eventId.replace('task-', '');
      await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timeBlockStart: newStart,
          timeBlockEnd: newEnd,
          dueDate: newStart,
          isPinned: true,
        }),
      });
    } else {
      // Unknown event type, skip
      return;
    }

    refreshCalendar();
  };

  const handleAutoSchedule = () => {
    if (!unscheduledTasks || unscheduledTasks.length === 0) return;

    // Convert all unscheduled items to SchedulableTask format
    const priorityMap: Record<string, SchedulableTask['priority']> = {
      aim: 'MEDIUM',
      review: 'HIGH',
    };

    const schedulableTasks: SchedulableTask[] = unscheduledTasks.map((t) => {
      // Determine scheduling period based on item type
      let schedulingPeriod: 'working' | 'casual' | 'both' | undefined;
      if (scheduleSettings) {
        if (t.itemType === 'aim') {
          // Use the aim's own schedule period if present, otherwise default to 'both'
          schedulingPeriod = t.schedulePeriod ?? 'both';
        } else if (t.itemType === 'review') {
          schedulingPeriod = 'working';
        } else {
          // Tasks use the global taskSchedulePeriod from settings
          schedulingPeriod = (scheduleSettings.taskSchedulePeriod as 'working' | 'casual' | 'both') ?? 'both';
        }
      }

      return {
        id: t.id,
        title: t.title,
        estimatedMinutes: t.duration ?? t.estimatedMinutes ?? 60,
        priority: t.priority ?? priorityMap[t.itemType] ?? 'MEDIUM',
        dueDate: t.dueDate ? new Date(t.dueDate) : t.scheduledDate ? new Date(t.scheduledDate) : null,
        preferredTimeStart: t.preferredTimeStart ?? null,
        preferredTimeEnd: t.preferredTimeEnd ?? null,
        schedulingPeriod,
      };
    });

    const existingCalEvents: ScheduleEvent[] = events.map((e) => ({
      start: new Date(e.start),
      end: new Date(e.end),
    }));

    let proposed: ProposedSlot[];

    if (scheduleSettings) {
      // Use period-aware scheduling with user settings
      const settings: ScheduleSettings = {
        workingHours: { start: scheduleSettings.workingHoursStart, end: scheduleSettings.workingHoursEnd },
        casualHours: { start: scheduleSettings.casualHoursStart, end: scheduleSettings.casualHoursEnd },
      };
      proposed = autoScheduleWithPeriods(schedulableTasks, existingCalEvents, settings);
    } else {
      // Fallback to original behavior
      proposed = autoSchedule(schedulableTasks, existingCalEvents, {
        start: '06:00',
        end: '22:00',
      });
    }

    setGhostEvents(proposed);
    setShowGhosts(true);
  };

  const handleConfirmGhosts = async () => {
    // Schedule each ghost event via the appropriate API
    for (const ghost of ghostEvents) {
      const item = unscheduledTasks?.find((t) => t.id === ghost.taskId);
      const itemType = item?.itemType || 'task';
      const startISO = ghost.start.toISOString();
      const endISO = ghost.end.toISOString();

      if (itemType === 'aim') {
        const aimInstanceId = item?.aimInstanceId;
        if (aimInstanceId) {
          await fetch(`/api/aims/instances/${aimInstanceId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ timeBlockStart: startISO, timeBlockEnd: endISO }),
          });
        } else if (item?.aimCategoryId) {
          await fetch('/api/aims/instances', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              aimCategoryId: item.aimCategoryId,
              scheduledDate: startISO,
              timeBlockStart: startISO,
              timeBlockEnd: endISO,
            }),
          });
        }
      } else if (itemType === 'review') {
        const reviewId = item?.reviewId;
        if (reviewId) {
          await fetch(`/api/reviews/${reviewId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ timeBlockStart: startISO, timeBlockEnd: endISO }),
          });
        }
      } else {
        // Task
        const taskId = item?.taskId || ghost.taskId.replace('task-', '');
        await fetch(`/api/tasks/${taskId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            timeBlockStart: startISO,
            timeBlockEnd: endISO,
            dueDate: startISO,
            isAutoScheduled: true,
            isPinned: false,
          }),
        });
      }
    }

    // Also call the batch callback if provided
    if (onBatchScheduleConfirm) {
      const slots = ghostEvents.map((g) => {
        const item = unscheduledTasks?.find((t) => t.id === g.taskId);
        return {
          id: g.taskId,
          timeBlockStart: g.start.toISOString(),
          timeBlockEnd: g.end.toISOString(),
          isAutoScheduled: true,
          isPinned: false,
          itemType: item?.itemType || 'task',
        };
      });
      onBatchScheduleConfirm(slots);
    }

    setGhostEvents([]);
    setShowGhosts(false);
    refreshCalendar();
  };

  const handleDismissGhosts = () => {
    setGhostEvents([]);
    setShowGhosts(false);
  };

  const handleActivitySelect = async (activity: string) => {
    if (!pendingAimDrop) return;

    const { info, startISO, endISO } = pendingAimDrop;
    const props = info.event.extendedProps || {};
    const aimInstanceId = props.aimInstanceId;
    const aimCategoryId = props.aimCategoryId;

    if (aimInstanceId) {
      await fetch(`/api/aims/instances/${aimInstanceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeBlockStart: startISO, timeBlockEnd: endISO, selectedActivity: activity }),
      });
    } else if (aimCategoryId) {
      await fetch('/api/aims/instances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aimCategoryId,
          scheduledDate: startISO,
          timeBlockStart: startISO,
          timeBlockEnd: endISO,
          selectedActivity: activity,
        }),
      });
    }

    const start = info.event.start;
    const end = info.event.end || new Date(start.getTime() + 60 * 60 * 1000);

    setShowActivityModal(false);
    setPendingAimDrop(null);
    setPendingActivities([]);
    setPendingAimName('');
    refreshCalendar();
    onExternalDrop?.(info.event.id, start, end, 'aim');
  };

  const handleActivityModalClose = () => {
    // If they cancel, revert the dropped event from the calendar
    if (pendingAimDrop) {
      pendingAimDrop.info.event.remove();
    }
    setShowActivityModal(false);
    setPendingAimDrop(null);
    setPendingActivities([]);
    setPendingAimName('');
  };

  // Get TODO tasks available for assignment (from unscheduledTasks prop)
  const availableTodoTasks = (unscheduledTasks || []).filter(
    (t: any) => t.itemType !== 'aim' && t.itemType !== 'review' && (t.status === 'TODO' || t.status === 'IN_PROGRESS')
  );

  const filteredEvents = events.filter((e) => activeFilters.has(e.source));

  const ghostCalendarEvents = showGhosts ? ghostEvents.map(g => {
    const item = unscheduledTasks?.find(t => t.id === g.taskId);
    const itemType = item?.itemType || 'task';
    const ghostColors: Record<string, { bg: string; border: string }> = {
      task: { bg: 'rgba(99, 102, 241, 0.3)', border: '#6366f1' },
      aim: { bg: 'rgba(20, 184, 166, 0.3)', border: '#14b8a6' },
      review: { bg: 'rgba(245, 158, 11, 0.3)', border: '#f59e0b' },
    };
    const { bg, border } = ghostColors[itemType] || ghostColors.task;

    return {
      id: `ghost-${g.taskId}`,
      title: `(Auto) ${item?.title ?? 'Item'}`,
      start: g.start.toISOString(),
      end: g.end.toISOString(),
      backgroundColor: bg,
      borderColor: border,
      classNames: ['ghost-event'],
      editable: true,
      source: itemType === 'task' ? 'tasks' : itemType === 'aim' ? 'aims' : 'reviews',
    };
  }) : [];

  const allDisplayEvents = [...filteredEvents, ...ghostCalendarEvents];

  return (
    <div className="relative">
      {/* Filter toggles */}
      <div className="flex items-center gap-3 mb-4">
        {SOURCE_FILTERS.map(({ key, label, color }) => (
          <button
            key={key}
            onClick={() => toggleFilter(key)}
            className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              activeFilters.has(key)
                ? 'bg-[var(--surface-raised)] text-[var(--text-primary)] border border-[var(--border-color)]'
                : 'text-[var(--text-muted)] border border-[var(--surface-raised)] opacity-50'
            }`}
          >
            <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
            {label}
          </button>
        ))}
      </div>

      {/* Auto-schedule button / Confirm-Dismiss buttons */}
      <div className="flex items-center gap-2 mb-4">
        {!showGhosts && unscheduledTasks && unscheduledTasks.length > 0 && scheduleSettings?.autoScheduleEnabled !== false && (
          <button
            onClick={handleAutoSchedule}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
          >
            <Sparkles className="h-4 w-4" />
            Auto-schedule ({unscheduledTasks.length})
          </button>
        )}

        {showGhosts && (
          <>
            <button
              onClick={handleConfirmGhosts}
              className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 transition-colors"
            >
              <Check className="h-4 w-4" />
              Confirm All
            </button>
            <button
              onClick={handleDismissGhosts}
              className="flex items-center gap-2 rounded-lg bg-gray-500 px-4 py-2 text-sm font-medium text-white hover:bg-gray-600 transition-colors"
            >
              <X className="h-4 w-4" />
              Dismiss
            </button>
          </>
        )}
      </div>

      {/* Activity selection modal for aims with activities */}
      <ActivitySelectModal
        open={showActivityModal}
        onClose={handleActivityModalClose}
        onSelect={handleActivitySelect}
        activities={pendingActivities}
        aimName={pendingAimName}
      />

      {/* Calendar */}
      <div className={`${resolvedTheme === 'dark' ? 'fc-dark-theme' : 'fc-light-theme'} glass-panel p-4`}>
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="timeGridWeek"
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,timeGridDay',
          }}
          events={allDisplayEvents}
          editable={true}
          selectable={true}
          droppable={true}
          eventDrop={handleEventDrop}
          eventReceive={handleEventReceive}
          eventClick={handleEventClick}
          select={onDateSelect}
          datesSet={handleDatesSet}
          height="auto"
          nowIndicator={true}
          slotMinTime="06:00:00"
          slotMaxTime="22:00:00"
          eventDidMount={(info) => {
            const props = info.event.extendedProps || {};
            // Show pin icon on pinned events
            if (props.isPinned) {
              const pinEl = document.createElement('span');
              pinEl.textContent = '\u{1F4CC}';
              pinEl.style.cssText = 'position:absolute;top:2px;right:4px;font-size:10px;';
              info.el.style.position = 'relative';
              info.el.appendChild(pinEl);
            }
            // Show task count badge on aim events with assigned tasks
            if (props.aimInstanceId && props.tasks && props.tasks.length > 0) {
              const badge = document.createElement('span');
              const doneCount = props.tasks.filter((t: AimTask) => t.status === 'DONE').length;
              badge.textContent = `${doneCount}/${props.tasks.length}`;
              badge.style.cssText = 'position:absolute;bottom:2px;right:4px;font-size:9px;background:rgba(0,0,0,0.4);color:#fff;border-radius:4px;padding:0 4px;line-height:1.4;';
              info.el.style.position = 'relative';
              info.el.appendChild(badge);
            }
          }}
        />
      </div>

      {/* Task Assignment Panel (overlay for Deep Work container) */}
      {showTaskAssignment && selectedAimInstance && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div
            className="glass-panel w-full max-w-md mx-4 rounded-xl border border-[var(--border-color)] shadow-2xl"
            style={{ maxHeight: '80vh' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-color)]">
              <div className="flex items-center gap-2">
                <ListTodo className="h-5 w-5 text-teal-400" />
                <h3 className="text-base font-semibold text-[var(--text-primary)]">
                  {selectedAimInstance.title}
                </h3>
              </div>
              <button
                onClick={handleCloseTaskAssignment}
                className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-raised)] transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="px-5 py-4 overflow-y-auto" style={{ maxHeight: 'calc(80vh - 120px)' }}>
              {/* Currently assigned tasks */}
              {selectedAimInstance.tasks.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide mb-2">
                    Assigned Tasks
                  </p>
                  <ul className="space-y-1">
                    {selectedAimInstance.tasks.map((task) => (
                      <li key={task.id} className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                        <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${
                          task.status === 'DONE' ? 'bg-emerald-400' : task.status === 'IN_PROGRESS' ? 'bg-blue-400' : 'bg-gray-400'
                        }`} />
                        <span className={task.status === 'DONE' ? 'line-through opacity-60' : ''}>
                          {task.title}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Available tasks to assign */}
              <div>
                <p className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide mb-2">
                  Select Tasks for This Block
                </p>
                {availableTodoTasks.length === 0 ? (
                  <p className="text-sm text-[var(--text-muted)] italic">No unscheduled tasks available.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {availableTodoTasks.map((task: any) => {
                      const taskId = task.taskId || task.id?.replace('task-', '') || task.id;
                      const isSelected = selectedTaskIds.has(taskId);
                      return (
                        <li key={taskId}>
                          <label
                            className={`flex items-center gap-3 rounded-lg px-3 py-2 cursor-pointer transition-colors ${
                              isSelected
                                ? 'bg-teal-500/15 border border-teal-500/30'
                                : 'hover:bg-[var(--surface-raised)] border border-transparent'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleTaskSelection(taskId)}
                              className="rounded border-[var(--border-color)] text-teal-500 focus:ring-teal-500/30 h-4 w-4"
                            />
                            <div className="flex-1 min-w-0">
                              <span className="text-sm text-[var(--text-primary)] block truncate">{task.title}</span>
                              {task.goalTitle && (
                                <span className="text-xs text-[var(--text-muted)] block truncate">{task.goalTitle}</span>
                              )}
                            </div>
                            {task.estimatedMinutes && (
                              <span className="text-xs text-[var(--text-muted)] flex-shrink-0">
                                {task.estimatedMinutes}m
                              </span>
                            )}
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>

            {/* Footer with save button */}
            <div className="flex items-center justify-between px-5 py-3 border-t border-[var(--border-color)]">
              <span className="text-xs text-[var(--text-muted)]">
                {selectedTaskIds.size} task{selectedTaskIds.size !== 1 ? 's' : ''} selected
              </span>
              <button
                onClick={handleSaveTaskAssignment}
                disabled={savingTasks}
                className="flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50 transition-colors"
              >
                {savingTasks ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
