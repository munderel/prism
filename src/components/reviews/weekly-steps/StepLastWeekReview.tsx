'use client';

/**
 * StepLastWeekReview
 *
 * Weekly Review step: review last week's WorkBlocks and AIM instances.
 * Shows COMPLETED / PARTIAL / MISSED pickers for work blocks and
 * COMPLETED / SKIPPED / MISSED for AIM instances.
 *
 * Placed as a NEW step just before "Successes & Difficulties" in the weekly
 * review wizard. Decision rationale: surfacing last week's actual execution
 * data before asking about successes and difficulties gives the user concrete
 * context to draw from — "I completed 3/5 blocks and missed my AIM twice"
 * directly informs the difficulty reflection. Folding it INTO Successes &
 * Difficulties would make that step too wide and harder to navigate; a
 * dedicated step keeps the UI focused.
 */

import { useState, useEffect } from 'react';
import { useSWRConfig } from 'swr';
import { minutesBetween, parseLocalDate } from '@/lib/date-utils';
import { CompletionReviewRow } from '@/components/shared/CompletionReviewRow';
import { useToast } from '@/components/ui/ToastProvider';

interface WorkBlockItem {
  id: string;
  start: string;
  end: string;
  mainObjective: string;
  completionStatus: 'PENDING' | 'COMPLETED' | 'PARTIAL' | 'MISSED';
  actualMinutes: number | null;
  task: {
    id: string;
    title: string;
    estimatedMinutes: number;
    status: string;
    dueDate: string | null;
  };
}

interface AimInstanceItem {
  id: string;
  scheduledDate: string;
  timeBlockStart: string | null;
  timeBlockEnd: string | null;
  status: string;
  actualMinutes: number | null;
  aimCategory: { id: string; name: string; defaultDurationMin?: number };
}

interface StepLastWeekReviewProps {
  /** Monday of last week (YYYY-MM-DD) */
  lastWeekStart: string;
  /** Sunday of last week (YYYY-MM-DD) */
  lastWeekEnd: string;
}

