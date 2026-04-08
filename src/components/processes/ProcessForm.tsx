'use client';

import { useState } from 'react';
import { m, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { DurationPicker } from './DurationPicker';
import { ScheduleFields } from './ScheduleFields';
import {
  CADENCE_OPTIONS,
  INPUT_CLASSES,
  cadenceNeedsDayOfWeek,
  cadenceNeedsDayOfMonth,
} from '@/lib/process-constants';
import { expandVariants } from '@/lib/process-animations';
import type { ProcessFormValues, UserOption } from '@/types/process';
import { INITIAL_PROCESS_FORM } from '@/types/process';

const DURATION_PRESETS = [
  { label: 'Indefinite', weeks: null },
  { label: '8 weeks', weeks: 8 },
  { label: '3 months', weeks: 13 },
  { label: '6 months', weeks: 26 },
  { label: '1 year', weeks: 52 },
  { label: '2 years', weeks: 104 },
] as const;

function computeDurationEndDate(weeks: number | null): string | null {
  if (weeks === null) return null;
  const d = new Date();
  d.setDate(d.getDate() + weeks * 7);
  return d.toISOString();
}

interface ProcessFormProps {
  mode: 'create' | 'edit';
  initialValues?: Partial<ProcessFormValues>;
  users: UserOption[];
  onSubmit: (values: ProcessFormValues) => Promise<void>;
  onCancel: () => void;
  requireSchedule?: boolean;
}

export function ProcessForm({
  mode,
  initialValues,
  users,
  onSubmit,
  onCancel,
  requireSchedule = true,
}: ProcessFormProps) {
  const [form, setForm] = useState<ProcessFormValues>({
    ...INITIAL_PROCESS_FORM,
    ...initialValues,
  });
  const [showAdvanced, setShowAdvanced] = useState(
    mode === 'edit' || form.mode === 'ADVANCED'
  );
  const [submitting, setSubmitting] = useState(false);
  const [durationPreset, setDurationPreset] = useState<string>(() => {
    if (!initialValues?.durationEndDate) return 'Indefinite';
    const msRemaining = new Date(initialValues.durationEndDate).getTime() - Date.now();
    const weeksRemaining = Math.round(msRemaining / (7 * 24 * 60 * 60 * 1000));
    const match = DURATION_PRESETS.find(
      (p) => p.weeks !== null && Math.abs(p.weeks - weeksRemaining) <= 1
    );
    return match ? match.label : 'Indefinite';
  });

  const updateField = <K extends keyof ProcessFormValues>(
    field: K,
    value: ProcessFormValues[K]
  ) => setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async () => {
    if (!form.title.trim()) return;
    if (requireSchedule && !form.scheduledTime) return;
    setSubmitting(true);
    try {
      await onSubmit(form);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <m.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className="overflow-hidden"
    >
      <div className="rounded-lg border border-[var(--border-color)] bg-[var(--surface)] p-4">
        <h4 className="text-sm font-display font-semibold text-[var(--text-primary)] mb-3">
          {mode === 'create' ? 'New Process' : 'Edit Process'}
        </h4>
        <div className="space-y-3">
          {/* Title */}
          <input
            type="text"
            value={form.title}
            onChange={(e) => updateField('title', e.target.value)}
            placeholder="Process title"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSubmit();
              if (e.key === 'Escape') onCancel();
            }}
            className={`w-full ${INPUT_CLASSES}`}
          />

          {/* Description */}
          <input
            type="text"
            value={form.description}
            onChange={(e) => updateField('description', e.target.value)}
            placeholder="Description (optional)"
            className={`w-full ${INPUT_CLASSES}`}
          />

          {/* Cadence + Assignee row */}
          <div className="flex gap-2">
            <select
              value={form.cadence}
              onChange={(e) => updateField('cadence', e.target.value)}
              className={INPUT_CLASSES}
            >
              {CADENCE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <select
              value={form.assigneeId}
              onChange={(e) => updateField('assigneeId', e.target.value)}
              className={INPUT_CLASSES}
            >
              <option value="">Unassigned</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name || u.email}
                </option>
              ))}
            </select>
          </div>

          {/* Schedule */}
          <ScheduleFields
            cadence={form.cadence}
            scheduledTime={form.scheduledTime}
            dayOfWeek={form.scheduledDayOfWeek}
            dayOfMonth={form.scheduledDayOfMonth}
            onTimeChange={(v) => updateField('scheduledTime', v)}
            onDayOfWeekChange={(v) => updateField('scheduledDayOfWeek', v)}
            onDayOfMonthChange={(v) => updateField('scheduledDayOfMonth', v)}
            label="Calendar Schedule"
            scheduleStartDate={form.scheduleStartDate}
            onStartDateChange={(v) => updateField('scheduleStartDate', v)}
          />

          {/* Advanced settings toggle */}
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
          >
            <m.div
              animate={{ rotate: showAdvanced ? 180 : 0 }}
              transition={{ duration: 0.2 }}
            >
              <ChevronDown className="h-3 w-3" />
            </m.div>
            Advanced settings
          </button>

          <AnimatePresence initial={false}>
            {showAdvanced && (
              <m.div
                variants={expandVariants}
                initial="collapsed"
                animate="expanded"
                exit="collapsed"
                className="overflow-hidden"
              >
                <div className="space-y-3 pt-1">
                  {/* Duration */}
                  <DurationPicker
                    selected={form.defaultDurationMinutes}
                    onChange={(v) => updateField('defaultDurationMinutes', v)}
                  />

                  {/* Mode toggle */}
                  <div>
                    <label className="block text-xs text-[var(--text-secondary)] mb-1">
                      Mode
                    </label>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => updateField('mode', 'BASIC')}
                        className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                          form.mode === 'BASIC'
                            ? 'bg-emerald-600 text-white border border-emerald-600'
                            : 'text-[var(--text-secondary)] border border-[var(--border-color)] hover:border-[var(--glass-border)]'
                        }`}
                      >
                        Basic
                      </button>
                      <button
                        type="button"
                        onClick={() => updateField('mode', 'ADVANCED')}
                        className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                          form.mode === 'ADVANCED'
                            ? 'bg-blue-600 text-white border border-blue-600'
                            : 'text-[var(--text-secondary)] border border-[var(--border-color)] hover:border-[var(--glass-border)]'
                        }`}
                      >
                        Advanced
                      </button>
                    </div>
                    <p className="text-[10px] text-[var(--text-muted)] mt-1">
                      {form.mode === 'BASIC'
                        ? 'Shows on calendar as a reminder. Mark complete to track streaks.'
                        : 'Creates independent tasks from process steps each period.'}
                    </p>
                  </div>

                  {/* Process Duration (ADVANCED only) */}
                  {form.mode === 'ADVANCED' && (
                    <div>
                      <label className="block text-xs text-[var(--text-secondary)] mb-1">
                        Process Duration
                      </label>
                      <div className="flex flex-wrap gap-1.5">
                        {DURATION_PRESETS.map((preset) => (
                          <button
                            key={preset.label}
                            type="button"
                            onClick={() => {
                              setDurationPreset(preset.label);
                              updateField('durationEndDate', computeDurationEndDate(preset.weeks));
                            }}
                            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                              durationPreset === preset.label
                                ? 'bg-blue-600 text-white border border-blue-600'
                                : 'text-[var(--text-secondary)] border border-[var(--border-color)] hover:border-[var(--glass-border)]'
                            }`}
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                      <p className="text-[10px] text-[var(--text-muted)] mt-1">
                        {durationPreset === 'Indefinite'
                          ? 'Tasks generated every period with no end date.'
                          : `Tasks generated until ${new Date(form.durationEndDate ?? '').toLocaleDateString()}.`}
                      </p>
                    </div>
                  )}
                </div>
              </m.div>
            )}
          </AnimatePresence>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleSubmit}
              disabled={
                !form.title.trim() ||
                (requireSchedule && !form.scheduledTime) ||
                submitting
              }
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
            >
              {submitting
                ? 'Saving...'
                : mode === 'create'
                  ? 'Create'
                  : 'Save'}
            </button>
            <button
              onClick={onCancel}
              className="rounded-lg border border-[var(--border-color)] px-4 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </m.div>
  );
}
