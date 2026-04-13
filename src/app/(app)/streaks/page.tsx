'use client';

import { Flame } from 'lucide-react';
import { StreaksDashboard } from '@/components/streaks/StreaksDashboard';

export default function StreaksPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-[var(--text-primary)] flex items-center gap-2">
          <Flame className="h-6 w-6 text-yellow-400" />
          Streaks
        </h1>
      </div>
      <StreaksDashboard />
    </div>
  );
}
