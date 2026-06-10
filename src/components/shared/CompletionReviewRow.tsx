'use client';

import { minutesBetween } from '@/lib/date-utils';

/** Status picker row shared by Powerdown and Weekly Review for WorkBlocks + AIM instances. */

interface WorkBlockReviewItem {
  kind: 'workblock';
  id: string;
  start: string;
  end: string;
  mainObjective: string;
  task: {
    id: string;
    title: string;
    estimatedMinutes: number;
  };
  completionStatus: 'PENDING' | 'COMPLETED' | 'PARTIAL' | 'MISSED';
  actualMinutes: number | null;
  /** Estimated scheduled minutes derived from start/end when displayed */
  scheduledMinutes?: number;
}

interface AimReviewItem {
  kind: 'aim';
  id: string;
  scheduledDate: string;
  timeBlockStart: string | null;
  timeBlockEnd: string | null;
  status: 'SCHEDULED' | 'COMPLETED' | 'SKIPPED' | 'MISSED';
  aimCategory: { id: string; name: string };
  actualMinutes: number | null;
  /** Target duration from the AIM category */
  targetMinutes?: number | null;
}

export type ReviewItem = WorkBlockReviewItem | AimReviewItem;

export interface ReviewChange {
  status: string;
  actualMinutes: number;
}

interface CompletionReviewRowProps {
  item: ReviewItem;
  onChange: (status: string, actualMinutes: number) => void;
  /** Current unsaved picks — if undefined, fall back to item's own status */
  currentStatus?: string;
  currentActualMinutes?: number;
}

/** Label map keyed by status value */
const STATUS_LABELS: Record<string, string> = {
  COMPLETED: 'Completed',
  PARTIAL: 'Partial',
  MISSED: 'Missed',
  SKIPPED: 'Skipped',
};

function statusButtonClass(
  opt: string,
  active: boolean,
): string {
  const base = 'rounded-md px-3 py-1.5 text-xs font-medium transition-colors';
  if (!active) return `${base} bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:bg-[var(--border-color)]`;
  if (opt === 'COMPLETED') return `${base} bg-emerald-600 text-white`;
  if (opt === 'PARTIAL') return `${base} bg-amber-600 text-white`;
  if (opt === 'SKIPPED') return `${base} bg-sky-700 text-white`;
  return `${base} bg-gray-600 text-white`; // MISSED
}

export function CompletionReviewRow({
  item,
  onChange,
  currentStatus,
  currentActualMinutes,
}: CompletionReviewRowProps) {
  const statusOptions: string[] =
    item.kind === 'workblock'
      ? ['COMPLETED', 'PARTIAL', 'MISSED']
      : ['COMPLETED', 'SKIPPED', 'MISSED'];

  // Resolve the display status: unsaved pick > item's stored status
  const activeStatus: string =
    currentStatus ??
    (item.kind === 'workblock' ? item.completionStatus : item.status);

  const defaultMinutes: number =
    item.kind === 'workblock'
      ? (item.scheduledMinutes ?? minutesBetween(item.start, item.end))
      : (item.targetMinutes ?? 60);

  const resolvedActual = currentActualMinutes ?? item.actualMinutes ?? defaultMinutes;

  // --- Time label ---
  let timeLabel = '';
  let durationLabel = '';
  if (item.kind === 'workblock') {
    const s = new Date(item.start);
    const e = new Date(item.end);
    timeLabel = `${s.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}–${e.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
    durationLabel = `${defaultMinutes}m scheduled`;
  } else {
    if (item.timeBlockStart) {
      const s = new Date(item.timeBlockStart);
      const e = item.timeBlockEnd ? new Date(item.timeBlockEnd) : null;
      timeLabel = e
        ? `${s.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}–${e.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
        : s.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    } else {
      // All-day AIM. scheduledDate is a full ISO at UTC midnight; pinning the
      // formatter to UTC keeps the displayed calendar day stable for every
      // viewer (the old `scheduledDate + 'T00:00:00'` concat produced an
      // invalid date string when the input was already an ISO).
      timeLabel = new Date(item.scheduledDate).toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      });
    }
    if (item.targetMinutes) durationLabel = `${item.targetMinutes}m target`;
  }

  // --- Title ---
  const title =
    item.kind === 'workblock' ? item.task.title : item.aimCategory.name;

  // --- Sub-title ---
  const subTitle =
    item.kind === 'workblock' ? item.mainObjective : undefined;

  // --- Tag ---
  const tag =
    item.kind === 'workblock' ? 'Work Block' : 'AIM';

  const showActualInput =
    activeStatus === 'COMPLETED' || activeStatus === 'PARTIAL';

  return (
    <div className="rounded-lg bg-[var(--surface-raised)]/50 px-4 py-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-indigo-400">
              {tag}
            </span>
            <span className="text-sm font-medium text-[var(--text-primary)]">{title}</span>
          </div>
          <div className="text-xs text-[var(--text-muted)] mt-0.5">
            {timeLabel}
            {durationLabel && (
              <>
                <span className="mx-1">•</span>
                {durationLabel}
              </>
            )}
          </div>
          {subTitle && (
            <div className="text-xs text-indigo-300 mt-0.5">
              Objective: {subTitle}
            </div>
          )}
        </div>
      </div>

      {/* Status picker */}
      <div className="flex flex-wrap gap-2">
        {statusOptions.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt, resolvedActual)}
            className={statusButtonClass(opt, activeStatus === opt)}
          >
            {STATUS_LABELS[opt] ?? opt}
          </button>
        ))}
      </div>

      {/* Actual minutes */}
      {showActualInput && (
        <div className="flex items-center gap-2">
          <label className="text-xs text-[var(--text-muted)]">Actual time</label>
          <input
            type="number"
            min={0}
            max={480}
            step={5}
            value={resolvedActual}
            onChange={(e) =>
              onChange(
                activeStatus,
                Math.max(0, Math.min(480, Number(e.target.value) || 0)),
              )
            }
            className="w-20 rounded-md border border-[var(--border-color)] bg-[var(--input-bg)] px-2 py-1 text-xs text-[var(--text-primary)]"
          />
          <span className="text-xs text-[var(--text-muted)]">min</span>
        </div>
      )}
    </div>
  );
}
