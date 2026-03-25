'use client';

import { useState, useEffect, useCallback } from 'react';
import { m, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2, Circle, ChevronRight, ChevronLeft, PartyPopper,
  Plus, Trash2, ListTodo, Target, BookOpen,
} from 'lucide-react';

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

type ChecklistState = Record<string, boolean | string | string[]>;

interface ReviewWizardProps {
  reviewId: string;
}

export function ReviewWizard({ reviewId }: ReviewWizardProps) {
  const router = useRouter();
  const [review, setReview] = useState<any>(null);
  const [checklist, setChecklist] = useState<ChecklistState>({});
  const [notes, setNotes] = useState('');
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [completed, setCompleted] = useState(false);
  const [showProcessHint, setShowProcessHint] = useState(false);

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

      // Resume from where user left off
      if (data.checklistState) {
        const items: ChecklistItem[] = data.template?.checklistItems ?? [];
        let resumeStep = 1;
        for (let i = 0; i < items.length; i++) {
          if (isItemComplete(items[i], data.checklistState)) {
            resumeStep = i + 2; // Move past completed items
          } else {
            break;
          }
        }
        setCurrentStep(Math.min(resumeStep, items.length + 1));
      }
    }
    setLoading(false);
  };

  const isItemComplete = (item: ChecklistItem, state: ChecklistState = checklist): boolean => {
    const type = item.type ?? 'checkbox';
    const value = state[item.title];
    switch (type) {
      case 'checkbox':
        return value === true;
      case 'text':
        return typeof value === 'string' && value.trim().length > 0;
      case 'text_list':
        return Array.isArray(value) && value.length > 0 && value.some((v) => v.trim().length > 0);
      case 'auto_tasks':
      case 'auto_goals':
        return true;
      default:
        return value === true;
    }
  };

  const persistState = useCallback(async (state: ChecklistState, notesVal?: string) => {
    await fetch(`/api/reviews/${reviewId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        checklistState: state,
        ...(notesVal !== undefined ? { notes: notesVal } : {}),
      }),
    });
  }, [reviewId]);

  const items: ChecklistItem[] = review?.template?.checklistItems ?? [];
  const steps: ProcessStep[] = review?.template?.processSteps ?? [];
  const totalSteps = items.length + 1; // +1 for notes/completion step

  const advanceStep = async () => {
    // Persist current state
    await persistState(checklist, currentStep === totalSteps ? notes : undefined);

    if (currentStep === totalSteps) {
      // Complete the review
      await fetch(`/api/reviews/${reviewId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes, complete: true }),
      });
      setCompleted(true);
      return;
    }

    setCurrentStep(currentStep + 1);
    setShowProcessHint(false);
  };

  const goBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
      setShowProcessHint(false);
    }
  };

  const toggleItem = (title: string) => {
    const updated = { ...checklist, [title]: !checklist[title] };
    setChecklist(updated);
    persistState(updated);
  };

  const updateTextItem = (title: string, value: string) => {
    const updated = { ...checklist, [title]: value };
    setChecklist(updated);
  };

  const persistTextItem = () => {
    persistState(checklist);
  };

  const updateTextListItem = (title: string, entries: string[]) => {
    const updated = { ...checklist, [title]: entries };
    setChecklist(updated);
    persistState(updated);
  };

  if (loading) return <div className="text-[var(--text-muted)] py-12 text-center">Loading review...</div>;
  if (!review) return <div className="text-[var(--text-muted)] py-12 text-center">Review not found.</div>;

  if (completed) {
    return (
      <m.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="text-center py-16"
      >
        <PartyPopper className="h-16 w-16 text-yellow-400 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-2">Review Complete!</h2>
        <p className="text-[var(--text-muted)] mb-6">
          Great work reflecting on your {review.reviewType.toLowerCase()} progress.
        </p>
        <button
          onClick={() => router.push('/reviews')}
          className="rounded-lg bg-indigo-600 px-6 py-3 text-sm font-medium text-white hover:bg-indigo-500 transition-colors"
        >
          Back to Reviews
        </button>
      </m.div>
    );
  }

  const currentItem = currentStep <= items.length ? items[currentStep - 1] : null;
  const currentProcessStep = currentStep <= steps.length ? steps[currentStep - 1] : null;
  const isNotesStep = currentStep === totalSteps;

  return (
    <div className="max-w-2xl mx-auto">
      {/* Progress bar */}
      <div className="flex items-center gap-2 mb-8">
        {Array.from({ length: totalSteps }, (_, i) => i + 1).map((num) => (
          <div
            key={num}
            className={`h-2 flex-1 rounded-full transition-colors ${
              num < currentStep ? 'bg-green-500' : num === currentStep ? 'bg-indigo-500' : 'bg-[var(--surface-raised)]'
            }`}
          />
        ))}
      </div>

      <AnimatePresence mode="wait">
        <m.div
          key={currentStep}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          className="space-y-6"
        >
          {/* Step header */}
          <div>
            <h2 className="text-xl font-bold text-[var(--text-primary)] mb-1">
              Step {currentStep} of {totalSteps}:{' '}
              {isNotesStep ? 'Notes & Completion' : currentItem?.title}
            </h2>
            <p className="text-[var(--text-muted)] text-sm">
              {isNotesStep
                ? 'Add any final reflections or notes, then complete the review.'
                : currentItem?.description}
            </p>
          </div>

          {/* Step content */}
          <div className="glass-panel p-6">
            {isNotesStep ? (
              <div className="space-y-4">
                <label className="block text-sm text-[var(--text-secondary)] mb-1">
                  Reflections, insights, action items...
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={6}
                  className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface)] px-3 py-2 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none resize-none"
                  placeholder="What stood out this period? What will you do differently?"
                />
              </div>
            ) : currentItem ? (
              <StepContent
                item={currentItem}
                checklist={checklist}
                onToggle={toggleItem}
                onTextChange={updateTextItem}
                onTextBlur={persistTextItem}
                onTextListChange={updateTextListItem}
              />
            ) : null}
          </div>

          {/* Process guide hint */}
          {currentProcessStep && !isNotesStep && (
            <div>
              <button
                onClick={() => setShowProcessHint(!showProcessHint)}
                className="flex items-center gap-2 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                <BookOpen className="h-3.5 w-3.5" />
                {showProcessHint ? 'Hide' : 'Show'} process guide
              </button>
              {showProcessHint && (
                <m.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="mt-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20 px-4 py-3"
                >
                  <p className="text-sm text-indigo-300 font-medium">{currentProcessStep.title}</p>
                  {currentProcessStep.description && (
                    <p className="text-xs text-indigo-400/70 mt-1">{currentProcessStep.description}</p>
                  )}
                </m.div>
              )}
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center gap-3">
            {currentStep > 1 && (
              <button
                onClick={goBack}
                className="flex items-center gap-2 rounded-lg border border-[var(--border-color)] px-4 py-3 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </button>
            )}
            <button
              onClick={advanceStep}
              className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-3 text-sm font-medium text-white hover:bg-indigo-500 transition-colors"
            >
              {isNotesStep ? 'Complete Review' : 'Next Step'}
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </m.div>
      </AnimatePresence>
    </div>
  );
}

