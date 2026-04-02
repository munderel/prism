'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lightbulb } from 'lucide-react';
import { ProcessSearch } from '@/components/tasks/ProcessSearch';
import { formatPicsDescription } from '@/lib/scoring';

const SCORE_RANGE = [1, 2, 3, 4, 5];

export default function NewIdeaPage() {
  const router = useRouter();

  const [title, setTitle] = useState('');
  const [problem, setProblem] = useState('');
  const [idea, setIdea] = useState('');
  const [cost, setCost] = useState('');
  const [stakes, setStakes] = useState('');
  const [selectedProcess, setSelectedProcess] = useState<any>(null);
  const [confidence, setConfidence] = useState(3);
  const [ease, setEase] = useState(3);
  const [impact, setImpact] = useState(3);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      const description = formatPicsDescription(problem, idea, cost, stakes);

      const body: any = {
        title,
        description,
        confidenceScore: confidence,
        easeScore: ease,
        impactScore: impact,
      };

      if (selectedProcess) body.processId = selectedProcess.id;

      const res = await fetch('/api/ideas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create idea');
      }

      router.push('/ideas');
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
          <Lightbulb className="h-6 w-6 text-prism-indigo" />
          Create an Idea
        </h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          Use the PICS framework to clearly describe your idea so it can be evaluated and prioritized.
        </p>
      </div>

      {/* PICS Info Box */}
      <details className="glass-panel mb-6">
        <summary className="px-4 py-3 cursor-pointer text-sm font-semibold text-[var(--text-primary)] select-none hover:text-indigo-400 transition-colors">
          What is the PICS framework?
        </summary>
        <div className="px-4 pb-4 space-y-2 text-sm text-[var(--text-secondary)]">
          <p>
            <span className="font-semibold text-indigo-400">P - Problem:</span> What problem does this idea solve? Describe the pain point or opportunity.
          </p>
          <p>
            <span className="font-semibold text-indigo-400">I - Idea:</span> What is your proposed solution? How would it work?
          </p>
          <p>
            <span className="font-semibold text-indigo-400">C - Cost:</span> What resources, time, or effort would this require?
          </p>
          <p>
            <span className="font-semibold text-indigo-400">S - Stakes:</span> What is the potential impact? What happens if we do or do not act?
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
            What should we call this Idea? <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            className={inputClass}
            placeholder="e.g., Automated weekly client status emails"
          />
        </div>

        {/* PICS Textareas */}
        <div>
          <label className="block text-sm text-[var(--text-secondary)] mb-1">Problem</label>
          <textarea
            value={problem}
            onChange={(e) => setProblem(e.target.value)}
            rows={3}
            className={textareaClass}
            placeholder="What problem does this solve?"
          />
        </div>

        <div>
          <label className="block text-sm text-[var(--text-secondary)] mb-1">Idea</label>
          <textarea
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            rows={3}
            className={textareaClass}
            placeholder="What is your proposed solution?"
          />
        </div>

        <div>
          <label className="block text-sm text-[var(--text-secondary)] mb-1">Cost</label>
          <textarea
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            rows={3}
            className={textareaClass}
            placeholder="What resources, time, or effort would this require?"
          />
        </div>

        <div>
          <label className="block text-sm text-[var(--text-secondary)] mb-1">Stakes</label>
          <textarea
            value={stakes}
            onChange={(e) => setStakes(e.target.value)}
            rows={3}
            className={textareaClass}
            placeholder="What is the potential impact?"
          />
        </div>

        {/* Optional Process */}
        <ProcessSearch
          value={selectedProcess}
          onChange={setSelectedProcess}
          label="Related Process (optional)"
        />

        {/* Confidence Score */}
        <div>
          <label className="block text-sm text-[var(--text-secondary)] mb-1">
            Confidence <span className="text-xs text-[var(--text-muted)]">(1 = Low, 5 = High)</span>
          </label>
          <div className="flex gap-2">
            {SCORE_RANGE.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setConfidence(n)}
                className={`rounded-lg w-10 h-10 text-sm font-medium transition-colors border ${
                  confidence === n
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'text-[var(--text-secondary)] border-[var(--border-color)] hover:border-[var(--glass-border)]'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* Ease Score */}
        <div>
          <label className="block text-sm text-[var(--text-secondary)] mb-1">
            Ease <span className="text-xs text-[var(--text-muted)]">(1 = Hard, 5 = Easy)</span>
          </label>
          <div className="flex gap-2">
            {SCORE_RANGE.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setEase(n)}
                className={`rounded-lg w-10 h-10 text-sm font-medium transition-colors border ${
                  ease === n
                    ? 'bg-green-600/20 text-green-400 border-green-600/30'
                    : 'text-[var(--text-secondary)] border-[var(--border-color)] hover:border-[var(--glass-border)]'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* Impact Score */}
        <div>
          <label className="block text-sm text-[var(--text-secondary)] mb-1">
            Impact <span className="text-xs text-[var(--text-muted)]">(1 = Low, 5 = High)</span>
          </label>
          <div className="flex gap-2">
            {SCORE_RANGE.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setImpact(n)}
                className={`rounded-lg w-10 h-10 text-sm font-medium transition-colors border ${
                  impact === n
                    ? 'bg-purple-600/20 text-purple-400 border-purple-600/30'
                    : 'text-[var(--text-secondary)] border-[var(--border-color)] hover:border-[var(--glass-border)]'
                }`}
              >
                {n}
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
            disabled={saving || !title.trim()}
            className="rounded-lg bg-indigo-600 px-6 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Submitting...' : 'Submit Your Idea'}
          </button>
        </div>
      </form>
    </div>
  );
}
