'use client';

import { motion } from 'framer-motion';

interface GoalProgressBarProps {
  progress: number;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

function getProgressColor(progress: number): string {
  if (progress <= 25) return 'bg-red-500';
  if (progress <= 50) return 'bg-yellow-500';
  if (progress <= 75) return 'bg-blue-500';
  return 'bg-green-500';
}

const sizeClasses = {
  sm: 'h-1.5',
  md: 'h-2.5',
  lg: 'h-4',
};

export function GoalProgressBar({
  progress,
  size = 'md',
  showLabel = false,
}: GoalProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, progress));

  return (
    <div className="flex items-center gap-2">
      <div className={`flex-1 rounded-full bg-gray-800 ${sizeClasses[size]}`}>
        <motion.div
          className={`${sizeClasses[size]} rounded-full ${getProgressColor(clamped)}`}
          initial={{ width: 0 }}
          animate={{ width: `${clamped}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>
      {showLabel && (
        <span className="text-xs text-gray-400 min-w-[3ch] text-right">
          {Math.round(clamped)}%
        </span>
      )}
    </div>
  );
}
