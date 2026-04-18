'use client';

import { useMemo, useState } from 'react';
import { m, AnimatePresence } from 'framer-motion';
import {
  Flame, ListChecks, ClipboardCheck, Moon, Trophy, Star,
  ChevronDown, Pause, Play, Info, RotateCcw,
} from 'lucide-react';
import useSWR, { useSWRConfig } from 'swr';
import { useSession } from 'next-auth/react';
import { PRISM_COLORS } from '@/lib/prism-colors';

// --- Types ---

interface Streak {
  id: string;
  streakType: string;
  currentCount: number;
  bestCount: number;
  lastActiveDate: string | null;
  isActive: boolean;
}

interface AimCategory {
  id: string;
  name: string;
}

interface BusinessFunction {
  processes: { id: string; name: string }[];
}

// --- Constants ---

const MILESTONES = [
  { days: 7, label: '7d', Icon: Flame, color: 'text-orange-400', bg: 'bg-orange-400/15' },
  { days: 14, label: '14d', Icon: Flame, color: 'text-orange-500', bg: 'bg-orange-500/15' },
  { days: 30, label: '30d', Icon: Star, color: 'text-yellow-400', bg: 'bg-yellow-400/15' },
  { days: 50, label: '50d', Icon: Trophy, color: 'text-yellow-500', bg: 'bg-yellow-500/15' },
  { days: 100, label: '100d', Icon: Trophy, color: 'text-amber-400', bg: 'bg-amber-400/15' },
];

const CATEGORIES = [
  { key: 'aims', label: 'Aims', prefix: 'aim_', Icon: Flame, prismKey: 'AIM' as const, unit: 'week', description: 'Consecutive weeks hitting your target frequency' },
  { key: 'processes', label: 'Processes', prefix: 'process_', Icon: ListChecks, prismKey: 'MAINTENANCE' as const, unit: 'day', description: 'Consecutive completions within the process cadence' },
  { key: 'reviews', label: 'Reviews', exact: 'review', Icon: ClipboardCheck, prismKey: 'REVIEW' as const, unit: 'day', description: 'Consecutive review completions' },
  { key: 'powerdown', label: 'Power Down', exact: 'powerdown', Icon: Moon, prismKey: 'POWER_DOWN' as const, unit: 'day', description: 'Consecutive evenings completing your power-down' },
] as const;

// --- Helpers ---

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function getHighestMilestone(bestCount: number): number {
  for (let i = MILESTONES.length - 1; i >= 0; i--) {
    if (bestCount >= MILESTONES[i].days) return MILESTONES[i].days;
  }
  return 0;
}

// --- Components ---

