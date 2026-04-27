'use client';

interface TimeUrgencyBadgeProps {
  startDate?: string | Date | null;
  endDate?: string | Date | null;
  status?: string | null;
}

function getTimeInfo(startDate?: string | Date | null, endDate?: string | Date | null) {
  const now = new Date();
  const target = endDate ? new Date(endDate) : null;
  if (!target) return null;

  const start = startDate ? new Date(startDate) : null;
  const diffMs = target.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  // Calculate percentage of time remaining
  let pctRemaining = 100;
  if (start) {
    const totalMs = target.getTime() - start.getTime();
    if (totalMs > 0) {
      pctRemaining = Math.max(0, Math.min(100, (diffMs / totalMs) * 100));
    }
  }

  // Format label
  let label: string;
  if (diffDays < 0) {
    label = `${Math.abs(diffDays)}d overdue`;
  } else if (diffDays === 0) {
    label = 'Due today';
  } else if (diffDays === 1) {
    label = '1d left';
  } else if (diffDays < 7) {
    label = `${diffDays}d left`;
  } else if (diffDays < 30) {
    const weeks = Math.ceil(diffDays / 7);
    label = `${weeks}w left`;
  } else {
    const months = Math.ceil(diffDays / 30);
    label = `${months}mo left`;
  }

  // Urgency color
  let colorClass: string;
  if (diffDays < 0) {
    colorClass = 'bg-red-600/20 text-red-400 animate-pulse';
  } else if (pctRemaining < 25) {
    colorClass = 'bg-red-600/20 text-red-400';
  } else if (pctRemaining < 50) {
    colorClass = 'bg-yellow-600/20 text-yellow-400';
  } else {
    colorClass = 'bg-green-600/20 text-green-400';
  }

  return { label, colorClass };
}

export function TimeUrgencyBadge({ startDate, endDate, status }: TimeUrgencyBadgeProps) {
  if (status === 'COMPLETED' || status === 'ABANDONED') return null;
  const info = getTimeInfo(startDate, endDate);
  if (!info) return null;

  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium shrink-0 ${info.colorClass}`}>
      {info.label}
    </span>
  );
}
