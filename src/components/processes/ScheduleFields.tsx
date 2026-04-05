'use client';

import { X } from 'lucide-react';
import { cadenceNeedsDayOfWeek, cadenceNeedsDayOfMonth, DAY_NAMES, INPUT_CLASSES } from '@/lib/process-constants';

interface ScheduleFieldsProps {
  cadence: string;
  scheduledTime: string;
  dayOfWeek: number;
  dayOfMonth: number;
  onTimeChange: (v: string) => void;
  onDayOfWeekChange: (v: number) => void;
  onDayOfMonthChange: (v: number) => void;
  label: string;
  scheduleStartDate?: string;
  onStartDateChange?: (v: string) => void;
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function ScheduleFields({
  cadence,
  scheduledTime,
  dayOfWeek,
  dayOfMonth,
  onTimeChange,
  onDayOfWeekChange,
  onDayOfMonthChange,
  label,
  scheduleStartDate,
  onStartDateChange,
}: ScheduleFieldsProps) {
  return (
    <div>
      <label className="block text-xs text-[var(--text-secondary)] mb-1">{label}</label>
      <div className="flex flex-wrap gap-2">
        <input
          type="time"
          value={scheduledTime}
          onChange={(e) => onTimeChange(e.target.value)}
          className={INPUT_CLASSES}
          placeholder="Time"
        />
        {cadenceNeedsDayOfWeek(cadence) && (
          <select
            value={dayOfWeek}
            onChange={(e) => onDayOfWeekChange(Number(e.target.value))}
            className={INPUT_CLASSES}
          >
            {DAY_NAMES.map((d, i) => (
              <option key={i} value={i}>
                {d}
              </option>
            ))}
          </select>
        )}
        {cadenceNeedsDayOfMonth(cadence) && (
          <select
            value={dayOfMonth}
            onChange={(e) => onDayOfMonthChange(Number(e.target.value))}
            className={INPUT_CLASSES}
          >
            {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>
                Day {d}
              </option>
            ))}
          </select>
        )}
      </div>

      {onStartDateChange && (
        <div className="mt-2">
          <label className="block text-xs text-[var(--text-secondary)] mb-1">Start from</label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={scheduleStartDate || ''}
              onChange={(e) => onStartDateChange(e.target.value)}
              className={INPUT_CLASSES}
            />
            <button
              type="button"
              onClick={() => onStartDateChange(todayISO())}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                scheduleStartDate === todayISO()
                  ? 'bg-indigo-600 text-white border border-indigo-600'
                  : 'text-[var(--text-secondary)] border border-[var(--border-color)] hover:border-indigo-400 hover:text-indigo-500'
              }`}
            >
              Start today
            </button>
            {scheduleStartDate && (
              <button
                type="button"
                onClick={() => onStartDateChange('')}
                className="rounded-lg p-1.5 text-[var(--text-muted)] hover:text-[var(--text-secondary)] border border-[var(--border-color)] transition-colors"
                title="Clear start date"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <p className="text-[10px] text-[var(--text-muted)] mt-1">
            {scheduleStartDate
              ? `First occurrence on ${scheduleStartDate}, then normal cadence.`
              : 'First occurrence computed from cadence rules.'}
          </p>
        </div>
      )}

      {scheduledTime && (
        <p className="text-xs text-cyan-700 dark:text-cyan-400 mt-1">
          Will appear on calendar at {scheduledTime}
        </p>
      )}
    </div>
  );
}