export function StepLastWeekReview({
  lastWeekStart,
  lastWeekEnd,
}: StepLastWeekReviewProps) {
  const { mutate } = useSWRConfig();
  const toast = useToast();

  const [workBlocks, setWorkBlocks] = useState<WorkBlockItem[]>([]);
  const [aimInstances, setAimInstances] = useState<AimInstanceItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Unsaved picks
  const [blockPicks, setBlockPicks] = useState<Record<string, string>>({});
  const [blockActual, setBlockActual] = useState<Record<string, number>>({});
  const [aimPicks, setAimPicks] = useState<Record<string, string>>({});
  const [aimActual, setAimActual] = useState<Record<string, number>>({});

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      try {
        const startIso = parseLocalDate(lastWeekStart).toISOString();
        const endDate = parseLocalDate(lastWeekEnd);
        endDate.setHours(23, 59, 59, 999);
        const endIso = endDate.toISOString();

        const [blocksRes, aimsRes] = await Promise.all([
          fetch(`/api/work-blocks?startDate=${lastWeekStart}&endDate=${lastWeekEnd}`),
          fetch(`/api/aims/instances?start=${encodeURIComponent(startIso)}&end=${encodeURIComponent(endIso)}`),
        ]);

        if (cancelled) return;

        const blocks: WorkBlockItem[] = blocksRes.ok ? await blocksRes.json() : [];
        const aims: AimInstanceItem[] = aimsRes.ok ? await aimsRes.json() : [];

        setWorkBlocks(blocks);
        setAimInstances(aims);

        // Pre-populate with already-saved values
        const bPicks: Record<string, string> = {};
        const bActual: Record<string, number> = {};
        blocks.forEach((b) => {
          if (b.completionStatus !== 'PENDING') bPicks[b.id] = b.completionStatus;
          if (b.actualMinutes != null) {
            bActual[b.id] = b.actualMinutes;
          }
        });
        setBlockPicks(bPicks);
        setBlockActual(bActual);

        const aPicks: Record<string, string> = {};
        const aActual: Record<string, number> = {};
        aims.forEach((a) => {
          if (a.status === 'COMPLETED' || a.status === 'SKIPPED' || a.status === 'MISSED') {
            aPicks[a.id] = a.status;
          }
          if (a.actualMinutes != null) aActual[a.id] = a.actualMinutes;
        });
        setAimPicks(aPicks);
        setAimActual(aActual);
      } catch {
        // Non-critical — data will still show if partially loaded
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void fetchData();
    return () => { cancelled = true; };
  }, [lastWeekStart, lastWeekEnd]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const blockPatches = Object.entries(blockPicks).map(([id, completionStatus]) => {
        const block = workBlocks.find((b) => b.id === id);
        const scheduledMin = block ? minutesBetween(block.start, block.end) : 60;
        const body: Record<string, unknown> = { completionStatus };
        body.actualMinutes = blockActual[id] ?? scheduledMin;
        return fetch(`/api/work-blocks/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      });

      const aimPatches = Object.entries(aimPicks).map(([id, status]) => {
        const body: Record<string, unknown> = { status };
        const actual = aimActual[id];
        if (typeof actual === 'number') body.actualMinutes = actual;
        return fetch(`/api/aims/instances/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      });

      const results = await Promise.allSettled([...blockPatches, ...aimPatches]);
      const failures = results.filter((r) => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.ok));

      if (failures.length > 0) {
        toast.error(`${failures.length} item(s) failed to save. Please try again.`);
      } else {
        setSaved(true);
        void mutate('/api/work-blocks');
        void mutate('/api/aims/instances');
      }
    } catch {
      toast.error('Failed to save reviews. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const hasChanges =
    Object.keys(blockPicks).length > 0 || Object.keys(aimPicks).length > 0;
  const totalItems = workBlocks.length + aimInstances.length;

  if (loading) {
    return (
      <p className="text-sm text-[var(--text-muted)] py-4 text-center">
        Loading last week&apos;s schedule…
      </p>
    );
  }

  if (totalItems === 0) {
    return (
      <p className="text-sm text-[var(--text-muted)] py-4 text-center">
        Nothing to review yet — schedule some work.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--text-secondary)]">
        Mark each work block and AIM session from last week as completed, partial/skipped, or missed.
        This feeds your progress history and — for completed AIMs — updates the linked KPI.
      </p>

      {/* Work blocks */}
      {workBlocks.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-indigo-400 uppercase tracking-widest">
            Work Blocks
          </p>
          {workBlocks.map((b) => {
            const scheduledMin = minutesBetween(b.start, b.end);
            return (
              <CompletionReviewRow
                key={`wb-${b.id}`}
                item={{
                  kind: 'workblock',
                  id: b.id,
                  start: b.start,
                  end: b.end,
                  mainObjective: b.mainObjective,
                  task: b.task,
                  completionStatus: b.completionStatus,
                  actualMinutes: b.actualMinutes,
                  scheduledMinutes: scheduledMin,
                }}
                currentStatus={blockPicks[b.id]}
                currentActualMinutes={blockActual[b.id]}
                onChange={(status, actualMinutes) => {
                  setBlockPicks((prev) => ({ ...prev, [b.id]: status }));
                  setBlockActual((prev) => ({ ...prev, [b.id]: actualMinutes }));
                  if (saved) setSaved(false);
                }}
              />
            );
          })}
        </div>
      )}

      {/* AIM instances */}
      {aimInstances.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-teal-400 uppercase tracking-widest">
            AIM Sessions
          </p>
          {aimInstances.map((a) => {
            const targetMin = a.aimCategory?.defaultDurationMin ?? 60;
            return (
              <CompletionReviewRow
                key={`aim-${a.id}`}
                item={{
                  kind: 'aim',
                  id: a.id,
                  scheduledDate: a.scheduledDate,
                  timeBlockStart: a.timeBlockStart,
                  timeBlockEnd: a.timeBlockEnd,
                  status: (aimPicks[a.id] ?? a.status) as 'SCHEDULED' | 'COMPLETED' | 'SKIPPED' | 'MISSED',
                  aimCategory: a.aimCategory,
                  actualMinutes: a.actualMinutes,
                  targetMinutes: targetMin,
                }}
                currentStatus={aimPicks[a.id]}
                currentActualMinutes={aimActual[a.id]}
                onChange={(status, actualMinutes) => {
                  setAimPicks((prev) => ({ ...prev, [a.id]: status }));
                  setAimActual((prev) => ({ ...prev, [a.id]: actualMinutes }));
                  if (saved) setSaved(false);
                }}
              />
            );
          })}
        </div>
      )}

      {/* Save button */}
      <div className="pt-2 flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !hasChanges}
          className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving…' : 'Save Reviews'}
        </button>
        {saved && (
          <span className="text-xs text-green-400">Saved!</span>
        )}
        {!hasChanges && (
          <span className="text-xs text-[var(--text-muted)]">
            Pick a status for any item to enable save.
          </span>
        )}
      </div>
    </div>
  );
}
