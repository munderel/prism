'use client';

import { useState, useEffect, useMemo } from 'react';
import useSWR from 'swr';
import { useSession } from 'next-auth/react';
import dynamic from 'next/dynamic';
import { m } from 'framer-motion';
import { Building2, User, Users, Target, Filter, CalendarClock, Trash2, Calendar, HelpCircle, Zap, UserCog } from 'lucide-react';
import { CompanyStackAssignmentsModal } from '@/components/goals/CompanyStackAssignmentsModal';
import { getLocalDateString } from '@/lib/date-utils';
import { useToast } from '@/components/ui/ToastProvider';
import { GoalStackGuide } from '@/components/goals/GoalStackGuide';
import { ErrorBoundary } from '@/components/ErrorBoundary';

const GoalStackTree = dynamic(
  () => import('@/components/goals/GoalStackTree').then((mod) => ({ default: mod.GoalStackTree })),
  { loading: () => <div className="text-[var(--text-muted)] py-8 text-center">Loading...</div> }
);
import { YamlImportExport } from '@/components/goals/YamlImportExport';

export default function GoalsPage() {
  const toast = useToast();
  const { data: session } = useSession();
  const { data: stacksData, isLoading, mutate: mutateStacks } = useSWR('/api/stacks');
  const stacks = useMemo(() => (Array.isArray(stacksData) ? stacksData : []), [stacksData]);
  const [selectedStackId, setSelectedStackId] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newStackName, setNewStackName] = useState('');
  const [newStackVisibility, setNewStackVisibility] = useState<'private' | 'group' | 'company'>('private');
  const [showInProgress, setShowInProgress] = useState(false);
  const [showDueToday, setShowDueToday] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [viewTab, setViewTab] = useState<'stack' | 'daily'>('stack');
  const [assignmentsStack, setAssignmentsStack] = useState<{ id: string; name: string } | null>(null);

  // Fetch today's tasks for Daily Actions view
  const today = getLocalDateString();
  const { data: todayTasks } = useSWR(viewTab === 'daily' ? `/api/tasks?date=${today}&includeUnscheduled=true` : null);
  const dailyTasks = useMemo(() => (Array.isArray(todayTasks) ? todayTasks : []), [todayTasks]);

  const isAdmin = session?.user?.isAdmin ?? false;

  // Auto-select first stack when data loads
  useEffect(() => {
    if (stacks.length > 0 && !selectedStackId) {
      setSelectedStackId(stacks[0].id);
    }
  }, [stacks, selectedStackId]);

  // Show guide on first visit if not dismissed
  useEffect(() => {
    const dismissed = localStorage.getItem('prism-goal-stack-guide-dismissed');
    if (!dismissed) {
      setShowGuide(true);
    }
  }, []);

  const selectedStack = stacks.find((s) => s.id === selectedStackId);

  const handleSubmitCreate = async () => {
    const name = newStackName.trim();
    if (!name) return;

    const res = await fetch('/api/stacks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, visibility: newStackVisibility, isCompany: newStackVisibility === 'company' }),
    });

    if (res.ok) {
      const stack = await res.json();
      setNewStackName('');
      setNewStackVisibility('private');
      setShowCreateForm(false);
      await mutateStacks();
      setSelectedStackId(stack.id);
    } else {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error || 'Failed to create stack');
    }
  };

  const handleDeleteStack = async (stackId: string, stackName: string) => {
    const confirmed = window.confirm(
      `Delete stack '${stackName}'? This will remove all goals in this stack.`
    );
    if (!confirmed) return;

    const remaining = stacks.filter((s) => s.id !== stackId);
    const prevSelectedId = selectedStackId;

    // Optimistically remove from UI immediately
    mutateStacks(remaining, { revalidate: false });
    if (selectedStackId === stackId) {
      setSelectedStackId(remaining.length > 0 ? remaining[0].id : null);
    }

    const res = await fetch(`/api/stacks/${stackId}`, { method: 'DELETE' });
    if (res.ok) {
      toast.success(`Stack '${stackName}' deleted`);
    } else {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error || 'Failed to delete stack');
      // Revert optimistic update
      await mutateStacks();
      setSelectedStackId(prevSelectedId);
    }
  };

  const handleToggleWeekStart = async (stackId: string, current: number) => {
    const next = current === 0 ? 1 : 0;
    const res = await fetch(`/api/stacks/${stackId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weekStartDay: next }),
    });
    if (res.ok) {
      await mutateStacks();
    } else {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error || 'Failed to update week start day');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-[var(--text-muted)]">Loading stacks...</div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold text-[var(--text-primary)] flex items-center gap-2">
          <Target className="h-6 w-6 text-prism-indigo" />
          Goal Stack
          <button
            onClick={() => setShowGuide(true)}
            className="p-1 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)] transition-colors"
            aria-label="Goal Stack Guide"
            title="Goal Stack Guide"
          >
            <HelpCircle className="h-5 w-5" />
          </button>
        </h1>
        {selectedStack && (
          <YamlImportExport
            stackId={selectedStack.id}
            stackName={selectedStack.name}
            onImportComplete={mutateStacks}
          />
        )}
      </div>

      {/* View toggle: Stack vs Daily Actions */}
      <div className="mb-4 flex items-center gap-2">
        <button
          onClick={() => setViewTab('stack')}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
            viewTab === 'stack' ? 'bg-indigo-600 text-white' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          Goal Stack
        </button>
        <button
          onClick={() => setViewTab('daily')}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1 ${
            viewTab === 'daily' ? 'bg-indigo-600 text-white' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          <Zap className="h-3 w-3" /> Daily Actions
        </button>
      </div>

      {viewTab === 'daily' ? (
        <div className="space-y-3">
          <p className="text-sm text-[var(--text-muted)] mb-4">Today&apos;s tasks traced back to their parent goals.</p>
          {dailyTasks.length === 0 ? (
            <div className="glass-panel p-8 text-center">
              <p className="text-[var(--text-muted)]">No tasks for today. Plan your day in Power Down or Reviews.</p>
            </div>
          ) : (
            dailyTasks.map((task: any) => (
              <div key={task.id} className="glass-panel p-3">
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-medium ${task.status === 'DONE' ? 'text-gray-500 line-through' : 'text-[var(--text-primary)]'}`}>
                    {task.title}
                  </span>
                  {task.isWinTheDay && <span className="text-xs text-amber-400">★</span>}
                </div>
                {task.goal && (
                  <div className="mt-1 text-xs text-[var(--text-muted)] flex items-center gap-1.5">
                    <span className="text-indigo-400">↑</span>
                    <span>{task.goal.title}</span>
                    {task.goal.stack?.name && <span className="text-[var(--text-muted)]">· {task.goal.stack.name}</span>}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      ) : (
      <>
      {/* Stack tabs */}
      <div className="mb-6 flex items-center gap-2 overflow-x-auto pb-2">
        {stacks.map((stack) => {
          const isCompany = stack.visibility === 'company' || stack.isCompany;
          const isGroup = stack.visibility === 'group';
          const VisibilityIcon = isCompany ? Building2 : isGroup ? Users : User;

          return (
          <div key={stack.id} className="relative flex items-center group">
            <button
              onClick={() => setSelectedStackId(stack.id)}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
                selectedStackId === stack.id
                  ? 'bg-prism-indigo/15 text-prism-indigo border border-prism-indigo/25'
                  : 'text-[var(--text-secondary)] border border-[var(--border-color)] hover:border-white/[0.1] hover:text-[var(--text-primary)]'
              }`}
            >
              <VisibilityIcon className="h-4 w-4" />
              {stack.name}
              {isGroup && (
                <span className="text-[9px] bg-teal-500/20 text-teal-400 rounded px-1">Group</span>
              )}
              {isCompany && (
                <span className="text-[9px] bg-indigo-500/20 text-indigo-400 rounded px-1">Company</span>
              )}
              <span className="text-xs text-[var(--text-muted)]">({stack._count?.goals ?? 0})</span>
            </button>
            {isAdmin && isCompany && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setAssignmentsStack({ id: stack.id, name: stack.name });
                }}
                aria-label={`Manage assignments for '${stack.name}'`}
                title={`Manage assignments for '${stack.name}'`}
                className="ml-1 rounded p-1 text-[var(--text-muted)] opacity-0 group-hover:opacity-100 hover:text-indigo-400 hover:bg-indigo-400/10 transition-all"
              >
                <UserCog className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteStack(stack.id, stack.name);
              }}
              aria-label={`Delete stack '${stack.name}'`}
              title={`Delete stack '${stack.name}'`}
              className="ml-1 rounded p-1 text-[var(--text-muted)] opacity-0 group-hover:opacity-100 hover:text-red-400 hover:bg-red-400/10 transition-all"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
          );
        })}
        <button
          onClick={() => setShowCreateForm(true)}
          className="rounded-lg border border-dashed border-[var(--border-color)] px-4 py-2 text-sm text-[var(--text-muted)] hover:border-[var(--glass-border)] hover:text-[var(--text-secondary)] transition-colors"
        >
          + New Stack
        </button>
      </div>

      {/* Inline create form */}
      {showCreateForm && (
        <div className="mb-6 glass-panel p-4">
          <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3">Create New Stack</h3>
          <div className="flex items-center gap-3 flex-wrap">
            <input
              type="text"
              value={newStackName}
              onChange={(e) => setNewStackName(e.target.value)}
              placeholder="Stack name"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSubmitCreate();
                if (e.key === 'Escape') { setShowCreateForm(false); setNewStackName(''); }
              }}
              className="rounded-lg border border-white/[0.08] bg-[var(--hover-bg)] px-3 py-2 text-[var(--text-primary)] text-sm focus:border-prism-indigo focus:outline-none"
            />
            <div className="flex gap-1">
              {(['private', 'group', ...(isAdmin ? ['company'] : [])] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setNewStackVisibility(v as any)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    newStackVisibility === v
                      ? 'bg-indigo-600 text-white border border-indigo-600'
                      : 'text-[var(--text-secondary)] border border-[var(--border-color)]'
                  }`}
                >
                  {v === 'private' ? 'Personal' : v === 'group' ? 'Group' : 'Company'}
                </button>
              ))}
            </div>
            <button
              onClick={handleSubmitCreate}
              disabled={!newStackName.trim()}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
            >
              Create
            </button>
            <button
              onClick={() => { setShowCreateForm(false); setNewStackName(''); }}
              className="rounded-lg border border-[var(--border-color)] px-4 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      {selectedStack && (
        <div className="mb-4 flex items-center gap-2">
          <button
            onClick={() => { setShowInProgress(!showInProgress); if (!showInProgress) setShowDueToday(false); }}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              showInProgress
                ? 'bg-indigo-600 text-white border border-indigo-600'
                : 'text-[var(--text-secondary)] border border-[var(--border-color)] hover:border-white/[0.1]'
            }`}
          >
            <Filter className="h-3.5 w-3.5" />
            In Progress
          </button>
          <button
            onClick={() => { setShowDueToday(!showDueToday); if (!showDueToday) setShowInProgress(false); }}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              showDueToday
                ? 'bg-yellow-600/20 text-yellow-400 border border-yellow-600/30'
                : 'text-[var(--text-secondary)] border border-[var(--border-color)] hover:border-white/[0.1]'
            }`}
          >
            <CalendarClock className="h-3.5 w-3.5" />
            Due Today
          </button>
          <div className="ml-auto flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
            <Calendar className="h-3.5 w-3.5" />
            <span>Week starts:</span>
            <button
              onClick={() => handleToggleWeekStart(selectedStack.id, selectedStack.weekStartDay ?? 0)}
              className="rounded-md border border-[var(--border-color)] px-2 py-0.5 text-xs font-medium text-[var(--text-secondary)] hover:border-white/[0.1] hover:text-[var(--text-primary)] transition-colors"
            >
              {(selectedStack.weekStartDay ?? 0) === 0 ? 'Sun' : 'Mon'}
            </button>
          </div>
        </div>
      )}

      {/* Tree */}
      {selectedStack ? (
        <m.div
          key={selectedStackId}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
        >
          <ErrorBoundary>
            <GoalStackTree
              stackId={selectedStack.id}
              isCompanyStack={selectedStack.isCompany}
              isAdmin={isAdmin}
              showInProgress={showInProgress}
              showDueToday={showDueToday}
            />
          </ErrorBoundary>
        </m.div>
      ) : (
        <div className="text-center py-16">
          <p className="text-[var(--text-muted)] mb-4">
            No goal stacks yet. Create one to get started!
          </p>
          <button
            onClick={() => setShowCreateForm(true)}
            className="rounded-lg bg-indigo-600 px-6 py-3 text-sm font-medium text-white hover:bg-indigo-500 transition-colors"
          >
            Create Your First Stack
          </button>
        </div>
      )}

      </>
      )}

      {showGuide && <GoalStackGuide isOpen={showGuide} onClose={() => setShowGuide(false)} />}

      {assignmentsStack && (
        <CompanyStackAssignmentsModal
          goalStackId={assignmentsStack.id}
          stackName={assignmentsStack.name}
          onClose={() => setAssignmentsStack(null)}
        />
      )}
    </div>
  );
}
