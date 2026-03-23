'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { useSession } from 'next-auth/react';
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

  const { data: functionsData, isLoading: loading, mutate: mutateFunctions } = useSWR('/api/processes');
  const functions = Array.isArray(functionsData) ? functionsData as BusinessFunction[] : [];
  const { data: usersData } = useSWR(isAdmin ? '/api/admin' : null);
  const users = Array.isArray(usersData) ? usersData as UserOption[] : [];

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

  // Delegation
  const [delegateUserId, setDelegateUserId] = useState('');
  const [delegateUntil, setDelegateUntil] = useState('');

  // Import
  const [showImport, setShowImport] = useState(false);
  const [importJson, setImportJson] = useState('');
  const [importError, setImportError] = useState('');


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
      }),
    });
    if (res.ok) {
      setNewProcTitle('');
      setNewProcDesc('');
      setNewProcCadence('WEEKLY');
      setNewProcAssignee('');
      setAddingProcessFnId(null);
      mutateFunctions();
    } else {
      const data = await res.json().catch(() => ({}));
      alert(data.error || 'Failed to create process');
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500">Loading processes...</div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <ListChecks className="h-6 w-6 text-indigo-400" />
          Processes
        </h1>
        {isAdmin && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowImport(!showImport)}
              className="flex items-center gap-2 rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
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
          </div>
        )}
      </div>

      {/* Import JSON panel */}
      {showImport && isAdmin && (
        <div className="mb-6 rounded-xl border border-gray-800 bg-gray-900/50 p-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-white">Import from JSON</h3>
            <button onClick={() => { setShowImport(false); setImportError(''); }} className="text-gray-500 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>
          <textarea
            value={importJson}
            onChange={(e) => setImportJson(e.target.value)}
            placeholder='{"functions": [{"name": "Marketing", "processes": [...]}]}'
            rows={8}
            className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white text-sm focus:border-indigo-500 focus:outline-none font-mono"
          />
          {importError && <p className="mt-2 text-sm text-red-400">{importError}</p>}
          <div className="mt-3 flex gap-2">
            <button onClick={handleImport} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 transition-colors">
              Import
            </button>
            <button onClick={() => { setShowImport(false); setImportJson(''); setImportError(''); }} className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Add Function form */}
      {showAddFunction && isAdmin && (
        <div className="mb-6 rounded-xl border border-gray-800 bg-gray-900/50 p-4">
          <h3 className="text-sm font-semibold text-white mb-3">New Business Function</h3>
          <div className="space-y-3">
            <input
              type="text"
              value={newFnName}
              onChange={(e) => setNewFnName(e.target.value)}
              placeholder="Function name"
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddFunction(); if (e.key === 'Escape') setShowAddFunction(false); }}
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white text-sm focus:border-indigo-500 focus:outline-none"
            />
            <input
              type="text"
              value={newFnDesc}
              onChange={(e) => setNewFnDesc(e.target.value)}
              placeholder="Description (optional)"
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddFunction(); }}
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white text-sm focus:border-indigo-500 focus:outline-none"
            />
            <div className="flex gap-2">
              <button onClick={handleAddFunction} disabled={!newFnName.trim()} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors">
                Create
              </button>
              <button onClick={() => { setShowAddFunction(false); setNewFnName(''); setNewFnDesc(''); }} className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {functions.length === 0 && (
        <div className="text-center py-16">
          <ListChecks className="h-12 w-12 text-gray-700 mx-auto mb-4" />
          <p className="text-gray-500 mb-2">No business functions yet.</p>
          <p className="text-gray-600 text-sm">
            {isAdmin ? 'Create a function to start defining your SOPs and processes.' : 'Ask an admin to set up business functions and processes.'}
          </p>
        </div>
      )}

      {/* Functions list */}
      {functions.map((fn) => (
        <details key={fn.id} className="mb-4 rounded-xl border border-gray-800 bg-gray-900/50 overflow-hidden" open>
          <summary className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-800/50 transition-colors list-none">
            <div className="flex items-center gap-3">
              <ChevronRight className="h-4 w-4 text-gray-500 details-open-rotate" />
              <div>
                {editingFnId === fn.id ? (
                  <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    <input
                      value={editFnName}
                      onChange={(e) => setEditFnName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleEditFunction(fn.id); if (e.key === 'Escape') setEditingFnId(null); }}
                      className="rounded-lg border border-gray-700 bg-gray-800 px-2 py-1 text-white text-sm focus:border-indigo-500 focus:outline-none"
                      autoFocus
                    />
                    <input
                      value={editFnDesc}
                      onChange={(e) => setEditFnDesc(e.target.value)}
                      placeholder="Description"
                      onKeyDown={(e) => { if (e.key === 'Enter') handleEditFunction(fn.id); }}
                      className="rounded-lg border border-gray-700 bg-gray-800 px-2 py-1 text-white text-sm focus:border-indigo-500 focus:outline-none"
                    />
                    <button onClick={(e) => { e.stopPropagation(); handleEditFunction(fn.id); }} className="text-indigo-400 hover:text-indigo-300 text-sm">Save</button>
                    <button onClick={(e) => { e.stopPropagation(); setEditingFnId(null); }} className="text-gray-500 hover:text-white text-sm">Cancel</button>
                  </div>
                ) : (
                  <>
                    <h2 className="text-white font-semibold">{fn.name}</h2>
                    {fn.description && <p className="text-gray-500 text-sm">{fn.description}</p>}
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-600">{fn.processes.length} process{fn.processes.length !== 1 ? 'es' : ''}</span>
              {isAdmin && editingFnId !== fn.id && (
                <>
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditingFnId(fn.id); setEditFnName(fn.name); setEditFnDesc(fn.description || ''); }}
                    className="rounded p-1 text-gray-500 hover:text-white hover:bg-gray-700 transition-colors"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteFunction(fn.id); }}
                    className="rounded p-1 text-gray-500 hover:text-red-400 hover:bg-gray-700 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </div>
          </summary>

          <div className="border-t border-gray-800 p-4">
            {/* Add process button */}
            {isAdmin && addingProcessFnId !== fn.id && (
              <button
                onClick={() => setAddingProcessFnId(fn.id)}
                className="mb-4 flex items-center gap-1 rounded-lg border border-dashed border-gray-700 px-3 py-2 text-sm text-gray-500 hover:border-gray-600 hover:text-gray-400 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Process
              </button>
            )}

            {/* Add process form */}
            {addingProcessFnId === fn.id && (
              <div className="mb-4 rounded-lg border border-gray-700 bg-gray-800/50 p-4">
                <h4 className="text-sm font-medium text-white mb-3">New Process</h4>
                <div className="space-y-2">
                  <input
                    type="text"
                    value={newProcTitle}
                    onChange={(e) => setNewProcTitle(e.target.value)}
                    placeholder="Process title"
                    autoFocus
                    className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white text-sm focus:border-indigo-500 focus:outline-none"
                  />
                  <input
                    type="text"
                    value={newProcDesc}
                    onChange={(e) => setNewProcDesc(e.target.value)}
                    placeholder="Description (optional)"
                    className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white text-sm focus:border-indigo-500 focus:outline-none"
                  />
                  <div className="flex gap-2">
                    <select
                      value={newProcCadence}
                      onChange={(e) => setNewProcCadence(e.target.value)}
                      className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white text-sm focus:border-indigo-500 focus:outline-none"
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
                      className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white text-sm focus:border-indigo-500 focus:outline-none"
                    >
                      <option value="">Unassigned</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>{u.name || u.email}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button onClick={() => handleAddProcess(fn.id)} disabled={!newProcTitle.trim()} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors">
                      Create
                    </button>
                    <button onClick={() => { setAddingProcessFnId(null); setNewProcTitle(''); setNewProcDesc(''); }} className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Process cards */}
            {fn.processes.length === 0 && (
              <p className="text-gray-600 text-sm py-2">No processes in this function yet.</p>
            )}

            <div className="space-y-2">
              {fn.processes.map((proc) => (
                <div key={proc.id} className="rounded-lg border border-gray-800 bg-gray-900/80">
                  {/* Process card header */}
                  <div
                    className="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-800/30 transition-colors"
                    onClick={() => toggleProcess(proc.id)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {expandedProcessId === proc.id ? (
                        <ChevronDown className="h-4 w-4 text-gray-500 shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-gray-500 shrink-0" />
                      )}
                      <div className="min-w-0">
                        <h3 className="text-sm font-medium text-white truncate">{proc.title}</h3>
                        <div className="flex items-center gap-2 mt-0.5">
                          {proc.assignee && (
                            <span className="flex items-center gap-1 text-xs text-gray-500">
                              <User className="h-3 w-3" />
                              {proc.assignee.name || proc.assignee.email}
                            </span>
                          )}
                          {proc.nextDueAt && (
                            <span className="flex items-center gap-1 text-xs text-gray-500">
                              <Calendar className="h-3 w-3" />
                              {new Date(proc.nextDueAt).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${CADENCE_COLORS[proc.cadence] || 'bg-gray-800 text-gray-400 border-gray-700'}`}>
                        {proc.cadence}
                      </span>
                      <span className="text-xs text-gray-600">{proc._count.steps} step{proc._count.steps !== 1 ? 's' : ''}</span>
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
                            }}
                            className="rounded p-1 text-gray-500 hover:text-white hover:bg-gray-700 transition-colors"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteProcess(proc.id); }}
                            className="rounded p-1 text-gray-500 hover:text-red-400 hover:bg-gray-700 transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Edit process form */}
                  {editingProcessId === proc.id && (
                    <div className="border-t border-gray-800 p-4" onClick={(e) => e.stopPropagation()}>
                      <h4 className="text-sm font-medium text-white mb-3">Edit Process</h4>
                      <div className="space-y-2">
                        <input
                          type="text"
                          value={editProcTitle}
                          onChange={(e) => setEditProcTitle(e.target.value)}
                          className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white text-sm focus:border-indigo-500 focus:outline-none"
                        />
                        <input
                          type="text"
                          value={editProcDesc}
                          onChange={(e) => setEditProcDesc(e.target.value)}
                          placeholder="Description"
                          className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white text-sm focus:border-indigo-500 focus:outline-none"
                        />
                        <div className="flex gap-2">
                          <select
                            value={editProcCadence}
                            onChange={(e) => setEditProcCadence(e.target.value)}
                            className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white text-sm focus:border-indigo-500 focus:outline-none"
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
                            className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white text-sm focus:border-indigo-500 focus:outline-none"
                          >
                            <option value="">Unassigned</option>
                            {users.map((u) => (
                              <option key={u.id} value={u.id}>{u.name || u.email}</option>
                            ))}
                          </select>
                        </div>
                        <div className="flex gap-2 pt-1">
                          <button onClick={() => handleEditProcess(proc.id)} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 transition-colors">
                            Save
                          </button>
                          <button onClick={() => setEditingProcessId(null)} className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">
                            Cancel
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Expanded process detail */}
                  {expandedProcessId === proc.id && expandedProcessData && (
                    <div className="border-t border-gray-800 p-4">
                      {/* Description */}
                      {expandedProcessData.description && (
                        <p className="text-sm text-gray-400 mb-4">{expandedProcessData.description}</p>
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
                        <div className="mb-4 rounded-lg border border-gray-700 bg-gray-800/50 p-3">
                          <h4 className="text-xs font-semibold text-gray-400 uppercase mb-2">Delegate This Process</h4>
                          <div className="flex items-center gap-2">
                            <select
                              value={delegateUserId}
                              onChange={(e) => setDelegateUserId(e.target.value)}
                              className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-white text-sm focus:border-indigo-500 focus:outline-none"
                            >
                              <option value="">No delegate</option>
                              {users.map((u) => (
                                <option key={u.id} value={u.id}>{u.name || u.email}</option>
                              ))}
                            </select>
                            <div className="flex flex-col">
                              <label className="text-xs text-gray-400 mb-0.5">Delegate until</label>
                              <input
                                type="date"
                                value={delegateUntil}
                                onChange={(e) => setDelegateUntil(e.target.value)}
                                className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-white text-sm focus:border-indigo-500 focus:outline-none"
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
                        <h4 className="text-xs font-semibold text-gray-400 uppercase">SOP Steps</h4>
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
                        <p className="text-sm text-gray-600 py-2">No steps defined yet.</p>
                      )}

                      <ol className="space-y-2">
                        {expandedProcessData.steps?.map((step: Step, idx: number) => (
                          <li key={step.id} className="flex items-start gap-3 rounded-lg border border-gray-800 bg-gray-900/50 p-3">
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-600/20 text-xs font-medium text-indigo-400">
                              {idx + 1}
                            </span>
                            {editingStepId === step.id ? (
                              <div className="flex-1 space-y-2">
                                <input
                                  value={editStepTitle}
                                  onChange={(e) => setEditStepTitle(e.target.value)}
                                  onKeyDown={(e) => { if (e.key === 'Enter') handleEditStep(step.id); if (e.key === 'Escape') setEditingStepId(null); }}
                                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-2 py-1 text-white text-sm focus:border-indigo-500 focus:outline-none"
                                  autoFocus
                                />
                                <input
                                  value={editStepDesc}
                                  onChange={(e) => setEditStepDesc(e.target.value)}
                                  placeholder="Description"
                                  onKeyDown={(e) => { if (e.key === 'Enter') handleEditStep(step.id); }}
                                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-2 py-1 text-white text-sm focus:border-indigo-500 focus:outline-none"
                                />
                                <input
                                  value={editStepUrl}
                                  onChange={(e) => setEditStepUrl(e.target.value)}
                                  placeholder="Link to SOP document (optional)"
                                  onKeyDown={(e) => { if (e.key === 'Enter') handleEditStep(step.id); }}
                                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-2 py-1 text-white text-sm focus:border-indigo-500 focus:outline-none"
                                />
                                <div className="flex gap-2">
                                  <button onClick={() => handleEditStep(step.id)} className="text-xs text-indigo-400 hover:text-indigo-300">Save</button>
                                  <button onClick={() => setEditingStepId(null)} className="text-xs text-gray-500 hover:text-white">Cancel</button>
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
                                  <p className="text-sm text-white">{step.title}</p>
                                )}
                                {step.description && <p className="text-xs text-gray-500 mt-0.5">{step.description}</p>}
                              </div>
                            )}
                            {isAdmin && editingStepId !== step.id && (
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  onClick={() => { setEditingStepId(step.id); setEditStepTitle(step.title); setEditStepDesc(step.description || ''); setEditStepUrl(step.url || ''); }}
                                  className="rounded p-1 text-gray-500 hover:text-white hover:bg-gray-700 transition-colors"
                                >
                                  <Pencil className="h-3 w-3" />
                                </button>
                                <button
                                  onClick={() => handleDeleteStep(step.id)}
                                  className="rounded p-1 text-gray-500 hover:text-red-400 hover:bg-gray-700 transition-colors"
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
                        <div className="mt-3 rounded-lg border border-gray-700 bg-gray-800/50 p-3">
                          <div className="space-y-2">
                            <input
                              type="text"
                              value={newStepTitle}
                              onChange={(e) => setNewStepTitle(e.target.value)}
                              placeholder="Step title"
                              autoFocus
                              onKeyDown={(e) => { if (e.key === 'Enter') handleAddStep(); if (e.key === 'Escape') setShowAddStep(false); }}
                              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white text-sm focus:border-indigo-500 focus:outline-none"
                            />
                            <input
                              type="text"
                              value={newStepDesc}
                              onChange={(e) => setNewStepDesc(e.target.value)}
                              placeholder="Description (optional)"
                              onKeyDown={(e) => { if (e.key === 'Enter') handleAddStep(); }}
                              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white text-sm focus:border-indigo-500 focus:outline-none"
                            />
                            <input
                              type="text"
                              value={newStepUrl}
                              onChange={(e) => setNewStepUrl(e.target.value)}
                              placeholder="Link to SOP document (optional)"
                              onKeyDown={(e) => { if (e.key === 'Enter') handleAddStep(); }}
                              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white text-sm focus:border-indigo-500 focus:outline-none"
                            />
                            <div className="flex gap-2">
                              <button onClick={handleAddStep} disabled={!newStepTitle.trim()} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors">
                                Add Step
                              </button>
                              <button onClick={() => { setShowAddStep(false); setNewStepTitle(''); setNewStepDesc(''); setNewStepUrl(''); }} className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">
                                Cancel
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Recent executions */}
                      {expandedProcessData.executions?.length > 0 && (
                        <div className="mt-4">
                          <h4 className="text-xs font-semibold text-gray-400 uppercase mb-2">Recent Executions</h4>
                          <div className="space-y-1">
                            {expandedProcessData.executions.map((exec: any) => (
                              <div key={exec.id} className="flex items-center justify-between text-xs text-gray-500 py-1">
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
    </div>
  );
}
