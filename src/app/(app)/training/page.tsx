'use client';

import { useState, useCallback } from 'react';
import useSWR from 'swr';
import {
  BookOpen,
  GraduationCap,
  Plus,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Circle,
  Clock,
  Trash2,
  Target,
  Brain,
  Loader2,
  X,
} from 'lucide-react';
import { formatDateOnly } from '@/lib/date-utils';

type TrainingType = 'BOOK' | 'COURSE';

interface AddModalState {
  open: boolean;
  type: TrainingType;
}

const typeBadge: Record<TrainingType, { label: string; cls: string; icon: any }> = {
  BOOK: {
    label: 'Book',
    cls: 'text-amber-400 bg-amber-600/20 border-amber-600/30',
    icon: BookOpen,
  },
  COURSE: {
    label: 'Course',
    cls: 'text-blue-400 bg-blue-600/20 border-blue-600/30',
    icon: GraduationCap,
  },
};

function quizScoreClass(score: number): string {
  if (score >= 80) return 'text-green-400 bg-green-600/20 border-green-600/30';
  if (score >= 60) return 'text-yellow-400 bg-yellow-600/20 border-yellow-600/30';
  return 'text-red-400 bg-red-600/20 border-red-600/30';
}

export default function TrainingPage() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [addModal, setAddModal] = useState<AddModalState>({ open: false, type: 'BOOK' });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Form fields
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formTargetDate, setFormTargetDate] = useState('');
  const [formGoalId, setFormGoalId] = useState('');

  const { data: items, isLoading, mutate } = useSWR('/api/training', { revalidateOnFocus: false });
  // Personal scope (owned + assigned stacks). A bare /api/goals 400s — the
  // route requires stackId or an isCompany/level param.
  const { data: goals } = useSWR('/api/goals?isCompany=false');

  const trainingItems = Array.isArray(items) ? items : [];
  const goalList = Array.isArray(goals) ? goals : [];

  const openAddModal = (type: TrainingType) => {
    setFormTitle('');
    setFormDescription('');
    setFormTargetDate('');
    setFormGoalId('');
    setFormError(null);
    setAddModal({ open: true, type });
  };

  const closeModal = () => {
    setAddModal({ open: false, type: 'BOOK' });
    setFormError(null);
  };

  const handleSubmit = useCallback(async () => {
    if (!formTitle.trim()) {
      setFormError('Title is required');
      return;
    }

    setSubmitting(true);
    setFormError(null);

    try {
      const isBook = addModal.type === 'BOOK';
      const endpoint = isBook ? '/api/training/books' : '/api/training/courses';
      const payload: any = {
        title: formTitle.trim(),
        ...(formDescription.trim() && {
          [isBook ? 'description' : 'syllabus']: formDescription.trim(),
        }),
        ...(formTargetDate && { targetCompletionDate: formTargetDate }),
        ...(formGoalId && { goalId: formGoalId }),
      };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Failed (${res.status})`);
      }

      await mutate();
      closeModal();
    } catch (err: any) {
      setFormError(err.message || 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  }, [formTitle, formDescription, formTargetDate, formGoalId, addModal.type, mutate]);

  const handleDelete = useCallback(
    async (id: string) => {
      if (!confirm('Delete this training item and all its tasks?')) return;
      setDeletingId(id);
      try {
        const res = await fetch(`/api/training/${id}`, { method: 'DELETE' });
        if (res.ok) {
          await mutate();
          if (expandedId === id) setExpandedId(null);
        }
      } finally {
        setDeletingId(null);
      }
    },
    [mutate, expandedId]
  );

  const fieldClass =
    'w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-3 py-2 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none';

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <h1 className="font-display text-2xl font-bold text-[var(--text-primary)] flex items-center gap-2">
          <BookOpen className="h-6 w-6 text-prism-indigo" />
          Training
        </h1>
        <div className="flex gap-2">
          <button
            onClick={() => openAddModal('BOOK')}
            className="flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add Book
          </button>
          <button
            onClick={() => openAddModal('COURSE')}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add Course
          </button>
        </div>
      </div>

      {/* Loading — show empty state immediately with subtle loading indicator */}
      {isLoading ? (
        <div className="glass-panel p-12 text-center">
          <Loader2 className="h-8 w-8 text-[var(--text-muted)] mx-auto mb-3 animate-spin" />
          <p className="text-[var(--text-muted)] text-sm">Loading training items...</p>
        </div>
      ) : trainingItems.length === 0 ? (
        <div className="glass-panel p-12 text-center">
          <BookOpen className="h-12 w-12 text-[var(--text-muted)] mx-auto mb-3" />
          <p className="text-[var(--text-muted)]">
            No training items yet. Add a book or course to get started!
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {trainingItems.map((item: any) => {
            const isExpanded = expandedId === item.id;
            const badge = typeBadge[item.type as TrainingType] ?? typeBadge.BOOK;
            const BadgeIcon = badge.icon;

            return (
              <div key={item.id} className="glass-panel overflow-hidden">
                {/* Card Header */}
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : item.id)}
                  className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-[var(--hover-bg)] transition-colors"
                >
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-[var(--text-primary)] truncate">
                        {item.title}
                      </span>
                      {item.goal && (
                        <span className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
                          <Target className="h-3 w-3" />
                          {item.goal.title}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-[var(--text-muted)]">
                      {item.targetCompletionDate && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Due {formatDateOnly(item.targetCompletionDate, { year: 'numeric', month: 'numeric', day: 'numeric' })}
                        </span>
                      )}
                      <span>
                        {item.completedTasks}/{item.totalTasks} tasks done
                      </span>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="shrink-0 w-20 flex items-center gap-2">
                    <div className="flex-1 h-1.5 rounded-full bg-[var(--border-color)] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-green-500 transition-all"
                        style={{ width: `${item.progressPct}%` }}
                      />
                    </div>
                    <span className="text-xs text-[var(--text-muted)] w-8 text-right">
                      {item.progressPct}%
                    </span>
                  </div>

                  {/* Type Badge */}
                  <span
                    className={`shrink-0 inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium ${badge.cls}`}
                  >
                    <BadgeIcon className="h-3 w-3" />
                    {badge.label}
                  </span>
                </button>

                {/* Expanded: Task Tree */}
                {isExpanded && (
                  <div className="border-t border-[var(--border-color)] px-4 py-4">
                    {/* Description */}
                    {item.description && (
                      <p className="text-sm text-[var(--text-secondary)] mb-4 whitespace-pre-wrap">
                        {item.description}
                      </p>
                    )}

                    {/* Task list */}
                    {item.trainingTasks?.length > 0 ? (
                      <div className="space-y-1.5 mb-4">
                        {item.trainingTasks.map((tt: any) => {
                          const task = tt.task;
                          const isDone = task.status === 'DONE';
                          return (
                            <div
                              key={tt.id}
                              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                                isDone
                                  ? 'bg-green-600/10 text-green-400'
                                  : 'bg-[var(--surface-raised)] text-[var(--text-secondary)]'
                              }`}
                            >
                              {isDone ? (
                                <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
                              ) : (
                                <Circle className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
                              )}
                              <span className={`flex-1 ${isDone ? 'line-through opacity-70' : ''}`}>
                                {task.title}
                              </span>
                              {tt.isQuizDay && (
                                <span className="inline-flex items-center gap-1 rounded border border-purple-600/30 bg-purple-600/20 px-1.5 py-0.5 text-[10px] font-medium text-purple-400">
                                  <Brain className="h-3 w-3" />
                                  Quiz
                                </span>
                              )}
                              {task.dueDate && (
                                <span className="text-xs text-[var(--text-muted)]">
                                  {formatDateOnly(task.dueDate, { year: 'numeric', month: 'numeric', day: 'numeric' })}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-sm text-[var(--text-muted)] mb-4">
                        No tasks generated yet.
                      </p>
                    )}

                    {/* Quiz scores */}
                    {item.quizAttempts && item.quizAttempts.length > 0 && (
                      <div className="mb-4">
                        <h4 className="text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)] mb-2">
                          Quiz Scores
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {item.quizAttempts
                            .filter((qa: any) => qa.score !== null)
                            .map((qa: any) => (
                              <span
                                key={qa.id}
                                className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${quizScoreClass(qa.score)}`}
                              >
                                {Math.round(qa.score)}%
                              </span>
                            ))}
                        </div>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleDelete(item.id)}
                        disabled={deletingId === item.id}
                        className="flex items-center gap-1 rounded-lg border border-red-600/30 bg-red-600/10 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-600/20 transition-colors disabled:opacity-50"
                      >
                        {deletingId === item.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Trash2 className="h-3 w-3" />
                        )}
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add Training Modal */}
      {addModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60" onClick={closeModal} />

          {/* Modal */}
          <div className="relative w-full max-w-lg mx-4 glass-panel p-6 rounded-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2">
                {addModal.type === 'BOOK' ? (
                  <BookOpen className="h-5 w-5 text-amber-400" />
                ) : (
                  <GraduationCap className="h-5 w-5 text-indigo-400" />
                )}
                Add {addModal.type === 'BOOK' ? 'Book' : 'Course'}
              </h2>
              <button
                onClick={closeModal}
                className="rounded-lg p-1.5 text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {formError && (
              <div className="mb-4 rounded-lg border border-red-600/30 bg-red-600/10 px-3 py-2 text-sm text-red-400">
                {formError}
              </div>
            )}

            <div className="space-y-4">
              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                  Title *
                </label>
                <input
                  type="text"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder={
                    addModal.type === 'BOOK'
                      ? 'e.g. "Thinking, Fast and Slow"'
                      : 'e.g. "AWS Solutions Architect"'
                  }
                  className={fieldClass}
                  autoFocus
                />
              </div>

              {/* Description / Syllabus */}
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                  {addModal.type === 'BOOK' ? 'Description (optional)' : 'Syllabus (optional)'}
                </label>
                <textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder={
                    addModal.type === 'BOOK'
                      ? 'Brief description or table of contents...'
                      : 'Paste syllabus or course outline...'
                  }
                  rows={3}
                  className={fieldClass}
                />
              </div>

              {/* Target Date */}
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                  Target Completion Date (optional)
                </label>
                <input
                  type="date"
                  value={formTargetDate}
                  onChange={(e) => setFormTargetDate(e.target.value)}
                  className={fieldClass}
                />
              </div>

              {/* Goal Link */}
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                  Link to Goal (optional)
                </label>
                <select
                  value={formGoalId}
                  onChange={(e) => setFormGoalId(e.target.value)}
                  className={fieldClass}
                >
                  <option value="">None</option>
                  {goalList.map((g: any) => (
                    <option key={g.id} value={g.id}>
                      {g.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={closeModal}
                className="rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 transition-colors disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    AI is breaking it down...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" />
                    Add & Generate Plan
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
