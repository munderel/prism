'use client';

import { useState, useMemo } from 'react';
import useSWR from 'swr';
import { AssigneeFilter } from '@/components/shared/AssigneeFilter';
import { useSession } from 'next-auth/react';
import { ProcessKpiSection } from '@/components/processes/ProcessKpiSection';
import { useToast } from '@/components/ui/ToastProvider';
import {
  ListChecks,
  Plus,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronRight,
  Upload,
  User,
  Calendar,
  X,
  ExternalLink,
  Clock,
} from 'lucide-react';

interface Step {
  id: string;
  title: string;
  description: string | null;
  url: string | null;
  sortOrder: number;
}

interface ProcessData {
  id: string;
  title: string;
  description: string | null;
  cadence: string;
  defaultDurationMinutes: number;
  scheduledTime: string | null;
  scheduledDayOfWeek: number | null;
  scheduledDayOfMonth: number | null;
  nextDueAt: string | null;
  assigneeId: string | null;
  delegateId: string | null;
  delegateUntil: string | null;
  assignee: { id: string; name: string | null; email: string } | null;
  delegate: { id: string; name: string | null; email: string } | null;
  _count: { steps: number };
}

interface BusinessFunction {
  id: string;
  name: string;
  description: string | null;
  processes: ProcessData[];
}

interface UserOption {
  id: string;
  name: string | null;
  email: string;
}

const CADENCE_COLORS: Record<string, string> = {
  DAILY: 'bg-red-900/50 text-red-300 border-red-800',
  WEEKLY: 'bg-blue-900/50 text-blue-300 border-blue-800',
  BIWEEKLY: 'bg-cyan-900/50 text-cyan-300 border-cyan-800',
  MONTHLY: 'bg-purple-900/50 text-purple-300 border-purple-800',
  QUARTERLY: 'bg-amber-900/50 text-amber-300 border-amber-800',
  YEARLY: 'bg-green-900/50 text-green-300 border-green-800',
};

