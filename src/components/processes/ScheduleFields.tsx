'use client';

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
      {scheduledTime && (
        <p className="text-xs text-cyan-700 dark:text-cyan-400 mt-1">
          Will appear on calendar at {scheduledTime}
        </p>
      )}
    </div>
  );
}
