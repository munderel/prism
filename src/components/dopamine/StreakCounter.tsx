'use client';

import { useMemo } from 'react';
import { m } from 'framer-motion';
import { Flame } from 'lucide-react';
import useSWR from 'swr';

interface StreakCounterProps {
  streakType?: string;
  atRisk?: boolean;
}

function getStreakStyle(atRisk: boolean, count: number): { container: string; flame: string } {
  if (atRisk) {
    return { container: 'border-orange-600/30 bg-orange-600/10', flame: 'text-orange-400' };
  }
  if (count > 0) {
    return { container: 'border-yellow-600/30 bg-yellow-600/10', flame: 'text-yellow-400' };
  }
  return { container: 'border-[var(--border-color)] bg-[var(--surface)]', flame: 'text-[var(--text-muted)]' };
}

export function StreakCounter({ streakType = 'daily_completion', atRisk = false }: StreakCounterProps) {
  const { data: streaks } = useSWR('/api/streaks');
  const streak = useMemo(
    () => Array.isArray(streaks) ? streaks.find((s: any) => s.streakType === streakType) : null,
    [streaks, streakType]
  );

  const count = streak?.currentCount ?? 0;
  const style = getStreakStyle(atRisk, count);

  return (
    <m.div
      className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${style.container}`}
      animate={atRisk ? { scale: [1, 1.02, 1] } : {}}
      transition={atRisk ? { repeat: Infinity, duration: 1.5 } : {}}
    >
      <m.div
        animate={count > 0 ? { rotate: [-5, 5, -5] } : {}}
        transition={{ repeat: Infinity, duration: 2.5, repeatType: 'mirror' }}
      >
        <Flame className={`h-5 w-5 ${style.flame}`} />
      </m.div>
      <div>
        <m.span
          key={count}
          initial={{ scale: 1.5 }}
          animate={{ scale: 1 }}
          className="text-lg font-bold text-[var(--text-primary)]"
        >
          {count}
        </m.span>
        <span className="text-xs text-[var(--text-muted)] ml-1">day streak</span>
      </div>
    </m.div>
  );
}
