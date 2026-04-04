'use client';

import { useState } from 'react';
import { m, AnimatePresence } from 'framer-motion';
import { Calendar, X } from 'lucide-react';
import { CadenceBadge } from './CadenceBadge';
import {
  cadenceNeedsDayOfWeek,
  cadenceNeedsDayOfMonth,
  cadenceNeedsDate,
  formatDurationDisplay,
  INPUT_CLASSES,
} from '@/lib/process-constants';
import type { ProcessData } from '@/types/process';

interface ScheduleModalProps {
  process: ProcessData | null;
  onSchedule: (
    processId: string,
    time: string,
    dayOfWeek?: number,
    dayOfMonth?: number,
    date?: string
  ) => Promise<void>;
  onClose: () => void;
}

export function ScheduleModal({ process, onSchedule, onClose }: ScheduleModalProps) {
  const [schedTime, setSchedTime] = useState('09:00');
  const [schedDayOfWeek, setSchedDayOfWeek] = useState(1);
  const [schedDayOfMonth, setSchedDayOfMonth] = useState(1);
  const [schedDate, setSchedDate] = useState('');
  const [saving, setSaving] = useState(false);

  // Reset state when process changes
  const handleOpen = (proc: ProcessData) => {
    setSchedTime(proc.scheduledTime || '09:00');
    setSchedDayOfWeek(proc.scheduledDayOfWeek ?? 1);
    setSchedDayOfMonth(proc.scheduledDayOfMonth ?? 1);
    setSchedDate('');
    setSaving(false);
  };

  // Initialize when process is set
  if (process && schedTime === '09:00' && !saving) {
    handleOpen(process);
  }

  const handleSubmit = async () => {
    if (!process) return;
    setSaving(true);
    await onSchedule(
      process.id,
      schedTime,
      cadenceNeedsDayOfWeek(process.cadence) ? schedDayOfWeek : undefined,
      cadenceNeedsDayOfMonth(process.cadence) ? schedDayOfMonth : undefined,
      cadenceNeedsDate(process.cadence) ? schedDate : undefined
    );
    setSaving(false);
  };

  return (
    <AnimatePresence>
      {process && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center">
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />
          <m.div
            initial={{ opacity: 0, scale: 0.9, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 10 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="relative glass-panel p-6 w-full max-w-md mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-display font-semibold text-[var(--text-primary)]">
                Schedule Process
              </h3>
              <button
                onClick={onClose}
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mb-4">
              <p className="text-sm font-medium text-[var(--text-primary)]">
                {process.title}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <CadenceBadge cadence={process.cadence} />
                <span className="text-xs text-[var(--text-muted)]">
                  {process.defaultDurationMinutes} min
                </span>
              </div>
            </div>

            <div className="space-y-4">
              {/* Day-of-week picker for WEEKLY / BIWEEKLY */}
              {cadenceNeedsDayOfWeek(process.cadence) && (
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                    Day of Week
                  </label>
                  <div className="flex gap-1">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(
                      (day, i) => (
                        <button
                          key={day}
                          type="button"
                          onClick={() => setSchedDayOfWeek(i)}
                          className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition-colors ${
                            schedDayOfWeek === i
                              ? 'bg-indigo-600 text-white border border-indigo-600'
                              : 'text-[var(--text-secondary)] border border-[var(--border-color)] hover:border-[var(--glass-border)]'
                          }`}
                        >
                          {day}
                        </button>
                      )
                    )}
                  </div>
                </div>
              )}

              {/* Day-of-month picker for MONTHLY / QUARTERLY */}
              {cadenceNeedsDayOfMonth(process.cadence) && (
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                    Day of Month
                  </label>
                  <div className="flex flex-wrap gap-1">
                    {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setSchedDayOfMonth(d)}
                        className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors ${
                          schedDayOfMonth === d
                            ? 'bg-indigo-600 text-white border border-indigo-600'
                            : 'text-[var(--text-secondary)] border border-[var(--border-color)] hover:border-[var(--glass-border)]'
                        }`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Date picker for YEARLY / ONE_TIME */}
              {cadenceNeedsDate(process.cadence) && (
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                    Date
                  </label>
                  <input
                    type="date"
                    value={schedDate}
                    onChange={(e) => setSchedDate(e.target.value)}
                    className={`w-full ${INPUT_CLASSES}`}
                  />
                </div>
              )}

              {/* Time picker */}
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                  Time
                </label>
                <input
                  type="time"
                  value={schedTime}
                  onChange={(e) => setSchedTime(e.target.value)}
                  className={`w-full ${INPUT_CLASSES}`}
                />
              </div>

              {/* Duration display */}
              <div className="rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] p-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[var(--text-secondary)]">Duration</span>
                  <span className="text-[var(--text-primary)] font-medium">
                    {formatDurationDisplay(process.defaultDurationMinutes)}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={handleSubmit}
                disabled={
                  saving ||
                  (cadenceNeedsDate(process.cadence) && !schedDate)
                }
                className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
              >
                <Calendar className="h-4 w-4" />
                {saving ? 'Scheduling...' : 'Schedule'}
              </button>
              <button
                onClick={onClose}
                className="rounded-lg border border-[var(--border-color)] px-4 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
              >
                Cancel
              </button>
            </div>
          </m.div>
        </div>
      )}
    </AnimatePresence>
  );
}
