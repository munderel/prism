'use client';

import { useState, useEffect } from 'react';
import { m } from 'framer-motion';
import { CheckCircle2, Circle, BookOpen } from 'lucide-react';

interface ChecklistItem {
  title: string;
  description?: string;
}

interface ProcessStep {
  title: string;
  description?: string;
}

interface ReviewChecklistProps {
  reviewId: string;
  onComplete: () => void;
}

export function ReviewChecklist({ reviewId, onComplete }: ReviewChecklistProps) {
  const [review, setReview] = useState<any>(null);
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchReview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewId]);

  const fetchReview = async () => {
    const res = await fetch(`/api/reviews/${reviewId}`);
    if (res.ok) {
      const data = await res.json();
      setReview(data);
      setChecklist(data.checklistState ?? {});
      setNotes(data.notes ?? '');
    }
    setLoading(false);
  };

  const toggleItem = async (title: string) => {
    const updated = { ...checklist, [title]: !checklist[title] };
    setChecklist(updated);

    await fetch(`/api/reviews/${reviewId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ checklistState: updated }),
    });
  };

  const handleComplete = async () => {
    await fetch(`/api/reviews/${reviewId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes, complete: true }),
    });
    onComplete();
  };

  if (loading) return <div className="text-gray-500 text-sm">Loading review...</div>;
  if (!review) return <div className="text-gray-500 text-sm">Review not found.</div>;

  const template = review.template;
  const items: ChecklistItem[] = template?.checklistItems ?? [];
  const steps: ProcessStep[] = template?.processSteps ?? [];
  const allChecked = items.length > 0 && items.every((item: ChecklistItem) => checklist[item.title]);

  return (
    <div className="space-y-6">
      {/* Process guide */}
      {steps.length > 0 && (
        <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-4">
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-indigo-400" />
            Process Guide
          </h3>
          <ol className="list-decimal list-inside space-y-2 text-sm text-gray-400">
            {steps.map((step: ProcessStep, i: number) => (
              <li key={i}>
                <span className="text-gray-300">{step.title}</span>
                {step.description && (
                  <p className="ml-5 mt-1 text-xs text-gray-500">{step.description}</p>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Checklist */}
      <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-4">
        <h3 className="text-sm font-semibold text-white mb-3">Checklist</h3>
        <div className="space-y-2">
          {items.map((item: ChecklistItem) => (
            <m.button
              key={item.title}
              onClick={() => toggleItem(item.title)}
              className="flex items-center gap-3 w-full text-left rounded-lg px-3 py-2 hover:bg-gray-800/50 transition-colors"
              whileTap={{ scale: 0.98 }}
            >
              {checklist[item.title] ? (
                <CheckCircle2 className="h-5 w-5 text-green-400 flex-shrink-0" />
              ) : (
                <Circle className="h-5 w-5 text-gray-600 flex-shrink-0" />
              )}
              <span className={`text-sm ${checklist[item.title] ? 'text-gray-500 line-through' : 'text-white'}`}>
                {item.title}
              </span>
            </m.button>
          ))}
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className="block text-sm text-gray-400 mb-1">Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white text-sm focus:border-indigo-500 focus:outline-none resize-none"
          placeholder="Reflections, insights, action items..."
        />
      </div>

      {/* Complete button */}
      <button
        onClick={handleComplete}
        disabled={!allChecked}
        className="w-full rounded-lg bg-green-600 px-4 py-3 text-sm font-medium text-white hover:bg-green-500 disabled:opacity-50 transition-colors"
      >
        {allChecked ? 'Complete Review' : `${items.filter((i: ChecklistItem) => checklist[i.title]).length}/${items.length} items checked`}
      </button>
    </div>
  );
}
