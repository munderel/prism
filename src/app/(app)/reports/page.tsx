'use client';

import { Fragment, useState, useMemo, type ReactNode } from 'react';
import useSWR from 'swr';
import {
  FileText,
  Download,
  ChevronDown,
  ChevronRight,
  Calendar,
  BarChart3,
  Target,
  CheckSquare,
} from 'lucide-react';

import { getLocalDateString, formatDisplayDate } from '@/lib/date-utils';

type Tab = 'reviews' | 'tasks' | 'aims' | 'goals';

interface Review {
  id: string;
  reviewType: string;
  scheduledDate: string;
  completedAt: string | null;
  notes?: string;
  answers?: { question: string; answer: string }[];
}

interface Task {
  id: string;
  title: string;
  taskType: string;
  status: string;
  priority: string;
  completedAt: string | null;
}

function downloadFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function buildCSV(headers: string[], rows: string[][]): string {
  const escape = (v: string) => {
    if (v.includes(',') || v.includes('"') || v.includes('\n')) {
      return `"${v.replace(/"/g, '""')}"`;
    }
    return v;
  };
  const lines = [headers.map(escape).join(',')];
  for (const row of rows) {
    lines.push(row.map(escape).join(','));
  }
  return lines.join('\n');
}

const STATUS_LABELS: Record<string, string> = {
  TODO: 'To Do',
  IN_PROGRESS: 'In Progress',
  DONE: 'Completed',
  DROPPED: 'Dropped',
};

const PRIORITY_LABELS: Record<string, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  URGENT: 'Urgent',
};

function statusBadgeClass(status: string): string {
  if (status === 'DONE') return 'bg-green-500/15 text-green-400';
  if (status === 'IN_PROGRESS') return 'bg-indigo-500/15 text-indigo-400';
  return 'bg-[var(--hover-bg)] text-[var(--text-secondary)]';
}

function priorityBadgeClass(priority: string): string {
  if (priority === 'URGENT' || priority === 'HIGH') return 'bg-red-500/15 text-red-400';
  if (priority === 'MEDIUM') return 'bg-yellow-500/15 text-yellow-400';
  return 'bg-[var(--hover-bg)] text-[var(--text-secondary)]';
}

