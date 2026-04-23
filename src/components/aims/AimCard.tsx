'use client';

import { Check, Clock, ChevronRight } from 'lucide-react';
import { useTaskTypeColors } from '@/hooks/useTaskTypeColors';

interface AimCardProps {
  aim: {
    id: string;
    aimCategory: { name: string; description?: string };
    isActive: boolean;
    currentPhase: string; // SEED, SPROUT, GROW, FLOW
    currentStreak: number;
    bestStreak: number;
    customDuration?: number;
    customFrequency?: number;
    lastCompletedAt?: string;
  };
  todayInstance?: {
    id: string;
    status: string;
    selectedActivity?: string;
    timeBlockStart?: string;
    timeBlockEnd?: string;
  };
  onComplete?: (instanceId: string) => void;
  onUndo?: (instanceId: string) => void;
  onExpand?: (aimId: string) => void;
  // Lets the parent handle completion when no todayInstance exists yet (e.g.,
  // simplified view where the instance is created on first click).
  onCompleteCategory?: () => void | Promise<void>;
}

const phaseConfig: Record<string, { label: string; bg: string; text: string }> = {
  SEED: { label: 'Seed', bg: 'bg-gray-100 dark:bg-gray-700', text: 'text-gray-600 dark:text-gray-300' },
  SPROUT: { label: 'Sprout', bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-400' },
  GROW: { label: 'Grow', bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-400' },
  FLOW: { label: 'Flow', bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-400' },
};

function formatTime(isoOrTime?: string): string | null {
  if (!isoOrTime) return null;
  const date = new Date(isoOrTime);
  if (isNaN(date.getTime())) return isoOrTime;
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function AimCard({
  aim,
  todayInstance,
  onComplete,
  onUndo,
  onExpand,
  onCompleteCategory,
}: AimCardProps) {
  const { colors } = useTaskTypeColors();
  const phase = phaseConfig[aim.currentPhase] ?? phaseConfig.SEED;
  const isCompleted = todayInstance?.status === 'COMPLETED';
  const scheduledTime = formatTime(todayInstance?.timeBlockStart);
  const showCheckbox =
    aim.isActive && (todayInstance != null || onCompleteCategory != null);

  const handleComplete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isCompleted) return;
    if (todayInstance && onComplete) {
      onComplete(todayInstance.id);
    } else if (onCompleteCategory) {
      void onCompleteCategory();
    }
  };

  const handleUndo = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (todayInstance && onUndo && isCompleted) {
      onUndo(todayInstance.id);
    }
  };

  return (
    <div
      onClick={() => onExpand?.(aim.id)}
      className={`group flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 transition-all hover:shadow-md ${
        aim.isActive
          ? 'border-gray-200 bg-white hover:border-teal-300 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-teal-600'
          : 'border-gray-100 bg-gray-50 opacity-60 dark:border-gray-800 dark:bg-gray-950'
      }`}
      style={aim.isActive ? { borderLeftWidth: 3, borderLeftColor: colors.AIM.color } : undefined}
    >
      {/* Complete checkbox */}
      {showCheckbox && (
        <button
          onClick={isCompleted ? handleUndo : handleComplete}
          className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
            isCompleted
              ? 'border-teal-500 bg-teal-500 text-white'
              : 'border-gray-300 hover:border-teal-400 dark:border-gray-600'
          }`}
        >
          {isCompleted && <Check className="h-3.5 w-3.5" />}
        </button>
      )}

      {/* Main content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
            {aim.aimCategory.name}
          </span>
          <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${phase.bg} ${phase.text}`}>
            {phase.label}
          </span>
        </div>

        <div className="mt-0.5 flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
          {todayInstance?.selectedActivity && (
            <span className="truncate">{todayInstance.selectedActivity}</span>
          )}
          {scheduledTime && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {scheduledTime}
            </span>
          )}
        </div>
      </div>

      {/* Streak */}
      <div className="flex flex-shrink-0 flex-col items-center">
        <span className="text-lg font-bold text-gray-900 dark:text-gray-100">
          {aim.currentStreak}
        </span>
        <span className="text-[10px] text-gray-400">{'\uD83D\uDD25'} week streak</span>
      </div>

      {/* Expand indicator */}
      <ChevronRight className="h-4 w-4 flex-shrink-0 text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-gray-500 dark:text-gray-600" />
    </div>
  );
}
