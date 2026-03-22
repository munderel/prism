'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { LayoutDashboard, Plus, CheckCircle2, Clock, AlertTriangle, Zap } from 'lucide-react';
import { DailyTaskList } from '@/components/tasks/DailyTaskList';
import { TaskEditor } from '@/components/tasks/TaskEditor';

export default function DashboardPage() {
  const { data: session } = useSession();
  const today = new Date().toISOString().split('T')[0];
  const [stats, setStats] = useState({ total: 0, done: 0, urgent: 0, inProgress: 0 });
  const [showEditor, setShowEditor] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const fetchStats = async () => {
    const res = await fetch(`/api/tasks?date=${today}`);
    if (res.ok) {
      const tasks = await res.json();
      setStats({
        total: tasks.length,
        done: tasks.filter((t: any) => t.status === 'DONE').length,
        urgent: tasks.filter((t: any) => t.priority === 'URGENT').length,
        inProgress: tasks.filter((t: any) => t.status === 'IN_PROGRESS').length,
      });
    }
  };

  useEffect(() => {
    fetchStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const refresh = () => {
    setRefreshKey((k) => k + 1);
    setShowEditor(false);
  };

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
          onEdit={() => {}}
          onDelete={async (id) => {
            await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
            refresh();
          }}
          refreshKey={refreshKey}
        />
      </div>

      {showEditor && (
        <TaskEditor
          onSave={refresh}
          onClose={() => setShowEditor(false)}
        />
      )}
    </div>
  );
}
