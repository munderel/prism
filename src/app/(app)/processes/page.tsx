'use client';

import { useState, useMemo, useCallback } from 'react';
import useSWR from 'swr';
import { m, AnimatePresence } from 'framer-motion';
import { useSession } from 'next-auth/react';
import {
  ListChecks,
  Plus,
  Upload,
  Search,
  ChevronRight,
  Pencil,
  Trash2,
  Clock,
  Calendar,
  User,
  Flame,
  PauseCircle,
  PlayCircle,
} from 'lucide-react';
import { AssigneeFilter } from '@/components/shared/AssigneeFilter';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/ToastProvider';
import { ProcessSkeleton } from '@/components/processes/ProcessSkeleton';
import { ProcessEmptyState, ProcessListEmptyState } from '@/components/processes/ProcessEmptyState';
import { ProcessForm } from '@/components/processes/ProcessForm';
import { FunctionForm } from '@/components/processes/FunctionForm';
import { ProcessDetailView } from '@/components/processes/ProcessDetailView';
import { ScheduleModal } from '@/components/processes/ScheduleModal';
import { ImportPanel } from '@/components/processes/ImportPanel';
import { CadenceBadge } from '@/components/processes/CadenceBadge';
import {
  CADENCE_OPTIONS,
  INPUT_CLASSES,
  cadenceNeedsDayOfWeek,
  cadenceNeedsDayOfMonth,
} from '@/lib/process-constants';
import {
  staggerContainer,
  staggerItem,
  springTransition,
  cardHoverProps,
} from '@/lib/process-animations';
import type { BusinessFunction, ProcessData, ProcessFormValues, UserOption } from '@/types/process';

// ── Confirm dialog state ──

interface ConfirmState {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
}

const CONFIRM_INITIAL: ConfirmState = {
  open: false,
  title: '',
  message: '',
  confirmLabel: 'Confirm',
  onConfirm: () => {},
};

