'use client';

import useSWR from 'swr';
import { useSession } from 'next-auth/react';

interface AssigneeFilterProps {
  value: string; // userId or '' for all
  onChange: (userId: string) => void;
  className?: string;
}

export function AssigneeFilter({ value, onChange, className = '' }: AssigneeFilterProps) {
  const { data: session } = useSession();
  const currentUserId = session?.user?.id;
  const { data: users = [] } = useSWR('/api/users');

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-3 py-1.5 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none ${className}`}
    >
      <option value="">All</option>
      {currentUserId && <option value={currentUserId}>My Processes</option>}
      <option disabled>──────</option>
      {users.map((u: any) => (
        <option key={u.id} value={u.id}>{u.name || u.email}</option>
      ))}
    </select>
  );
}
