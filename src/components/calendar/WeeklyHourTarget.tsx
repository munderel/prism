'use client';

import { WEEKLY_HOUR_TARGET, WEEKLY_HOUR_WARNING } from '@/lib/prism-colors';

interface WeeklyHourTargetProps {
  scheduledHours: number;
  className?: string;
}

export function WeeklyHourTarget({ scheduledHours, className = '' }: WeeklyHourTargetProps) {
  const percentage = Math.min(100, (scheduledHours / WEEKLY_HOUR_TARGET) * 100);

  const barColor =
    scheduledHours >= WEEKLY_HOUR_TARGET
      ? '#10b981'
      : scheduledHours >= WEEKLY_HOUR_WARNING
        ? '#fbbf24'
        : '#ef4444';

  return (
    <div className={`space-y-1 ${className}`}>
      <p className="text-sm text-gray-600">
        <span className="font-medium">{scheduledHours}h</span> / {WEEKLY_HOUR_TARGET}h scheduled
      </p>
      <div className="h-2 w-full rounded-full bg-gray-200">
        <div
          className="h-2 rounded-full transition-all duration-300"
          style={{ width: `${percentage}%`, backgroundColor: barColor }}
        />
      </div>
    </div>
  );
}
