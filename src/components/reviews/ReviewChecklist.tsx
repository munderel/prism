'use client';

import { useState, useEffect, useCallback } from 'react';
import { m } from 'framer-motion';
import { CheckCircle2, Circle, BookOpen, Plus, Trash2, ListTodo, Target } from 'lucide-react';
import { useToast } from '@/components/ui/ToastProvider';

type ChecklistItemType = 'checkbox' | 'text' | 'text_list' | 'auto_tasks' | 'auto_goals';

interface ChecklistItem {
  title: string;
  description?: string;
  type?: ChecklistItemType;
}

interface ProcessStep {
  title: string;
  description?: string;
}

interface ReviewChecklistProps {
  reviewId: string;
  onComplete: () => void;
}

// State shape: { [itemTitle]: boolean | string | string[] }
type ChecklistState = Record<string, boolean | string | string[]>;

export function ReviewChecklist({ reviewId, onComplete }: ReviewChecklistProps) {
  const toast = useToast();
  const [review, setReview] = useState<any>(null);
  const [checklist, setChecklist] = useState<ChecklistState>({});
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

  const persistState = useCallback(async (updated: ChecklistState) => {
    await fetch(`/api/reviews/${reviewId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ checklistState: updated }),
    });
  }, [reviewId]);

  const toggleItem = (title: string) => {
    const updated = { ...checklist, [title]: !checklist[title] };
    setChecklist(updated);
    persistState(updated);
  };

  const updateTextItem = (title: string, value: string) => {
    setChecklist((prev) => ({ ...prev, [title]: value }));
  };

  const persistTextItem = () => {
    persistState(checklist);
  };

  const updateTextListItem = (title: string, entries: string[]) => {
    const updated = { ...checklist, [title]: entries };
    setChecklist(updated);
    persistState(updated);
  };

  const handleComplete = async () => {
    const res = await fetch(`/api/reviews/${reviewId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes, complete: true }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data?.error ?? 'Failed to complete review. Please try again.');
      return;
    }
    if (data.beeminderError) toast.error(`Beeminder sync failed: ${data.beeminderError}`);
    onComplete();
  };

  if (loading) return <div className="text-gray-500 text-sm">Loading review...</div>;
  if (!review) return <div className="text-gray-500 text-sm">Review not found.</div>;

  const template = review.template;
  const items: ChecklistItem[] = template?.checklistItems ?? [];
  const steps: ProcessStep[] = template?.processSteps ?? [];

  // Check completion: all items must be "filled"
  const isItemComplete = (item: ChecklistItem): boolean => {
    const type = item.type ?? 'checkbox';
    const value = checklist[item.title];
    switch (type) {
      case 'checkbox':
        return value === true;
      case 'text':
        return typeof value === 'string' && value.trim().length > 0;
      case 'text_list':
        return Array.isArray(value) && value.length > 0 && value.some((v) => v.trim().length > 0);
      case 'auto_tasks':
      case 'auto_goals':
        // Placeholders are always considered complete (no blocking)
        return true;
      default:
        return value === true;
    }
  };

  const allComplete = items.length > 0 && items.every(isItemComplete);
  const completedCount = items.filter(isItemComplete).length;

  return (
    <div className="space-y-6">
      {/* Process guide */}
      {steps.length > 0 && (
        <div className="glass-panel p-4">
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

      {/* Checklist items (supports multiple types) */}
      <div className="glass-panel p-4">
        <h3 className="text-sm font-semibold text-white mb-3">Checklist</h3>
        <div className="space-y-3">
          {items.map((item: ChecklistItem) => {
            const type = item.type ?? 'checkbox';

            switch (type) {
              case 'checkbox':
                return (
                  <CheckboxItem
                    key={item.title}
                    item={item}
                    checked={checklist[item.title] === true}
                    onToggle={() => toggleItem(item.title)}
                  />
                );

              case 'text':
                return (
                  <TextItem
                    key={item.title}
                    item={item}
                    value={(checklist[item.title] as string) ?? ''}
                    onChange={(val) => updateTextItem(item.title, val)}
                    onBlur={persistTextItem}
                  />
                );

              case 'text_list':
                return (
                  <TextListItem
                    key={item.title}
                    item={item}
                    entries={(checklist[item.title] as string[]) ?? []}
                    onChange={(entries) => updateTextListItem(item.title, entries)}
                  />
                );

              case 'auto_tasks':
                return (
                  <AutoTasksPlaceholder key={item.title} item={item} />
                );

              case 'auto_goals':
                return (
                  <AutoGoalsPlaceholder key={item.title} item={item} />
                );

              default:
                return (
                  <CheckboxItem
                    key={item.title}
                    item={item}
                    checked={checklist[item.title] === true}
                    onToggle={() => toggleItem(item.title)}
                  />
                );
            }
          })}
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
        disabled={!allComplete}
        className="w-full rounded-lg bg-green-600 px-4 py-3 text-sm font-medium text-white hover:bg-green-500 disabled:opacity-50 transition-colors"
      >
        {allComplete ? 'Complete Review' : `${completedCount}/${items.length} items completed`}
      </button>
    </div>
  );
}

/* ===== Sub-components for each step type ===== */

function CheckboxItem({ item, checked, onToggle }: { item: ChecklistItem; checked: boolean; onToggle: () => void }) {
  return (
    <m.button
      onClick={onToggle}
      className="flex items-start gap-3 w-full text-left rounded-lg px-3 py-2 hover:bg-gray-800/50 transition-colors"
      whileTap={{ scale: 0.98 }}
    >
      {checked ? (
        <CheckCircle2 className="h-5 w-5 text-green-400 flex-shrink-0 mt-0.5" />
      ) : (
        <Circle className="h-5 w-5 text-gray-600 flex-shrink-0 mt-0.5" />
      )}
      <div>
        <span className={`text-sm ${checked ? 'text-gray-500 line-through' : 'text-white'}`}>
          {item.title}
        </span>
        {item.description && (
          <p className="text-xs text-gray-500 mt-0.5">{item.description}</p>
        )}
      </div>
    </m.button>
  );
}

function TextItem({ item, value, onChange, onBlur }: {
  item: ChecklistItem;
  value: string;
  onChange: (val: string) => void;
  onBlur: () => void;
}) {
  return (
    <div className="rounded-lg px-3 py-2">
      <label className="block text-sm text-white mb-1">{item.title}</label>
      {item.description && (
        <p className="text-xs text-gray-500 mb-2">{item.description}</p>
      )}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        rows={3}
        className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white text-sm focus:border-indigo-500 focus:outline-none resize-none"
        placeholder={`Enter ${item.title.toLowerCase()}...`}
      />
    </div>
  );
}

function TextListItem({ item, entries, onChange }: {
  item: ChecklistItem;
  entries: string[];
  onChange: (entries: string[]) => void;
}) {
  const addEntry = () => {
    onChange([...entries, '']);
  };

  const updateEntry = (index: number, value: string) => {
    const updated = [...entries];
    updated[index] = value;
    onChange(updated);
  };

  const removeEntry = (index: number) => {
    onChange(entries.filter((_, i) => i !== index));
  };

  return (
    <div className="rounded-lg px-3 py-2">
      <label className="block text-sm text-white mb-1">{item.title}</label>
      {item.description && (
        <p className="text-xs text-gray-500 mb-2">{item.description}</p>
      )}
      <div className="space-y-2">
        {entries.map((entry, index) => (
          <div key={index} className="flex items-center gap-2">
            <input
              type="text"
              value={entry}
              onChange={(e) => updateEntry(index, e.target.value)}
              className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-white text-sm focus:border-indigo-500 focus:outline-none"
              placeholder={`Item ${index + 1}...`}
            />
            <button
              onClick={() => removeEntry(index)}
              className="rounded p-1 text-red-400/60 hover:bg-red-600/20 hover:text-red-400 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <button
          onClick={addEntry}
          className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors px-1 py-1"
        >
          <Plus className="h-3 w-3" />
          Add entry
        </button>
      </div>
    </div>
  );
}

function AutoTasksPlaceholder({ item }: { item: ChecklistItem }) {
  return (
    <div className="rounded-lg border border-dashed border-gray-700 px-3 py-4">
      <div className="flex items-center gap-2 mb-1">
        <ListTodo className="h-4 w-4 text-amber-400" />
        <span className="text-sm text-white">{item.title}</span>
      </div>
      {item.description && (
        <p className="text-xs text-gray-500 mb-2">{item.description}</p>
      )}
      <p className="text-xs text-gray-600 italic">
        Auto-loaded tasks from the previous week will appear here. (Coming soon)
      </p>
    </div>
  );
}

function AutoGoalsPlaceholder({ item }: { item: ChecklistItem }) {
  return (
    <div className="rounded-lg border border-dashed border-gray-700 px-3 py-4">
      <div className="flex items-center gap-2 mb-1">
        <Target className="h-4 w-4 text-blue-400" />
        <span className="text-sm text-white">{item.title}</span>
      </div>
      {item.description && (
        <p className="text-xs text-gray-500 mb-2">{item.description}</p>
      )}
      <p className="text-xs text-gray-600 italic">
        Goal progress will be auto-loaded here. (Coming soon)
      </p>
    </div>
  );
}
