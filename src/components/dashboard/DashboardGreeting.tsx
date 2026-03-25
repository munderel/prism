'use client';

import { useSession } from 'next-auth/react';
import { Plus } from 'lucide-react';
import { StreakCounter } from '@/components/dopamine/StreakCounter';

interface DashboardGreetingProps {
  onQuickAdd: () => void;
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function DashboardGreeting({ onQuickAdd }: DashboardGreetingProps) {
  const { data: session } = useSession();
  const greeting = getGreeting();

  return (
    <div className="mb-8 flex items-start justify-between gap-4">
      <div>
        <h1 className="font-display text-3xl font-bold text-white">
          {greeting}{session?.user?.name ? `, ${session.user.name}` : ''}
        </h1>
        <p className="text-gray-500 mt-1.5 text-sm">
          Here&apos;s your day at a glance.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <StreakCounter />
        <button
          onClick={onQuickAdd}
          className="glass-panel flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white hover:bg-white/[0.05] transition-colors"
        >
          <Plus className="h-4 w-4 text-prism-indigo" />
          Quick Add
        </button>
      </div>
    </div>
  );
}