export default function ReportsExportPage() {
  const [activeTab, setActiveTab] = useState<Tab>('reviews');
  const thirtyDaysAgo = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return getLocalDateString(d);
  }, []);
  const [from, setFrom] = useState(thirtyDaysAgo);
  const [to, setTo] = useState(getLocalDateString(new Date()));

  const tabs: { key: Tab; label: string; icon: ReactNode }[] = [
    { key: 'reviews', label: 'Reviews', icon: <FileText className="h-4 w-4" /> },
    { key: 'tasks', label: 'Tasks', icon: <CheckSquare className="h-4 w-4" /> },
    { key: 'aims', label: 'AIMs', icon: <Target className="h-4 w-4" /> },
    { key: 'goals', label: 'Goals', icon: <BarChart3 className="h-4 w-4" /> },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-[var(--text-primary)]">Reports &amp; Export</h1>

      {/* Tab bar */}
      <div className="mb-6 flex gap-1 rounded-lg border border-[var(--border-color)] bg-[var(--hover-bg)] p-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'bg-[var(--card-bg)] text-[var(--text-primary)] shadow-sm'
                : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Date range picker */}
      <div className="mb-6 flex items-center gap-3">
        <Calendar className="h-4 w-4 text-[var(--text-muted)]" />
        <label className="text-sm text-[var(--text-secondary)]">From</label>
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="rounded-md border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-1.5 text-sm text-[var(--text-primary)] focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <label className="text-sm text-[var(--text-secondary)]">To</label>
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="rounded-md border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-1.5 text-sm text-[var(--text-primary)] focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>

      {/* Tab content */}
      {activeTab === 'reviews' && <ReviewsTab from={from} to={to} />}
      {activeTab === 'tasks' && <TasksTab from={from} to={to} />}
      {activeTab === 'aims' && <AIMsTab />}
      {activeTab === 'goals' && <GoalsTab />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Reviews Tab                                                        */
/* ------------------------------------------------------------------ */

function ReviewsTab({ from, to }: { from: string; to: string }) {
  const { data, error, isLoading } = useSWR<Review[]>(
    `/api/reviews?userId=me&from=${from}&to=${to}`,
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Deduplicate reviews: keep only the most recent per type+date combination
  const reviews = useMemo(() => {
    const raw = data ?? [];
    const seen = new Map<string, Review>();
    for (const r of raw) {
      const dateStr = r.scheduledDate?.split('T')[0] ?? '';
      const key = `${r.reviewType}-${dateStr}`;
      const existing = seen.get(key);
      if (!existing || (r.completedAt && !existing.completedAt)) {
        seen.set(key, r);
      }
    }
    return Array.from(seen.values());
  }, [data]);

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message="Failed to load reviews." />;

  const handleExportCSV = () => {
    const headers = ['Date', 'Type', 'Status'];
    const rows = reviews.map((r) => [
      r.scheduledDate.split('T')[0],
      r.reviewType,
      r.completedAt ? 'Completed' : 'Pending',
    ]);
    downloadFile('reviews.csv', buildCSV(headers, rows), 'text/csv');
  };

  const handleExportJSON = () => {
    downloadFile('reviews.json', JSON.stringify(reviews, null, 2), 'application/json');
  };

  return (
    <div>
      <div className="overflow-hidden rounded-lg border border-[var(--border-color)]">
        <table className="min-w-full divide-y divide-[var(--border-color)]">
          <thead className="bg-[var(--hover-bg)]">
            <tr>
              <th className="w-8 px-4 py-3" />
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
                Date
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
                Type
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-color)] bg-[var(--card-bg)]">
            {reviews.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-sm text-[var(--text-muted)]">
                  No reviews found for this date range.
                </td>
              </tr>
            )}
            {reviews.map((review) => (
              <Fragment key={review.id}>
                <tr
                  className="cursor-pointer hover:bg-[var(--hover-bg)]"
                  onClick={() =>
                    setExpandedId(expandedId === review.id ? null : review.id)
                  }
                >
                  <td className="px-4 py-3">
                    {expandedId === review.id ? (
                      <ChevronDown className="h-4 w-4 text-[var(--text-muted)]" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-[var(--text-muted)]" />
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-[var(--text-primary)]">
                    {review.scheduledDate.split('T')[0]}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span className="rounded-full bg-indigo-500/15 px-2 py-0.5 text-xs font-medium text-indigo-400">
                      {review.reviewType}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        review.completedAt
                          ? 'bg-green-500/15 text-green-400'
                          : 'bg-yellow-500/15 text-yellow-400'
                      }`}
                    >
                      {review.completedAt ? 'Completed' : 'Pending'}
                    </span>
                  </td>
                </tr>
                {expandedId === review.id && review.answers && (
                  <tr>
                    <td colSpan={4} className="bg-[var(--hover-bg)] px-8 py-4">
                      <div className="space-y-3">
                        {review.answers.map((a, i) => (
                          <div key={i}>
                            <p className="text-xs font-medium text-[var(--text-muted)]">{a.question}</p>
                            <p className="mt-0.5 text-sm text-[var(--text-secondary)]">{a.answer}</p>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <ExportButtons onCSV={handleExportCSV} onJSON={handleExportJSON} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tasks Tab                                                          */
/* ------------------------------------------------------------------ */

function TasksTab({ from, to }: { from: string; to: string }) {
  const { data, error, isLoading } = useSWR<Task[]>(
    `/api/tasks?startDate=${from}&endDate=${to}`,
  );

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message="Failed to load tasks." />;

  const tasks = data ?? [];
  const completed = tasks.filter((t) => t.status === 'DONE');
  const completionRate = tasks.length > 0 ? Math.round((completed.length / tasks.length) * 100) : 0;

  const handleExportCSV = () => {
    const headers = ['Title', 'Type', 'Status', 'Priority', 'Completed At'];
    const rows = tasks.map((t) => [
      t.title,
      t.taskType,
      STATUS_LABELS[t.status] ?? t.status,
      PRIORITY_LABELS[t.priority] ?? t.priority,
      t.status === 'DONE' && t.completedAt ? formatDisplayDate(t.completedAt) : '',
    ]);
    downloadFile('tasks.csv', buildCSV(headers, rows), 'text/csv');
  };

  const handleExportJSON = () => {
    downloadFile('tasks.json', JSON.stringify(tasks, null, 2), 'application/json');
  };

  return (
    <div>
      {/* Stats */}
      <div className="mb-4 flex gap-4">
        <div className="glass-panel px-4 py-3">
          <p className="text-xs text-[var(--text-muted)]">Total Tasks</p>
          <p className="text-lg font-semibold text-[var(--text-primary)]">{tasks.length}</p>
        </div>
        <div className="glass-panel px-4 py-3">
          <p className="text-xs text-[var(--text-muted)]">Completed</p>
          <p className="text-lg font-semibold text-green-400">{completed.length}</p>
        </div>
        <div className="glass-panel px-4 py-3">
          <p className="text-xs text-[var(--text-muted)]">Completion Rate</p>
          <p className="text-lg font-semibold text-indigo-400">{completionRate}%</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-[var(--border-color)]">
        <table className="min-w-full divide-y divide-[var(--border-color)]">
          <thead className="bg-[var(--hover-bg)]">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
                Title
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
                Type
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
                Priority
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
                Completed At
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-color)] bg-[var(--card-bg)]">
            {tasks.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-[var(--text-muted)]">
                  No tasks found for this date range.
                </td>
              </tr>
            )}
            {tasks.map((task) => (
              <tr key={task.id} className="hover:bg-[var(--hover-bg)]">
                <td className="px-4 py-3 text-sm text-[var(--text-primary)]">{task.title}</td>
                <td className="px-4 py-3 text-sm text-[var(--text-secondary)]">{task.taskType}</td>
                <td className="px-4 py-3 text-sm">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClass(task.status)}`}>
                    {STATUS_LABELS[task.status] ?? task.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${priorityBadgeClass(task.priority)}`}>
                    {PRIORITY_LABELS[task.priority] ?? task.priority}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-[var(--text-secondary)]">
                  {task.status === 'DONE' ? formatDisplayDate(task.completedAt) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ExportButtons onCSV={handleExportCSV} onJSON={handleExportJSON} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* AIMs Tab (placeholder)                                             */
/* ------------------------------------------------------------------ */

function AIMsTab() {
  return (
    <div className="rounded-lg border border-dashed border-[var(--border-color)] bg-[var(--hover-bg)] px-6 py-16 text-center">
      <Target className="mx-auto mb-3 h-8 w-8 text-[var(--text-muted)]" />
      <p className="text-sm text-[var(--text-muted)]">AIM streak history and completion patterns</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Goals Tab (placeholder)                                            */
/* ------------------------------------------------------------------ */

function GoalsTab() {
  return (
    <div className="rounded-lg border border-dashed border-[var(--border-color)] bg-[var(--hover-bg)] px-6 py-16 text-center">
      <BarChart3 className="mx-auto mb-3 h-8 w-8 text-[var(--text-muted)]" />
      <p className="text-sm text-[var(--text-muted)]">Goal progress and KPI trends</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Shared UI                                                          */
/* ------------------------------------------------------------------ */

function ExportButtons({ onCSV, onJSON }: { onCSV: () => void; onJSON: () => void }) {
  return (
    <div className="mt-4 flex gap-3">
      <button
        onClick={onCSV}
        className="inline-flex items-center gap-2 rounded-md border border-[var(--border-color)] bg-[var(--card-bg)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] shadow-sm hover:bg-[var(--hover-bg)]"
      >
        <Download className="h-4 w-4" />
        Export CSV
      </button>
      <button
        onClick={onJSON}
        className="inline-flex items-center gap-2 rounded-md border border-[var(--border-color)] bg-[var(--card-bg)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] shadow-sm hover:bg-[var(--hover-bg)]"
      >
        <Download className="h-4 w-4" />
        Export JSON
      </button>
    </div>
  );
}

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--border-color)] border-t-indigo-500" />
    </div>
  );
}

function ErrorMessage({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
      {message}
    </div>
  );
}
