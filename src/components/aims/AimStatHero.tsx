'use client';

import useSWR from 'swr';
import { Flame, Trophy } from 'lucide-react';
import { isDayActive } from '@/lib/aim-streak-engine';
import { getStreakColor, getStreakColorOrMuted } from '@/lib/streak-colors';

interface DayEntry {
  date: string;
  scheduled: boolean;
  completed: boolean;
}

export interface AimStatHeroProps {
  aimCategoryId: string;
  isDaily: boolean;
  /** Sun=1 Mon=2 … Sat=64 — only meaningful for daily aims */
  activeWeekdays: number;
  /** Weekly completion target — effective frequency (phase-aware) */
  target: number;
  streak: number;
  bestStreak: number;
  /** Buffer days remaining (from BufferDerailInfo.safetyBufferDays). null when unavailable. */
  bufferDays: number | null;
  /** Phase label (e.g. "Flow"). Shown when no buffer data. */
  phaseLabel: string;
}

function todayLocalMidnight(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function localKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Monday of date's ISO week. */
function mondayOfWeek(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dow = d.getDay() || 7;
  d.setDate(d.getDate() - (dow - 1));
  return d;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/** Number of active weekdays remaining in this week (Mon→Sun ISO), including today. */
function activeDaysThisWeek(activeWeekdays: number): number {
  const monday = mondayOfWeek(todayLocalMidnight());
  let n = 0;
  for (let i = 0; i < 7; i++) {
    const dow = addDays(monday, i).getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6;
    if (isDayActive(activeWeekdays, dow)) n += 1;
  }
  return n;
}

/** Count completions in current ISO week from history. */
function completionsThisIsoWeek(history: DayEntry[]): number {
  const monday = mondayOfWeek(todayLocalMidnight());
  const keys = new Set(Array.from({ length: 7 }, (_, i) => localKey(addDays(monday, i))));
  return history.filter((e) => e.completed && keys.has(e.date)).length;
}

export default function AimStatHero({
  aimCategoryId,
  isDaily,
  activeWeekdays,
  target,
  streak,
  bestStreak,
  bufferDays,
  phaseLabel,
}: AimStatHeroProps) {
  // SWR will dedupe with StreakHeatmap's identical fetch.
  const { data: history } = useSWR<DayEntry[]>(
    `/api/aims/streak-history?aimCategoryId=${aimCategoryId}&days=14`,
  );

  const completedThisWeek = history ? completionsThisIsoWeek(history) : 0;
  const ringTarget = isDaily
    ? Math.max(activeDaysThisWeek(activeWeekdays), 1)
    : Math.max(target, 1);
  const ringValue = Math.min(completedThisWeek, ringTarget);
  const pctDegrees = (ringValue / ringTarget) * 360;

  const streakLabel = streak === 0
    ? (isDaily ? 'day streak' : 'week streak')
    : (isDaily ? 'day streak' : 'week streak');

  return (
    <div className="mt-3 grid grid-cols-[auto_1fr] items-center gap-4 rounded-xl border border-teal-500/15 bg-[var(--surface-raised)] p-3">
      {/* Progress ring */}
      <div
        className="relative grid h-[78px] w-[78px] place-items-center rounded-full"
        style={{
          backgroundImage: `conic-gradient(#2dd4bf 0deg ${pctDegrees}deg, rgba(255,255,255,0.06) ${pctDegrees}deg 360deg)`,
          boxShadow: ringValue >= ringTarget ? '0 0 16px rgba(45,212,191,0.35)' : undefined,
        }}
        title={`${completedThisWeek} of ${ringTarget} this week`}
      >
        <div className="absolute inset-[8px] rounded-full bg-[var(--surface)]" />
        <div className="relative z-10 text-center leading-none">
          <div className="text-[18px] font-bold text-[var(--text-primary)]">
            {completedThisWeek}
            <span className="ml-0.5 text-[11px] font-medium text-[var(--text-muted)]">
              /{ringTarget}
            </span>
          </div>
          <div className="mt-1 text-[10px] text-[var(--text-muted)]">this week</div>
        </div>
      </div>

      {/* Streak side */}
      <div className="min-w-0">
        <div className="flex items-baseline gap-1.5">
          <Flame className={`h-5 w-5 shrink-0 ${getStreakColor(streak)}`} />
          <span className={`text-lg font-bold ${getStreakColorOrMuted(streak)}`}>
            {streak === 0 ? '—' : streak}
          </span>
          <span className="text-xs text-[var(--text-muted)] font-normal">{streakLabel}</span>
          {streak >= 14 && <span aria-hidden>🔥🔥</span>}
          {streak >= 7 && streak < 14 && <span aria-hidden>🔥</span>}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--text-muted)]">
          {bestStreak > 0 && (
            <span className="flex items-center gap-1" title="Best streak">
              <Trophy className="h-3 w-3 text-amber-400" />
              Best: {bestStreak}
            </span>
          )}
          {bufferDays != null ? (
            <span title="Safety buffer remaining">Buffer: {bufferDays}d</span>
          ) : (
            <span>Phase: {phaseLabel}</span>
          )}
        </div>
      </div>
    </div>
  );
}
