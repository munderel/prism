'use client';

import { m } from 'framer-motion';
import { ListChecks } from 'lucide-react';
import { springTransition } from '@/lib/process-animations';

interface ProcessEmptyStateProps {
  isAdmin: boolean;
  onCreateFunction: (name: string, description: string) => Promise<void>;
}

const TEMPLATES = [
  { name: 'Marketing', desc: 'Ad campaigns, content creation, social media' },
  { name: 'Sales', desc: 'Lead follow-up, proposals, client onboarding' },
  { name: 'Operations', desc: 'Weekly planning, reporting, team meetings' },
  { name: 'Product', desc: 'Feature development, bug triage, releases' },
  { name: 'Finance', desc: 'Invoicing, budgeting, expense tracking' },
  { name: 'HR', desc: 'Hiring, onboarding, performance reviews' },
];

export function ProcessEmptyState({ isAdmin, onCreateFunction }: ProcessEmptyStateProps) {
  return (
    <m.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springTransition}
      className="py-16 text-center"
    >
      <div className="relative mx-auto mb-6 h-20 w-20">
        <div className="absolute inset-0 rounded-2xl bg-indigo-500/10 blur-xl" />
        <div className="relative flex h-full w-full items-center justify-center rounded-2xl glass-panel">
          <ListChecks className="h-10 w-10 text-indigo-500 dark:text-indigo-400" />
        </div>
      </div>
      <h2 className="font-display text-lg font-semibold text-[var(--text-primary)] mb-2">
        No business functions yet
      </h2>
      <p className="text-sm text-[var(--text-muted)] max-w-md mx-auto mb-8">
        {isAdmin
          ? 'Start with a template or create from scratch.'
          : 'Ask an admin to set up business functions and processes.'}
      </p>
      {isAdmin && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-w-3xl mx-auto">
          {TEMPLATES.map((tpl) => (
            <button
              key={tpl.name}
              onClick={() => onCreateFunction(tpl.name, tpl.desc)}
              className="glass-panel p-4 text-left hover:border-indigo-500/30 transition-colors group"
            >
              <p className="text-sm font-medium text-[var(--text-primary)] group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                {tpl.name}
              </p>
              <p className="text-xs text-[var(--text-muted)] mt-1">{tpl.desc}</p>
            </button>
          ))}
        </div>
      )}
    </m.div>
  );
}

export function ProcessListEmptyState() {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-dashed border-[var(--border-color)] p-4">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--surface-raised)]">
        <ListChecks className="h-4 w-4 text-[var(--text-muted)]" />
      </div>
      <p className="text-sm text-[var(--text-muted)]">No processes in this function yet.</p>
    </div>
  );
}
