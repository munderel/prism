'use client';

import { cadenceBadgeClasses, formatCadenceLabel } from '@/lib/process-constants';

interface CadenceBadgeProps {
  cadence: string;
  className?: string;
}

export function CadenceBadge({ cadence, className = '' }: CadenceBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium leading-none ${cadenceBadgeClasses(cadence)} ${className}`}
    >
      {formatCadenceLabel(cadence)}
    </span>
  );
}
