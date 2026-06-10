'use client';

import { useState, useCallback, useEffect } from 'react';
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
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  RotateCcw,
  PauseCircle,
  PlayCircle,
  Target,
} from 'lucide-react';
import { useToast } from '@/components/ui/ToastProvider';
import { invalidateAfterAimChange } from '@/lib/swr-mutations';
import StreakHeatmap from '@/components/aims/StreakHeatmap';
import { AimProgressChart } from '@/components/aims/AimProgressChart';
import { AimCard as AimCardSimplified } from '@/components/aims/AimCard';
import AimStatHero from '@/components/aims/AimStatHero';
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
  linkedKpiId: string | null;
  kpiIncrement: number | null;
}

interface GoalStack {
  id: string;
  name: string;
}

interface Goal {
  id: string;
  title: string;
  level: string;
  deletedAt: string | null;
}

interface Kpi {
  id: string;
  name: string;
  type: string;
  unit: string | null;
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
  skipSeedPhase: boolean;
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

const STREAK_BANNER_KEY = 'streak-math-banner-dismissed-v1';

export default function AimsPage() {
  const toast = useToast();
  const { data: categories, isLoading: catsLoading } = useSWR<AimCategory[]>('/api/aims/categories');
  const { data: userAims, isLoading: aimsLoading, mutate: mutateAims } = useSWR<UserAim[]>('/api/aims/user');

  // One-time streak-update banner (localStorage, client-only).
  const [bannerDismissed, setBannerDismissed] = useState<boolean>(true); // default true to avoid SSR flash
  useEffect(() => {
    setBannerDismissed(localStorage.getItem(STREAK_BANNER_KEY) === '1');
  }, []);
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
  const [editSkipSeedPhase, setEditSkipSeedPhase] = useState<boolean>(false);
  const [newActivity, setNewActivity] = useState('');
  const [editActivities, setEditActivities] = useState<string[]>([]);
  const [completingId, setCompletingId] = useState<string | null>(null);

  // KPI linkage state (per edit session)
  const [editLinkedKpiId, setEditLinkedKpiId] = useState<string | null>(null);
  const [editKpiIncrement, setEditKpiIncrement] = useState<number>(1);
  const [kpiPickerStackId, setKpiPickerStackId] = useState<string | null>(null);
  const [kpiPickerGoalId, setKpiPickerGoalId] = useState<string | null>(null);

  // Stacks for KPI picker
  const { data: stacks } = useSWR<GoalStack[]>('/api/stacks');
  // Goals for selected stack — only fetch when a stack is selected.
  // /api/goals?stackId=... returns a raw array (not { goals: [...] }).
  const { data: stackGoals } = useSWR<Goal[]>(
    kpiPickerStackId ? `/api/goals?stackId=${kpiPickerStackId}` : null,
  );
  // KPIs for selected goal — only fetch when a goal is selected
  const { data: goalKpisData } = useSWR<{ kpis: Kpi[] }>(
    kpiPickerGoalId ? `/api/goals/${kpiPickerGoalId}/kpis` : null,
  );
  const numericKpisForGoal = (goalKpisData?.kpis ?? []).filter((k) => k.type === 'NUMERIC');
  const hasOnlyBinaryKpis =
    kpiPickerGoalId !== null &&
    (goalKpisData?.kpis ?? []).length > 0 &&
    numericKpisForGoal.length === 0;

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

        // Refresh data — local aim views plus cross-area (leaderboard, calendar, streaks).
        await Promise.all([mutateAims(), mutateTodayInstances(), invalidateAfterAimChange()]);
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
            skipSeedPhase: false,
            aimCategory: category,
          });

          return list;
        },
        { revalidate: false },
      );
      try {
        const res = await fetch('/api/aims/user', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            aims: [{ aimCategoryId: catId, isActive: !currentlyActive }],
          }),
        });
        if (!res.ok) toast.error('Failed to update aim');
        mutateAims();
      } catch {
        toast.error('Failed to update aim');
        mutateAims(); // Revert on error
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [categories, userAims, mutateAims]
  );

  const resetToSeed = useCallback(
    async (catId: string) => {
      if (!confirm('Reset this aim to Seed phase? This will clear your streak and completion count.')) return;
      const res = await fetch('/api/aims/user', {
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
      if (!res.ok) toast.error('Failed to reset aim');
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
    setEditSkipSeedPhase(ua?.skipSeedPhase ?? false);
    // KPI linkage state
    setEditLinkedKpiId(cat.linkedKpiId ?? null);
    setEditKpiIncrement(cat.kpiIncrement ?? 1);
    setKpiPickerStackId(null);
    setKpiPickerGoalId(null);
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

    // Per-aim SEED skip — only send when it changed from the stored value.
    if (editSkipSeedPhase !== (cat.id ? (userAimMap.get(cat.id)?.skipSeedPhase ?? false) : false)) {
      payload.skipSeedPhase = editSkipSeedPhase;
    }

    // KPI linkage lives on the shared AimCategory and is guarded server-side.
    // Only send it when the user actually changed it, otherwise editing a
    // per-user field (active days, duration) on a shared default AIM would be
    // rejected with 403 and silently drop the whole save.
    const currentLinkedKpiId = cat.linkedKpiId ?? null;
    const currentKpiIncrement = cat.kpiIncrement ?? 1;
    const nextLinkedKpiId = editLinkedKpiId ?? null;
    const nextKpiIncrement = editLinkedKpiId ? (editKpiIncrement > 0 ? editKpiIncrement : 1) : null;
    const kpiLinkageChanged =
      nextLinkedKpiId !== currentLinkedKpiId ||
      (nextLinkedKpiId !== null && nextKpiIncrement !== currentKpiIncrement);
    if (kpiLinkageChanged) {
      payload.linkedKpiId = nextLinkedKpiId;
      payload.kpiIncrement = nextKpiIncrement;
    }

    const res = await fetch('/api/aims/user', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aims: [payload] }),
    });
    if (!res.ok) {
      toast.error('Failed to save aim settings');
      return;
    }
    setEditingId(null);
    mutateAims();
    await mutate('/api/aims/categories');
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
      if (!res.ok) {
        // HTTP failure (403/404/validation): roll the optimistic tick back so
        // the checkbox doesn't stay falsely checked, and tell the user.
        mutateTodayInstances();
        toast.error('Failed to complete aim');
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (data.beeminderError) toast.error(`Beeminder sync failed: ${data.beeminderError}`);
      mutateAims(); // Refresh user aims for streak/phase updates
      await invalidateAfterAimChange(); // ripple to leaderboard / calendar / streaks
    } catch {
      mutateTodayInstances(); // Revert on network error
      toast.error('Failed to complete aim');
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
      const res = await fetch(`/api/aims/instances/${instanceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'SCHEDULED' }),
      });
      if (!res.ok) {
        mutateTodayInstances();
        toast.error('Failed to undo aim');
        return;
      }
      mutateAims();
      await invalidateAfterAimChange();
    } catch {
      mutateTodayInstances();
      toast.error('Failed to undo aim');
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
                    editSkipSeedPhase={editSkipSeedPhase}
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
                    onEditSkipSeedPhaseChange={setEditSkipSeedPhase}
                    onNewActivityChange={setNewActivity}
                    onAddActivity={addActivity}
                    onRemoveActivity={removeActivity}
                    onResetToSeed={() => resetToSeed(cat.id)}
                    onMutateAims={mutateAims}
                    aimStreakData={getAimStreakData(cat.id)}
                    onToggleAimStreak={handleToggleAimStreak}
                    editLinkedKpiId={editingId === cat.id ? editLinkedKpiId : null}
                    editKpiIncrement={editingId === cat.id ? editKpiIncrement : 1}
                    kpiPickerStackId={editingId === cat.id ? kpiPickerStackId : null}
                    kpiPickerGoalId={editingId === cat.id ? kpiPickerGoalId : null}
                    stacks={stacks}
                    stackGoals={editingId === cat.id ? (stackGoals ?? []) : []}
                    numericKpisForGoal={editingId === cat.id ? numericKpisForGoal : []}
                    hasOnlyBinaryKpis={editingId === cat.id ? hasOnlyBinaryKpis : false}
                    onLinkedKpiChange={setEditLinkedKpiId}
                    onKpiIncrementChange={setEditKpiIncrement}
                    onKpiPickerStackChange={setKpiPickerStackId}
                    onKpiPickerGoalChange={setKpiPickerGoalId}
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
                  editSkipSeedPhase={editSkipSeedPhase}
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
                  onEditSkipSeedPhaseChange={setEditSkipSeedPhase}
                  onNewActivityChange={setNewActivity}
                  onAddActivity={addActivity}
                  onRemoveActivity={removeActivity}
                  onResetToSeed={() => resetToSeed(cat.id)}
                  onMutateAims={mutateAims}
                  onWorkoutSubTypesChange={(subTypes) => handleWorkoutSubTypesChange(cat.id, subTypes)}
                  aimStreakData={getAimStreakData(cat.id)}
                  onToggleAimStreak={handleToggleAimStreak}
                  editLinkedKpiId={editingId === cat.id ? editLinkedKpiId : null}
                  editKpiIncrement={editingId === cat.id ? editKpiIncrement : 1}
                  kpiPickerStackId={editingId === cat.id ? kpiPickerStackId : null}
                  kpiPickerGoalId={editingId === cat.id ? kpiPickerGoalId : null}
                  stacks={stacks}
                  stackGoals={editingId === cat.id ? (stackGoals ?? []) : []}
                  numericKpisForGoal={editingId === cat.id ? numericKpisForGoal : []}
                  hasOnlyBinaryKpis={editingId === cat.id ? hasOnlyBinaryKpis : false}
                  onLinkedKpiChange={setEditLinkedKpiId}
                  onKpiIncrementChange={setEditKpiIncrement}
                  onKpiPickerStackChange={setKpiPickerStackId}
                  onKpiPickerGoalChange={setKpiPickerGoalId}
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
  editSkipSeedPhase: boolean;
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
  onEditSkipSeedPhaseChange: (v: boolean) => void;
  onNewActivityChange: (v: string) => void;
  onAddActivity: () => void;
  onRemoveActivity: (act: string) => void;
  onResetToSeed: () => void;
  onMutateAims: () => void;
  onWorkoutSubTypesChange?: (subTypes: { id: string; name: string; frequencyPerWeek: number }[]) => void;
  aimStreakData?: { count: number; id: string | null; isActive: boolean };
  onToggleAimStreak?: (id: string, isActive: boolean) => void;
  // KPI linkage
  editLinkedKpiId: string | null;
  editKpiIncrement: number;
  kpiPickerStackId: string | null;
  kpiPickerGoalId: string | null;
  stacks: GoalStack[] | undefined;
  stackGoals: Goal[] | undefined;
  numericKpisForGoal: Kpi[];
  hasOnlyBinaryKpis: boolean;
  onLinkedKpiChange: (kpiId: string | null) => void;
  onKpiIncrementChange: (v: number) => void;
  onKpiPickerStackChange: (stackId: string | null) => void;
  onKpiPickerGoalChange: (goalId: string | null) => void;
}

function AimCard({
  category,
  active,
  duration,
  frequency: _frequency,
  activities,
  userAim,
  derailInfo,
  isEditing,
  editDuration,
  editFrequency,
  editActiveWeekdays,
  editSkipSeedPhase,
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
  onEditSkipSeedPhaseChange,
  onNewActivityChange,
  onAddActivity,
  onRemoveActivity,
  onResetToSeed,
  onMutateAims: _onMutateAims,
  onWorkoutSubTypesChange,
  aimStreakData,
  onToggleAimStreak,
  editLinkedKpiId,
  editKpiIncrement,
  kpiPickerStackId,
  kpiPickerGoalId,
  stacks,
  stackGoals,
  numericKpisForGoal,
  hasOnlyBinaryKpis,
  onLinkedKpiChange,
  onKpiIncrementChange,
  onKpiPickerStackChange,
  onKpiPickerGoalChange,
}: AimCardProps) {
  const [chartExpanded, setChartExpanded] = useState(false);
  // Invite teammates state
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteUserIds, setInviteUserIds] = useState<string[]>([]);
  const [inviting, setInviting] = useState(false);
  const [inviteMsg, setInviteMsg] = useState<string | null>(null);
  const { data: allUsers } = useSWR<{ id: string; name: string | null; email: string }[]>(
    inviteOpen ? '/api/users' : null,
  );
  const handleAimInvite = async () => {
    if (!todayInstanceId || inviteUserIds.length === 0) return;
    setInviting(true);
    setInviteMsg(null);
    try {
      const res = await fetch(`/api/aims/instances/${todayInstanceId}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds: inviteUserIds }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setInviteMsg((json as { error?: string }).error ?? 'Failed to send invitations.');
      } else {
        setInviteUserIds([]);
        setInviteMsg('Invitations sent!');
        setTimeout(() => setInviteMsg(null), 3000);
      }
    } catch {
      setInviteMsg('An error occurred.');
    } finally {
      setInviting(false);
    }
  };
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

  // Format frequency display using effective frequency
  const effectiveFreqDisplay = category.isDaily
    ? 'Daily'
    : `${effectiveFreq}x / week`;

  return (
    <div
      className={`glass-panel rounded-xl p-4 transition-opacity ${
        active ? 'opacity-100' : 'opacity-50'
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-[var(--text-primary)] break-words line-clamp-2">
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

      {/* Stat Hero — ring + flame anchors the card */}
      {active && !isEditing && (
        <AimStatHero
          aimCategoryId={category.id}
          isDaily={category.isDaily}
          activeWeekdays={userAim?.activeWeekdays ?? 127}
          target={effectiveFreq}
          streak={streak}
          bestStreak={userAim?.bestStreak ?? 0}
          bufferDays={derailInfo?.safetyBufferDays ?? null}
          phaseLabel={PHASE_LABELS[phase] ?? phase}
        />
      )}

      {/* Secondary streak metadata: total completions + pause/resume control */}
      {active && !isEditing && (completionCount > 0 || (aimStreakData?.id && onToggleAimStreak)) && (
        <div className="mt-2 flex items-center gap-3 text-[11px] text-[var(--text-muted)]">
          {completionCount > 0 && (
            <span title={`Total completions: ${completionCount}`}>{completionCount} done all-time</span>
          )}
          {aimStreakData?.id && onToggleAimStreak && (
            <button
              onClick={() => onToggleAimStreak(aimStreakData.id!, !aimStreakData.isActive)}
              className="ml-auto inline-flex items-center gap-1 text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
              title={aimStreakData.isActive ? 'Pause streak tracking' : 'Resume streak tracking'}
            >
              {aimStreakData.isActive ? (
                <><PauseCircle className="h-3.5 w-3.5" /> Pause</>
              ) : (
                <><PlayCircle className="h-3.5 w-3.5" /> Resume</>
              )}
            </button>
          )}
        </div>
      )}

      {/* Streak heatmap */}
      {active && !isEditing && (
        <div className="mt-2">
          <StreakHeatmap
            aimCategoryId={category.id}
            isDaily={category.isDaily}
            activeWeekdays={userAim?.activeWeekdays ?? 127}
            weeklyTarget={userAim?.customFrequency ?? category.defaultFrequency}
          />
        </div>
      )}

      {/* Progress chart — collapsible */}
      {active && !isEditing && (
        <details className="mt-2 group" open={chartExpanded}>
          <summary
            onClick={(e) => { e.preventDefault(); setChartExpanded(!chartExpanded); }}
            className="flex w-full cursor-pointer items-center justify-between rounded-lg border border-[var(--border-color)] bg-[var(--surface)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] transition-colors list-none"
          >
            <span>Progress Chart</span>
            {chartExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </summary>
          {chartExpanded && (
            <div className="mt-2">
              <AimProgressChart aimCategoryId={category.id} days={30} />
            </div>
          )}
        </details>
      )}

      {/* Stats Row — effective (phase-aware) duration and frequency, shown as pills */}
      <div className="flex items-center gap-2 mt-3 text-[11px]">
        <span className="inline-flex items-center gap-1 rounded-full border border-teal-500/25 bg-teal-500/8 px-2 py-0.5 text-teal-300">
          <Clock className="h-3 w-3" />
          {effectiveDuration} min
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border border-teal-500/25 bg-teal-500/8 px-2 py-0.5 text-teal-300">
          <Repeat className="h-3 w-3" />
          {effectiveFreqDisplay}
        </span>
        {category.isGroupable && (
          <span
            className="inline-flex items-center gap-1 rounded-full bg-teal-500/10 px-2 py-0.5 text-teal-500 cursor-help"
            title="Team members can see and join this AIM session."
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


      {/* Invite teammates to today's session — collapsible */}
      {active && !isEditing && todayInstanceId && (
        <details className="mt-3" open={inviteOpen}>
          <summary
            onClick={(e) => { e.preventDefault(); setInviteOpen((v) => !v); }}
            className="flex w-full cursor-pointer items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors list-none"
          >
            <Users className="h-3.5 w-3.5" />
            Invite teammates
          </summary>
          {inviteOpen && (
            <div className="mt-2 space-y-2 rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] p-3">
              <select
                multiple
                value={inviteUserIds}
                onChange={(e) =>
                  setInviteUserIds(Array.from(e.target.selectedOptions, (o) => o.value))
                }
                className="w-full rounded-md border border-[var(--border-color)] bg-[var(--input-bg)] px-2 py-1.5 text-xs text-[var(--text-primary)] focus:border-indigo-400 focus:outline-none"
                size={Math.min(4, (allUsers?.length ?? 0) + 1)}
              >
                {(allUsers ?? []).map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name ?? u.email}
                  </option>
                ))}
              </select>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleAimInvite}
                  disabled={inviting || inviteUserIds.length === 0}
                  className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
                >
                  {inviting && <Loader2 className="h-3 w-3 animate-spin" />}
                  Send
                </button>
                {inviteMsg && (
                  <span className={`text-xs ${inviteMsg.includes('sent') ? 'text-emerald-400' : 'text-red-400'}`}>
                    {inviteMsg}
                  </span>
                )}
              </div>
            </div>
          )}
        </details>
      )}

      {/* Activities (non-editing) — collapsible */}
      {!isEditing && activities.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors list-none">
            Activities ({activities.length})
          </summary>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {activities.map((act) => (
              <span
                key={act}
                className="text-xs px-2 py-0.5 rounded-full bg-[var(--surface-raised)] text-[var(--text-secondary)] border border-[var(--border-color)]"
              >
                {act}
              </span>
            ))}
          </div>
        </details>
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

          {/* Skip Seed phase — opt out of the SEED ramp-up for this aim */}
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={editSkipSeedPhase}
              onChange={(e) => onEditSkipSeedPhaseChange(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-[var(--border-color)] text-teal-600 focus:ring-teal-500"
            />
            <span className="text-xs text-[var(--text-secondary)]">
              Skip Seed phase
              <span className="block text-[10px] text-[var(--text-muted)]">
                Start at Sprout instead of the gradual Seed ramp-up.
              </span>
            </span>
          </label>

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

          {/* KPI Linkage Section */}
          <div className="border-t border-[var(--border-color)] pt-3 space-y-2">
            <label className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)]">
              <Target className="h-3.5 w-3.5 text-indigo-400" />
              Counts toward goal KPI (optional)
            </label>

            {/* Current linkage display */}
            {editLinkedKpiId && (
              <div className="flex items-center justify-between rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-1.5">
                <span className="text-xs text-indigo-300">KPI linked</span>
                <button
                  onClick={() => {
                    onLinkedKpiChange(null);
                    onKpiPickerStackChange(null);
                    onKpiPickerGoalChange(null);
                  }}
                  className="text-[var(--text-muted)] hover:text-red-400 transition-colors"
                  title="Remove KPI link"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {/* Stack picker */}
            <select
              value={kpiPickerStackId ?? ''}
              onChange={(e) => {
                onKpiPickerStackChange(e.target.value || null);
                onKpiPickerGoalChange(null);
                onLinkedKpiChange(null);
              }}
              className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface)] px-2 py-1.5 text-xs text-[var(--text-primary)] focus:border-indigo-500 focus:outline-none"
            >
              <option value="">Select a goal stack...</option>
              {(stacks ?? []).map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>

            {/* Goal picker */}
            {kpiPickerStackId && (
              <select
                value={kpiPickerGoalId ?? ''}
                onChange={(e) => {
                  onKpiPickerGoalChange(e.target.value || null);
                  onLinkedKpiChange(null);
                }}
                className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface)] px-2 py-1.5 text-xs text-[var(--text-primary)] focus:border-indigo-500 focus:outline-none"
              >
                <option value="">Select a goal...</option>
                {(stackGoals ?? [])
                  .filter((g) => !g.deletedAt)
                  .map((g) => (
                    <option key={g.id} value={g.id}>{g.title}</option>
                  ))}
              </select>
            )}

            {/* Binary-only warning */}
            {hasOnlyBinaryKpis && (
              <p className="text-[10px] text-amber-400 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Binary KPIs not supported — pick a goal with a numeric KPI.
              </p>
            )}

            {/* KPI picker */}
            {kpiPickerGoalId && numericKpisForGoal.length > 0 && (
              <select
                value={editLinkedKpiId ?? ''}
                onChange={(e) => onLinkedKpiChange(e.target.value || null)}
                className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface)] px-2 py-1.5 text-xs text-[var(--text-primary)] focus:border-indigo-500 focus:outline-none"
              >
                <option value="">Select a KPI...</option>
                {numericKpisForGoal.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.name}{k.unit ? ` (${k.unit})` : ''}
                  </option>
                ))}
              </select>
            )}

            {/* Increment input — show when a KPI is selected */}
            {editLinkedKpiId && (
              <div>
                <label className="text-xs text-[var(--text-secondary)]">
                  Increment per completion
                  {category.defaultDurationMin > 0 && (
                    <button
                      type="button"
                      onClick={() => onKpiIncrementChange(+(category.defaultDurationMin / 60).toFixed(2))}
                      className="ml-2 text-[10px] text-indigo-400 hover:text-indigo-300 underline"
                    >
                      Use {(category.defaultDurationMin / 60).toFixed(2)}h (duration-based)
                    </button>
                  )}
                </label>
                <input
                  type="number"
                  min={0.01}
                  step={0.1}
                  value={editKpiIncrement}
                  onChange={(e) => onKpiIncrementChange(parseFloat(e.target.value) || 1)}
                  className="mt-1 w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface)] px-2 py-1.5 text-xs text-[var(--text-primary)] focus:border-indigo-500 focus:outline-none"
                />
              </div>
            )}
          </div>

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
