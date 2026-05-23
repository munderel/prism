export function getStreakColor(streak: number): string {
  if (streak === 0) return 'text-gray-400';
  if (streak < 7) return 'text-orange-400';
  if (streak < 14) return 'text-orange-500';
  return 'text-red-500';
}

export function getStreakColorOrMuted(streak: number): string {
  if (streak === 0) return 'text-[var(--text-muted)]';
  return getStreakColor(streak);
}
