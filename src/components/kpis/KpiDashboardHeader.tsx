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
      {/* View mode toggle */}
      <div className="flex items-center gap-1 rounded-lg border border-[var(--border-color)] bg-[var(--hover-bg)] p-1">
        <button
          onClick={() => onViewModeChange('company')}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            viewMode === 'company'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          <Building2 className="h-3.5 w-3.5" />
          Company
        </button>
        <button
          onClick={() => onViewModeChange('individual')}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            viewMode === 'individual'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          <User className="h-3.5 w-3.5" />
          Individual
        </button>
      </div>

      {/* Right side: time level + assignee filter */}
      <div className="flex items-center gap-3">
        {/* Time level selector */}
        <div className="flex items-center gap-1 rounded-lg border border-[var(--border-color)] bg-[var(--hover-bg)] p-1">
          {TIME_LEVELS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => onTimeLevelChange(value)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                timeLevel === value
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Assignee filter */}
        <AssigneeFilter value={assigneeFilter} onChange={onAssigneeFilterChange} />
      </div>
    </div>
  );
}
