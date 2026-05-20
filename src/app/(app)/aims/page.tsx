'use client';

import { useState, useCallback } from 'react';
import useSWR, { mutate } from 'swr';
import {
  Flame,
  Clock,
  Repeat,
  Users,
  ToggleLeft,
  ToggleRight,
  Plus,
  X,
  Pencil,
  Check,
  CheckCircle2,
  Loader2,
  Trophy,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  RotateCcw,
  PauseCircle,
  PlayCircle,
} from 'lucide-react';
import { useToast } from '@/components/ui/ToastProvider';
import StreakHeatmap from '@/components/aims/StreakHeatmap';
import { AimProgressChart } from '@/components/aims/AimProgressChart';
import { AimCard as AimCardSimplified } from '@/components/aims/AimCard';
import { WorkoutSubTypes } from '@/components/aims/WorkoutSubTypes';
import type { BufferDerailInfo } from '@/lib/derailing-buffer';
type DerailInfo = BufferDerailInfo;
import {
  PHASE_LABELS as PHASE_LABELS_MAP,
  getEffectiveDuration,
  getEffectiveFrequency,
} from '@/lib/aim-phases';

interface AimCategory {
  id: string;
  name: string;
  description: string | null;
  defaultFrequency: number;
  defaultDurationMin: number;
  isGroupable: boolean;
  isDefault: boolean;
  isDaily: boolean;
  activities: string[] | null;
}

interface UserAim {
  id: string;
  userId: string;
  aimCategoryId: string;
  isActive: boolean;
  customDuration: number | null;
  customFrequency: number | null;
  customActivities: string[] | null;
  currentPhase: string;
  phaseStartedAt: string;
  completionCount: number;
  currentStreak: number;
  bestStreak: number;
  activeWeekdays: number;
  aimCategory: AimCategory;
}

interface AimInstance {
  id: string;
  userId: string;
  aimCategoryId: string;
  scheduledDate: string;
  status: string;
  completedAt: string | null;
}

function getTodayRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

interface DerailBatchResponse {
  [aimCategoryId: string]: {
    derailInfo: DerailInfo;
    history: { date: string; completed: boolean; status: string }[];
    expectedPerDay: number;
  };
}

function getStreakColor(streak: number): string {
  if (streak === 0) return 'text-gray-400';
  if (streak < 7) return 'text-orange-400';
  if (streak < 14) return 'text-orange-500';
  return 'text-red-500';
}

function getStreakColorOrMuted(streak: number): string {
  if (streak === 0) return 'text-[var(--text-muted)]';
  return getStreakColor(streak);
}

const STREAK_BANNER_KEY = 'streak-math-banner-dismissed-v1';

