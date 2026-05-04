'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Zap, Upload } from 'lucide-react';

type User = {
  id: string;
  name: string | null;
  email: string;
};

type GoalAssignee = {
  user: { id: string; name: string | null };
};

type Goal = {
  id: string;
  title: string;
  level: string;
  assignees?: GoalAssignee[];
};

type UrgencyLevel = 'critical' | 'urgent' | 'standard' | 'consider-idea' | null;

function classifyDeadline(dateStr: string): UrgencyLevel {
  if (!dateStr) return null;
  const now = new Date();
  const deadline = new Date(dateStr + 'T23:59:59');
  const diffMs = deadline.getTime() - now.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  if (diffDays < 1) return 'critical';
  if (diffDays <= 3) return 'urgent';
  if (diffDays <= 14) return 'standard';
  return 'consider-idea';
}

function urgencyToPriority(urgency: UrgencyLevel): string {
  switch (urgency) {
    case 'critical':
      return 'URGENT';
    case 'urgent':
      return 'HIGH';
    case 'standard':
      return 'MEDIUM';
    case 'consider-idea':
      return 'LOW';
    default:
      return 'MEDIUM';
  }
}

export default function NewReactiveTaskPage() {
  const router = useRouter();

  const [title, setTitle] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [carsDescription, setCarsDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [goalId, setGoalId] = useState('');

  // Fetch user list and goals on mount
  useEffect(() => {
    async function fetchUsers() {
      try {
        const res = await fetch('/api/admin');
        if (res.ok) {
          const data = await res.json();
          setUsers(data);
        }
      } catch (err) {
        console.error('Failed to fetch users:', err);
      } finally {
        setUsersLoading(false);
      }
    }
    async function fetchGoals() {
      try {
        const res = await fetch('/api/goals?isCompany=true');
        if (res.ok) {
          const data = await res.json();
          setGoals(Array.isArray(data) ? data : []);
        }
      } catch {
        // Ignore — goals are optional
      }
    }
    fetchUsers();
    fetchGoals();
  }, []);

  // Auto-assign from goal's responsible person when goal is selected
  useEffect(() => {
    if (!goalId) return;
    const selected = goals.find((g) => g.id === goalId);
    const firstAssignee = selected?.assignees?.[0]?.user?.id;
    if (firstAssignee) setAssigneeId(firstAssignee);
  }, [goalId, goals]);

  const urgency = useMemo(() => classifyDeadline(dueDate), [dueDate]);
  const autoPriority = useMemo(() => urgencyToPriority(urgency), [urgency]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    setFiles((prev) => [...prev, ...droppedFiles]);
  }, []);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
    }
  }, []);

  const removeFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      const body: Record<string, unknown> = {
        taskType: 'REACT',
        title,
        description: carsDescription,
        dueDate,
        priority: autoPriority,
        estimatedMinutes: 60,
      };

      if (assigneeId) body.assigneeId = assigneeId;
      if (goalId) body.goalId = goalId;

      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create reactive task');
      }

      router.push('/reactive-tasks');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    'w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-3 py-2 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none';
  const textareaClass =
    'w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-3 py-2 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none resize-none';
  const selectClass =
    'w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-3 py-2 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none';

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-[var(--text-primary)] flex items-center gap-2">
          <Zap className="h-6 w-6 text-prism-indigo" />
          Create a Reactive Task
        </h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          Use this form to create a Reactive Task for our team.
        </p>
      </div>

      {/* CARS Framework Explanation */}
      <details className="glass-panel mb-6">
        <summary className="px-4 py-3 cursor-pointer text-sm font-semibold text-[var(--text-primary)] select-none hover:text-indigo-400 transition-colors">
          &larr; Click to Review CARS &#8505;&#65039;
        </summary>
        <div className="px-4 pb-4 space-y-2 text-sm text-[var(--text-secondary)]">
          <p>CARS is an acronym by ProcessDriven:</p>
          <p>
            <span className="font-semibold text-indigo-400">C - Context:</span> What relevant information should others know?
          </p>
          <p>
            <span className="font-semibold text-indigo-400">A - Attempts:</span> What have you tried already?
          </p>
          <p>
            <span className="font-semibold text-indigo-400">R - Request:</span> What specific actions would you like to see?
          </p>
          <p>
            <span className="font-semibold text-indigo-400">S - Stakes:</span> What makes this important to complete by this person in this time frame?
          </p>
        </div>
      </details>

      {error && (
        <div className="mb-4 rounded-lg border border-red-600/30 bg-red-600/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* 1. Action Requested */}
        <div>
          <label className="block text-sm text-[var(--text-secondary)] mb-1">
            What action are you requesting? <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            className={inputClass}
            placeholder='e.g., "Publish Case Study #212" or "Fix Typo on Home Page"'
          />
        </div>

        {/* 2. Linked Goal */}
        <div>
          <label className="block text-sm text-[var(--text-secondary)] mb-1">
            Linked Goal <span className="text-xs text-[var(--text-muted)]">(optional — auto-assigns responsible person)</span>
          </label>
          <select
            value={goalId}
            onChange={(e) => setGoalId(e.target.value)}
            className={selectClass}
          >
            <option value="">-- Select a goal (optional) --</option>
            {goals.map((goal) => (
              <option key={goal.id} value={goal.id}>
                {goal.title}
              </option>
            ))}
          </select>
        </div>

        {/* 3. Process Owner */}
        <div>
          <label className="block text-sm text-[var(--text-secondary)] mb-1">
            Who is responsible for this area of responsibility?
          </label>
          <select
            value={assigneeId}
            onChange={(e) => setAssigneeId(e.target.value)}
            className={selectClass}
            disabled={usersLoading}
          >
            <option value="">
              {usersLoading ? 'Loading team members...' : '-- Select a team member (optional) --'}
            </option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name || user.email}
              </option>
            ))}
          </select>
        </div>

        {/* 3. CARS Description */}
        <div>
          <label className="block text-sm text-[var(--text-secondary)] mb-1">
            Please describe (1) Context, (2) Attempts, (3) Request, (4) Stakes{' '}
            <span className="text-red-400">*</span>
          </label>
          <textarea
            value={carsDescription}
            onChange={(e) => setCarsDescription(e.target.value)}
            rows={8}
            required
            className={textareaClass}
            placeholder={
              'Context: What relevant background should others know?\n\n' +
              'Attempts: What have you tried already?\n\n' +
              'Request: What specific actions would you like to see?\n\n' +
              'Stakes: Why is this important to complete now?'
            }
          />
        </div>

        {/* 4. Deadline */}
        <div>
          <label className="block text-sm text-[var(--text-secondary)] mb-1">
            What is the deadline for this Task? <span className="text-red-400">*</span>
          </label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            required
            className={inputClass}
          />

          {/* Deadline Guidelines */}
          <details className="mt-3">
            <summary className="cursor-pointer text-xs text-[var(--text-muted)] select-none hover:text-indigo-400 transition-colors">
              &larr; Click for Deadline Guidelines &#8505;&#65039;
            </summary>
            <div className="mt-2 space-y-1.5 text-xs text-[var(--text-secondary)] pl-2 border-l-2 border-[var(--border-color)]">
              <p>
                <span className="font-semibold text-red-400">&lt; 24 Hours:</span> Extremely rare &mdash; fully blocking core business
              </p>
              <p>
                <span className="font-semibold text-orange-400">1-3 Days:</span> Most common &mdash; quick requests or partial blocking
              </p>
              <p>
                <span className="font-semibold text-blue-400">3-14 Days:</span> General issues requiring attention
              </p>
              <p>
                <span className="font-semibold text-green-400">&gt; 14 Days:</span> Consider submitting as an{' '}
                <Link href="/ideas/new" className="underline text-indigo-400 hover:text-indigo-300">
                  Idea
                </Link>{' '}
                instead
              </p>
            </div>
          </details>

          {/* Inline urgency classification */}
          {urgency && (
            <div className="mt-3">
              {urgency === 'critical' && (
                <span className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium bg-red-600/15 text-red-400 border border-red-600/30">
                  &#9889; Critical (&lt; 24 hours)
                </span>
              )}
              {urgency === 'urgent' && (
                <span className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium bg-orange-600/15 text-orange-400 border border-orange-600/30">
                  &#128293; Urgent (1-3 days)
                </span>
              )}
              {urgency === 'standard' && (
                <span className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium bg-blue-600/15 text-blue-400 border border-blue-600/30">
                  &#128203; Standard (3-14 days)
                </span>
              )}
              {urgency === 'consider-idea' && (
                <span className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium bg-amber-600/15 text-amber-400 border border-amber-600/30">
                  &#128161; Consider submitting as an{' '}
                  <Link href="/ideas/new" className="underline hover:text-amber-300">
                    Idea
                  </Link>{' '}
                  instead
                </span>
              )}
            </div>
          )}
        </div>

        {/* 5. File Attachments */}
        <div>
          <label className="block text-sm text-[var(--text-secondary)] mb-1">
            Attachments <span className="text-xs text-[var(--text-muted)]">(optional)</span>
          </label>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={`relative rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors ${
              dragOver
                ? 'border-indigo-500 bg-indigo-600/10'
                : 'border-[var(--border-color)] hover:border-[var(--glass-border)]'
            }`}
          >
            <Upload className="h-6 w-6 mx-auto mb-2 text-[var(--text-muted)]" />
            <p className="text-sm text-[var(--text-secondary)]">
              Drop your files here to upload
            </p>
            <p className="text-xs text-[var(--text-muted)] mt-1">or</p>
            <label className="mt-2 inline-block cursor-pointer rounded-lg border border-[var(--border-color)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:border-[var(--glass-border)] hover:text-[var(--text-primary)] transition-colors">
              Browse files
              <input
                type="file"
                multiple
                onChange={handleFileInput}
                className="hidden"
              />
            </label>
          </div>
          {files.length > 0 && (
            <ul className="mt-2 space-y-1">
              {files.map((file, i) => (
                <li
                  key={`${file.name}-${i}`}
                  className="flex items-center justify-between rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-3 py-1.5 text-xs text-[var(--text-secondary)]"
                >
                  <span className="truncate mr-2">{file.name}</span>
                  <button
                    type="button"
                    onClick={() => removeFile(i)}
                    className="text-[var(--text-muted)] hover:text-red-400 transition-colors flex-shrink-0"
                  >
                    &times;
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Submit */}
        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-lg px-4 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !title.trim() || !carsDescription.trim() || !dueDate}
            className="rounded-lg px-6 py-2 text-sm font-medium text-white disabled:opacity-50 transition-all hover:brightness-110"
            style={{
              background: 'var(--prism-gradient)',
            }}
          >
            {saving ? 'Creating...' : 'Create Reactive Task'}
          </button>
        </div>
      </form>
    </div>
  );
}