export default function ProcessesPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.isAdmin ?? false;
  const userId = session?.user?.id;
  const toast = useToast();

  const { data: functionsData, isLoading: loading, mutate: mutateFunctions } = useSWR('/api/processes');
  const functions = Array.isArray(functionsData) ? functionsData as BusinessFunction[] : [];
  const { data: usersData } = useSWR(isAdmin ? '/api/admin' : null);
  const users = Array.isArray(usersData) ? usersData as UserOption[] : [];

  // Assignee filter
  const [assigneeFilter, setAssigneeFilter] = useState('');

  const filteredFunctions = useMemo(() => {
    if (!assigneeFilter) return functions;
    return functions
      .map((fn: BusinessFunction) => ({
        ...fn,
        processes: fn.processes.filter(
          (p: ProcessData) => p.assigneeId === assigneeFilter || p.delegateId === assigneeFilter
        ),
      }))
      .filter((fn: BusinessFunction) => fn.processes.length > 0);
  }, [functions, assigneeFilter]);

  // Add function form
  const [showAddFunction, setShowAddFunction] = useState(false);
  const [newFnName, setNewFnName] = useState('');
  const [newFnDesc, setNewFnDesc] = useState('');

  // Edit function
  const [editingFnId, setEditingFnId] = useState<string | null>(null);
  const [editFnName, setEditFnName] = useState('');
  const [editFnDesc, setEditFnDesc] = useState('');

  // Add process form
  const [addingProcessFnId, setAddingProcessFnId] = useState<string | null>(null);
  const [newProcTitle, setNewProcTitle] = useState('');
  const [newProcDesc, setNewProcDesc] = useState('');
  const [newProcCadence, setNewProcCadence] = useState('WEEKLY');
  const [newProcAssignee, setNewProcAssignee] = useState('');
  const [newProcDuration, setNewProcDuration] = useState(60);
  const [newProcScheduledTime, setNewProcScheduledTime] = useState('');
  const [newProcDayOfWeek, setNewProcDayOfWeek] = useState(1);
  const [newProcDayOfMonth, setNewProcDayOfMonth] = useState(1);

  // Expanded process
  const [expandedProcessId, setExpandedProcessId] = useState<string | null>(null);
  const [expandedProcessData, setExpandedProcessData] = useState<any>(null);

  // Add step form
  const [showAddStep, setShowAddStep] = useState(false);
  const [newStepTitle, setNewStepTitle] = useState('');
  const [newStepDesc, setNewStepDesc] = useState('');
  const [newStepUrl, setNewStepUrl] = useState('');

  // Edit step
  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const [editStepTitle, setEditStepTitle] = useState('');
  const [editStepDesc, setEditStepDesc] = useState('');
  const [editStepUrl, setEditStepUrl] = useState('');

  // Edit process (admin)
  const [editingProcessId, setEditingProcessId] = useState<string | null>(null);
  const [editProcTitle, setEditProcTitle] = useState('');
  const [editProcDesc, setEditProcDesc] = useState('');
  const [editProcCadence, setEditProcCadence] = useState('');
  const [editProcAssignee, setEditProcAssignee] = useState('');
  const [editProcDuration, setEditProcDuration] = useState(60);
  const [editProcScheduledTime, setEditProcScheduledTime] = useState('');
  const [editProcDayOfWeek, setEditProcDayOfWeek] = useState(1);
  const [editProcDayOfMonth, setEditProcDayOfMonth] = useState(1);

  // Delegation
  const [delegateUserId, setDelegateUserId] = useState('');
  const [delegateUntil, setDelegateUntil] = useState('');

  // Import
  const [showImport, setShowImport] = useState(false);
  const [importJson, setImportJson] = useState('');
  const [importError, setImportError] = useState('');

  // Schedule popup
  const [schedulingProcess, setSchedulingProcess] = useState<ProcessData | null>(null);
  const [schedTime, setSchedTime] = useState('09:00');
  const [schedDayOfWeek, setSchedDayOfWeek] = useState(1); // Monday
  const [schedDayOfMonth, setSchedDayOfMonth] = useState(1);
  const [schedDate, setSchedDate] = useState('');
  const [schedSaving, setSchedSaving] = useState(false);


  const fetchProcessDetail = async (processId: string) => {
    const res = await fetch(`/api/processes/${processId}`);
    if (res.ok) {
      const data = await res.json();
      setExpandedProcessData(data);
    }
  };

  const toggleProcess = (processId: string) => {
    if (expandedProcessId === processId) {
      setExpandedProcessId(null);
      setExpandedProcessData(null);
    } else {
      setExpandedProcessId(processId);
      fetchProcessDetail(processId);
    }
  };

  // === CRUD handlers ===

  const handleAddFunction = async () => {
    if (!newFnName.trim()) return;
    const res = await fetch('/api/processes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newFnName.trim(), description: newFnDesc.trim() || null }),
    });
    if (res.ok) {
      setNewFnName('');
      setNewFnDesc('');
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

  const handleDeleteFunction = async (id: string) => {
    if (!confirm('Delete this function and all its processes?')) return;
    const res = await fetch(`/api/processes/functions/${id}`, { method: 'DELETE' });
    if (res.ok) mutateFunctions();
  };

  const handleAddProcess = async (functionId: string) => {
    if (!newProcTitle.trim()) return;
    const res = await fetch(`/api/processes/functions/${functionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: newProcTitle.trim(),
        description: newProcDesc.trim() || null,
        cadence: newProcCadence,
        assigneeId: newProcAssignee || null,
        defaultDurationMinutes: newProcDuration,
        scheduledTime: newProcScheduledTime || null,
        scheduledDayOfWeek: ['WEEKLY', 'BIWEEKLY'].includes(newProcCadence) ? newProcDayOfWeek : null,
        scheduledDayOfMonth: ['MONTHLY', 'QUARTERLY'].includes(newProcCadence) ? newProcDayOfMonth : null,
      }),
    });
    if (res.ok) {
      setNewProcTitle('');
      setNewProcDesc('');
      setNewProcCadence('WEEKLY');
      setNewProcAssignee('');
      setNewProcDuration(60);
      setNewProcScheduledTime('');
      setNewProcDayOfWeek(1);
      setNewProcDayOfMonth(1);
      setAddingProcessFnId(null);
      mutateFunctions();
    } else {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error || 'Failed to create process');
    }
  };

  const handleEditProcess = async (processId: string) => {
    const res = await fetch(`/api/processes/${processId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: editProcTitle,
        description: editProcDesc || null,
        cadence: editProcCadence,
        assigneeId: editProcAssignee || null,
        defaultDurationMinutes: editProcDuration,
        scheduledTime: editProcScheduledTime || null,
        scheduledDayOfWeek: ['WEEKLY', 'BIWEEKLY'].includes(editProcCadence) ? editProcDayOfWeek : null,
        scheduledDayOfMonth: ['MONTHLY', 'QUARTERLY'].includes(editProcCadence) ? editProcDayOfMonth : null,
      }),
    });
    if (res.ok) {
      setEditingProcessId(null);
      mutateFunctions();
      if (expandedProcessId === processId) fetchProcessDetail(processId);
    }
  };

  const handleDeleteProcess = async (processId: string) => {
    if (!confirm('Delete this process?')) return;
    const res = await fetch(`/api/processes/${processId}`, { method: 'DELETE' });
    if (res.ok) {
      if (expandedProcessId === processId) {
        setExpandedProcessId(null);
        setExpandedProcessData(null);
      }
      mutateFunctions();
    }
  };

  const handleAddStep = async () => {
    if (!newStepTitle.trim() || !expandedProcessId) return;
    const res = await fetch(`/api/processes/${expandedProcessId}/steps`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newStepTitle.trim(), description: newStepDesc.trim() || null, url: newStepUrl.trim() || null }),
    });
    if (res.ok) {
      setNewStepTitle('');
      setNewStepDesc('');
      setNewStepUrl('');
      setShowAddStep(false);
      fetchProcessDetail(expandedProcessId);
      mutateFunctions();
    }
  };

  const handleEditStep = async (stepId: string) => {
    if (!expandedProcessId) return;
    const res = await fetch(`/api/processes/${expandedProcessId}/steps/${stepId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: editStepTitle, description: editStepDesc || null, url: editStepUrl || null }),
    });
    if (res.ok) {
      setEditingStepId(null);
      fetchProcessDetail(expandedProcessId);
    }
  };

  const handleDeleteStep = async (stepId: string) => {
    if (!expandedProcessId) return;
    if (!confirm('Delete this step?')) return;
    const res = await fetch(`/api/processes/${expandedProcessId}/steps/${stepId}`, { method: 'DELETE' });
    if (res.ok) {
      fetchProcessDetail(expandedProcessId);
      mutateFunctions();
    }
  };

  const handleDelegate = async (processId: string) => {
    const res = await fetch(`/api/processes/${processId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        delegateId: delegateUserId || null,
        delegateUntil: delegateUntil || null,
      }),
    });
    if (res.ok) {
      setDelegateUserId('');
      setDelegateUntil('');
      mutateFunctions();
      if (expandedProcessId === processId) fetchProcessDetail(processId);
    }
  };

  const handleImport = async () => {
    setImportError('');
    let parsed;
    try {
      parsed = JSON.parse(importJson);
    } catch {
      setImportError('Invalid JSON');
      return;
    }
    const res = await fetch('/api/processes/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed),
    });
    if (res.ok) {
      setImportJson('');
      setShowImport(false);
      mutateFunctions();
    } else {
      const data = await res.json().catch(() => ({}));
      setImportError(data.error || 'Import failed');
    }
  };

  const openSchedulePopup = (proc: ProcessData) => {
    setSchedulingProcess(proc);
    setSchedTime('09:00');
    setSchedDayOfWeek(1);
    setSchedDayOfMonth(1);
    setSchedDate('');
    setSchedSaving(false);
  };

  const handleScheduleProcess = async () => {
    if (!schedulingProcess) return;
    setSchedSaving(true);

    const payload: Record<string, unknown> = { time: schedTime };
    const cadence = schedulingProcess.cadence;

    if (cadence === 'WEEKLY' || cadence === 'BIWEEKLY') {
      payload.dayOfWeek = schedDayOfWeek;
    }
    if (cadence === 'MONTHLY' || cadence === 'QUARTERLY') {
      payload.dayOfMonth = schedDayOfMonth;
    }
    if (cadence === 'YEARLY' || cadence === 'ONE_TIME') {
      payload.date = schedDate;
    }

    const res = await fetch(`/api/processes/${schedulingProcess.id}/schedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    setSchedSaving(false);

    if (res.ok) {
      // Also persist the scheduled time on the process for recurring calendar display
      await fetch(`/api/processes/${schedulingProcess.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheduledTime: schedTime,
          scheduledDayOfWeek: (cadence === 'WEEKLY' || cadence === 'BIWEEKLY') ? schedDayOfWeek : null,
          scheduledDayOfMonth: (cadence === 'MONTHLY' || cadence === 'QUARTERLY') ? schedDayOfMonth : null,
        }),
      });
      toast.success(`Scheduled "${schedulingProcess.title}" on the calendar`);
      setSchedulingProcess(null);
      mutateFunctions();
      if (expandedProcessId === schedulingProcess.id) {
        fetchProcessDetail(schedulingProcess.id);
      }
    } else {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error || 'Failed to schedule process');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-[var(--text-muted)]">Loading processes...</div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold text-[var(--text-primary)] flex items-center gap-2">
          <ListChecks className="h-6 w-6 text-prism-indigo" />
          Processes
        </h1>
        <div className="flex items-center gap-2">
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

      {/* Import JSON panel */}
      {showImport && isAdmin && (
        <div className="mb-6 glass-panel p-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">Import from JSON</h3>
            <button onClick={() => { setShowImport(false); setImportError(''); }} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
              <X className="h-4 w-4" />
            </button>
          </div>
          <textarea
            value={importJson}
            onChange={(e) => setImportJson(e.target.value)}
            placeholder='{"functions": [{"name": "Marketing", "processes": [...]}]}'
            rows={8}
            className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-3 py-2 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none font-mono"
          />
          {importError && <p className="mt-2 text-sm text-red-400">{importError}</p>}
          <div className="mt-3 flex gap-2">
            <button onClick={handleImport} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 transition-colors">
              Import
            </button>
            <button onClick={() => { setShowImport(false); setImportJson(''); setImportError(''); }} className="rounded-lg border border-[var(--border-color)] px-4 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Add Function form */}
      {showAddFunction && isAdmin && (
        <div className="mb-6 glass-panel p-4">
          <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3">New Business Function</h3>
          <div className="space-y-3">
            <input
              type="text"
              value={newFnName}
              onChange={(e) => setNewFnName(e.target.value)}
              placeholder="Function name"
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddFunction(); if (e.key === 'Escape') setShowAddFunction(false); }}
              className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-3 py-2 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none"
            />
            <input
              type="text"
              value={newFnDesc}
              onChange={(e) => setNewFnDesc(e.target.value)}
              placeholder="Description (optional)"
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddFunction(); }}
              className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-3 py-2 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none"
            />
            <div className="flex gap-2">
              <button onClick={handleAddFunction} disabled={!newFnName.trim()} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors">
                Create
              </button>
              <button onClick={() => { setShowAddFunction(false); setNewFnName(''); setNewFnDesc(''); }} className="rounded-lg border border-[var(--border-color)] px-4 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Empty state with starter templates */}
      {functions.length === 0 && (
        <div className="text-center py-12">
          <ListChecks className="h-12 w-12 text-[var(--border-color)] mx-auto mb-4" />
          <p className="text-[var(--text-muted)] mb-2">No business functions yet.</p>
          <p className="text-[var(--text-muted)] text-sm mb-6">
            {isAdmin ? 'Start with a template or create from scratch.' : 'Ask an admin to set up business functions and processes.'}
          </p>
          {isAdmin && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-w-3xl mx-auto">
              {[
                { name: 'Marketing', desc: 'Ad campaigns, content creation, social media' },
                { name: 'Sales', desc: 'Lead follow-up, proposals, client onboarding' },
                { name: 'Operations', desc: 'Weekly planning, reporting, team meetings' },
                { name: 'Product', desc: 'Feature development, bug triage, releases' },
                { name: 'Finance', desc: 'Invoicing, budgeting, expense tracking' },
                { name: 'HR', desc: 'Hiring, onboarding, performance reviews' },
              ].map((tpl) => (
                <button
                  key={tpl.name}
                  onClick={async () => {
                    await fetch('/api/processes', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ name: tpl.name, description: tpl.desc }),
                    });
                    mutateFunctions();
                  }}
                  className="glass-panel p-4 text-left hover:border-indigo-500/30 transition-colors"
                >
                  <p className="text-sm font-medium text-[var(--text-primary)]">{tpl.name}</p>
                  <p className="text-xs text-[var(--text-muted)] mt-1">{tpl.desc}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Functions list */}
      {filteredFunctions.map((fn) => (
        <details key={fn.id} className="mb-4 glass-panel overflow-hidden" open>
          <summary className="flex items-center justify-between p-4 cursor-pointer hover:bg-[var(--surface)] transition-colors list-none">
            <div className="flex items-center gap-3">
              <ChevronRight className="h-4 w-4 text-[var(--text-muted)] details-open-rotate" />
              <div>
                {editingFnId === fn.id ? (
                  <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    <input
                      value={editFnName}
                      onChange={(e) => setEditFnName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleEditFunction(fn.id); if (e.key === 'Escape') setEditingFnId(null); }}
                      className="rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-2 py-1 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none"
                      autoFocus
                    />
                    <input
                      value={editFnDesc}
                      onChange={(e) => setEditFnDesc(e.target.value)}
                      placeholder="Description"
                      onKeyDown={(e) => { if (e.key === 'Enter') handleEditFunction(fn.id); }}
                      className="rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-2 py-1 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none"
                    />
                    <button onClick={(e) => { e.stopPropagation(); handleEditFunction(fn.id); }} className="text-indigo-400 hover:text-indigo-300 text-sm">Save</button>
                    <button onClick={(e) => { e.stopPropagation(); setEditingFnId(null); }} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-sm">Cancel</button>
                  </div>
                ) : (
                  <>
                    <h2 className="text-[var(--text-primary)] font-semibold">{fn.name}</h2>
                    {fn.description && <p className="text-[var(--text-muted)] text-sm">{fn.description}</p>}
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--text-muted)]">{fn.processes.length} process{fn.processes.length !== 1 ? 'es' : ''}</span>
              {isAdmin && editingFnId !== fn.id && (
                <>
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditingFnId(fn.id); setEditFnName(fn.name); setEditFnDesc(fn.description || ''); }}
                    className="rounded p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)] transition-colors"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteFunction(fn.id); }}
                    className="rounded p-1 text-[var(--text-muted)] hover:text-red-400 hover:bg-[var(--hover-bg)] transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </div>
          </summary>

          <div className="border-t border-[var(--surface-raised)] p-4">
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
            {addingProcessFnId === fn.id && (
              <div className="mb-4 rounded-lg border border-[var(--border-color)] bg-[var(--surface)] p-4">
                <h4 className="text-sm font-medium text-[var(--text-primary)] mb-3">New Process</h4>
                <div className="space-y-2">
                  <input
                    type="text"
                    value={newProcTitle}
                    onChange={(e) => setNewProcTitle(e.target.value)}
                    placeholder="Process title"
                    autoFocus
                    className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-3 py-2 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none"
                  />
                  <input
                    type="text"
                    value={newProcDesc}
                    onChange={(e) => setNewProcDesc(e.target.value)}
                    placeholder="Description (optional)"
                    className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-3 py-2 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none"
                  />
                  <div className="flex gap-2">
                    <select
                      value={newProcCadence}
                      onChange={(e) => setNewProcCadence(e.target.value)}
                      className="rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-3 py-2 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none"
                    >
                      <option value="DAILY">Daily</option>
                      <option value="WEEKLY">Weekly</option>
                      <option value="BIWEEKLY">Biweekly</option>
                      <option value="MONTHLY">Monthly</option>
                      <option value="QUARTERLY">Quarterly</option>
                      <option value="YEARLY">Yearly</option>
                    </select>
                    <select
                      value={newProcAssignee}
                      onChange={(e) => setNewProcAssignee(e.target.value)}
                      className="rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-3 py-2 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none"
                    >
                      <option value="">Unassigned</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>{u.name || u.email}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-[var(--text-secondary)] mb-1">Default Duration</label>
                    <div className="flex flex-wrap gap-1.5">
                      {[15, 30, 45, 60, 90, 120, 180, 240].map((mins) => (
                        <button
                          key={mins}
                          type="button"
                          onClick={() => setNewProcDuration(mins)}
                          className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                            newProcDuration === mins
                              ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-600/30'
                              : 'text-[var(--text-secondary)] border border-[var(--border-color)] hover:border-[var(--glass-border)]'
                          }`}
                        >
                          {mins < 60 ? `${mins}m` : `${mins / 60}h`}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-[var(--text-secondary)] mb-1">Calendar Schedule (optional)</label>
                    <div className="flex flex-wrap gap-2">
                      <input
                        type="time"
                        value={newProcScheduledTime}
                        onChange={(e) => setNewProcScheduledTime(e.target.value)}
                        className="rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-3 py-2 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none"
                        placeholder="Time"
                      />
                      {['WEEKLY', 'BIWEEKLY'].includes(newProcCadence) && (
                        <select
                          value={newProcDayOfWeek}
                          onChange={(e) => setNewProcDayOfWeek(Number(e.target.value))}
                          className="rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-3 py-2 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none"
                        >
                          {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((d, i) => (
                            <option key={i} value={i}>{d}</option>
                          ))}
                        </select>
                      )}
                      {['MONTHLY', 'QUARTERLY'].includes(newProcCadence) && (
                        <select
                          value={newProcDayOfMonth}
                          onChange={(e) => setNewProcDayOfMonth(Number(e.target.value))}
                          className="rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-3 py-2 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none"
                        >
                          {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                            <option key={d} value={d}>Day {d}</option>
                          ))}
                        </select>
                      )}
                    </div>
                    {newProcScheduledTime && (
                      <p className="text-xs text-cyan-400 mt-1">Will appear on calendar at {newProcScheduledTime}</p>
                    )}
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button onClick={() => handleAddProcess(fn.id)} disabled={!newProcTitle.trim()} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors">
                      Create
                    </button>
                    <button onClick={() => { setAddingProcessFnId(null); setNewProcTitle(''); setNewProcDesc(''); setNewProcDuration(60); setNewProcScheduledTime(''); }} className="rounded-lg border border-[var(--border-color)] px-4 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Process cards */}
            {fn.processes.length === 0 && (
              <p className="text-[var(--text-muted)] text-sm py-2">No processes in this function yet.</p>
            )}

            <div className="space-y-2">
              {fn.processes.map((proc) => (
                <div key={proc.id} className="rounded-lg border border-[var(--surface-raised)] bg-background/80">
                  {/* Process card header */}
                  <div
                    className="flex items-center justify-between p-3 cursor-pointer hover:bg-[var(--surface)] transition-colors"
                    onClick={() => toggleProcess(proc.id)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {expandedProcessId === proc.id ? (
                        <ChevronDown className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
                      )}
                      <div className="min-w-0">
                        <h3 className="text-sm font-medium text-[var(--text-primary)] truncate">{proc.title}</h3>
                        <div className="flex items-center gap-2 mt-0.5">
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
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${CADENCE_COLORS[proc.cadence] || 'bg-[var(--surface-raised)] text-[var(--text-secondary)] border-[var(--border-color)]'}`}>
                        {proc.cadence}
                      </span>
                      {proc.scheduledTime && (
                        <span className="flex items-center gap-1 text-xs text-cyan-400" title={`On calendar at ${proc.scheduledTime}`}>
                          <Calendar className="h-3 w-3" />
                          {proc.scheduledTime}
                        </span>
                      )}
                      <span className="text-xs text-[var(--text-muted)]">{proc._count.steps} step{proc._count.steps !== 1 ? 's' : ''}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); openSchedulePopup(proc); }}
                        className="flex items-center gap-1 rounded-lg border border-indigo-600/30 bg-indigo-600/10 px-2 py-1 text-xs font-medium text-indigo-400 hover:bg-indigo-600/20 transition-colors"
                        title="Schedule on calendar"
                      >
                        <Clock className="h-3 w-3" />
                        Schedule
                      </button>
                      {isAdmin && (
                        <>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingProcessId(proc.id);
                              setEditProcTitle(proc.title);
                              setEditProcDesc(proc.description || '');
                              setEditProcCadence(proc.cadence);
                              setEditProcAssignee(proc.assigneeId || '');
                              setEditProcDuration(proc.defaultDurationMinutes ?? 60);
                              setEditProcScheduledTime(proc.scheduledTime || '');
                              setEditProcDayOfWeek(proc.scheduledDayOfWeek ?? 1);
                              setEditProcDayOfMonth(proc.scheduledDayOfMonth ?? 1);
                            }}
                            className="rounded p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)] transition-colors"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteProcess(proc.id); }}
                            className="rounded p-1 text-[var(--text-muted)] hover:text-red-400 hover:bg-[var(--hover-bg)] transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Edit process form */}
                  {editingProcessId === proc.id && (
                    <div className="border-t border-[var(--surface-raised)] p-4" onClick={(e) => e.stopPropagation()}>
                      <h4 className="text-sm font-medium text-[var(--text-primary)] mb-3">Edit Process</h4>
                      <div className="space-y-2">
                        <input
                          type="text"
                          value={editProcTitle}
                          onChange={(e) => setEditProcTitle(e.target.value)}
                          className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-3 py-2 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none"
                        />
                        <input
                          type="text"
                          value={editProcDesc}
                          onChange={(e) => setEditProcDesc(e.target.value)}
                          placeholder="Description"
                          className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-3 py-2 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none"
                        />
                        <div className="flex gap-2">
                          <select
                            value={editProcCadence}
                            onChange={(e) => setEditProcCadence(e.target.value)}
                            className="rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-3 py-2 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none"
                          >
                            <option value="DAILY">Daily</option>
                            <option value="WEEKLY">Weekly</option>
                            <option value="BIWEEKLY">Biweekly</option>
                            <option value="MONTHLY">Monthly</option>
                            <option value="QUARTERLY">Quarterly</option>
                            <option value="YEARLY">Yearly</option>
                          </select>
                          <select
                            value={editProcAssignee}
                            onChange={(e) => setEditProcAssignee(e.target.value)}
                            className="rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-3 py-2 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none"
                          >
                            <option value="">Unassigned</option>
                            {users.map((u) => (
                              <option key={u.id} value={u.id}>{u.name || u.email}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-[var(--text-secondary)] mb-1">Default Duration</label>
                          <div className="flex flex-wrap gap-1.5">
                            {[15, 30, 45, 60, 90, 120, 180, 240].map((mins) => (
                              <button
                                key={mins}
                                type="button"
                                onClick={() => setEditProcDuration(mins)}
                                className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                                  editProcDuration === mins
                                    ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-600/30'
                                    : 'text-[var(--text-secondary)] border border-[var(--border-color)] hover:border-[var(--glass-border)]'
                                }`}
                              >
                                {mins < 60 ? `${mins}m` : `${mins / 60}h`}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs text-[var(--text-secondary)] mb-1">Calendar Schedule</label>
                          <div className="flex flex-wrap gap-2">
                            <input
                              type="time"
                              value={editProcScheduledTime}
                              onChange={(e) => setEditProcScheduledTime(e.target.value)}
                              className="rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-3 py-2 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none"
                              placeholder="Time"
                            />
                            {['WEEKLY', 'BIWEEKLY'].includes(editProcCadence) && (
                              <select
                                value={editProcDayOfWeek}
                                onChange={(e) => setEditProcDayOfWeek(Number(e.target.value))}
                                className="rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-3 py-2 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none"
                              >
                                {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((d, i) => (
                                  <option key={i} value={i}>{d}</option>
                                ))}
                              </select>
                            )}
                            {['MONTHLY', 'QUARTERLY'].includes(editProcCadence) && (
                              <select
                                value={editProcDayOfMonth}
                                onChange={(e) => setEditProcDayOfMonth(Number(e.target.value))}
                                className="rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-3 py-2 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none"
                              >
                                {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                                  <option key={d} value={d}>Day {d}</option>
                                ))}
                              </select>
                            )}
                          </div>
                          {editProcScheduledTime && (
                            <p className="text-xs text-cyan-400 mt-1">Will appear on calendar at {editProcScheduledTime}</p>
                          )}
                        </div>
                        <div className="flex gap-2 pt-1">
                          <button onClick={() => handleEditProcess(proc.id)} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 transition-colors">
                            Save
                          </button>
                          <button onClick={() => setEditingProcessId(null)} className="rounded-lg border border-[var(--border-color)] px-4 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
                            Cancel
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Expanded process detail */}
                  {expandedProcessId === proc.id && expandedProcessData && (
                    <div className="border-t border-[var(--surface-raised)] p-4">
                      {/* Description */}
                      {expandedProcessData.description && (
                        <p className="text-sm text-[var(--text-secondary)] mb-4">{expandedProcessData.description}</p>
                      )}

                      {/* Delegate info */}
                      {expandedProcessData.delegate && (
                        <div className="mb-4 rounded-lg border border-amber-900/50 bg-amber-900/20 p-3">
                          <p className="text-sm text-amber-300">
                            Delegated to <span className="font-medium">{expandedProcessData.delegate.name || expandedProcessData.delegate.email}</span>
                            {expandedProcessData.delegateUntil && (
                              <> until {new Date(expandedProcessData.delegateUntil).toLocaleDateString()}</>
                            )}
                          </p>
                        </div>
                      )}

                      {/* Delegation section for assignee */}
                      {proc.assigneeId === userId && (
                        <div className="mb-4 rounded-lg border border-[var(--border-color)] bg-[var(--surface)] p-3">
                          <h4 className="text-xs font-semibold text-[var(--text-secondary)] uppercase mb-2">Delegate This Process</h4>
                          <div className="flex items-center gap-2">
                            <select
                              value={delegateUserId}
                              onChange={(e) => setDelegateUserId(e.target.value)}
                              className="rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-3 py-1.5 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none"
                            >
                              <option value="">No delegate</option>
                              {users.map((u) => (
                                <option key={u.id} value={u.id}>{u.name || u.email}</option>
                              ))}
                            </select>
                            <div className="flex flex-col">
                              <label className="text-xs text-[var(--text-secondary)] mb-0.5">Delegate until</label>
                              <input
                                type="date"
                                value={delegateUntil}
                                onChange={(e) => setDelegateUntil(e.target.value)}
                                className="rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-3 py-1.5 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none"
                              />
                            </div>
                            <button
                              onClick={() => handleDelegate(proc.id)}
                              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 transition-colors"
                            >
                              Save
                            </button>
                          </div>
                        </div>
                      )}

                      {/* SOP Steps */}
                      <div className="mb-3 flex items-center justify-between">
                        <h4 className="text-xs font-semibold text-[var(--text-secondary)] uppercase">SOP Steps</h4>
                        {isAdmin && (
                          <button
                            onClick={() => setShowAddStep(true)}
                            className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                          >
                            <Plus className="h-3 w-3" />
                            Add Step
                          </button>
                        )}
                      </div>

                      {expandedProcessData.steps?.length === 0 && (
                        <p className="text-sm text-[var(--text-muted)] py-2">No steps defined yet.</p>
                      )}

                      <ol className="space-y-2">
                        {expandedProcessData.steps?.map((step: Step, idx: number) => (
                          <li key={step.id} className="flex items-start gap-3 glass-panel p-3">
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-600/20 text-xs font-medium text-indigo-400">
                              {idx + 1}
                            </span>
                            {editingStepId === step.id ? (
                              <div className="flex-1 space-y-2">
                                <input
                                  value={editStepTitle}
                                  onChange={(e) => setEditStepTitle(e.target.value)}
                                  onKeyDown={(e) => { if (e.key === 'Enter') handleEditStep(step.id); if (e.key === 'Escape') setEditingStepId(null); }}
                                  className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-2 py-1 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none"
                                  autoFocus
                                />
                                <input
                                  value={editStepDesc}
                                  onChange={(e) => setEditStepDesc(e.target.value)}
                                  placeholder="Description"
                                  onKeyDown={(e) => { if (e.key === 'Enter') handleEditStep(step.id); }}
                                  className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-2 py-1 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none"
                                />
                                <input
                                  value={editStepUrl}
                                  onChange={(e) => setEditStepUrl(e.target.value)}
                                  placeholder="Link to SOP document (optional)"
                                  onKeyDown={(e) => { if (e.key === 'Enter') handleEditStep(step.id); }}
                                  className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-2 py-1 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none"
                                />
                                <div className="flex gap-2">
                                  <button onClick={() => handleEditStep(step.id)} className="text-xs text-indigo-400 hover:text-indigo-300">Save</button>
                                  <button onClick={() => setEditingStepId(null)} className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]">Cancel</button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex-1 min-w-0">
                                {step.url ? (
                                  <a href={step.url} target="_blank" rel="noopener noreferrer" className="text-sm text-indigo-400 hover:text-indigo-300 inline-flex items-center gap-1">
                                    {step.title}
                                    <ExternalLink className="h-3 w-3" />
                                  </a>
                                ) : (
                                  <p className="text-sm text-[var(--text-primary)]">{step.title}</p>
                                )}
                                {step.description && <p className="text-xs text-[var(--text-muted)] mt-0.5">{step.description}</p>}
                              </div>
                            )}
                            {isAdmin && editingStepId !== step.id && (
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  onClick={() => { setEditingStepId(step.id); setEditStepTitle(step.title); setEditStepDesc(step.description || ''); setEditStepUrl(step.url || ''); }}
                                  className="rounded p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)] transition-colors"
                                >
                                  <Pencil className="h-3 w-3" />
                                </button>
                                <button
                                  onClick={() => handleDeleteStep(step.id)}
                                  className="rounded p-1 text-[var(--text-muted)] hover:text-red-400 hover:bg-[var(--hover-bg)] transition-colors"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            )}
                          </li>
                        ))}
                      </ol>

                      {/* Add step form */}
                      {showAddStep && isAdmin && (
                        <div className="mt-3 rounded-lg border border-[var(--border-color)] bg-[var(--surface)] p-3">
                          <div className="space-y-2">
                            <input
                              type="text"
                              value={newStepTitle}
                              onChange={(e) => setNewStepTitle(e.target.value)}
                              placeholder="Step title"
                              autoFocus
                              onKeyDown={(e) => { if (e.key === 'Enter') handleAddStep(); if (e.key === 'Escape') setShowAddStep(false); }}
                              className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-3 py-2 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none"
                            />
                            <input
                              type="text"
                              value={newStepDesc}
                              onChange={(e) => setNewStepDesc(e.target.value)}
                              placeholder="Description (optional)"
                              onKeyDown={(e) => { if (e.key === 'Enter') handleAddStep(); }}
                              className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-3 py-2 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none"
                            />
                            <input
                              type="text"
                              value={newStepUrl}
                              onChange={(e) => setNewStepUrl(e.target.value)}
                              placeholder="Link to SOP document (optional)"
                              onKeyDown={(e) => { if (e.key === 'Enter') handleAddStep(); }}
                              className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-3 py-2 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none"
                            />
                            <div className="flex gap-2">
                              <button onClick={handleAddStep} disabled={!newStepTitle.trim()} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors">
                                Add Step
                              </button>
                              <button onClick={() => { setShowAddStep(false); setNewStepTitle(''); setNewStepDesc(''); setNewStepUrl(''); }} className="rounded-lg border border-[var(--border-color)] px-4 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
                                Cancel
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* KPI section */}
                      <ProcessKpiSection processId={proc.id} isAdmin={isAdmin} />

                      {/* Recent executions */}
                      {expandedProcessData.executions?.length > 0 && (
                        <div className="mt-4">
                          <h4 className="text-xs font-semibold text-[var(--text-secondary)] uppercase mb-2">Recent Executions</h4>
                          <div className="space-y-1">
                            {expandedProcessData.executions.map((exec: any) => (
                              <div key={exec.id} className="flex items-center justify-between text-xs text-[var(--text-muted)] py-1">
                                <span>{new Date(exec.scheduledDate).toLocaleDateString()}</span>
                                <span>{exec.executedBy?.name || 'Unknown'}</span>
                                <span className={exec.task?.completedAt ? 'text-green-400' : 'text-yellow-400'}>
                                  {exec.task?.status || 'N/A'}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </details>
      ))}

      {/* Schedule Process Popup */}
      {schedulingProcess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setSchedulingProcess(null)}>
          <div className="w-full max-w-md rounded-xl border border-[var(--border-color)] bg-[var(--surface)] p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-[var(--text-primary)]">Schedule Process</h3>
              <button onClick={() => setSchedulingProcess(null)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mb-4">
              <p className="text-sm font-medium text-[var(--text-primary)]">{schedulingProcess.title}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${CADENCE_COLORS[schedulingProcess.cadence] || 'bg-[var(--surface-raised)] text-[var(--text-secondary)] border-[var(--border-color)]'}`}>
                  {schedulingProcess.cadence}
                </span>
                <span className="text-xs text-[var(--text-muted)]">{schedulingProcess.defaultDurationMinutes} min</span>
              </div>
            </div>

            <div className="space-y-4">
              {/* Day-of-week picker for WEEKLY / BIWEEKLY */}
              {(schedulingProcess.cadence === 'WEEKLY' || schedulingProcess.cadence === 'BIWEEKLY') && (
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Day of Week</label>
                  <div className="flex gap-1">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, i) => (
                      <button
                        key={day}
                        type="button"
                        onClick={() => setSchedDayOfWeek(i)}
                        className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition-colors ${
                          schedDayOfWeek === i
                            ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-600/30'
                            : 'text-[var(--text-secondary)] border border-[var(--border-color)] hover:border-[var(--glass-border)]'
                        }`}
                      >
                        {day}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Day-of-month picker for MONTHLY / QUARTERLY */}
              {(schedulingProcess.cadence === 'MONTHLY' || schedulingProcess.cadence === 'QUARTERLY') && (
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Day of Month</label>
                  <div className="flex flex-wrap gap-1">
                    {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setSchedDayOfMonth(d)}
                        className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors ${
                          schedDayOfMonth === d
                            ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-600/30'
                            : 'text-[var(--text-secondary)] border border-[var(--border-color)] hover:border-[var(--glass-border)]'
                        }`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Date picker for YEARLY / ONE_TIME */}
              {(schedulingProcess.cadence === 'YEARLY' || schedulingProcess.cadence === 'ONE_TIME') && (
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Date</label>
                  <input
                    type="date"
                    value={schedDate}
                    onChange={(e) => setSchedDate(e.target.value)}
                    className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-3 py-2 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              )}

              {/* Time picker — always shown */}
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Time</label>
                <input
                  type="time"
                  value={schedTime}
                  onChange={(e) => setSchedTime(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-3 py-2 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>

              {/* Duration display */}
              <div className="rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] p-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[var(--text-secondary)]">Duration</span>
                  <span className="text-[var(--text-primary)] font-medium">
                    {schedulingProcess.defaultDurationMinutes < 60
                      ? `${schedulingProcess.defaultDurationMinutes} min`
                      : schedulingProcess.defaultDurationMinutes % 60 === 0
                        ? `${schedulingProcess.defaultDurationMinutes / 60}h`
                        : `${Math.floor(schedulingProcess.defaultDurationMinutes / 60)}h ${schedulingProcess.defaultDurationMinutes % 60}m`}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={handleScheduleProcess}
                disabled={schedSaving || ((schedulingProcess.cadence === 'YEARLY' || schedulingProcess.cadence === 'ONE_TIME') && !schedDate)}
                className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
              >
                <Calendar className="h-4 w-4" />
                {schedSaving ? 'Scheduling...' : 'Schedule'}
              </button>
              <button
                onClick={() => setSchedulingProcess(null)}
                className="rounded-lg border border-[var(--border-color)] px-4 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
