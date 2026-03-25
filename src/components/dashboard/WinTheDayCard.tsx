'use client';

import { Star, Trophy } from 'lucide-react';

interface WinTheDayCardProps {
  task: any | null;
}

export function WinTheDayCard({ task }: WinTheDayCardProps) {
  if (!task) {
    return (
      <div className="glass-panel border-dashed border-amber-500/20 p-4 mb-6 text-center">
        <div className="flex items-center justify-center gap-2 text-gray-500">
          <Star className="h-4 w-4" />
          <span className="text-sm">Flag a task as your Win the Day</span>
        </div>
      </div>
    );
  }

  const isDone = task.status === 'DONE';

  return (
    <div className="mb-6">
      <div className="glass-panel border-amber-500/40 shadow-[0_0_20px_rgba(245,158,11,0.15)] p-4">
        <div className="flex items-center gap-2 mb-3">
          <Star className="h-4 w-4 text-amber-400 fill-amber-400" />
          <span className="text-xs font-bold tracking-widest text-amber-400 uppercase">WIN THE DAY</span>
          {isDone && (
            <div className="ml-auto flex items-center gap-1.5">
              <Trophy className="h-4 w-4 text-amber-400" />
              <span className="text-xs font-semibold text-amber-400">You Won the Day!</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-sm font-medium ${isDone ? 'text-gray-500 line-through' : 'text-white'}`}>
            {task.title}
          </span>
        </div>
      </div>
    </div>
  );
}