export default function AimsPage() {
  const toast = useToast();
  const { data: categories, isLoading: catsLoading } = useSWR<AimCategory[]>('/api/aims/categories');
  const { data: userAims, isLoading: aimsLoading, mutate: mutateAims } = useSWR<UserAim[]>('/api/aims/user');

  // One-time streak-update banner (localStorage, client-only).
  const [bannerDismissed, setBannerDismissed] = useState<boolean>(true); // default true to avoid flash
  // Read localStorage only on the client (avoid SSR mismatch).
  useState(() => {
    if (typeof window !== 'undefined') {
      setBannerDismissed(localStorage.getItem(STREAK_BANNER_KEY) === '1');
    }
  });
  const dismissBanner = () => {
    if (typeof window !== 'undefined') localStorage.setItem(STREAK_BANNER_KEY, '1');
    setBannerDismissed(true);
  };

  // Batch-fetch derail info for ALL active aims in one request (eliminates N+1 waterfall)
  const { data: derailBatch } = useSWR<DerailBatchResponse>('/api/aims/derail-batch?days=14');

  // Fetch today's instances to show completion status
  const { start: todayStart, end: todayEnd } = getTodayRange();
  const { data: todayInstances, mutate: mutateTodayInstances } = useSWR<AimInstance[]>(
    `/api/aims/instances?start=${todayStart}&end=${todayEnd}`
  );

  const { data: aimStreaks, mutate: mutateAimStreaks } = useSWR<any[]>('/api/streaks?type=aim');

  const getAimStreakData = useCallback(
    (categoryId: string): { count: number; id: string | null; isActive: boolean } => {
      if (!Array.isArray(aimStreaks)) return { count: 0, id: null, isActive: true };
      const s = aimStreaks.find((x: any) => x.streakType === `aim_${categoryId}`);
      return { count: s?.currentCount ?? 0, id: s?.id ?? null, isActive: s?.isActive ?? true };
    },
    [aimStreaks]
  );

  const handleToggleAimStreak = useCallback(
    async (streakId: string, newIsActive: boolean) => {
      await fetch(`/api/streaks/${streakId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: newIsActive }),
      });
      mutateAimStreaks();
    },
    [mutateAimStreaks]
  );

  const [viewMode, setViewMode] = useState<'simplified' | 'full'>('simplified');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDuration, setEditDuration] = useState<number>(0);
  const [editFrequency, setEditFrequency] = useState<number>(0);
  const [editActiveWeekdays, setEditActiveWeekdays] = useState<number>(127);
  const [newActivity, setNewActivity] = useState('');
  const [editActivities, setEditActivities] = useState<string[]>([]);
  const [completingId, setCompletingId] = useState<string | null>(null);

  const emptyNewAim = {
    name: '',
    description: '',
    defaultFrequency: 3,
    defaultDurationMin: 30,
    isDaily: false,
    isGroupable: false,
  };
  const [showCreateAim, setShowCreateAim] = useState(false);
  const [newAim, setNewAim] = useState(emptyNewAim);
  const [creatingAim, setCreatingAim] = useState(false);

  const isLoading = catsLoading || aimsLoading;

  // Build a set of aimCategoryIds that are completed today
  const completedTodaySet = new Set<string>();
  const todayInstanceMap = new Map<string, AimInstance>();
  todayInstances?.forEach((inst) => {
    if (inst.status === 'COMPLETED') {
      completedTodaySet.add(inst.aimCategoryId);
    }
    // Keep the latest instance per category
    todayInstanceMap.set(inst.aimCategoryId, inst);
  });

  const completeToday = useCallback(
    async (aimCategoryId: string) => {
      // Only allow completion for enrolled (active) AIMS
      if (!isActive(aimCategoryId)) return;
      setCompletingId(aimCategoryId);
      try {
        // Check if an instance exists for today already
        let instance = todayInstanceMap.get(aimCategoryId);

        if (!instance) {
          // Create today's instance
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const res = await fetch('/api/aims/instances', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              aimCategoryId,
              scheduledDate: today.toISOString(),
            }),
          });
          if (!res.ok) {
            console.error('Failed to create instance');
            return;
          }
          instance = await res.json();
        }

        if (!instance) return;

        // Mark it as COMPLETED
        if (instance.status !== 'COMPLETED') {
          const res = await fetch(`/api/aims/instances/${instance.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'COMPLETED' }),
          });
          if (!res.ok) {
            console.error('Failed to complete instance');
            return;
          }
          const data = await res.json().catch(() => ({}));
          if (data.beeminderError) toast.error(`Beeminder sync failed: ${data.beeminderError}`);
        }

        // Refresh data
        await Promise.all([mutateAims(), mutateTodayInstances()]);
      } finally {
        setCompletingId(null);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [todayInstanceMap, mutateAims, mutateTodayInstances]
  );

  const userAimMap = new Map<string, UserAim>();
  userAims?.forEach((ua) => userAimMap.set(ua.aimCategoryId, ua));

  const isActive = (catId: string) => {
    const ua = userAimMap.get(catId);
    return ua ? ua.isActive : false;
  };

  const getDuration = (cat: AimCategory) => {
    const ua = userAimMap.get(cat.id);
    return ua?.customDuration ?? cat.defaultDurationMin;
  };

  const getFrequency = (cat: AimCategory) => {
    const ua = userAimMap.get(cat.id);
    return ua?.customFrequency ?? cat.defaultFrequency;
  };

  const getActivities = (cat: AimCategory) => {
    const ua = userAimMap.get(cat.id);
    return (ua?.customActivities ?? cat.activities ?? []) as string[];
  };

  const toggleAim = useCallback(
    async (catId: string) => {
      const currentlyActive = isActive(catId);
      // Optimistic update
      mutateAims(
        (current: UserAim[] | undefined) => {
          const list = Array.isArray(current) ? [...current] : [];
          const index = list.findIndex((ua) => ua.aimCategoryId === catId);
          if (index >= 0) {
            list[index] = { ...list[index], isActive: !currentlyActive };
            return list;
          }

          const category = categories?.find((cat) => cat.id === catId);
          if (!category) return list;

          list.push({
            id: `optimistic-${catId}`,
            userId: 'me',
            aimCategoryId: catId,
            isActive: !currentlyActive,
            customDuration: null,
            customFrequency: null,
            customActivities: null,
            currentPhase: 'SEED',
            phaseStartedAt: new Date().toISOString(),
            completionCount: 0,
            currentStreak: 0,
            bestStreak: 0,
            activeWeekdays: 127,
            aimCategory: category,
          });

          return list;
        },
        { revalidate: false },
      );
      try {
        await fetch('/api/aims/user', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            aims: [{ aimCategoryId: catId, isActive: !currentlyActive }],
          }),
        });
        mutateAims();
      } catch {
        mutateAims(); // Revert on error
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [categories, userAims, mutateAims]
  );

  const resetToSeed = useCallback(
    async (catId: string) => {
      if (!confirm('Reset this aim to Seed phase? This will clear your streak and completion count.')) return;
      await fetch('/api/aims/user', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aims: [{
            aimCategoryId: catId,
            currentPhase: 'SEED',
            phaseStartedAt: new Date().toISOString(),
            completionCount: 0,
            currentStreak: 0,
          }],
        }),
      });
      mutateAims();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mutateAims]
  );

  const startEditing = (cat: AimCategory) => {
    setEditingId(cat.id);
    setEditDuration(getDuration(cat));
    setEditFrequency(getFrequency(cat));
    setEditActivities(getActivities(cat));
    const ua = userAimMap.get(cat.id);
    setEditActiveWeekdays(ua?.activeWeekdays ?? 127);
  };

  const saveEditing = async (cat: AimCategory) => {
    const payload: Record<string, unknown> = {
      aimCategoryId: cat.id,
      isActive: isActive(cat.id),
      customDuration: editDuration !== cat.defaultDurationMin ? editDuration : null,
      customFrequency: editFrequency !== cat.defaultFrequency ? editFrequency : null,
    };

    if (cat.activities) {
      const defaultActs = (cat.activities as string[]) || [];
      const changed =
        editActivities.length !== defaultActs.length ||
        editActivities.some((a, i) => a !== defaultActs[i]);
      if (changed) {
        payload.customActivities = editActivities;
      }
    }

    // activeWeekdays only applies to daily aims
    if (cat.isDaily) {
      payload.activeWeekdays = editActiveWeekdays;
    }

    await fetch('/api/aims/user', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aims: [payload] }),
    });
    setEditingId(null);
    mutateAims();
  };

  const submitNewAim = async () => {
    const trimmedName = newAim.name.trim();
    if (!trimmedName) {
      toast.error('Name is required');
      return;
    }
    setCreatingAim(true);
    try {
      const res = await fetch('/api/aims/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmedName,
          description: newAim.description.trim() || null,
          defaultFrequency: Number(newAim.defaultFrequency),
          defaultDurationMin: Number(newAim.defaultDurationMin),
          isDaily: newAim.isDaily,
          isGroupable: newAim.isGroupable,
        }),
      });
      if (!res.ok) {
        toast.error('Failed to create Aim');
        return;
      }
      setShowCreateAim(false);
      setNewAim(emptyNewAim);
      await mutate('/api/aims/categories');
      toast.success('Aim created');
    } finally {
      setCreatingAim(false);
    }
  };

  const addActivity = () => {
    const trimmed = newActivity.trim().toLowerCase();
    if (trimmed && !editActivities.includes(trimmed)) {
      setEditActivities([...editActivities, trimmed]);
      setNewActivity('');
    }
  };

  const removeActivity = (act: string) => {
    setEditActivities(editActivities.filter((a) => a !== act));
  };

  const handleWorkoutSubTypesChange = async (catId: string, subTypes: { id: string; name: string; frequencyPerWeek: number }[]) => {
    const customActivities = subTypes.map((s) => s.name);
    setEditActivities(customActivities);
    await fetch('/api/aims/user', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        aims: [{ aimCategoryId: catId, customActivities }],
      }),
    });
    mutateAims();
  };

  const dailyCategories = categories?.filter((c) => c.isDaily) ?? [];
  const weeklyCategories = categories?.filter((c) => !c.isDaily) ?? [];

  const formatFrequency = (cat: AimCategory) => {
    const freq = getFrequency(cat);
    if (cat.isDaily) return 'Daily';
    return `${freq}x / week`;
  };

  const completeInstance = async (instanceId: string) => {
    // Optimistic update for today instances
    mutateTodayInstances(
      (current: AimInstance[] | undefined) =>
        (Array.isArray(current) ? current : []).map((inst) =>
          inst.id === instanceId ? { ...inst, status: 'COMPLETED' as const } : inst
        ),
      { revalidate: false },
    );
    try {
      const res = await fetch(`/api/aims/instances/${instanceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'COMPLETED' }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.beeminderError) toast.error(`Beeminder sync failed: ${data.beeminderError}`);
      mutateAims(); // Refresh user aims for streak/phase updates
    } catch {
      mutateTodayInstances(); // Revert on error
    }
  };

  const undoCompleteInstance = async (instanceId: string) => {
    mutateTodayInstances(
      (current: AimInstance[] | undefined) =>
        (Array.isArray(current) ? current : []).map((inst) =>
          inst.id === instanceId ? { ...inst, status: 'SCHEDULED', completedAt: null } : inst
        ),
      { revalidate: false },
    );
    try {
      await fetch(`/api/aims/instances/${instanceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'SCHEDULED' }),
      });
      mutateAims();
    } catch {
      mutateTodayInstances();
    }
  };

  function renderSimplifiedSection(title: string, cats: AimCategory[]) {
    if (cats.length === 0) return null;
    const activeCats = cats.filter((cat) => isActive(cat.id));
    const inactiveCats = cats.filter((cat) => !isActive(cat.id));

    return (
      <section>
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">{title}</h2>
        <div className="space-y-2">
          {activeCats.map((cat) => {
            const ua = userAimMap.get(cat.id);
            const inst = todayInstanceMap.get(cat.id);
            return (
              <AimCardSimplified
                key={cat.id}
                aim={{
                  id: ua?.id ?? `default-${cat.id}`,
                  aimCategory: { name: cat.name, description: cat.description ?? undefined, isDaily: cat.isDaily },
                  isActive: true,
                  currentPhase: ua?.currentPhase ?? 'SEED',
                  currentStreak: ua?.currentStreak ?? 0,
                  bestStreak: ua?.bestStreak ?? 0,
                  customDuration: ua?.customDuration ?? undefined,
                  customFrequency: ua?.customFrequency ?? undefined,
                }}
                todayInstance={inst ? { id: inst.id, status: inst.status } : undefined}
                onComplete={completeInstance}
                onUndo={undoCompleteInstance}
                onCompleteCategory={() => completeToday(cat.id)}
              />
            );
          })}
          {inactiveCats.map((cat) => (
            <div
              key={cat.id}
              className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-4 py-3 opacity-60 dark:border-gray-800 dark:bg-gray-950"
            >
              <span className="text-sm text-[var(--text-muted)]">{cat.name}</span>
              <button
                onClick={() => toggleAim(cat.id)}
                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium text-teal-500 hover:bg-teal-500/10 transition-colors"
                title="Enable this aim"
              >
                <ToggleLeft className="h-5 w-5" />
                Enable
              </button>
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold font-display text-[var(--text-primary)]">
          Aims
        </h1>
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--accent-primary)]" />
        </div>
      </div>
    );
  }

  if (!categories || categories.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold font-display text-[var(--text-primary)] flex items-center gap-2">
          <Flame className="h-6 w-6 text-teal-500" />
          Aims
        </h1>
        <div className="glass-panel p-8 text-center">
          <p className="text-[var(--text-secondary)]">No aim categories found.</p>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            An admin can seed the default categories from{' '}
            <a href="/settings" className="text-teal-400 underline hover:text-teal-300">Settings → Admin Panel</a>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* One-time streak-update banner */}
      {!bannerDismissed && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-teal-500/30 bg-teal-500/10 px-4 py-3">
          <p className="text-sm text-teal-300">
            Streak math updated — see your AIM heatmap for the new view.
          </p>
          <button
            onClick={dismissBanner}
            className="shrink-0 p-1 rounded text-teal-400 hover:text-teal-200 hover:bg-teal-500/20 transition-colors"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-display text-[var(--text-primary)] flex items-center gap-2">
            <Flame className="h-6 w-6 text-teal-500" />
            Aims
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Daily and weekly rituals that fuel peak performance.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setViewMode('simplified')}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                viewMode === 'simplified' ? 'bg-teal-600 text-white border border-teal-600' : 'text-[var(--text-secondary)] border border-[var(--border-color)] hover:text-[var(--text-primary)]'
              }`}
            >
              Simplified
            </button>
            <button
              onClick={() => setViewMode('full')}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                viewMode === 'full' ? 'bg-teal-600 text-white border border-teal-600' : 'text-[var(--text-secondary)] border border-[var(--border-color)] hover:text-[var(--text-primary)]'
              }`}
            >
              Full View
            </button>
          </div>
          <button
            onClick={() => setShowCreateAim(true)}
            className="flex items-center gap-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white px-3 py-1.5 text-xs font-medium transition-colors border border-teal-600"
          >
            <Plus className="h-3.5 w-3.5" />
            New Aim
          </button>
        </div>
      </div>

      {viewMode === 'simplified' ? (
        <>
          {renderSimplifiedSection('Daily Aims', dailyCategories)}
          {renderSimplifiedSection('Weekly Aims', weeklyCategories)}
        </>
      ) : (
        <>
          {/* Full View: existing detailed cards */}
          {dailyCategories.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">
                Daily Aims
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {dailyCategories.map((cat) => (
                  <AimCard
                    key={cat.id}
                    category={cat}
                    active={isActive(cat.id)}
                    duration={getDuration(cat)}
                    frequency={formatFrequency(cat)}
                    activities={getActivities(cat)}
                    userAim={userAimMap.get(cat.id)}
                    derailInfo={derailBatch?.[cat.id]?.derailInfo}
                    isEditing={editingId === cat.id}
                    editDuration={editDuration}
                    editFrequency={editFrequency}
                    editActiveWeekdays={editActiveWeekdays}
                    editActivities={editActivities}
                    newActivity={newActivity}
                    completedToday={completedTodaySet.has(cat.id)}
                    todayInstanceId={todayInstanceMap.get(cat.id)?.id}
                    completing={completingId === cat.id}
                    onToggle={() => toggleAim(cat.id)}
                    onComplete={() => completeToday(cat.id)}
                    onUndoComplete={() => {
                      const instanceId = todayInstanceMap.get(cat.id)?.id;
                      if (instanceId) void undoCompleteInstance(instanceId);
                    }}
                    onStartEdit={() => startEditing(cat)}
                    onSaveEdit={() => saveEditing(cat)}
                    onCancelEdit={() => setEditingId(null)}
                    onEditDurationChange={setEditDuration}
                    onEditFrequencyChange={setEditFrequency}
                    onEditActiveWeekdaysChange={setEditActiveWeekdays}
                    onNewActivityChange={setNewActivity}
                    onAddActivity={addActivity}
                    onRemoveActivity={removeActivity}
                    onResetToSeed={() => resetToSeed(cat.id)}
                    onMutateAims={mutateAims}
                    aimStreakData={getAimStreakData(cat.id)}
                    onToggleAimStreak={handleToggleAimStreak}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Weekly Aims Section */}
          <section>
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">
              Weekly Aims
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {weeklyCategories.map((cat) => (
                <AimCard
                  key={cat.id}
                  category={cat}
                  active={isActive(cat.id)}
                  duration={getDuration(cat)}
                  frequency={formatFrequency(cat)}
                  activities={getActivities(cat)}
                  userAim={userAimMap.get(cat.id)}
                  derailInfo={derailBatch?.[cat.id]?.derailInfo}
                  isEditing={editingId === cat.id}
                  editDuration={editDuration}
                  editFrequency={editFrequency}
                  editActiveWeekdays={editActiveWeekdays}
                  editActivities={editActivities}
                  newActivity={newActivity}
                  completedToday={completedTodaySet.has(cat.id)}
                  todayInstanceId={todayInstanceMap.get(cat.id)?.id}
                  completing={completingId === cat.id}
                  onToggle={() => toggleAim(cat.id)}
                  onComplete={() => completeToday(cat.id)}
                  onUndoComplete={() => {
                    const instanceId = todayInstanceMap.get(cat.id)?.id;
                    if (instanceId) void undoCompleteInstance(instanceId);
                  }}
                  onStartEdit={() => startEditing(cat)}
                  onSaveEdit={() => saveEditing(cat)}
                  onCancelEdit={() => setEditingId(null)}
                  onEditDurationChange={setEditDuration}
                  onEditFrequencyChange={setEditFrequency}
                  onEditActiveWeekdaysChange={setEditActiveWeekdays}
                  onNewActivityChange={setNewActivity}
                  onAddActivity={addActivity}
                  onRemoveActivity={removeActivity}
                  onResetToSeed={() => resetToSeed(cat.id)}
                  onMutateAims={mutateAims}
                  onWorkoutSubTypesChange={(subTypes) => handleWorkoutSubTypesChange(cat.id, subTypes)}
                  aimStreakData={getAimStreakData(cat.id)}
                  onToggleAimStreak={handleToggleAimStreak}
                />
              ))}
            </div>
          </section>
        </>
      )}

      {showCreateAim && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => !creatingAim && setShowCreateAim(false)}
        >
          <div
            className="glass-panel w-full max-w-md shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[var(--border-color)] px-5 py-4">
              <h2 className="text-lg font-semibold text-[var(--text-primary)] flex items-center gap-2">
                <Flame className="h-5 w-5 text-teal-500" />
                New Aim
              </h2>
              <button
                onClick={() => setShowCreateAim(false)}
                disabled={creatingAim}
                className="rounded p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/5 transition-colors disabled:opacity-50"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                  Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={newAim.name}
                  onChange={(e) => setNewAim({ ...newAim, name: e.target.value })}
                  maxLength={200}
                  autoFocus
                  placeholder="e.g. Morning meditation"
                  className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-teal-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                  Description
                </label>
                <textarea
                  value={newAim.description}
                  onChange={(e) => setNewAim({ ...newAim, description: e.target.value })}
                  maxLength={2000}
                  rows={2}
                  placeholder="What's this aim about?"
                  className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-teal-500 focus:outline-none resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                    Frequency / week
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={7}
                    value={newAim.defaultFrequency}
                    onChange={(e) =>
                      setNewAim({ ...newAim, defaultFrequency: Math.max(1, Number(e.target.value) || 1) })
                    }
                    disabled={newAim.isDaily}
                    className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-teal-500 focus:outline-none disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                    Duration (min)
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={newAim.defaultDurationMin}
                    onChange={(e) =>
                      setNewAim({ ...newAim, defaultDurationMin: Math.max(1, Number(e.target.value) || 1) })
                    }
                    className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-teal-500 focus:outline-none"
                  />
                </div>
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newAim.isDaily}
                    onChange={(e) =>
                      setNewAim({
                        ...newAim,
                        isDaily: e.target.checked,
                        defaultFrequency: e.target.checked ? 7 : newAim.defaultFrequency,
                      })
                    }
                    className="h-3.5 w-3.5 rounded border-[var(--border-color)] bg-[var(--input-bg)] text-teal-500 focus:ring-teal-500"
                  />
                  Daily
                </label>
                <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newAim.isGroupable}
                    onChange={(e) => setNewAim({ ...newAim, isGroupable: e.target.checked })}
                    className="h-3.5 w-3.5 rounded border-[var(--border-color)] bg-[var(--input-bg)] text-teal-500 focus:ring-teal-500"
                  />
                  Groupable
                </label>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-[var(--border-color)] px-5 py-3">
              <button
                onClick={() => setShowCreateAim(false)}
                disabled={creatingAim}
                className="rounded-lg border border-[var(--border-color)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)] transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={submitNewAim}
                disabled={creatingAim || !newAim.name.trim()}
                className="flex items-center gap-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 px-3 py-1.5 text-xs font-medium text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {creatingAim ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const PHASE_STYLES: Record<string, { dot: string; text: string; bg: string }> = {
  SEED:   { dot: 'bg-gray-400',   text: 'text-gray-400',   bg: 'bg-gray-400/10' },
  SPROUT: { dot: 'bg-green-400',  text: 'text-green-400',  bg: 'bg-green-400/10' },
  GROW:   { dot: 'bg-teal-400',   text: 'text-teal-400',   bg: 'bg-teal-400/10' },
  FLOW:   { dot: 'bg-amber-400',  text: 'text-amber-400',  bg: 'bg-amber-400/10' },
};

