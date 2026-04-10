'use client';

import { useState } from 'react';
import { m } from 'framer-motion';
import {
  CheckCircle2,
  Flame,
  RefreshCw,
  ListChecks,
  User,
  Calendar,
} from 'lucide-react';
import { StepsList } from './StepsList';
import { ProcessTasksList } from './ProcessTasksList';
import { ProcessKpiSection } from './ProcessKpiSection';
import { modeBadgeClasses } from '@/lib/process-constants';
import { expandVariants } from '@/lib/process-animations';
import { INPUT_CLASSES } from '@/lib/process-constants';
import type { ProcessData, UserOption } from '@/types/process';

interface ProcessDetailViewProps {
  proc: ProcessData;
  expandedData: any;
  processTasks: any[];
  isAdmin: boolean;
  userId: string | undefined;
  users: UserOption[];
  streak: number;
  completingProcessId: string | null;
  regeneratingId: string | null;
  creatingTasks: boolean;
  onCompleteProcess: (processId: string) => void;
  onRegenerateTasks: (processId: string) => void;
  onCreateTasksFromSteps: (proc: ProcessData) => void;
  onAddStep: (title: string, description: string | null, url: string | null) => Promise<void>;
  onEditStep: (stepId: string, title: string, description: string | null, url: string | null) => Promise<void>;
  onDeleteStep: (stepId: string) => void;
  onAddTask: (processId: string, title: string, parentId?: string) => Promise<void>;
  onDelegate: (processId: string, delegateUserId: string, delegateUntil: string) => Promise<void>;
}

