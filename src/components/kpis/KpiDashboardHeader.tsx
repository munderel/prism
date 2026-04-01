'use client';

import { Building2, User } from 'lucide-react';
import { AssigneeFilter } from '@/components/shared/AssigneeFilter';

interface KpiDashboardHeaderProps {
  viewMode: 'company' | 'individual';
  onViewModeChange: (mode: 'company' | 'individual') => void;
  timeLevel: string;
  onTimeLevelChange: (level: string) => void;
  assigneeFilter: string;
  onAssigneeFilterChange: (userId: string) => void;
}

const TIME_LEVELS = [
  { value: 'WEEKLY', label: 'Week' },
  { value: 'MONTHLY', label: 'Month' },
  { value: 'YEARLY', label: 'Year' },
];

function toggleBtnClass(isActive: boolean): string {
  return `rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
    isActive
      ? 'bg-indigo-600 text-white shadow-sm'
      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
  }`;
}

const VIEW_MODES = [
  { value: 'company' as const, label: 'Company', icon: Building2 },
  { value: 'individual' as const, label: 'Individual', icon: User },
];

export function KpiDashboardHeader({
  viewMode,
  onViewModeChange,
  timeLevel,
  onTimeLevelChange,
  assigneeFilter,
  onAssigneeFilterChange,
}: KpiDashboardHeaderProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-1 rounded-lg border border-[var(--border-color)] bg-[var(--hover-bg)] p-1">
        {VIEW_MODES.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            onClick={() => onViewModeChange(value)}
            className={`flex items-center gap-1.5 ${toggleBtnClass(viewMode === value)}`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1 rounded-lg border border-[var(--border-color)] bg-[var(--hover-bg)] p-1">
          {TIME_LEVELS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => onTimeLevelChange(value)}
              className={toggleBtnClass(timeLevel === value)}
            >
              {label}
            </button>
          ))}
        </div>

        <AssigneeFilter value={assigneeFilter} onChange={onAssigneeFilterChange} />
      </div>
    </div>
  );
}
