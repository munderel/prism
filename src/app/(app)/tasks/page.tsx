'use client';

import { useState } from 'react';
import { ListTodo, Plus } from 'lucide-react';
import { DailyTaskList } from '@/components/tasks/DailyTaskList';
import { TaskEditor } from '@/components/tasks/TaskEditor';
import { TaskComments } from '@/components/tasks/TaskComments';

export default function TasksPage() {
  const today = new Date().toISOString().split('T')[0];
  const [date, setDate] = useState(today);
  const [showEditor, setShowEditor] = useState(false);
  const [editingTask, setEditingTask] = useState<any>(null);
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = () => {
    setRefreshKey((k) => k + 1);
    setShowEditor(false);
    setEditingTask(null);
  };

  const handleEdit = (task: any) => {
    setEditingTask(task);
    setShowEditor(true);
  };

  const handleDelete = async (taskId: string) => {
    if (!confirm('Delete this task?')) return;
    const res = await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
    if (res.ok) {
      if (selectedTask?.id === taskId) setSelectedTask(null);
      refresh();
    }
  };

  const handleTaskClick = async (task: any) => {
    // Fetch full task with comments
    const res = await fetch(`/api/tasks/${task.id}`);
    if (res.ok) {
      setSelectedTask(await res.json());
    }
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <ListTodo className="h-6 w-6 text-indigo-400" />
          Tasks
        </h1>
        <button
          onClick={() => { setEditingTask(null); setShowEditor(true); }}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Task
        </button>
      </div>

      {/* Filter bar */}
      <div className="mb-6 flex items-center gap-4">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
        />
        <button
          onClick={() => setDate(today)}
          className={`rounded-lg px-3 py-2 text-sm transition-colors ${
            date === today
              ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-600/30'
              : 'text-gray-400 border border-gray-700 hover:border-gray-600'
          }`}
        >
          Today
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Task list */}
        <div className="lg:col-span-2">
          <DailyTaskList
            date={date}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onClick={handleTaskClick}
            refreshKey={refreshKey}
          />
        </div>

        {/* Detail panel */}
        <div className="lg:col-span-1">
          {selectedTask ? (
            <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4 space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-white">{selectedTask.title}</h3>
                {selectedTask.description && (
                  <p className="text-sm text-gray-400 mt-1">{selectedTask.description}</p>
                )}
                <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                  <span>{selectedTask.taskType.replace('_', ' ')}</span>
                  <span>{selectedTask.priority}</span>
                  <span>{selectedTask.status.replace('_', ' ')}</span>
                </div>
              </div>
              <TaskComments taskId={selectedTask.id} />
            </div>
          ) : (
            <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-8 text-center">
              <p className="text-gray-600 text-sm">Select a task to view details and comments</p>
            </div>
          )}
        </div>
      </div>

      {/* Editor modal */}
      {showEditor && (
        <TaskEditor
          task={editingTask}
          onSave={refresh}
          onClose={() => { setShowEditor(false); setEditingTask(null); }}
        />
      )}
    </div>
  );
}