/* ===== Step content renderer ===== */

function StepContent({
  item,
  checklist,
  onToggle,
  onTextChange,
  onTextBlur,
  onTextListChange,
}: {
  item: ChecklistItem;
  checklist: ChecklistState;
  onToggle: (title: string) => void;
  onTextChange: (title: string, value: string) => void;
  onTextBlur: () => void;
  onTextListChange: (title: string, entries: string[]) => void;
}) {
  const type = item.type ?? 'checkbox';

  switch (type) {
    case 'checkbox': {
      const checked = checklist[item.title] === true;
      return (
        <m.button
          onClick={() => onToggle(item.title)}
          className="flex items-center gap-4 w-full text-left rounded-lg px-4 py-4 hover:bg-[var(--surface-raised)] transition-colors"
          whileTap={{ scale: 0.98 }}
        >
          {checked ? (
            <CheckCircle2 className="h-8 w-8 text-green-400 flex-shrink-0" />
          ) : (
            <Circle className="h-8 w-8 text-[var(--text-muted)] flex-shrink-0" />
          )}
          <span className={`text-base ${checked ? 'text-[var(--text-muted)] line-through' : 'text-[var(--text-primary)]'}`}>
            {checked ? 'Done! Click to undo.' : 'Click to mark as done'}
          </span>
        </m.button>
      );
    }

    case 'text': {
      const value = (checklist[item.title] as string) ?? '';
      return (
        <textarea
          value={value}
          onChange={(e) => onTextChange(item.title, e.target.value)}
          onBlur={onTextBlur}
          rows={5}
          className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface)] px-3 py-2 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none resize-none"
          placeholder={`Enter ${item.title.toLowerCase()}...`}
        />
      );
    }

    case 'text_list': {
      const entries = (checklist[item.title] as string[]) ?? [];
      return (
        <div className="space-y-3">
          {entries.map((entry, index) => (
            <div key={index} className="flex items-center gap-2">
              <input
                type="text"
                value={entry}
                onChange={(e) => {
                  const updated = [...entries];
                  updated[index] = e.target.value;
                  onTextListChange(item.title, updated);
                }}
                className="flex-1 rounded-lg border border-[var(--border-color)] bg-[var(--surface)] px-3 py-2 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none"
                placeholder={`Item ${index + 1}...`}
              />
              <button
                onClick={() => onTextListChange(item.title, entries.filter((_, i) => i !== index))}
                className="rounded p-1.5 text-red-400/60 hover:bg-red-600/20 hover:text-red-400 transition-colors"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          <button
            onClick={() => onTextListChange(item.title, [...entries, ''])}
            className="flex items-center gap-1.5 text-sm text-indigo-400 hover:text-indigo-300 transition-colors px-1 py-1"
          >
            <Plus className="h-4 w-4" />
            Add entry
          </button>
        </div>
      );
    }

    case 'auto_tasks':
      return (
        <div className="rounded-lg border border-dashed border-[var(--border-color)] px-4 py-6 text-center">
          <ListTodo className="h-8 w-8 text-amber-400 mx-auto mb-2" />
          <p className="text-sm text-[var(--text-primary)]">{item.title}</p>
          <p className="text-xs text-[var(--text-muted)] mt-1 italic">
            Auto-loaded tasks will appear here. (Coming soon)
          </p>
        </div>
      );

    case 'auto_goals':
      return (
        <div className="rounded-lg border border-dashed border-[var(--border-color)] px-4 py-6 text-center">
          <Target className="h-8 w-8 text-blue-400 mx-auto mb-2" />
          <p className="text-sm text-[var(--text-primary)]">{item.title}</p>
          <p className="text-xs text-[var(--text-muted)] mt-1 italic">
            Goal progress will be auto-loaded here. (Coming soon)
          </p>
        </div>
      );

    default:
      return null;
  }
}