const PHASE_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(PHASE_LABELS_MAP).map(([k, v]) => [k, v.label])
);
const PHASE_DESCRIPTIONS: Record<string, string> = Object.fromEntries(
  Object.entries(PHASE_LABELS_MAP).map(([k, v]) => [k, v.description])
);

// C3: Phase-specific tooltip text
const PHASE_TOOLTIPS: Record<string, string> = {
  SEED:   'Seed -- Building the habit. Start small: 1x/week, 5 minutes.',
  SPROUT: 'Sprout -- Getting stronger. Increasing frequency and duration.',
  GROW:   'Grow -- Almost automatic. Approaching your full target.',
  FLOW:   'Flow -- In flow. Performing at your target level.',
};

interface AimCardProps {
  category: AimCategory;
  active: boolean;
  duration: number;
  frequency: string;
  activities: string[];
  userAim?: UserAim;
  derailInfo?: DerailInfo;
  isEditing: boolean;
  editDuration: number;
  editFrequency: number;
  editActiveWeekdays: number;
  editActivities: string[];
  newActivity: string;
  completedToday: boolean;
  todayInstanceId?: string;
  completing: boolean;
  onToggle: () => void;
  onComplete: () => void;
  onUndoComplete: () => void;
  onStartEdit: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onEditDurationChange: (v: number) => void;
  onEditFrequencyChange: (v: number) => void;
  onEditActiveWeekdaysChange: (v: number) => void;
  onNewActivityChange: (v: string) => void;
  onAddActivity: () => void;
  onRemoveActivity: (act: string) => void;
  onResetToSeed: () => void;
  onMutateAims: () => void;
  onWorkoutSubTypesChange?: (subTypes: { id: string; name: string; frequencyPerWeek: number }[]) => void;
  aimStreakData?: { count: number; id: string | null; isActive: boolean };
  onToggleAimStreak?: (id: string, isActive: boolean) => void;
}

