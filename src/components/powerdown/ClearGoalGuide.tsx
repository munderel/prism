'use client';

import { useState } from 'react';
import { Lightbulb, ChevronRight, ChevronLeft, Square, CheckSquare } from 'lucide-react';

interface ClearGoalGuideProps {
  isOpen: boolean;
  onToggle: () => void;
}

const CHECKLIST_ITEMS = [
  'Is the outcome specific? (Not "work on X" but "complete draft of sections 1-3")',
  'Is it measurable? (Has a number or clear deliverable)',
  'Can you say "done" unambiguously when it\'s complete?',
  'Is the first action obvious enough to start immediately tomorrow?',
  'Can this be done within the scheduled time block?',
];

/**
 * Clear Goal Guide sidebar for PowerDown Step 5.
 * Interactive checklist to help users write specific, measurable task outcomes.
 */
export function ClearGoalGuide({ isOpen, onToggle }: ClearGoalGuideProps) {
  const [checkedItems, setCheckedItems] = useState<boolean[]>(
    new Array(CHECKLIST_ITEMS.length).fill(false)
  );

  const checkedCount = checkedItems.filter(Boolean).length;
  const progressPct = (checkedCount / CHECKLIST_ITEMS.length) * 100;

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
          title="Open Clear Goal Guide"
        >
          <Lightbulb className="h-4 w-4" />
          <ChevronLeft className="h-3 w-3" />
        </button>
      )}

      {/* Sliding panel */}
      <div
        className={`fixed right-0 top-0 z-50 h-full w-96 transform border-l border-gray-200 bg-white shadow-xl transition-transform duration-300 ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex h-full flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
            <div className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-amber-500" />
              <h3 className="text-sm font-semibold text-gray-800">
                Clear Goal Guide
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
                Clear Goals
              </span>
            </div>

            {/* Description */}
            <p className="mb-6 text-sm leading-relaxed text-gray-600">
              A clear goal is a specific result you can point to when it&apos;s done—not a task, but an outcome.
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

            <div className="mt-6 rounded-lg bg-gray-50 p-3">
              <div className="mb-1 flex items-center justify-between text-xs text-gray-500">
                <span>Quality Score</span>
                <span>
                  {checkedCount}/{CHECKLIST_ITEMS.length}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-gray-200">
                <div
                  className="h-full rounded-full bg-amber-500 transition-all duration-300"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
