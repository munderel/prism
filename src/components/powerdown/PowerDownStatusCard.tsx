'use client';

import Link from 'next/link';
import { Moon, Check } from 'lucide-react';

interface PowerDownSession {
  id: string;
  sessionDate: string;
  completedAt: string | null;
  timeBlockStart: string | null;
  timeBlockEnd: string | null;
}

interface PowerDownStatusCardProps {
  session: PowerDownSession | null;
  powerdownTime: string | null | undefined;
  date: string;
  compact?: boolean;
}

export function PowerDownStatusCard({ session, powerdownTime, date, compact }: PowerDownStatusCardProps) {
  const isCompleted = !!session?.completedAt;

  let timeLabel: string | null = null;
  if (session?.timeBlockStart && session?.timeBlockEnd) {
    const start = new Date(session.timeBlockStart).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const end = new Date(session.timeBlockEnd).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    timeLabel = `${start}–${end}`;
  } else if (powerdownTime) {
    const [h, m] = powerdownTime.split(':').map(Number);
    const s = new Date();
    s.setHours(h, m, 0, 0);
    const e = new Date(s.getTime() + 30 * 60 * 1000);
    const start = s.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const end = e.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    timeLabel = `${start}–${end}`;
  }

  if (compact) {
    return (
      <Link
        href="/powerdown"
        className={`flex items-center gap-2 rounded-lg border p-2 transition-colors ${
          isCompleted
            ? 'border-green-500/30 bg-green-500/5 hover:border-green-500/50'
            : 'border-violet-500/30 bg-violet-500/5 hover:border-violet-500/50'
        }`}
      >
        {isCompleted ? (
          <Check className="h-4 w-4 text-green-400 shrink-0" />
        ) : (
          <Moon className="h-4 w-4 text-violet-400 shrink-0" />
        )}
        <span className={`text-xs font-medium truncate ${isCompleted ? 'text-[var(--text-muted)] line-through' : 'text-[var(--text-primary)]'}`}>
          Power Down
        </span>
        {timeLabel && (
          <span className={`text-xs rounded px-1.5 py-0.5 ml-auto shrink-0 ${
            isCompleted ? 'bg-green-600 text-white' : 'bg-violet-600 text-white'
          }`}>
            {timeLabel}
          </span>
        )}
      </Link>
    );
  }

  return (
    <Link
      href="/powerdown"
      className={`flex items-center gap-3 rounded-lg border p-3 transition-colors ${
        isCompleted
          ? 'border-green-500/30 bg-green-500/5 hover:border-green-500/50'
          : 'border-violet-500/30 bg-violet-500/5 hover:border-violet-500/50'
      }`}
    >
      {isCompleted ? (
        <Check className="h-5 w-5 text-green-400 shrink-0" />
      ) : (
        <Moon className="h-5 w-5 text-violet-400 shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${isCompleted ? 'text-[var(--text-muted)] line-through' : 'text-[var(--text-primary)]'}`}>
          Power Down
        </p>
        <p className="text-xs text-[var(--text-muted)]">
          {isCompleted
            ? `Completed at ${new Date(session!.completedAt!).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
            : timeLabel
              ? `Scheduled ${timeLabel}`
              : 'Prepare tomorrow\u0027s plan'}
        </p>
      </div>
      {isCompleted ? (
        <span className="text-xs text-green-400 bg-green-500/15 rounded-lg px-3 py-1 shrink-0">Done</span>
      ) : (
        <span className="text-xs text-white bg-violet-600 rounded-lg px-3 py-1 shrink-0">Start</span>
      )}
    </Link>
  );
}