function CategoryCard({
  label, Icon, streaks, color, bg, border, unit, description,
}: {
  label: string;
  Icon: React.ElementType;
  streaks: Streak[];
  color: string;
  bg: string;
  border: string;
  unit: string;
  description: string;
}) {
  const best = Math.max(0, ...streaks.map((s) => s.currentCount));
  const allTimeBest = Math.max(0, ...streaks.map((s) => s.bestCount));
  const active = streaks.filter((s) => s.isActive && s.currentCount > 0).length;

  return (
    <m.div
      className="glass-panel p-4"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="flex items-center gap-2 mb-3">
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${bg}`} style={{ borderColor: border }}>
          <Icon className={`h-4 w-4`} style={{ color }} />
        </div>
        <span className="text-sm font-medium text-[var(--text-primary)]">{label}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-bold text-[var(--text-primary)]">{best}</span>
        <span className="text-xs text-[var(--text-muted)]">{unit}{best !== 1 ? 's' : ''}</span>
      </div>
      <p className="mt-1 text-[10px] text-[var(--text-muted)] leading-tight">{description}</p>
      <div className="mt-1.5 flex items-center gap-3 text-xs text-[var(--text-muted)]">
        <span>Best: {allTimeBest}</span>
        <span>{active} active</span>
      </div>
    </m.div>
  );
}

function StreakRow({
  streak, name, onTogglePause,
}: {
  streak: Streak;
  name: string;
  onTogglePause: (id: string, isActive: boolean) => void;
}) {
  const milestone = getHighestMilestone(streak.bestCount);

  return (
    <div className="flex items-center justify-between py-2 px-1 border-b border-[var(--border-color)] last:border-0">
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex flex-col min-w-0">
          <span className={`text-sm font-medium truncate ${streak.isActive ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)] line-through'}`}>
            {name}
          </span>
          <span className="text-xs text-[var(--text-muted)]">
            Last active: {formatDate(streak.lastActiveDate)}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-4">
        {milestone > 0 && (
          <span className="text-xs px-1.5 py-0.5 rounded-full bg-yellow-400/15 text-yellow-400 font-medium">
            {milestone}d
          </span>
        )}
        <div className="text-right">
          <span className="text-sm font-bold text-[var(--text-primary)]">{streak.currentCount}</span>
          <span className="text-xs text-[var(--text-muted)] ml-1">/ {streak.bestCount} best</span>
        </div>
        <button
          onClick={() => onTogglePause(streak.id, streak.isActive)}
          className="p-1.5 rounded-lg text-[var(--text-muted)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)] transition-colors"
          title={streak.isActive ? 'Pause streak' : 'Resume streak'}
        >
          {streak.isActive ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
}

function CategorySection({
  category, streaks, nameMap, onTogglePause,
}: {
  category: typeof CATEGORIES[number];
  streaks: Streak[];
  nameMap: Map<string, string>;
  onTogglePause: (id: string, isActive: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const colors = PRISM_COLORS[category.prismKey];

  if (streaks.length === 0) return null;

  return (
    <div className="glass-panel overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-[var(--hover-bg)] transition-colors"
      >
        <div className="flex items-center gap-2">
          <category.Icon className="h-5 w-5" style={{ color: colors.color }} />
          <span className="text-sm font-semibold text-[var(--text-primary)]">{category.label}</span>
          <span className="text-xs text-[var(--text-muted)]">({streaks.length})</span>
        </div>
        <m.div animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown className="h-4 w-4 text-[var(--text-muted)]" />
        </m.div>
      </button>
      <AnimatePresence>
        {expanded && (
          <m.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-3">
              {streaks.map((s) => (
                <StreakRow
                  key={s.id}
                  streak={s}
                  name={nameMap.get(s.streakType) ?? s.streakType}
                  onTogglePause={onTogglePause}
                />
              ))}
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// --- Main Dashboard ---

export function StreaksDashboard() {
  const { data: session } = useSession();
  const isAdmin = !!(session?.user as { isAdmin?: boolean } | undefined)?.isAdmin;
  const { data: streaks, isLoading } = useSWR<Streak[]>('/api/streaks');
  const { data: aimCategories } = useSWR<AimCategory[]>('/api/aims/categories');
  const { data: functions } = useSWR<BusinessFunction[]>('/api/processes');
  const { mutate } = useSWRConfig();

  // Under the simplified rule the daily streak is driven by powerdown, so if
  // the 'daily' row is missing (first powerdown ever, or a reset wiped it)
  // fall back to the 'powerdown' row so the hero card reflects reality.
  const daily = useMemo(() => {
    const list = streaks ?? [];
    return list.find((s) => s.streakType === 'daily') ?? list.find((s) => s.streakType === 'powerdown');
  }, [streaks]);

  const categorized = useMemo(() => {
    if (!streaks) return new Map<string, Streak[]>();
    const map = new Map<string, Streak[]>();
    for (const cat of CATEGORIES) {
      const filtered = streaks.filter((s) =>
        'exact' in cat ? s.streakType === cat.exact : s.streakType.startsWith(cat.prefix),
      );
      map.set(cat.key, filtered);
    }
    return map;
  }, [streaks]);

  const nameMap = useMemo(() => {
    const m = new Map<string, string>();
    if (aimCategories) {
      for (const a of aimCategories) m.set(`aim_${a.id}`, a.name);
    }
    if (functions) {
      for (const f of functions) {
        for (const p of f.processes) m.set(`process_${p.id}`, p.name);
      }
    }
    m.set('review', 'Weekly Review');
    m.set('powerdown', 'Power Down');
    m.set('daily', 'Daily');
    return m;
  }, [aimCategories, functions]);

  const earnedMilestones = useMemo(() => {
    if (!streaks) return new Set<number>();
    const bestOverall = Math.max(0, ...streaks.map((s) => s.bestCount));
    const earned = new Set<number>();
    for (const ms of MILESTONES) {
      if (bestOverall >= ms.days) earned.add(ms.days);
    }
    return earned;
  }, [streaks]);

  const [resetConfirm, setResetConfirm] = useState<'streaks' | 'leaderboard' | null>(null);

  const togglePause = async (streakId: string, currentlyActive: boolean) => {
    const prev = streaks;
    mutate('/api/streaks', (streaks ?? []).map((s: Streak) =>
      s.id === streakId ? { ...s, isActive: !currentlyActive } : s
    ), false);
    try {
      await fetch(`/api/streaks/${streakId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !currentlyActive }),
      });
      mutate('/api/streaks');
    } catch {
      mutate('/api/streaks', prev, false);
    }
  };

  const resetStreaks = async () => {
    setResetConfirm(null);
    await fetch('/api/streaks/reset', { method: 'POST' });
    mutate('/api/streaks');
  };

  const resetLeaderboard = async () => {
    setResetConfirm(null);
    await fetch('/api/leaderboard/reset', { method: 'POST' });
    mutate('/api/leaderboard');
  };

  if (isLoading) {
    return <div className="text-[var(--text-muted)] py-12 text-center">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Hero: Daily Streak */}
      <m.div
        className="glass-panel p-6 flex items-center gap-5"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <m.div
          animate={daily && daily.currentCount > 0 ? { rotate: [-5, 5, -5] } : {}}
          transition={{ repeat: Infinity, duration: 2.5, repeatType: 'mirror' }}
          className="flex h-16 w-16 items-center justify-center rounded-2xl bg-yellow-400/15"
        >
          <Flame className={`h-9 w-9 ${daily && daily.currentCount > 0 ? 'text-yellow-400' : 'text-[var(--text-muted)]'}`} />
        </m.div>
        <div>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-bold text-[var(--text-primary)]">
              {daily?.currentCount ?? 0}
            </span>
            <span className="text-sm text-[var(--text-muted)]">day streak</span>
          </div>
          <div className="mt-1 text-xs text-[var(--text-muted)]">
            Best: {daily?.bestCount ?? 0} days
            {daily?.lastActiveDate && <> &middot; Last active: {formatDate(daily.lastActiveDate)}</>}
          </div>
        </div>
      </m.div>

      {/* Category Overview Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {CATEGORIES.map((cat) => {
          const colors = PRISM_COLORS[cat.prismKey];
          return (
            <CategoryCard
              key={cat.key}
              label={cat.label}
              Icon={cat.Icon}
              streaks={categorized.get(cat.key) ?? []}
              color={colors.color}
              bg={colors.bgClass}
              border={colors.border}
              unit={cat.unit}
              description={cat.description}
            />
          );
        })}
      </div>

      {/* Milestone Badges */}
      <div className="glass-panel p-4">
        <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-3">Milestones</h2>
        <div className="flex flex-wrap gap-2">
          {MILESTONES.map((ms) => {
            const earned = earnedMilestones.has(ms.days);
            return (
              <m.div
                key={ms.days}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: ms.days * 0.002 }}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 border ${
                  earned
                    ? `${ms.bg} border-transparent`
                    : 'bg-[var(--surface)] border-[var(--border-color)] opacity-40'
                }`}
              >
                <ms.Icon className={`h-3.5 w-3.5 ${earned ? ms.color : 'text-[var(--text-muted)]'}`} />
                <span className={`text-xs font-medium ${earned ? ms.color : 'text-[var(--text-muted)]'}`}>
                  {ms.label}
                </span>
              </m.div>
            );
          })}
        </div>
      </div>

      {/* Category Sections */}
      <div className="space-y-3">
        {CATEGORIES.map((cat) => (
          <CategorySection
            key={cat.key}
            category={cat}
            streaks={categorized.get(cat.key) ?? []}
            nameMap={nameMap}
            onTogglePause={togglePause}
          />
        ))}
      </div>

      {/* How Streaks Work */}
      <div className="glass-panel p-4">
        <div className="flex items-center gap-2 mb-3">
          <Info className="h-4 w-4 text-[var(--text-muted)]" />
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">How Streaks Work</h2>
        </div>
        <div className="space-y-2 text-xs text-[var(--text-muted)] leading-relaxed">
          <p>
            <strong className="text-[var(--text-secondary)]">Daily streak</strong> increments each day you complete at least one enabled activity (aims, processes, reviews, or power-down). Miss a day and it resets.
          </p>
          <p>
            <strong className="text-[var(--text-secondary)]">Aim streaks</strong> track consecutive weeks where you hit your target frequency. If your aim is 3x/week, completing 3 or more sessions that week counts as on-target.
          </p>
          <p>
            <strong className="text-[var(--text-secondary)]">Process streaks</strong> track consecutive completions within the process cadence. A weekly process gives you 7 days to complete it before the streak breaks.
          </p>
          <p>
            <strong className="text-[var(--text-secondary)]">Pausing</strong> a streak freezes it in place. It won&apos;t increment or break while paused. Your best count is always preserved.
          </p>
          <p>
            You can enable a <strong className="text-[var(--text-secondary)]">grace day</strong> in Settings to get 1 extra day before any streak breaks.
          </p>
        </div>
      </div>

      {/* Reset Actions (admin only) */}
      {isAdmin && <div className="glass-panel p-4">
        <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-3">Reset</h2>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => setResetConfirm('streaks')}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-red-400 bg-red-400/10 hover:bg-red-400/20 transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset All Streaks
          </button>
          <button
            onClick={() => setResetConfirm('leaderboard')}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-red-400 bg-red-400/10 hover:bg-red-400/20 transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset Leaderboard Data
          </button>
        </div>
      </div>}

      {/* Reset Confirmation Modal */}
      <AnimatePresence>
        {resetConfirm && (
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={() => setResetConfirm(null)}
          >
            <m.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="glass-panel p-6 max-w-sm mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-2">
                {resetConfirm === 'streaks' ? 'Reset All Streaks?' : 'Reset Leaderboard Data?'}
              </h3>
              <p className="text-xs text-[var(--text-muted)] mb-4">
                {resetConfirm === 'streaks'
                  ? 'This will reset all streak counts to 0. Your best counts will be preserved. This cannot be undone.'
                  : 'This will zero all aim points and remove your public wins. This cannot be undone.'}
              </p>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setResetConfirm(null)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={resetConfirm === 'streaks' ? resetStreaks : resetLeaderboard}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-red-500 hover:bg-red-600 transition-colors"
                >
                  Reset
                </button>
              </div>
            </m.div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}
