'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Moon } from 'lucide-react';
import { PowerDownRitual } from '@/components/powerdown/PowerDownRitual';

// useSearchParams needs a Suspense boundary so Next can prerender the shell
// while the query-driven body resolves at runtime.
export default function PowerDownPage() {
  return (
    <Suspense fallback={<div className="text-sm text-[var(--text-muted)] py-6">Loading...</div>}>
      <PowerDownPageInner />
    </Suspense>
  );
}

function PowerDownPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Optional anchor for historical view; must be a bare YYYY-MM-DD or it's
  // ignored (defensive — defaults to today).
  const rawDate = searchParams?.get('date') ?? null;
  const date = rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : undefined;
  const isHistorical = Boolean(date);

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-[var(--text-primary)] flex items-center gap-2">
          <Moon className="h-6 w-6 text-prism-indigo" />
          Power Down Ritual
          {isHistorical && (
            <span className="ml-2 rounded-md bg-indigo-500/15 border border-indigo-500/40 px-2 py-0.5 text-xs font-medium text-indigo-300">
              {date}
            </span>
          )}
        </h1>
        <p className="text-[var(--text-muted)] text-sm mt-1">
          {isHistorical ? 'Reviewing a past session.' : 'End your day with intention. Review, plan, and power down.'}
        </p>
      </div>

      <PowerDownRitual
        key={date ?? 'today'}
        date={date}
        onComplete={() => router.push('/')}
      />
    </div>
  );
}
