'use client';

import { useState } from 'react';
import { Lightbulb, ChevronRight, ChevronLeft, Square, CheckSquare } from 'lucide-react';

interface GoalCreationCoachProps {
  goalLevel: 'HIGH_HARD' | 'STRATEGIC' | 'MONTHLY' | 'WEEKLY';
  isOpen: boolean;
  onToggle: () => void;
}

const LEVEL_GUIDANCE: Record<
  GoalCreationCoachProps['goalLevel'],
  { title: string; description: string }
> = {
  HIGH_HARD: {
    title: 'High Hard Goal',
    description:
      'Your High Hard Goal should be ambitious (scary), time-bound (1-5 years), specific & measurable, with confidence 6-7/10.',
  },
  STRATEGIC: {
    title: 'Yearly Goal',
    description:
      'Annual goals should ladder directly to your High Hard Goal. Ask: if I achieve this, am I closer to my HHG?',
  },
  MONTHLY: {
    title: 'Monthly Goal',
    description:
      "Monthly goals break down the current year's focus. Each should be completable in 30 days with clear success criteria.",
  },
  WEEKLY: {
    title: 'Weekly Goal',
    description:
      'Weekly goals are the most tactical level. They should be specific enough to know exactly when done. Max 3 per week.',
  },
};

const CHECKLIST_ITEMS = [
  'Is this binary? (You can say yes/no when it\'s done)',
  'Is it measurable? (Has a number or clear deliverable)',
  'Is it ambitious enough? (Feels slightly uncomfortable)',
  'Does it ladder to the level above?',
  'Is the timeline realistic?',
];

export function GoalCreationCoach({
  goalLevel,
  isOpen,
  onToggle,
}: GoalCreationCoachProps) {
  const [checkedItems, setCheckedItems] = useState<boolean[]>(
    new Array(CHECKLIST_ITEMS.length).fill(false)
  );

  const guidance = LEVEL_GUIDANCE[goalLevel];

  const toggleCheck = (index: number) => {
    setCheckedItems((prev) => {
      const next = [...prev];
      next[index] = !next[index];
      return next;
    });
  };

  return (
    <>
      {/* Toggle button (always visible) */}
      {!isOpen && (
        <button
          type="button"
          onClick={onToggle}
          className="fixed right-0 top-1/3 z-40 flex items-center gap-1 rounded-l-lg border border-r-0 border-amber-300 bg-amber-50 px-2 py-3 text-amber-700 shadow-md transition-colors hover:bg-amber-100"
          title="Open Goal Creation Guide"
        >
          <Lightbulb className="h-4 w-4" />
          <ChevronLeft className="h-3 w-3" />
        </button>
      )}

      {/* Sliding panel */}
      <div
        className={`fixed right-0 top-0 z-50 h-full w-80 transform border-l border-gray-200 bg-white shadow-xl transition-transform duration-300 ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex h-full flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
            <div className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-amber-500" />
              <h3 className="text-sm font-semibold text-gray-800">
                Goal Creation Guide
              </h3>
            </div>
            <button
              type="button"
              onClick={onToggle}
              className="rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
              title="Close guide"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto px-4 py-4">
            {/* Level badge */}
            <div className="mb-4">
              <span className="inline-block rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">
                {guidance.title}
              </span>
            </div>

            {/* Description */}
            <p className="mb-6 text-sm leading-relaxed text-gray-600">
              {guidance.description}
            </p>

            {/* Checklist */}
            <div className="space-y-1">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Quality Checklist
              </p>

              {CHECKLIST_ITEMS.map((item, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => toggleCheck(index)}
                  className="flex w-full items-start gap-2.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-gray-50"
                >
                  {checkedItems[index] ? (
                    <CheckSquare className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                  ) : (
                    <Square className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                  )}
                  <span
                    className={`text-sm ${
                      checkedItems[index]
                        ? 'text-green-700 line-through'
                        : 'text-gray-700'
                    }`}
                  >
                    {item}
                  </span>
                </button>
              ))}
            </div>

            {/* Progress indicator */}
            <div className="mt-6 rounded-lg bg-gray-50 p-3">
              <div className="mb-1 flex items-center justify-between text-xs text-gray-500">
                <span>Quality Score</span>
                <span>
                  {checkedItems.filter(Boolean).length}/{CHECKLIST_ITEMS.length}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-gray-200">
                <div
                  className="h-full rounded-full bg-green-500 transition-all duration-300"
                  style={{
                    width: `${
                      (checkedItems.filter(Boolean).length /
                        CHECKLIST_ITEMS.length) *
                      100
                    }%`,
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
