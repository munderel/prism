'use client';

import { useState, useEffect } from 'react';
import { m } from 'framer-motion';
import { Flame } from 'lucide-react';

interface StreakCounterProps {
  streakType?: string;
  atRisk?: boolean;
}

export function StreakCounter({ streakType = 'daily_completion', atRisk = false }: StreakCounterProps) {
  const [streak, setStreak] = useState<any>(null);

  useEffect(() => {
    fetch('/api/streaks')
      .then((r) => r.json())
      .then((streaks) => {
        const s = streaks.find((s: any) => s.streakType === streakType);
        setStreak(s);
      });
  }, [streakType]);

  const count = streak?.currentCount ?? 0;

  return (
    <m.div
      className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${
        atRisk
          ? 'border-orange-600/30 bg-orange-600/10'
          : count > 0
          ? 'border-yellow-600/30 bg-yellow-600/10'
          : 'border-gray-800 bg-gray-900/50'
      }`}
      animate={atRisk ? { scale: [1, 1.02, 1] } : {}}
      transition={atRisk ? { repeat: Infinity, duration: 1.5 } : {}}
    >
      <m.div
        animate={count > 0 ? { rotate: [-5, 5, -5] } : {}}
        transition={{ repeat: Infinity, duration: 0.5 }}
      >
        <Flame className={`h-5 w-5 ${atRisk ? 'text-orange-400' : count > 0 ? 'text-yellow-400' : 'text-gray-600'}`} />
      </m.div>
      <div>
        <m.span
          key={count}
          initial={{ scale: 1.5 }}
          animate={{ scale: 1 }}
          className="text-lg font-bold text-white"
        >
          {count}
        </m.span>
        <span className="text-xs text-gray-500 ml-1">day streak</span>
      </div>
    </m.div>
  );
}