export function ProcessDetailView({
  proc,
  expandedData,
  processTasks,
  isAdmin,
  userId,
  users,
  streak,
  completingProcessId,
  regeneratingId,
  creatingTasks,
  onCompleteProcess,
  onRegenerateTasks,
  onCreateTasksFromSteps,
  onAddStep,
  onEditStep,
  onDeleteStep,
  onAddTask,
  onDelegate,
}: ProcessDetailViewProps) {
  return (
    <m.div
      variants={expandVariants}
      initial="collapsed"
      animate="expanded"
      exit="collapsed"
      className="overflow-hidden"
    >
      <div className="border-t border-[var(--border-color)] px-4 pb-4 space-y-0">
        {/* Process metadata badges */}
        <div className="flex items-center gap-2 pt-3 pb-2">
          <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium leading-none ${modeBadgeClasses(proc.mode || 'BASIC')}`}
          >
            {proc.mode || 'BASIC'}
          </span>
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

        {/* Description */}
        {expandedData.description && (
          <p className="text-sm text-[var(--text-secondary)] pb-3">
            {expandedData.description}
          </p>
        )}

        {/* Delegate info banner */}
        {expandedData.delegate && (
          <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
            <p className="text-sm text-amber-700 dark:text-amber-300">
              Delegated to{' '}
              <span className="font-medium">
                {expandedData.delegate.name || expandedData.delegate.email}
              </span>
              {expandedData.delegateUntil && (
                <>
                  {' '}
                  until{' '}
                  {new Date(expandedData.delegateUntil).toLocaleDateString()}
                </>
              )}
            </p>
          </div>
        )}

        {/* Delegation section for assignee */}
        {proc.assigneeId === userId && (
          <DelegationSection
            processId={proc.id}
            users={users}
            onDelegate={onDelegate}
          />
        )}

        {/* SOP Steps */}
        <div className="border-t border-[var(--border-color)] pt-4">
          <StepsList
            steps={expandedData.steps || []}
            processId={proc.id}
            isAdmin={isAdmin}
            onAddStep={onAddStep}
            onEditStep={onEditStep}
            onDeleteStep={onDeleteStep}
          />
        </div>

        {/* Action buttons */}
        <div className="border-t border-[var(--border-color)] pt-4">
          <div className="flex flex-wrap gap-2">
            {/* BASIC mode: Mark Complete button */}
            {proc.mode !== 'ADVANCED' && (
              <button
                onClick={() => onCompleteProcess(proc.id)}
                disabled={completingProcessId === proc.id}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/40 px-3 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/25 transition-colors disabled:opacity-50"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                {completingProcessId === proc.id ? 'Saving...' : 'Mark Complete'}
              </button>
            )}

            {/* BASIC mode: Show streak */}
            {proc.mode !== 'ADVANCED' && streak > 0 && (
              <span className="flex items-center gap-1.5 rounded-lg bg-amber-500/15 border border-amber-500/40 px-3 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                <Flame className="h-3.5 w-3.5" />
                Streak: {streak} consecutive{' '}
                {proc.cadence.toLowerCase().replace('_', ' ')} completions
              </span>
            )}

            {/* ADVANCED mode: Regenerate button */}
            {proc.mode === 'ADVANCED' && (
              <button
                onClick={() => onRegenerateTasks(proc.id)}
                disabled={regeneratingId === proc.id}
                className="flex items-center gap-1.5 rounded-lg bg-blue-500/15 border border-blue-500/40 px-3 py-1.5 text-xs font-medium text-blue-700 dark:text-blue-400 hover:bg-blue-500/25 transition-colors disabled:opacity-50"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${regeneratingId === proc.id ? 'animate-spin' : ''}`}
                />
                {regeneratingId === proc.id
                  ? 'Regenerating...'
                  : 'Regenerate Tasks'}
              </button>
            )}

            {/* Manual create tasks from steps (BASIC mode only) */}
            {proc.mode !== 'ADVANCED' &&
              expandedData.steps?.length > 0 && (
                <button
                  onClick={() => onCreateTasksFromSteps(proc)}
                  disabled={creatingTasks}
                  className="flex items-center gap-1.5 rounded-lg bg-cyan-500/15 border border-cyan-500/40 px-3 py-1.5 text-xs font-medium text-cyan-700 dark:text-cyan-400 hover:bg-cyan-500/25 transition-colors disabled:opacity-50"
                >
                  <ListChecks className="h-3.5 w-3.5" />
                  {creatingTasks ? 'Creating...' : 'Create tasks from steps'}
                </button>
              )}
          </div>
        </div>

        {/* Current Tasks */}
        <div className="border-t border-[var(--border-color)] pt-4">
          <ProcessTasksList
            tasks={Array.isArray(processTasks) ? processTasks : []}
            processId={proc.id}
            onAddTask={onAddTask}
          />
        </div>

        {/* KPIs */}
        <div className="border-t border-[var(--border-color)] pt-4">
          <ProcessKpiSection processId={proc.id} isAdmin={isAdmin} />
        </div>

        {/* Recent Executions */}
        {expandedData.executions?.length > 0 && (
          <div className="border-t border-[var(--border-color)] pt-4">
            <h4 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
              Recent Executions
            </h4>
            <div className="space-y-1">
              {expandedData.executions.map((exec: any) => (
                <div
                  key={exec.id}
                  className="flex items-center justify-between text-xs text-[var(--text-muted)] py-1"
                >
                  <span>
                    {new Date(exec.scheduledDate).toLocaleDateString()}
                  </span>
                  <span>{exec.executedBy?.name || 'Unknown'}</span>
                  <span
                    className={
                      exec.task?.completedAt
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-amber-600 dark:text-yellow-400'
                    }
                  >
                    {exec.task?.status || 'N/A'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </m.div>
  );
}

// ── Delegation sub-component ──

function DelegationSection({
  processId,
  users,
  onDelegate,
}: {
  processId: string;
  users: UserOption[];
  onDelegate: (processId: string, userId: string, until: string) => Promise<void>;
}) {
  const [delegateUserId, setDelegateUserId] = useState('');
  const [delegateUntil, setDelegateUntil] = useState('');

  return (
    <div className="mb-3 rounded-lg border border-[var(--border-color)] bg-[var(--surface)] p-3">
      <h4 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
        Delegate This Process
      </h4>
      <div className="flex items-center gap-2">
        <select
          value={delegateUserId}
          onChange={(e) => setDelegateUserId(e.target.value)}
          className={INPUT_CLASSES}
        >
          <option value="">No delegate</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name || u.email}
            </option>
          ))}
        </select>
        <div className="flex flex-col">
          <label className="text-xs text-[var(--text-secondary)] mb-0.5">
            Delegate until
          </label>
          <input
            type="date"
            value={delegateUntil}
            onChange={(e) => setDelegateUntil(e.target.value)}
            className={INPUT_CLASSES}
          />
        </div>
        <button
          onClick={() => onDelegate(processId, delegateUserId, delegateUntil)}
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 transition-colors"
        >
          Save
        </button>
      </div>
    </div>
  );
}

