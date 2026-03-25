'use client';

import { useCallback, useMemo, useState } from 'react';
import useSWR from 'swr';
import { Clock, CheckCircle2, Zap, AlertTriangle } from 'lucide-react';
import { DailyTaskList } from '@/components/tasks/DailyTaskList';
import { TaskEditor } from '@/components/tasks/TaskEditor';
import { DashboardGreeting } from '@/components/dashboard/DashboardGreeting';
import { PrismStatCard } from '@/components/dashboard/PrismStatCard';

export default function DashboardPage() {
  const today = new Date().toISOString().split('T')[0];
  const [showEditor, setShowEditor] = useState(false);
  const [editingTask, setEditingTask] = useState<any>(null);

  const { data: tasks, mutate } = useSWR(`/api/tasks?date=${today}&includeUnscheduled=true`);
  const list = useMemo(() => (Array.isArray(tasks) ? tasks : []), [tasks]);

  const stats = useMemo(() => ({
    total: list.length,
    done: list.filter((t: any) => t.status === 'DONE').length,
    urgent: list.filter((t: any) => t.priority === 'URGENT').length,
    inProgress: list.filter((t: any) => t.status === 'IN_PROGRESS').length,
  }), [list]);

  const refresh = useCallback(() => {
    mutate();
    setShowEditor(false);
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

  const statCards = [
    { label: 'Total Tasks', value: stats.total, icon: Clock, color: 'text-blue-400', glowColor: '#3b82f6' },
    { label: 'Completed', value: stats.done, icon: CheckCircle2, color: 'text-green-400', glowColor: '#22c55e' },
    { label: 'In Progress', value: stats.inProgress, icon: Zap, color: 'text-yellow-400', glowColor: '#eab308' },
    { label: 'Urgent', value: stats.urgent, icon: AlertTriangle, color: 'text-red-400', glowColor: '#ef4444' },
  ];

  return (
    <div>
      {/* Greeting + streak + quick add */}
      <DashboardGreeting onQuickAdd={() => setShowEditor(true)} />

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {statCards.map((card) => (
          <PrismStatCard key={card.label} {...card} />
        ))}
      </div>

      {/* Today's tasks */}
      <div className="mb-4">
        <h2 className="font-display text-lg font-semibold text-[var(--text-primary)] mb-4">Today&apos;s Tasks</h2>
        <DailyTaskList
          date={today}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onStatusChange={handleStatusChange}
        />
      </div>

      {showEditor && (
        <TaskEditor
          onSave={refresh}
          onClose={() => setShowEditor(false)}
        />
      )}

      {editingTask && (
        <TaskEditor
          task={editingTask}
          onSave={refresh}
          onClose={() => setEditingTask(null)}
        />
      )}
    </div>
  );
}
