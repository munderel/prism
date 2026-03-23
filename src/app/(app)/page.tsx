'use client';

import { useCallback, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import useSWR from 'swr';
import { LayoutDashboard, Plus, CheckCircle2, Clock, AlertTriangle, Zap } from 'lucide-react';
import { DailyTaskList } from '@/components/tasks/DailyTaskList';
import { TaskEditor } from '@/components/tasks/TaskEditor';
import { useState } from 'react';

export default function DashboardPage() {
  const { data: session } = useSession();
  const today = new Date().toISOString().split('T')[0];
  const [showEditor, setShowEditor] = useState(false);
  const [editingTask, setEditingTask] = useState<any>(null);

  const { data: tasks, mutate } = useSWR(`/api/tasks?date=${today}`);
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
    { label: 'Total Tasks', value: stats.total, icon: Clock, color: 'text-blue-400' },
    { label: 'Completed', value: stats.done, icon: CheckCircle2, color: 'text-green-400' },
    { label: 'In Progress', value: stats.inProgress, icon: Zap, color: 'text-yellow-400' },
    { label: 'Urgent', value: stats.urgent, icon: AlertTriangle, color: 'text-red-400' },
  ];

  return (
    <div>
      {/* Welcome header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <LayoutDashboard className="h-6 w-6 text-indigo-400" />
            Dashboard
          </h1>
          <p className="text-gray-500 mt-1">
            Welcome back{session?.user?.name ? `, ${session.user.name}` : ''}. Here&apos;s your day.
          </p>
        </div>
        <button
          onClick={() => setShowEditor(true)}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Quick Add
        </button>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {statCards.map(({ label, value, icon: Icon, color }) => (
          <div
            key={label}
            className="rounded-xl border border-gray-800 bg-gray-900/50 p-4"
          >
            <div className="flex items-center gap-2 mb-2">
              <Icon className={`h-4 w-4 ${color}`} />
              <span className="text-xs text-gray-500">{label}</span>
            </div>
            <span className="text-2xl font-bold text-white">{value}</span>
          </div>
        ))}
      </div>

      {/* Today's tasks */}
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-white mb-4">Today&apos;s Tasks</h2>
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
