'use client';

import { useCallback, useRef, useState } from 'react';
import { PlayCircle, Plus, Trash2 } from 'lucide-react';
import { mutate } from 'swr';
import {
  Popover,
  PopoverBody,
  PopoverClose,
  PopoverFooter,
  PopoverHeader,
} from '@/components/ui/Popover';
import { useToast } from '@/components/ui/ToastProvider';

// ── Types ──────────────────────────────────────────────────────────────────────

interface DeliverableItem {
  id: string;
  text: string;
  isDone: boolean;
}

interface Task {
  id: string;
  title: string;
  estimatedMinutes?: number | null;
  deliverableItems?: DeliverableItem[];
}

export interface StartNowPopoverProps {
  task: Task;
  /** The button element that triggered the popover (used for anchor positioning). */
  anchorRect: DOMRect | null;
  onClose: () => void;
  /** Called after the WorkBlock has been successfully created. */
  onCreated?: () => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function defaultMainObjective(task: Task): string {
  return task.deliverableItems?.[0]?.text ?? task.title;
}

function defaultClearGoals(task: Task): string[] {
  if (!task.deliverableItems || task.deliverableItems.length === 0) return [];
  // Skip the first item — it's used as mainObjective when present.
  return task.deliverableItems.slice(1).map((d) => d.text);
}

// ── Component ─────────────────────────────────────────────────────────────────

export function StartNowPopover({
  task,
  anchorRect,
  onClose,
  onCreated,
}: StartNowPopoverProps) {
  const toast = useToast();

  const [duration, setDuration] = useState<number>(
    typeof task.estimatedMinutes === 'number' && task.estimatedMinutes > 0
      ? task.estimatedMinutes
      : 30,
  );
  const [mainObjective, setMainObjective] = useState<string>(defaultMainObjective(task));
  const [clearGoals, setClearGoals] = useState<string[]>(defaultClearGoals(task));
  const [loading, setLoading] = useState(false);

  // Overlap-warn dialog state.
  const [showOverlapWarn, setShowOverlapWarn] = useState(false);
  // Ref stores the submission payload so we can re-use it after user confirms.
  const pendingPayload = useRef<{ start: string; end: string } | null>(null);

  // ── goal list helpers ──
  const addGoal = useCallback(() => setClearGoals((g) => [...g, '']), []);
  const removeGoal = useCallback(
    (i: number) => setClearGoals((g) => g.filter((_, idx) => idx !== i)),
    [],
  );
  const updateGoal = useCallback(
    (i: number, value: string) =>
      setClearGoals((g) => g.map((v, idx) => (idx === i ? value : v))),
    [],
  );

  // ── overlap detection ──
  const detectOverlapFromCache = useCallback(
    (start: Date, end: Date): boolean => {
      try {
        // Attempt a client-side check from the SWR cache.
        // useSWR's global cache exposes data keyed by URL strings.
        // We need the raw cache — import the global cache accessor.
        const cache = (globalThis as Record<string, unknown>).__SWR_CACHE__ as
          | Map<string, { data?: unknown }>
          | undefined;
        if (!cache) return false;
        // Scan for any work-blocks entry in the cache.
        for (const [, value] of Array.from(cache.entries())) {
          const blocks = value?.data;
          if (!Array.isArray(blocks)) continue;
          for (const b of blocks) {
            if (
              b &&
              typeof b === 'object' &&
              'start' in b &&
              'end' in b
            ) {
              const bStart = new Date(b.start as string);
              const bEnd = new Date(b.end as string);
              if (bStart < end && bEnd > start) return true;
            }
          }
        }
      } catch {
        // Best-effort — don't block submission on errors.
      }
      return false;
    },
    [],
  );

  // ── submit ──
  const doSubmit = useCallback(
    async (startISO: string, endISO: string) => {
      setLoading(true);
      try {
        const res = await fetch('/api/work-blocks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            taskId: task.id,
            start: startISO,
            end: endISO,
            mainObjective: mainObjective.trim() || task.title,
            clearGoals: clearGoals.filter((g) => g.trim().length > 0),
          }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          const message =
            (body as { error?: string }).error ?? `Error ${res.status}`;
          toast.error(message);
          return;
        }

        // Invalidate relevant SWR caches.
        await Promise.all([
          mutate('/api/calendar'),
          mutate('/api/work-blocks'),
          mutate('/api/tasks'),
        ]);

        toast.success('Work block started!');
        onCreated?.();
        onClose();
      } finally {
        setLoading(false);
      }
    },
    [task.id, task.title, mainObjective, clearGoals, toast, onCreated, onClose],
  );

