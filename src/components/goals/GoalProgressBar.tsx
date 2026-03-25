'use client';

import React from 'react';
import { m } from 'framer-motion';

interface GoalProgressBarProps {
  progress: number;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

const sizeClasses = {
  sm: 'h-1.5',
  md: 'h-2.5',
  lg: 'h-4',
};

export const GoalProgressBar = React.memo(function GoalProgressBar({
  progress,
  size = 'md',
  showLabel = false,
}: GoalProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, progress));
  const isActive = clamped > 0 && clamped < 100;

  return (
    <div className="flex items-center gap-2">
      <div className={`flex-1 rounded-full bg-white/[0.06] ${sizeClasses[size]}`}>
        <m.div
          className={`${sizeClasses[size]} rounded-full bg-gradient-to-r from-prism-rose via-prism-amber to-prism-teal relative ${
            isActive ? 'progress-shimmer' : ''
          }`}
          style={{
            boxShadow: clamped > 0 ? '0 0 8px rgba(99, 102, 241, 0.3)' : 'none',
          }}
          initial={{ width: 0 }}
          animate={{ width: `${clamped}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>
      {showLabel && (
        <span className="text-xs text-[var(--text-secondary)] min-w-[3ch] text-right">
          {Math.round(clamped)}%
        </span>
      )}
    </div>
  );
});
