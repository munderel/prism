'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Zap } from 'lucide-react';
import { ProcessSearch } from '@/components/tasks/ProcessSearch';
import { formatCarsDescription } from '@/lib/scoring';
import { resolveAssignee } from '@/lib/delegation';

const DURATION_PRESETS = [
  { label: '15m', value: 15 },
  { label: '30m', value: 30 },
  { label: '45m', value: 45 },
  { label: '1h', value: 60 },
  { label: '1.5h', value: 90 },
  { label: '2h', value: 120 },
  { label: '3h', value: 180 },
  { label: '4h', value: 240 },
];

const PRIORITY_OPTIONS = ['MEDIUM', 'HIGH', 'URGENT'] as const;

const priorityColors: Record<string, string> = {
  MEDIUM: 'text-yellow-400 bg-yellow-600/20 border-yellow-600/30',
  HIGH: 'text-orange-400 bg-orange-600/20 border-orange-600/30',
  URGENT: 'text-red-400 bg-red-600/20 border-red-600/30',
};

export default function NewReactiveTaskPage() {
  const router = useRouter();

  const [title, setTitle] = useState('');
  const [selectedProcess, setSelectedProcess] = useState<any>(null);
  const [context, setContext] = useState('');
  const [attempts, setAttempts] = useState('');
  const [request, setRequest] = useState('');
  const [stakes, setStakes] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState<string>('HIGH');
  const [estimatedMinutes, setEstimatedMinutes] = useState(60);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      const description = formatCarsDescription(context, attempts, request, stakes);
      const ownerId = selectedProcess ? resolveAssignee(selectedProcess) : null;

      const body: any = {
        taskType: 'REACT',
        title,
        description,
        priority,
        dueDate,
        estimatedMinutes,
      };

      if (selectedProcess) body.processId = selectedProcess.id;
      if (ownerId) body.ownerId = ownerId;

      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create task');
      }

      router.push('/tasks');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    'w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-3 py-2 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none';
  const textareaClass =
    'w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-3 py-2 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none resize-none';

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-[var(--text-primary)] flex items-center gap-2">
          <Zap className="h-6 w-6 text-prism-indigo" />
          Create a Reactive Task
        </h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          Use the CARS framework to clearly communicate what you need and why it matters.
        </p>
      </div>

      {/* CARS Info Box */}
      <details className="glass-panel mb-6">
        <summary className="px-4 py-3 cursor-pointer text-sm font-semibold text-[var(--text-primary)] select-none hover:text-indigo-400 transition-colors">
          What is the CARS framework?
        </summary>
        <div className="px-4 pb-4 space-y-2 text-sm text-[var(--text-secondary)]">
          <p>
            <span className="font-semibold text-indigo-400">C - Context:</span> What is happening? Provide the background the reader needs to understand the situation.
          </p>
          <p>
            <span className="font-semibold text-indigo-400">A - Attempts:</span> What have you already tried? Show that you have made an effort before escalating.
          </p>
          <p>
            <span className="font-semibold text-indigo-400">R - Request:</span> What specific action are you asking for? Be precise about what you need.
          </p>
          <p>
            <span className="font-semibold text-indigo-400">S - Stakes:</span> Why does this matter? What happens if this is not addressed?
          </p>
        </div>
      </details>

      {error && (
        <div className="mb-4 rounded-lg border border-red-600/30 bg-red-600/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Title */}
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
            placeholder="e.g., Fix the broken invoice export for Q1 reports"
          />
        </div>

        {/* Process Search */}
        <ProcessSearch
          value={selectedProcess}
          onChange={setSelectedProcess}
          label="Who is responsible for this area?"
        />

        {/* CARS Textareas */}
        <div>
          <label className="block text-sm text-[var(--text-secondary)] mb-1">
            Context
          </label>
          <textarea
            value={context}
            onChange={(e) => setContext(e.target.value)}
            rows={3}
            className={textareaClass}
            placeholder="What is happening? Provide background..."
          />
        </div>

        <div>
          <label className="block text-sm text-[var(--text-secondary)] mb-1">
            Attempts
          </label>
          <textarea
            value={attempts}
            onChange={(e) => setAttempts(e.target.value)}
            rows={3}
            className={textareaClass}
            placeholder="What have you already tried?"
          />
        </div>

        <div>
          <label className="block text-sm text-[var(--text-secondary)] mb-1">
            Request
          </label>
          <textarea
            value={request}
            onChange={(e) => setRequest(e.target.value)}
            rows={3}
            className={textareaClass}
            placeholder="What specific action do you need?"
          />
        </div>

        <div>
          <label className="block text-sm text-[var(--text-secondary)] mb-1">
            Stakes
          </label>
          <textarea
            value={stakes}
            onChange={(e) => setStakes(e.target.value)}
            rows={3}
            className={textareaClass}
            placeholder="Why does this matter? What happens if it's not addressed?"
          />
        </div>

        {/* Deadline Guidelines */}
        <details className="glass-panel">
          <summary className="px-4 py-3 cursor-pointer text-sm font-semibold text-[var(--text-primary)] select-none hover:text-indigo-400 transition-colors">
            Deadline guidelines
          </summary>
          <div className="px-4 pb-4 space-y-2 text-sm text-[var(--text-secondary)]">
            <p>
              <span className="font-semibold text-yellow-400">Same day:</span> Only for true emergencies that block revenue or a live system.
            </p>
            <p>
              <span className="font-semibold text-orange-400">1-2 days:</span> Urgent items that affect customers or team members today.
            </p>
            <p>
              <span className="font-semibold text-blue-400">3-5 days:</span> Standard requests that need prompt attention.
            </p>
            <p>
              <span className="font-semibold text-green-400">1-2 weeks:</span> Important but not time-sensitive improvements.
            </p>
          </div>
        </details>

        {/* Due Date */}
        <div>
          <label className="block text-sm text-[var(--text-secondary)] mb-1">
            Deadline <span className="text-red-400">*</span>
          </label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            required
            className={inputClass}
          />
        </div>

        {/* Priority */}
        <div>
          <label className="block text-sm text-[var(--text-secondary)] mb-1">Priority</label>
          <div className="flex gap-2">
            {PRIORITY_OPTIONS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPriority(p)}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors border ${
                  priority === p
                    ? priorityColors[p]
                    : 'text-[var(--text-secondary)] border-[var(--border-color)] hover:border-[var(--glass-border)]'
                }`}
              >
                {p.charAt(0) + p.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Duration */}
        <div>
          <label className="block text-sm text-[var(--text-secondary)] mb-1">Estimated Duration</label>
          <div className="flex flex-wrap gap-2">
            {DURATION_PRESETS.map(({ label, value }) => (
              <button
                key={value}
                type="button"
                onClick={() => setEstimatedMinutes(value)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  estimatedMinutes === value
                    ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-600/30'
                    : 'text-[var(--text-secondary)] border border-[var(--border-color)] hover:border-[var(--glass-border)]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
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
            disabled={saving || !title.trim() || !dueDate}
            className="rounded-lg bg-indigo-600 px-6 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Creating...' : 'Create Reactive Task'}
          </button>
        </div>
      </form>
    </div>
  );
}