  const handleStart = useCallback(async () => {
    if (duration <= 0) {
      toast.error('Duration must be greater than 0');
      return;
    }

    const now = new Date();
    const end = new Date(now.getTime() + duration * 60_000);
    const startISO = now.toISOString();
    const endISO = end.toISOString();

    // Check for overlap in the SWR cache — warn-and-allow.
    const hasOverlap = detectOverlapFromCache(now, end);
    if (hasOverlap) {
      pendingPayload.current = { start: startISO, end: endISO };
      setShowOverlapWarn(true);
      return;
    }

    await doSubmit(startISO, endISO);
  }, [duration, detectOverlapFromCache, doSubmit, toast]);

  const handleOverlapConfirm = useCallback(async () => {
    setShowOverlapWarn(false);
    if (pendingPayload.current) {
      await doSubmit(pendingPayload.current.start, pendingPayload.current.end);
    }
  }, [doSubmit]);

  // ── render ──
  return (
    <>
      {/* Overlap-warn modal — rendered outside the Popover so z-index stacks correctly */}
      {showOverlapWarn && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowOverlapWarn(false)}
          />
          <div className="relative glass-panel p-6 w-full max-w-sm mx-4 space-y-4">
            <h3 className="text-base font-semibold text-[var(--text-primary)]">
              Time conflict detected
            </h3>
            <p className="text-sm text-[var(--text-secondary)]">
              There&apos;s already a work block at this time. Schedule alongside
              anyway?
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setShowOverlapWarn(false)}
                className="px-4 py-2 text-sm font-medium rounded-lg text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleOverlapConfirm}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
              >
                Schedule anyway
              </button>
            </div>
          </div>
        </div>
      )}

      <Popover
        open
        anchorRect={anchorRect}
        onClose={onClose}
        preferredSide="bottom"
        className="w-80"
      >
        <PopoverHeader>
          <div className="flex items-center gap-2">
            <PlayCircle className="h-4 w-4 text-indigo-400 flex-shrink-0" />
            <span className="text-sm font-semibold text-[var(--text-primary)] truncate">
              Start Now
            </span>
          </div>
          <PopoverClose onClose={onClose} />
        </PopoverHeader>

        <PopoverBody>
          {/* Duration */}
          <div className="space-y-1">
            <label className="text-xs text-[var(--text-muted)] font-medium">
              Duration (minutes)
            </label>
            <input
              type="number"
              min={1}
              max={480}
              value={duration}
              onChange={(e) => setDuration(Math.max(1, Number(e.target.value)))}
              className="w-full rounded-md border border-[var(--border-color)] bg-[var(--surface-raised)] px-3 py-1.5 text-sm text-[var(--text-primary)] focus:border-indigo-500 focus:outline-none"
            />
          </div>

          {/* Main objective */}
          <div className="space-y-1">
            <label className="text-xs text-[var(--text-muted)] font-medium">
              Main objective
            </label>
            <input
              type="text"
              value={mainObjective}
              onChange={(e) => setMainObjective(e.target.value)}
              className="w-full rounded-md border border-[var(--border-color)] bg-[var(--surface-raised)] px-3 py-1.5 text-sm text-[var(--text-primary)] focus:border-indigo-500 focus:outline-none"
              placeholder="What do you aim to achieve?"
            />
          </div>

          {/* Clear goals */}
          <div className="space-y-1.5">
            <label className="text-xs text-[var(--text-muted)] font-medium">
              Clear goals
            </label>
            {clearGoals.map((goal, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={goal}
                  onChange={(e) => updateGoal(i, e.target.value)}
                  className="flex-1 rounded-md border border-[var(--border-color)] bg-[var(--surface-raised)] px-3 py-1.5 text-sm text-[var(--text-primary)] focus:border-indigo-500 focus:outline-none"
                  placeholder={`Goal ${i + 1}`}
                />
                <button
                  onClick={() => removeGoal(i)}
                  className="rounded p-1 text-[var(--text-muted)] hover:text-rose-400 hover:bg-rose-500/10 transition-colors flex-shrink-0"
                  title="Remove goal"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            <button
              onClick={addGoal}
              className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors py-0.5"
            >
              <Plus className="h-3.5 w-3.5" />
              Add goal
            </button>
          </div>
        </PopoverBody>

        <PopoverFooter>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              disabled={loading}
              className="flex-1 px-3 py-1.5 text-sm font-medium rounded-lg text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleStart}
              disabled={loading || duration <= 0}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors disabled:opacity-50"
            >
              {loading ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : (
                <PlayCircle className="h-4 w-4" />
              )}
              {loading ? 'Starting…' : 'Start'}
            </button>
          </div>
        </PopoverFooter>
      </Popover>
    </>
  );
}