function AimCard({
  category,
  active,
  duration,
  frequency,
  activities,
  userAim,
  derailInfo,
  isEditing,
  editDuration,
  editFrequency,
  editActiveWeekdays,
  editActivities,
  newActivity,
  completedToday,
  todayInstanceId,
  completing,
  onToggle,
  onComplete,
  onUndoComplete,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onEditDurationChange,
  onEditFrequencyChange,
  onEditActiveWeekdaysChange,
  onNewActivityChange,
  onAddActivity,
  onRemoveActivity,
  onResetToSeed,
  onMutateAims: _onMutateAims,
  onWorkoutSubTypesChange,
  aimStreakData,
  onToggleAimStreak,
}: AimCardProps) {
  const [chartExpanded, setChartExpanded] = useState(false);
  const phase = (userAim?.currentPhase || 'SEED') as string;
  const phaseStyle = PHASE_STYLES[phase] || PHASE_STYLES.SEED;
  const streak = userAim?.currentStreak ?? 0;
  const completionCount = userAim?.completionCount ?? 0;

  // C1: Use phase-aware dynamic functions from aim-phases.ts
  const aimLike = userAim
    ? {
        customDuration: userAim.customDuration,
        customFrequency: userAim.customFrequency,
        currentPhase: userAim.currentPhase,
        phaseStartedAt: userAim.phaseStartedAt,
        aimCategory: {
          defaultDurationMin: category.defaultDurationMin,
          defaultFrequency: category.defaultFrequency,
        },
      }
    : null;

  const effectiveDuration = aimLike ? getEffectiveDuration(aimLike) : duration;
  const effectiveFreq = aimLike ? getEffectiveFrequency(aimLike) : category.defaultFrequency;
  const isReduced = effectiveDuration < duration;

  // Format frequency display using effective frequency
  const effectiveFreqDisplay = category.isDaily
    ? 'Daily'
    : `${effectiveFreq}x / week`;
  const baseFreqDisplay = frequency; // original (target) frequency from parent

  return (
    <div
      className={`glass-panel rounded-xl p-4 transition-opacity ${
        active ? 'opacity-100' : 'opacity-50'
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-[var(--text-primary)] truncate">
              {category.name}
            </h3>
            {/* Derail status indicator */}
            {active && derailInfo && <DerailStatusBadge derailInfo={derailInfo} />}
          </div>
          {category.description && (
            <p className="text-xs text-[var(--text-muted)] mt-0.5 line-clamp-2">
              {category.description}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 ml-2 shrink-0">
          {/* C3: Phase badge with tooltip */}
          {active && (
            <span
              className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${phaseStyle.text} ${phaseStyle.bg}`}
              title={PHASE_TOOLTIPS[phase] || ''}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${phaseStyle.dot}`}
                title={PHASE_TOOLTIPS[phase] || ''}
              />
              {PHASE_LABELS[phase]}
            </span>
          )}
          {!isEditing && (
            <button
              onClick={onStartEdit}
              className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)] transition-colors"
              title="Edit"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={onToggle}
            className="transition-colors"
            title={active ? 'Disable' : 'Enable'}
          >
            {active ? (
              <ToggleRight className="h-6 w-6 text-teal-500" />
            ) : (
              <ToggleLeft className="h-6 w-6 text-[var(--text-muted)]" />
            )}
          </button>
        </div>
      </div>

      {/* Get back on track — shown when the aim has derailed. */}
      {active && derailInfo?.status === 'derailed' && (
        <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2">
          <p className="text-xs text-red-300">
            You&apos;ve derailed on this aim. Reset your buffer and try again.
          </p>
          <button
            onClick={async () => {
              try {
                const res = await fetch(`/api/aims/${category.id}/back-on-track`, { method: 'POST' });
                if (res.ok && typeof window !== 'undefined') window.location.reload();
              } catch {
                // best-effort
              }
            }}
            className="text-xs font-semibold text-red-200 bg-red-500/30 hover:bg-red-500/40 rounded px-2 py-1 transition-colors shrink-0"
          >
            Get back on track
          </button>
        </div>
      )}

      {/* Phase description */}
      {active && (
        <div className="mt-2">
          <span className={`text-[10px] ${phaseStyle.text}`}>
            {PHASE_DESCRIPTIONS[phase]}
          </span>
        </div>
      )}

      {/* Streak display - prominent and always visible */}
      {active && (
        <div className="mt-2 flex items-center gap-3 rounded-lg bg-[var(--surface-raised)] px-3 py-2">
          {/* C3: Tooltip on flame/streak icon */}
          <span title={`Current streak: ${streak} ${category.isDaily ? 'days' : 'weeks'}`}>
            <Flame className={`h-5 w-5 shrink-0 ${getStreakColor(streak)}`} />
          </span>
          <div className="flex-1 min-w-0">
            <span
              className={`text-sm font-semibold ${getStreakColorOrMuted(streak)}`}
              title={`Current streak: ${streak} ${category.isDaily ? 'days' : 'weeks'}`}
            >
              {streak === 0
                ? 'No streak'
                : category.isDaily
                  ? `${streak} day streak${streak >= 14 ? ' \u{1F525}\u{1F525}' : streak >= 7 ? ' \u{1F525}' : ''}`
                  : `${streak} week streak${streak >= 14 ? ' \u{1F525}\u{1F525}' : streak >= 7 ? ' \u{1F525}' : ''}`}
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {(userAim?.bestStreak ?? 0) > 0 && (
              <span className="flex items-center gap-1 text-xs text-[var(--text-muted)]" title="Best streak">
                <Trophy className="h-3.5 w-3.5 text-amber-400" />
                Best: {userAim?.bestStreak}
              </span>
            )}
            {/* C3: Tooltip on completion count */}
            {completionCount > 0 && (
              <span
                className="text-xs text-[var(--text-muted)] ml-1"
                title={`Total completions: ${completionCount}`}
              >
                {completionCount} done
              </span>
            )}
            {aimStreakData?.id && onToggleAimStreak && (
              <button
                onClick={() => onToggleAimStreak(aimStreakData.id!, !aimStreakData.isActive)}
                className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
                title={aimStreakData.isActive ? 'Pause streak tracking' : 'Resume streak tracking'}
              >
                {aimStreakData.isActive ? (
                  <PauseCircle className="h-4 w-4" />
                ) : (
                  <PlayCircle className="h-4 w-4" />
                )}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Streak heatmap */}
      {active && !isEditing && (
        <div className="mt-2">
          <StreakHeatmap aimCategoryId={category.id} />
        </div>
      )}

      {/* Progress chart toggle */}
      {active && !isEditing && (
        <button
          onClick={() => setChartExpanded(!chartExpanded)}
          className="mt-2 flex w-full items-center justify-between rounded-lg border border-[var(--border-color)] bg-[var(--surface)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] transition-colors"
        >
          <span>Progress Chart</span>
          {chartExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
      )}
      {active && chartExpanded && !isEditing && (
        <div className="mt-2">
          <AimProgressChart aimCategoryId={category.id} days={30} />
        </div>
      )}

      {/* Stats Row — uses effective (phase-aware) duration and frequency */}
      <div className="flex items-center gap-3 mt-2 text-xs text-[var(--text-secondary)]">
        <span className="flex items-center gap-1">
          <Clock className="h-3.5 w-3.5" />
          {isReduced ? (
            <><span>{effectiveDuration} min</span><span className="text-[var(--text-muted)] line-through ml-1">{duration}</span></>
          ) : (
            <>{duration} min</>
          )}
        </span>
        <span className="flex items-center gap-1">
          <Repeat className="h-3.5 w-3.5" />
          {effectiveFreqDisplay !== baseFreqDisplay ? (
            <><span>{effectiveFreqDisplay}</span><span className="text-[var(--text-muted)] line-through ml-1">{baseFreqDisplay}</span></>
          ) : (
            <>{effectiveFreqDisplay}</>
          )}
        </span>
        {category.isGroupable && (
          <span
            className="flex items-center gap-1 text-teal-500 bg-teal-500/10 px-1.5 py-0.5 rounded-full cursor-help"
            title="Team members can see and join this AIM session. Toggle in settings below."
          >
            <Users className="h-3 w-3" />
            Groupable
          </span>
        )}
      </div>

      {/* Complete Today Button + Schedule Button */}
      {active && !isEditing && (
        <div className="mt-3 flex items-center gap-2">
          {completedToday ? (
            <>
              <div className="flex items-center gap-1.5 text-xs font-medium text-green-500">
                <CheckCircle2 className="h-4 w-4" />
                Completed today
              </div>
              {todayInstanceId && (
                <button
                  onClick={onUndoComplete}
                  className="flex items-center gap-1.5 rounded-lg border border-[var(--border-color)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] transition-colors"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Undo
                </button>
              )}
            </>
          ) : (
            <button
              onClick={onComplete}
              disabled={completing}
              className="flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {completing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}
              {completing ? 'Completing...' : 'Complete Today'}
            </button>
          )}
        </div>
      )}


      {/* Activities (non-editing) */}
      {!isEditing && activities.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {activities.map((act) => (
            <span
              key={act}
              className="text-xs px-2 py-0.5 rounded-full bg-[var(--surface-raised)] text-[var(--text-secondary)] border border-[var(--border-color)]"
            >
              {act}
            </span>
          ))}
        </div>
      )}

      {/* Editing Mode */}
      {isEditing && (
        <div className="mt-3 space-y-3 border-t border-[var(--border-color)] pt-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-[var(--text-secondary)]">
                Duration (min)
              </label>
              <input
                type="number"
                min={5}
                step={5}
                value={editDuration}
                onChange={(e) => onEditDurationChange(parseInt(e.target.value) || 0)}
                className="mt-1 w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface)] px-2 py-1.5 text-sm text-[var(--text-primary)]"
              />
            </div>
            {!category.isDaily && (
              <div>
                <label className="text-xs font-medium text-[var(--text-secondary)]">
                  Frequency (/week)
                </label>
                <input
                  type="number"
                  min={1}
                  max={7}
                  value={editFrequency}
                  onChange={(e) => onEditFrequencyChange(parseInt(e.target.value) || 1)}
                  className="mt-1 w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface)] px-2 py-1.5 text-sm text-[var(--text-primary)]"
                />
              </div>
            )}
          </div>

          {/* Active weekdays picker — only for daily aims */}
          {category.isDaily && (
            <div>
              <label className="text-xs font-medium text-[var(--text-secondary)]">
                Active days
              </label>
              <div className="mt-1.5 flex gap-1">
                {(['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] as const).map((label, idx) => {
                  const bit = 1 << idx; // Sun=1, Mon=2, …, Sat=64
                  const active = (editActiveWeekdays & bit) !== 0;
                  return (
                    <button
                      key={label}
                      type="button"
                      onClick={() => onEditActiveWeekdaysChange(active ? editActiveWeekdays & ~bit : editActiveWeekdays | bit)}
                      className={`flex-1 rounded py-1 text-[10px] font-semibold transition-colors ${
                        active
                          ? 'bg-teal-600 text-white border border-teal-600'
                          : 'bg-[var(--surface)] text-[var(--text-muted)] border border-[var(--border-color)] hover:border-teal-500'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Activities Editor (for categories that have activities) */}
          {category.activities && (
            <div>
              <label className="text-xs font-medium text-[var(--text-secondary)]">
                Activities
              </label>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {editActivities.map((act) => (
                  <span
                    key={act}
                    className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-[var(--surface-raised)] text-[var(--text-secondary)] border border-[var(--border-color)]"
                  >
                    {act}
                    <button
                      onClick={() => onRemoveActivity(act)}
                      className="text-[var(--text-muted)] hover:text-red-400 transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2 mt-2">
                <input
                  type="text"
                  value={newActivity}
                  onChange={(e) => onNewActivityChange(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && onAddActivity()}
                  placeholder="Add activity..."
                  className="flex-1 rounded-lg border border-[var(--border-color)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--text-primary)]"
                />
                <button
                  onClick={onAddActivity}
                  className="rounded-lg bg-teal-600 px-2 py-1 text-xs text-white hover:bg-teal-700 transition-colors"
                >
                  <Plus className="h-3 w-3" />
                </button>
              </div>
            </div>
          )}

          {/* WorkoutSubTypes for exercise-related categories */}
          {/exercise|workout|fitness|gym|physical/i.test(category.name) && (
            <WorkoutSubTypes
              subTypes={(editActivities || []).map((a: string, i: number) => ({
                id: String(i),
                name: typeof a === 'string' ? a : (a as any).name || a,
                frequencyPerWeek: (a as any).frequencyPerWeek || 1,
              }))}
              onChange={(newTypes) => {
                onWorkoutSubTypesChange?.(newTypes);
              }}
              editable
            />
          )}

          <div className="flex justify-between">
            {/* C2: Reset to Seed button */}
            <button
              onClick={onResetToSeed}
              className="flex items-center gap-1 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-500 hover:bg-red-500/20 transition-colors"
              title="Reset aim to Seed phase, clearing streak and completion count"
            >
              <RotateCcw className="h-3 w-3" />
              Reset to Seed
            </button>
            <div className="flex gap-2">
              <button
                onClick={onCancelEdit}
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={onSaveEdit}
                className="flex items-center gap-1 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700 transition-colors"
              >
                <Check className="h-3 w-3" />
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Derail Status Badge ----

const DERAIL_STYLES: Record<string, { dot: string; text: string; bg: string; label: string }> = {
  on_track: { dot: 'bg-green-500', text: 'text-green-500', bg: 'bg-green-500/10', label: 'On Track' },
  caution:  { dot: 'bg-yellow-500', text: 'text-yellow-500', bg: 'bg-yellow-500/10', label: 'Heads up' },
  derailed: { dot: 'bg-red-600', text: 'text-red-400', bg: 'bg-red-600/10', label: 'Derailed' },
};

function DerailStatusBadge({ derailInfo }: { derailInfo: DerailInfo }) {
  const style = DERAIL_STYLES[derailInfo.status] || DERAIL_STYLES.on_track;
  const buf = derailInfo.safetyBufferDays;
  return (
    <span
      className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${style.text} ${style.bg} shrink-0`}
      title={derailInfo.message}
    >
      {derailInfo.status === 'derailed' && <AlertTriangle className="h-3 w-3" />}
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      {style.label}
      {derailInfo.status !== 'derailed' && (
        <span className="ml-0.5 opacity-70">({buf.toFixed(1)}d buffer)</span>
      )}
    </span>
  );
}
