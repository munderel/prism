'use client';

import { useState, useEffect } from 'react';
import { X, BookOpen } from 'lucide-react';

interface ReviewStartupGuideProps {
  reviewType: 'WEEKLY' | 'MONTHLY' | 'YEARLY' | 'POWERDOWN';
  isOpen: boolean;
  onClose: () => void;
}

const REVIEW_CONTENT: Record<
  ReviewStartupGuideProps['reviewType'],
  {
    title: string;
    description: string;
    steps: string[];
  }
> = {
  WEEKLY: {
    title: 'How Weekly Reviews Work',
    description:
      "Weekly reviews close out the previous week and plan the upcoming week. You'll review goals, rank your top 3 tasks, schedule work blocks, and drag tasks into your calendar.",
    steps: [
      'Review last week\'s goals and mark them complete or incomplete',
      'Reflect on successes and difficulties',
      'Select your top 3 most important tasks for next week',
      'Create or adjust weekly goals',
      'Schedule work blocks into your calendar',
    ],
  },
  MONTHLY: {
    title: 'How Monthly Reviews Work',
    description:
      "Monthly reviews zoom out. You'll start by seeing your High Hard Goal and yearly vision for motivation, then review weekly progress, adjust goals, and create next month's weekly goals.",
    steps: [
      'Revisit your High Hard Goal and yearly vision',
      'Review this month\'s weekly progress',
      'Reflect on successes and challenges',
      'Assess goal completion and KPIs',
      'Create next month\'s goals and weekly breakdown',
    ],
  },
  YEARLY: {
    title: 'How Yearly Reviews Work',
    description:
      "Yearly reviews are your biggest planning moment. You'll assess your High Hard Goal, review the year's monthly progress, and plan next year's monthly goals.",
    steps: [
      'Reflect on your High Hard Goal progress',
      'Review all 12 months of progress and milestones',
      'Celebrate major wins and analyze setbacks',
      'Set or adjust your High Hard Goal',
      'Create next year\'s strategic goals',
      'Break down the year into monthly goals',
    ],
  },
  POWERDOWN: {
    title: 'How Power Down Works',
    description:
      "Power Down is your end-of-day ritual. You'll review today, pick tomorrow's top 3 tasks, schedule them into your calendar, and set clear goals for each.",
    steps: [
      'Review what you accomplished today',
      'Note any unfinished tasks to carry forward',
      'Select tomorrow\'s top 3 tasks',
      'Schedule tasks into tomorrow\'s calendar',
      'Set a clear intention for tomorrow',
    ],
  },
};

const STORAGE_KEY_PREFIX = 'prism-review-guide-dismissed-';

export function ReviewStartupGuide({
  reviewType,
  isOpen,
  onClose,
}: ReviewStartupGuideProps) {
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const storageKey = `${STORAGE_KEY_PREFIX}${reviewType}`;

  useEffect(() => {
    try {
      const dismissed = localStorage.getItem(storageKey);
      if (dismissed === 'true') {
        setDontShowAgain(true);
      }
    } catch {
      // localStorage unavailable
    }
  }, [storageKey]);

  const handleClose = () => {
    if (dontShowAgain) {
      try {
        localStorage.setItem(storageKey, 'true');
      } catch {
        // localStorage unavailable
      }
    }
    onClose();
  };

  const handleToggleDismiss = () => {
    const next = !dontShowAgain;
    setDontShowAgain(next);
    try {
      if (next) {
        localStorage.setItem(storageKey, 'true');
      } else {
        localStorage.removeItem(storageKey);
      }
    } catch {
      // localStorage unavailable
    }
  };

  if (!isOpen) return null;

  const content = REVIEW_CONTENT[reviewType];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl border border-gray-200 bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <BookOpen className="h-5 w-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900">
              {content.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          <p className="mb-5 text-sm leading-relaxed text-gray-600">
            {content.description}
          </p>

          <div className="mb-5">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Steps in this review
            </p>
            <ol className="space-y-2.5">
              {content.steps.map((step, index) => (
                <li key={index} className="flex items-start gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
                    {index + 1}
                  </span>
                  <span className="text-sm text-gray-700">{step}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-gray-100 px-6 py-4">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-500">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={handleToggleDismiss}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            Don&apos;t show this again
          </label>

          <button
            type="button"
            onClick={handleClose}
            className="rounded-md bg-blue-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
