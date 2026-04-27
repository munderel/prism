'use client';

import { useMemo } from 'react';
import { m } from 'framer-motion';
import { Flame } from 'lucide-react';
import Link from 'next/link';
import useSWR from 'swr';

interface StreakCounterProps {
  streakType?: string;
  atRisk?: boolean;
  compact?: boolean;
}

type StreakStyle = { container: string; flame: string };

function getStreakStyle(atRisk: boolean, paused: boolean, count: number): StreakStyle {
  if (paused) {
    return { container: 'border-amber-600/40 bg-amber-600/10', flame: 'text-amber-400' };
  }
  if (atRisk) {
    return { container: 'border-orange-600/30 bg-orange-600/10', flame: 'text-orange-400' };
  }
  if (count > 0) {
    return { container: 'border-yellow-600/30 bg-yellow-600/10', flame: 'text-yellow-400' };
  }
  return { container: 'border-[var(--border-color)] bg-[var(--surface)]', flame: 'text-[var(--text-muted)]' };
}

// Soft glow that gets warmer/wider at milestone tiers. Returns a framer-motion
// boxShadow keyframe array; when count is 0 returns undefined so the prop is
// dropped entirely and the static container className wins.
function getGlowKeyframes(count: number): string[] | undefined {
  if (count <= 0) return undefined;
  if (count >= 100) return ['0 0 8px rgba(251,191,36,0.4)', '0 0 22px rgba(251,191,36,0.7)', '0 0 8px rgba(251,191,36,0.4)'];
  if (count >= 30)  return ['0 0 6px rgba(251,191,36,0.3)', '0 0 16px rgba(251,191,36,0.55)', '0 0 6px rgba(251,191,36,0.3)'];
  if (count >= 7)   return ['0 0 4px rgba(250,204,21,0.25)', '0 0 12px rgba(250,204,21,0.45)', '0 0 4px rgba(250,204,21,0.25)'];
  return ['0 0 2px rgba(250,204,21,0.15)', '0 0 8px rgba(250,204,21,0.3)', '0 0 2px rgba(250,204,21,0.15)'];
}

export function StreakCounter({ streakType = 'daily', atRisk = false, compact = false }: StreakCounterProps) {
  const { data: streaks } = useSWR('/api/streaks');
  const streak = useMemo(() => {
    if (!Array.isArray(streaks)) return null;
    const exact = streaks.find((s: { streakType: string }) => s.streakType === streakType);
    if (exact) return exact;
    // Daily streak is driven by powerdown; fall back to the powerdown row
    // when no 'daily' row exists yet (e.g. fresh user, post-reset).
    if (streakType === 'daily') {
      return streaks.find((s: { streakType: string }) => s.streakType === 'powerdown') ?? null;
    }
    return null;
  }, [streaks, streakType]);

  const count = streak?.currentCount ?? 0;
  const paused = streak ? streak.isActive === false : false;
  const style = getStreakStyle(atRisk, paused, count);
  const glow = paused ? undefined : getGlowKeyframes(count);

  const motionAnimate: { scale?: number[]; boxShadow?: string[] } = {};
  const motionTransition: { duration?: number; repeat?: number } = {};
  if (atRisk) {
    motionAnimate.scale = [1, 1.02, 1];
    motionTransition.duration = 1.5;
    motionTransition.repeat = Infinity;
  } else if (glow) {
    motionAnimate.boxShadow = glow;
    motionTransition.duration = 2.4;
    motionTransition.repeat = Infinity;
  }

  const flameRotate = count > 0 && !paused ? { rotate: [-5, 5, -5] } : {};

  const inner = compact ? (
    <m.div
      className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 min-h-[36px] ${style.container}`}
      animate={motionAnimate}
      transition={motionTransition}
    >
      <m.div
        animate={flameRotate}
        transition={{ repeat: Infinity, duration: 2.5, repeatType: 'mirror' }}
      >
        <Flame className={`h-4 w-4 ${style.flame}`} />
      </m.div>
      <m.span
        key={count}
        initial={{ scale: 1.5 }}
        animate={{ scale: 1 }}
        className="text-sm font-bold text-[var(--text-primary)]"
      >
        {paused ? 'Paused' : count}
      </m.span>
    </m.div>
  ) : (
    <m.div
      className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${style.container}`}
      animate={motionAnimate}
      transition={motionTransition}
    >
      <m.div
        animate={flameRotate}
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
          {paused ? 'Paused' : count}
        </m.span>
        <span className="text-xs text-[var(--text-muted)] ml-1">
          {paused ? 'tap to resume' : 'day streak'}
        </span>
      </div>
    </m.div>
  );

  if (paused) {
    return (
      <Link href="/streaks" title="Streak paused — tap to resume">
        {inner}
      </Link>
    );
  }
  return inner;
}
