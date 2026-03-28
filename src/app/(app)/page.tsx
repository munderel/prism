'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { Clock, CheckCircle2, Zap, Focus, AlertTriangle } from 'lucide-react';
import { DailyTaskList } from '@/components/tasks/DailyTaskList';
import { TaskEditor } from '@/components/tasks/TaskEditor';
import { DashboardGreeting } from '@/components/dashboard/DashboardGreeting';
import { PrismStatCard } from '@/components/dashboard/PrismStatCard';
import { WinTheDayCard } from '@/components/dashboard/WinTheDayCard';
import { WinTheDayCelebration } from '@/components/dopamine/WinTheDayCelebration';
import { FocusView } from '@/components/dashboard/FocusView';
import type { DerailInfo } from '@/lib/derail-detection';

interface DerailBatchResponse {
  [aimCategoryId: string]: {
    derailInfo: DerailInfo;
    history: { date: string; completed: boolean; status: string }[];
    expectedPerDay: number;
  };
}

const FOCUS_MODE_KEY = 'prism-focus-mode';

export default function DashboardPage() {
  const today = useMemo(() => new Date().toISOString().split('T')[0], []);
  const [editingTask, setEditingTask] = useState<any | 'new' | null>(null);
  const [focusMode, setFocusMode] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(FOCUS_MODE_KEY);
    if (stored === 'true') setFocusMode(true);
  }, []);

  const toggleFocusMode = () => {
    setFocusMode((prev) => {
      const next = !prev;
      localStorage.setItem(FOCUS_MODE_KEY, String(next));
      return next;
    });
  };

  const [showWinCelebration, setShowWinCelebration] = useState(false);

  const { data: tasks, mutate } = useSWR(`/api/tasks?date=${today}&includeUnscheduled=true`, { revalidateOnFocus: true });
  const list = useMemo(() => (Array.isArray(tasks) ? tasks : []), [tasks]);

  // Batch-fetch derail info for ALL active aims in one request (eliminates N+1 waterfall)
  const { data: derailBatch } = useSWR<DerailBatchResponse>('/api/aims/derail-batch?days=14');

  const winTheDayTask = useMemo(() => list.find((t: any) => t.isWinTheDay) ?? null, [list]);

  const prevWtdStatusRef = useRef<string | null>(null);
  useEffect(() => {
    if (winTheDayTask) {
      if (prevWtdStatusRef.current && prevWtdStatusRef.current !== 'DONE' && winTheDayTask.status === 'DONE') {
        setShowWinCelebration(true);
      }
      prevWtdStatusRef.current = winTheDayTask.status;
    }
  }, [winTheDayTask]);

  const stats = useMemo(() => ({
    total: list.length,
    done: list.filter((t: any) => t.status === 'DONE').length,
    inProgress: list.filter((t: any) => t.status === 'IN_PROGRESS').length,
  }), [list]);

  const refresh = useCallback(() => {
    mutate();
    setEditingTask(null);
  }, [mutate]);

  const handleEdit = useCallback((task: any) => {
    setEditingTask(task);
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
    mutate();
  }, [mutate]);

  const handleStatusChange = useCallback(() => {
    mutate();
  }, [mutate]);

  const handleFocusStatusChange = useCallback(async (taskId: string, newStatus: string) => {
    await fetch(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    mutate();
  }, [mutate]);

  const statCards = [
    { label: 'Total Tasks', value: stats.total, icon: Clock, color: 'text-blue-400', glowColor: '#3b82f6' },
    { label: 'Completed', value: stats.done, icon: CheckCircle2, color: 'text-green-400', glowColor: '#22c55e' },
    { label: 'In Progress', value: stats.inProgress, icon: Zap, color: 'text-yellow-400', glowColor: '#eab308' },
  ];

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <button
          onClick={toggleFocusMode}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
            focusMode
              ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-600/30'
              : 'text-[var(--text-secondary)] border border-[var(--border-color)] hover:border-white/[0.1]'
          }`}
        >
          <Focus className="h-3.5 w-3.5" />
          {focusMode ? 'Full View' : 'Focus Mode'}
        </button>
      </div>

      {/* Derailing aims alert banner */}
      {derailBatch && <DerailAlertBanner derailBatch={derailBatch} />}

      {focusMode ? (
        <>
          <WinTheDayCard task={winTheDayTask} />
          <WinTheDayCelebration show={showWinCelebration} onComplete={() => setShowWinCelebration(false)} />
          <div className="mt-4">
            <FocusView tasks={list} onStatusChange={handleFocusStatusChange} />
          </div>
        </>
      ) : (
        <>
          <DashboardGreeting onQuickAdd={() => setEditingTask('new')} />

          <div className="grid grid-cols-3 gap-4 mb-8">
            {statCards.map((card) => (
              <PrismStatCard key={card.label} {...card} />
            ))}
          </div>

          <WinTheDayCard task={winTheDayTask} />
          <WinTheDayCelebration show={showWinCelebration} onComplete={() => setShowWinCelebration(false)} />

          <div className="mb-4">
            <h2 className="font-display text-lg font-semibold text-[var(--text-primary)] mb-4">Today&apos;s Tasks</h2>
            <DailyTaskList
              date={today}
              prefetchedTasks={list}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onStatusChange={handleStatusChange}
            />
          </div>
        </>
      )}

      {editingTask && (
        <TaskEditor
          task={editingTask === 'new' ? undefined : editingTask}
          onSave={refresh}
          onClose={() => setEditingTask(null)}
        />
      )}
    </div>
  );
}

// ---- Derail Alert Banner ----

/**
 * Shows a banner if any active aims need attention.
 * Receives the already-fetched batch derail data from the parent (single SWR call).
 */
function DerailAlertBanner({ derailBatch }: { derailBatch: DerailBatchResponse }) {
  const needsAttention = Object.values(derailBatch)
    .map((entry) => entry.derailInfo)
    .filter((d) => d.status === 'caution' || d.status === 'derailing');

  if (needsAttention.length === 0) return null;

  return (
    <Link
      href="/aims"
      className="mb-4 flex items-center gap-2 rounded-lg border border-yellow-600/30 bg-yellow-600/10 px-4 py-2.5 text-sm text-yellow-400 hover:bg-yellow-600/20 transition-colors"
    >
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span>
        {needsAttention.length} aim{needsAttention.length !== 1 ? 's' : ''} need{needsAttention.length === 1 ? 's' : ''} attention
        {(() => {
          const derailingCount = needsAttention.filter((d) => d.status === 'derailing').length;
          const cautionCount = needsAttention.filter((d) => d.status === 'caution').length;
          const parts: string[] = [];
          if (derailingCount > 0) parts.push(`${derailingCount} derailing`);
          if (cautionCount > 0) parts.push(`${cautionCount} needs caution`);
          return parts.length > 0 ? <span className="text-yellow-500/70"> ({parts.join(', ')})</span> : null;
        })()}
      </span>
    </Link>
  );
}