export default function ProcessesPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.isAdmin ?? false;
  const userId = session?.user?.id;
  const toast = useToast();

  // ── Data fetching ──
  const { data: functionsData, isLoading: loading, mutate: mutateFunctions } = useSWR('/api/processes');
  const functions = Array.isArray(functionsData) ? (functionsData as BusinessFunction[]) : [];
  const { data: usersData } = useSWR(isAdmin ? '/api/admin' : null);
  const users = Array.isArray(usersData) ? (usersData as UserOption[]) : [];
  const { data: processStreaks, mutate: mutateStreaks } = useSWR('/api/streaks?type=process');

  // ── Filters ──
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [cadenceFilter, setCadenceFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredFunctions = useMemo(() => {
    let fns = functions;
    if (assigneeFilter) {
      fns = fns
        .map((fn) => ({
          ...fn,
          processes: fn.processes.filter(
            (p) => p.assigneeId === assigneeFilter || p.delegateId === assigneeFilter
          ),
        }))
        .filter((fn) => fn.processes.length > 0);
    }
    if (cadenceFilter) {
      fns = fns
        .map((fn) => ({
          ...fn,
          processes: fn.processes.filter((p) => p.cadence === cadenceFilter),
        }))
        .filter((fn) => fn.processes.length > 0);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      fns = fns
        .map((fn) => ({
          ...fn,
          processes: fn.processes.filter(
            (p) =>
              p.title.toLowerCase().includes(q) ||
              p.description?.toLowerCase().includes(q)
          ),
        }))
        .filter((fn) => fn.processes.length > 0 || fn.name.toLowerCase().includes(q));
    }
    return fns;
  }, [functions, assigneeFilter, cadenceFilter, searchQuery]);

  // ── UI state ──
  const [showAddFunction, setShowAddFunction] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [addingProcessFnId, setAddingProcessFnId] = useState<string | null>(null);
  const [editingFnId, setEditingFnId] = useState<string | null>(null);
  const [editFnName, setEditFnName] = useState('');
  const [editFnDesc, setEditFnDesc] = useState('');
  const [editingProcessId, setEditingProcessId] = useState<string | null>(null);
  const [editingProcessData, setEditingProcessData] = useState<Partial<ProcessFormValues> | null>(null);
  const [expandedProcessId, setExpandedProcessId] = useState<string | null>(null);
  const [expandedProcessData, setExpandedProcessData] = useState<any>(null);
  const [schedulingProcess, setSchedulingProcess] = useState<ProcessData | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState>(CONFIRM_INITIAL);
  const [completingProcessId, setCompletingProcessId] = useState<string | null>(null);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [creatingTasks, setCreatingTasks] = useState(false);

  // ── Process tasks (for expanded detail) ──
  const { data: processTasks, mutate: mutateProcessTasks } = useSWR(
    expandedProcessId ? `/api/tasks?processId=${expandedProcessId}&includeSubtasks=true` : null
  );

  // ── Helpers ──

  const getProcessStreakData = useCallback(
    (processId: string): { count: number; id: string | null; isActive: boolean } => {
      if (!Array.isArray(processStreaks)) return { count: 0, id: null, isActive: true };
      const streak = processStreaks.find((s: any) => s.streakType === `process_${processId}`);
      return {
        count: streak?.currentCount ?? 0,
        id: streak?.id ?? null,
        isActive: streak?.isActive ?? true,
      };
    },
    [processStreaks]
  );

  const handleToggleProcessStreak = useCallback(
    async (streakId: string, newIsActive: boolean) => {
      await fetch(`/api/streaks/${streakId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: newIsActive }),
      });
      mutateStreaks();
    },
    [mutateStreaks]
  );

  const fetchProcessDetail = useCallback(async (processId: string) => {
    const res = await fetch(`/api/processes/${processId}`);
    if (res.ok) {
      const data = await res.json();
      setExpandedProcessData(data);
    }
  }, []);

  const requestConfirm = (title: string, message: string, confirmLabel: string, onConfirm: () => void) => {
    setConfirmState({ open: true, title, message, confirmLabel, onConfirm });
  };

  // ── CRUD Handlers ──

  const handleAddFunction = async (name: string, description: string) => {
    const res = await fetch('/api/processes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description: description || null }),
    });
    if (res.ok) {
      setShowAddFunction(false);
      mutateFunctions();
    }
  };

  const handleEditFunction = async (id: string) => {
    const res = await fetch(`/api/processes/functions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editFnName, description: editFnDesc || null }),
    });
    if (res.ok) {
      setEditingFnId(null);
      mutateFunctions();
    }
  };

  const handleDeleteFunction = (id: string) => {
    requestConfirm(
      'Delete Function',
      'This will delete the function and all its processes. This cannot be undone.',
      'Delete',
      async () => {
        const res = await fetch(`/api/processes/functions/${id}`, { method: 'DELETE' });
        if (res.ok) mutateFunctions();
        setConfirmState(CONFIRM_INITIAL);
      }
    );
  };

  const handleAddProcess = async (functionId: string, values: ProcessFormValues) => {
    const res = await fetch(`/api/processes/functions/${functionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: values.title.trim(),
        description: values.description.trim() || null,
        cadence: values.cadence,
        assigneeId: values.assigneeId || null,
        defaultDurationMinutes: values.defaultDurationMinutes,
        scheduledTime: values.scheduledTime || null,
        scheduledDayOfWeek: cadenceNeedsDayOfWeek(values.cadence) ? values.scheduledDayOfWeek : null,
        scheduledDayOfMonth: cadenceNeedsDayOfMonth(values.cadence) ? values.scheduledDayOfMonth : null,
        scheduleStartDate: values.scheduleStartDate || null,
        mode: values.mode,
        subtaskMode: values.subtaskMode,
      }),
    });
    if (res.ok) {
      setAddingProcessFnId(null);
      mutateFunctions();
    } else {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error || 'Failed to create process');
    }
  };

  const handleEditProcess = async (processId: string, values: ProcessFormValues) => {
    const res = await fetch(`/api/processes/${processId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: values.title,
        description: values.description || null,
        cadence: values.cadence,
        assigneeId: values.assigneeId || null,
        defaultDurationMinutes: values.defaultDurationMinutes,
        scheduledTime: values.scheduledTime || null,
        scheduledDayOfWeek: cadenceNeedsDayOfWeek(values.cadence) ? values.scheduledDayOfWeek : null,
        scheduledDayOfMonth: cadenceNeedsDayOfMonth(values.cadence) ? values.scheduledDayOfMonth : null,
        scheduleStartDate: values.scheduleStartDate || null,
        mode: values.mode,
        subtaskMode: values.subtaskMode,
      }),
    });
    if (res.ok) {
      setEditingProcessId(null);
      setEditingProcessData(null);
      mutateFunctions();
      if (expandedProcessId === processId) fetchProcessDetail(processId);
    }
  };

  const handleDeleteProcess = (processId: string) => {
    requestConfirm(
      'Delete Process',
      'This will permanently delete this process. This cannot be undone.',
      'Delete',
      async () => {
        const res = await fetch(`/api/processes/${processId}`, { method: 'DELETE' });
        if (res.ok) {
          if (expandedProcessId === processId) {
            setExpandedProcessId(null);
            setExpandedProcessData(null);
          }
          mutateFunctions();
        }
        setConfirmState(CONFIRM_INITIAL);
      }
    );
  };

  const handleCompleteProcess = async (processId: string) => {
    setCompletingProcessId(processId);
    try {
      const res = await fetch(`/api/processes/${processId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduledDate: new Date().toISOString() }),
      });
      if (res.ok) {
        const data = await res.json();
        toast.success(data.completed ? 'Process marked complete!' : 'Completion removed');
        mutateStreaks();
        if (expandedProcessId === processId) fetchProcessDetail(processId);
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || 'Failed to complete process');
      }
    } catch {
      toast.error('Failed to complete process');
    } finally {
      setCompletingProcessId(null);
    }
  };

  const handleRegenerateTasks = (processId: string) => {
    requestConfirm(
      'Regenerate Tasks',
      'This will delete future TODO tasks and recreate them based on the current process steps.',
      'Regenerate',
      async () => {
        setConfirmState(CONFIRM_INITIAL);
        setRegeneratingId(processId);
        try {
          const res = await fetch(`/api/processes/${processId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ regenerate: true }),
          });
          if (res.ok) {
            toast.success('Tasks regenerated');
            mutateProcessTasks();
            if (expandedProcessId === processId) fetchProcessDetail(processId);
          }
        } catch {
          toast.error('Failed to regenerate tasks');
        } finally {
          setRegeneratingId(null);
        }
      }
    );
  };

  const handleScheduleProcess = async (
    processId: string,
    time: string,
    dayOfWeek?: number,
    dayOfMonth?: number,
    date?: string
  ) => {
    const payload: Record<string, unknown> = { time };
    if (dayOfWeek !== undefined) payload.dayOfWeek = dayOfWeek;
    if (dayOfMonth !== undefined) payload.dayOfMonth = dayOfMonth;
    if (date) payload.date = date;

    const res = await fetch(`/api/processes/${processId}/schedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      await fetch(`/api/processes/${processId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheduledTime: time,
          scheduledDayOfWeek: dayOfWeek ?? null,
          scheduledDayOfMonth: dayOfMonth ?? null,
        }),
      });
      toast.success(`Scheduled on the calendar`);
      setSchedulingProcess(null);
      mutateFunctions();
      if (expandedProcessId === processId) fetchProcessDetail(processId);
    } else {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error || 'Failed to schedule process');
    }
  };

  const handleImport = async (json: string): Promise<string | null> => {
    let parsed;
    try {
      parsed = JSON.parse(json);
    } catch {
      return 'Invalid JSON';
    }
    const res = await fetch('/api/processes/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed),
    });
    if (res.ok) {
      mutateFunctions();
      return null;
    }
    const data = await res.json().catch(() => ({}));
    return data.error || 'Import failed';
  };

  // Steps CRUD
  const handleAddStep = async (title: string, description: string | null, url: string | null) => {
    if (!expandedProcessId) return;
    const res = await fetch(`/api/processes/${expandedProcessId}/steps`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, description, url }),
    });
    if (res.ok) {
      fetchProcessDetail(expandedProcessId);
      mutateFunctions();
    }
  };

  const handleEditStep = async (stepId: string, title: string, description: string | null, url: string | null) => {
    if (!expandedProcessId) return;
    const res = await fetch(`/api/processes/${expandedProcessId}/steps/${stepId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, description, url }),
    });
    if (res.ok) fetchProcessDetail(expandedProcessId);
  };

  const handleDeleteStep = (stepId: string) => {
    requestConfirm(
      'Delete Step',
      'This will permanently delete this step.',
      'Delete',
      async () => {
        if (!expandedProcessId) return;
        const res = await fetch(`/api/processes/${expandedProcessId}/steps/${stepId}`, { method: 'DELETE' });
        if (res.ok) {
          fetchProcessDetail(expandedProcessId);
          mutateFunctions();
        }
        setConfirmState(CONFIRM_INITIAL);
      }
    );
  };

  // Task creation
  const addProcessTask = async (processId: string, title: string, parentId?: string) => {
    if (!title.trim()) return;
    const endOfWeek = new Date();
    endOfWeek.setDate(endOfWeek.getDate() + (7 - endOfWeek.getDay()));
    await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: title.trim(),
        taskType: 'MAINTENANCE',
        processId,
        parentId: parentId || undefined,
        dueDate: endOfWeek.toISOString(),
      }),
    });
    mutateProcessTasks();
  };

  // Create tasks from steps
  const createTasksFromSteps = async (proc: ProcessData) => {
    if (!expandedProcessData?.steps?.length) {
      toast.error('No steps defined for this process');
      return;
    }
    setCreatingTasks(true);
    try {
      const parentRes = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: proc.title,
          taskType: 'MAINTENANCE',
          processId: proc.id,
          dueDate: new Date().toISOString(),
          estimatedMinutes: proc.defaultDurationMinutes,
        }),
      });
      if (!parentRes.ok) {
        toast.error('Failed to create parent task');
        return;
      }
      const parentTask = await parentRes.json();
      await Promise.all(
        expandedProcessData.steps.map((step: any) =>
          fetch('/api/tasks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: step.title,
              taskType: 'MAINTENANCE',
              parentId: parentTask.id,
              dueDate: new Date().toISOString(),
            }),
          })
        )
      );
      toast.success(`Created ${expandedProcessData.steps.length} subtasks`);
    } catch {
      toast.error('Failed to create tasks');
    } finally {
      setCreatingTasks(false);
    }
  };

  // Delegation
  const handleDelegate = async (processId: string, delegateUserId: string, delegateUntil: string) => {
    const res = await fetch(`/api/processes/${processId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        delegateId: delegateUserId || null,
        delegateUntil: delegateUntil || null,
      }),
    });
    if (res.ok) {
      mutateFunctions();
      if (expandedProcessId === processId) fetchProcessDetail(processId);
    }
  };

  // Toggle expand
  const toggleProcess = (processId: string) => {
    if (expandedProcessId === processId) {
      setExpandedProcessId(null);
      setExpandedProcessData(null);
    } else {
      setExpandedProcessId(processId);
      fetchProcessDetail(processId);
    }
  };

  // ── Render ──

  if (loading) return <ProcessSkeleton />;

  return (
    <div>
      {/* ── Header ── */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold text-[var(--text-primary)] flex items-center gap-2">
          <ListChecks className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
          Processes
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-muted)]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search processes..."
              className={`pl-9 pr-3 py-2 w-52 ${INPUT_CLASSES}`}
            />
          </div>

          {/* Cadence filter */}
          <select
            value={cadenceFilter}
            onChange={(e) => setCadenceFilter(e.target.value)}
            className={INPUT_CLASSES}
          >
            <option value="">All cadences</option>
            {CADENCE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          <AssigneeFilter value={assigneeFilter} onChange={setAssigneeFilter} />

          {isAdmin && (
            <>
              <button
                onClick={() => setShowImport(!showImport)}
                className="flex items-center gap-2 rounded-lg border border-[var(--border-color)] px-4 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
              >
                <Upload className="h-4 w-4" />
                Import JSON
              </button>
              <button
                onClick={() => setShowAddFunction(true)}
                className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 transition-colors"
              >
                <Plus className="h-4 w-4" />
                Add Function
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Import Panel ── */}
      <AnimatePresence>
        {showImport && isAdmin && (
          <ImportPanel onImport={handleImport} onClose={() => setShowImport(false)} />
        )}
      </AnimatePresence>

      {/* ── Add Function Form ── */}
      <AnimatePresence>
        {showAddFunction && isAdmin && (
          <FunctionForm
            mode="create"
            onSubmit={handleAddFunction}
            onCancel={() => setShowAddFunction(false)}
          />
        )}
      </AnimatePresence>

      {/* ── Empty state ── */}
      {functions.length === 0 && (
        <ProcessEmptyState
          isAdmin={isAdmin}
          onCreateFunction={async (name, desc) => {
            await fetch('/api/processes', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name, description: desc }),
            });
            mutateFunctions();
          }}
        />
      )}

      {/* ── Functions list (staggered) ── */}
      <m.div
        variants={staggerContainer}
        initial="hidden"
        animate="show"
        className="space-y-4"
      >
        {filteredFunctions.map((fn) => (
          <m.div key={fn.id} variants={staggerItem}>
            <details className="glass-panel overflow-hidden" open>
              <summary className="flex items-center justify-between p-4 cursor-pointer hover:bg-[var(--hover-bg)] transition-colors list-none">
                <div className="flex items-center gap-3">
                  <ChevronRight className="h-4 w-4 text-[var(--text-muted)] details-open-rotate" />
                  <div>
                    {editingFnId === fn.id ? (
                      <div
                        className="flex items-center gap-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          value={editFnName}
                          onChange={(e) => setEditFnName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleEditFunction(fn.id);
                            if (e.key === 'Escape') setEditingFnId(null);
                          }}
                          className={INPUT_CLASSES}
                          autoFocus
                        />
                        <input
                          value={editFnDesc}
                          onChange={(e) => setEditFnDesc(e.target.value)}
                          placeholder="Description"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleEditFunction(fn.id);
                          }}
                          className={INPUT_CLASSES}
                        />
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditFunction(fn.id);
                          }}
                          className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 text-sm"
                        >
                          Save
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingFnId(null);
                          }}
                          className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-sm"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <>
                        <h2 className="text-[var(--text-primary)] font-display font-semibold">
                          {fn.name}
                        </h2>
                        {fn.description && (
                          <p className="text-[var(--text-muted)] text-sm">{fn.description}</p>
                        )}
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[var(--text-muted)]">
                    {fn.processes.length} process{fn.processes.length !== 1 ? 'es' : ''}
                  </span>
                  {isAdmin && editingFnId !== fn.id && (
                    <>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingFnId(fn.id);
                          setEditFnName(fn.name);
                          setEditFnDesc(fn.description || '');
                        }}
                        className="rounded p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)] transition-colors"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteFunction(fn.id);
                        }}
                        className="rounded p-1 text-[var(--text-muted)] hover:text-red-600 dark:hover:text-red-400 hover:bg-[var(--hover-bg)] transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </summary>

              <div className="border-t border-[var(--border-color)] p-4">
                {/* Add process button */}
                {isAdmin && addingProcessFnId !== fn.id && (
                  <button
                    onClick={() => setAddingProcessFnId(fn.id)}
                    className="mb-4 flex items-center gap-1 rounded-lg border border-dashed border-[var(--border-color)] px-3 py-2 text-sm text-[var(--text-muted)] hover:border-[var(--glass-border)] hover:text-[var(--text-secondary)] transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add Process
                  </button>
                )}

                {/* Add process form */}
                <AnimatePresence>
                  {addingProcessFnId === fn.id && (
                    <div className="mb-4">
                      <ProcessForm
                        mode="create"
                        users={users}
                        onSubmit={(values) => handleAddProcess(fn.id, values)}
                        onCancel={() => setAddingProcessFnId(null)}
                      />
                    </div>
                  )}
                </AnimatePresence>

                {/* Empty state */}
                {fn.processes.length === 0 && <ProcessListEmptyState />}

                {/* Process cards (staggered) */}
                <m.div
                  variants={staggerContainer}
                  initial="hidden"
                  animate="show"
                  className="space-y-2"
                >
                  {fn.processes.map((proc) => (
                    <m.div key={proc.id} variants={staggerItem}>
                      <m.div
                        className="glass-panel overflow-hidden group"
                        {...cardHoverProps}
                      >
                        {/* ── Process card header ── */}
                        <div
                          className="flex items-start justify-between p-4 cursor-pointer hover:bg-[var(--hover-bg)] transition-colors"
                          onClick={() => toggleProcess(proc.id)}
                        >
                          {/* Left: title + metadata */}
                          <div className="flex items-start gap-3 min-w-0">
                            <m.div
                              animate={{ rotate: expandedProcessId === proc.id ? 90 : 0 }}
                              transition={springTransition}
                              className="mt-0.5 shrink-0"
                            >
                              <ChevronRight className="h-4 w-4 text-[var(--text-muted)]" />
                            </m.div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <h3 className="font-display text-sm font-semibold text-[var(--text-primary)] truncate">
                                  {proc.title}
                                </h3>
                                <CadenceBadge cadence={proc.cadence} />
                              </div>
                              {/* Secondary metadata */}
                              <div className="flex items-center gap-3 mt-1">
                                {proc.assignee && (
                                  <span className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
                                    <User className="h-3 w-3" />
                                    {proc.assignee.name || proc.assignee.email}
                                  </span>
                                )}
                                {proc.nextDueAt && (
                                  <span className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
                                    <Calendar className="h-3 w-3" />
                                    {new Date(proc.nextDueAt).toLocaleDateString()}
                                  </span>
                                )}
                                <span className="text-xs text-[var(--text-muted)]">
                                  {proc._count.steps} step{proc._count.steps !== 1 ? 's' : ''}
                                </span>
                                {(() => {
                                  const sd = getProcessStreakData(proc.id);
                                  if (sd.count === 0 && !sd.id) return null;
                                  return (
                                    <span className="flex items-center gap-0.5">
                                      {sd.count > 0 && (
                                        <span
                                          className={`flex items-center gap-0.5 text-xs ${sd.isActive ? 'text-amber-700 dark:text-amber-400' : 'text-[var(--text-muted)]'}`}
                                          title={`${sd.count}-period streak${sd.isActive ? '' : ' (paused)'}`}
                                        >
                                          <Flame className="h-3 w-3" />
                                          {sd.count}
                                        </span>
                                      )}
                                      {sd.id && (
                                        <button
                                          onClick={(e) => { e.stopPropagation(); handleToggleProcessStreak(sd.id!, !sd.isActive); }}
                                          className="ml-0.5 text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
                                          title={sd.isActive ? 'Pause streak tracking' : 'Resume streak tracking'}
                                        >
                                          {sd.isActive ? (
                                            <PauseCircle className="h-3 w-3" />
                                          ) : (
                                            <PlayCircle className="h-3 w-3" />
                                          )}
                                        </button>
                                      )}
                                    </span>
                                  );
                                })()}
                              </div>
                            </div>
                          </div>

                          {/* Right: schedule + actions */}
                          <div className="flex items-center gap-2 shrink-0 ml-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSchedulingProcess(proc);
                              }}
                              className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-medium transition-colors ${
                                proc.scheduledTime
                                  ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 hover:bg-cyan-500/20'
                                  : 'border-indigo-500/40 bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 hover:bg-indigo-500/20'
                              }`}
                              title={
                                proc.scheduledTime
                                  ? `Scheduled at ${proc.scheduledTime}`
                                  : 'Schedule on calendar'
                              }
                            >
                              {proc.scheduledTime ? (
                                <>
                                  <Calendar className="h-3 w-3" />
                                  {proc.scheduledTime}
                                </>
                              ) : (
                                <>
                                  <Clock className="h-3 w-3" />
                                  Schedule
                                </>
                              )}
                            </button>
                            {isAdmin && (
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingProcessId(proc.id);
                                    setEditingProcessData({
                                      title: proc.title,
                                      description: proc.description || '',
                                      cadence: proc.cadence,
                                      assigneeId: proc.assigneeId || '',
                                      defaultDurationMinutes: proc.defaultDurationMinutes ?? 60,
                                      scheduledTime: proc.scheduledTime || '',
                                      scheduledDayOfWeek: proc.scheduledDayOfWeek ?? 1,
                                      scheduledDayOfMonth: proc.scheduledDayOfMonth ?? 1,
                                      scheduleStartDate: proc.scheduleStartDate
                                        ? new Date(proc.scheduleStartDate).toISOString().split('T')[0]
                                        : '',
                                      mode: proc.mode || 'BASIC',
                                      subtaskMode: proc.subtaskMode || 'PAIRED',
                                    });
                                  }}
                                  className="rounded p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)] transition-colors"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteProcess(proc.id);
                                  }}
                                  className="rounded p-1 text-[var(--text-muted)] hover:text-red-600 dark:hover:text-red-400 hover:bg-[var(--hover-bg)] transition-colors"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* ── Edit process form ── */}
                        <AnimatePresence>
                          {editingProcessId === proc.id && editingProcessData && (
                            <div
                              className="border-t border-[var(--border-color)] p-4"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <ProcessForm
                                mode="edit"
                                initialValues={editingProcessData}
                                users={users}
                                onSubmit={(values) => handleEditProcess(proc.id, values)}
                                onCancel={() => {
                                  setEditingProcessId(null);
                                  setEditingProcessData(null);
                                }}
                              />
                            </div>
                          )}
                        </AnimatePresence>

                        {/* ── Expanded detail view ── */}
                        <AnimatePresence initial={false}>
                          {expandedProcessId === proc.id && expandedProcessData && (
                            <ProcessDetailView
                              proc={proc}
                              expandedData={expandedProcessData}
                              processTasks={Array.isArray(processTasks) ? processTasks : []}
                              isAdmin={isAdmin}
                              userId={userId}
                              users={users}
                              streak={getProcessStreakData(proc.id).count}
                              completingProcessId={completingProcessId}
                              regeneratingId={regeneratingId}
                              creatingTasks={creatingTasks}
                              onCompleteProcess={handleCompleteProcess}
                              onRegenerateTasks={handleRegenerateTasks}
                              onCreateTasksFromSteps={createTasksFromSteps}
                              onAddStep={handleAddStep}
                              onEditStep={handleEditStep}
                              onDeleteStep={handleDeleteStep}
                              onAddTask={addProcessTask}
                              onDelegate={handleDelegate}
                            />
                          )}
                        </AnimatePresence>
                      </m.div>
                    </m.div>
                  ))}
                </m.div>
              </div>
            </details>
          </m.div>
        ))}
      </m.div>

      {/* ── Schedule Modal ── */}
      <ScheduleModal
        process={schedulingProcess}
        onSchedule={handleScheduleProcess}
        onClose={() => setSchedulingProcess(null)}
      />

      {/* ── Confirm Dialog ── */}
      <ConfirmDialog
        open={confirmState.open}
        title={confirmState.title}
        message={confirmState.message}
        confirmLabel={confirmState.confirmLabel}
        variant="danger"
        onConfirm={confirmState.onConfirm}
        onCancel={() => setConfirmState(CONFIRM_INITIAL)}
      />
    </div>
  );
}
