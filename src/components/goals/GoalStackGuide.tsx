'use client';

import { useState, useEffect } from 'react';
import { Target, Lightbulb, ArrowDown, Zap, X } from 'lucide-react';

interface GoalStackGuideProps {
  isOpen: boolean;
  onClose: () => void;
}

const STORAGE_KEY = 'prism-goal-stack-guide-dismissed';

const tabs = [
  {
    id: 'purpose',
    label: 'Find Your Purpose',
    icon: Target,
    summary: 'Discover the driving force behind your goals.',
    content:
      'Identify your broad life purpose. Purpose is a verb, not a noun. "Ending mental health stigma" > "becoming a therapist". Focus on problems that bother you — the issues you can\'t stop thinking about. Your purpose doesn\'t need to be grand; it needs to be genuine.',
  },
  {
    id: 'possibilities',
    label: 'Expand Possibilities',
    icon: Lightbulb,
    summary: 'Stretch your thinking before committing to a goal.',
    content:
      'Before setting your High Hard Goal, stretch your thinking. Use belief contagion (study 2\u20133 role models who achieved what seems impossible), past goal attainment for self-efficacy (recall times you exceeded expectations), and brute force big thinking (100X your vision \u2014 what would you attempt if you literally could not fail?).',
  },
  {
    id: 'reverse',
    label: 'Reverse Engineer',
    icon: ArrowDown,
    summary: 'Build your goal stack from the top down.',
    content:
      'Build from the top down: High Hard Goal (ambitious, 1\u20135 years, specific, measurable, 6\u20137/10 confidence you can achieve it) \u2192 Yearly Goals \u2192 Monthly Goals \u2192 Weekly Goals. Each level must logically ladder to the one above. If a lower goal doesn\'t clearly support a higher one, remove or replace it.',
  },
  {
    id: 'daily',
    label: 'Daily Actions',
    icon: Zap,
    summary: 'Execute with focus using max 3 daily actions.',
    content:
      'Max 3 daily critical actions. Use the Nightly Power-Down Ritual: review your stack \u2192 pick 3 actions for tomorrow \u2192 break each into sub-steps \u2192 do the "first step of the first step" (write the first sentence, not "write a chapter"). Separate planning from doing \u2014 plan at night, execute by day.',
  },
] as const;

export function GoalStackGuide({ isOpen, onClose }: GoalStackGuideProps) {
  const [activeTab, setActiveTab] = useState(0);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(0);
      setDontShowAgain(false);
    }
  }, [isOpen]);

  const handleClose = () => {
    if (dontShowAgain) {
      localStorage.setItem(STORAGE_KEY, 'true');
    }
    onClose();
  };

  if (!isOpen) return null;

  const current = tabs[activeTab];
  const Icon = current.icon;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={handleClose}>
      <div className="relative mx-4 w-full max-w-lg rounded-xl bg-[var(--surface)] shadow-2xl border border-[var(--border-color)]" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-color)] px-6 py-4">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">
            Goal Stack Guide
          </h2>
          <button
            onClick={handleClose}
            className="rounded-lg p-1 text-[var(--text-muted)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[var(--border-color)]">
          {tabs.map((tab, idx) => {
            const TabIcon = tab.icon;
            const isActive = idx === activeTab;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(idx)}
                className={`flex flex-1 flex-col items-center gap-1 px-2 py-3 text-xs font-medium transition-colors ${
                  isActive
                    ? 'border-b-2 border-indigo-500 text-indigo-400'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                <TabIcon className="h-4 w-4" />
                <span className="hidden sm:inline">{tab.label}</span>
                <span className="sm:hidden">{idx + 1}</span>
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="px-6 py-5">
          <div className="mb-3 flex items-center gap-2">
            <Icon className="h-5 w-5 text-indigo-500" />
            <h3 className="text-base font-semibold text-[var(--text-primary)]">
              {current.label}
            </h3>
          </div>
          <p className="mb-2 text-sm font-medium text-[var(--text-secondary)]">
            {current.summary}
          </p>
          <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
            {current.content}
          </p>
          <p className="mt-4 text-xs text-[var(--text-muted)]">
            Based on principles from the Flow Research Collective
          </p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[var(--border-color)] px-6 py-4">
          <label className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            Don&apos;t show again
          </label>
          <button
            onClick={handleClose}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
