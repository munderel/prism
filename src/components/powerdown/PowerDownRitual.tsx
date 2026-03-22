'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, ChevronRight, Moon, PartyPopper } from 'lucide-react';

const STEPS = [
  { num: 1, title: 'Review Completions', description: 'Review what you accomplished today.' },
  { num: 2, title: 'Capture Loose Ends', description: 'Capture any unfinished items as React tasks.' },
  { num: 3, title: 'Reschedule Incomplete', description: 'Move incomplete tasks to tomorrow or close them.' },
  { num: 4, title: "Set Tomorrow's Focus", description: 'Break weekly goals into daily tasks for tomorrow.' },
  { num: 5, title: 'Assign Time Blocks', description: 'Schedule time blocks for tomorrow\'s tasks.' },
  { num: 6, title: 'Clear Inbox & Power Down', description: 'Final check — you\'re done for the day!' },
];

interface PowerDownRitualProps {
  onComplete: () => void;
}

export function PowerDownRitual({ onComplete }: PowerDownRitualProps) {
  const [session, setSession] = useState<any>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [todayTasks, setTodayTasks] = useState<any[]>([]);
  const [tomorrowPlan, setTomorrowPlan] = useState<string[]>([]);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    initSession();
    fetchTodayTasks();
  }, []);

  const initSession = async () => {
    // Try to resume existing session
    let res = await fetch('/api/powerdown');
    let data = res.ok ? await res.json() : null;

    if (!data) {
      res = await fetch('/api/powerdown', { method: 'POST' });
      data = await res.json();
    }

    setSession(data);
    setCurrentStep(data.currentStep ?? 1);
    setTomorrowPlan(data.tomorrowPlan ?? []);
    setLoading(false);
  };

  const fetchTodayTasks = async () => {
    const today = new Date().toISOString().split('T')[0];
    const res = await fetch(`/api/tasks?date=${today}`);
    if (res.ok) setTodayTasks(await res.json());
  };

  const advanceStep = async () => {
    if (!session) return;
    const next = currentStep + 1;

    if (next > 6) {
      // Complete
      await fetch('/api/powerdown', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.id, currentStep: 6, tomorrowPlan, complete: true }),
      });
      setCompleted(true);
      return;
    }

    await fetch('/api/powerdown', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: session.id, currentStep: next, tomorrowPlan }),
    });
    setCurrentStep(next);
  };

  const addLooseEnd = async () => {
    if (!newTaskTitle.trim()) return;
    await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        taskType: 'REACT',
        title: newTaskTitle,
        dueDate: new Date(Date.now() + 86400000).toISOString().split('T')[0],
      }),
    });
    setNewTaskTitle('');
    fetchTodayTasks();
  };

  const rescheduleTask = async (taskId: string) => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    await fetch(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dueDate: tomorrow }),
    });
    fetchTodayTasks();
  };

  if (loading) return <div className="text-gray-500 py-12 text-center">Loading...</div>;

  if (completed) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="text-center py-16"
      >
        <PartyPopper className="h-16 w-16 text-yellow-400 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-white mb-2">Power Down Complete!</h2>
        <p className="text-gray-400 mb-6">Great work today. Rest well.</p>
        <button
          onClick={onComplete}
          className="rounded-lg bg-indigo-600 px-6 py-3 text-sm font-medium text-white hover:bg-indigo-500 transition-colors"
        >
          Back to Dashboard
        </button>
      </motion.div>
    );
  }

  const completedTasks = todayTasks.filter((t) => t.status === 'DONE');
  const incompleteTasks = todayTasks.filter((t) => t.status !== 'DONE' && t.status !== 'DROPPED');

  return (
    <div className="max-w-2xl mx-auto">
      {/* Step indicators */}
      <div className="flex items-center gap-2 mb-8">
        {STEPS.map(({ num }) => (
          <div
            key={num}
            className={`h-2 flex-1 rounded-full transition-colors ${
              num < currentStep ? 'bg-green-500' : num === currentStep ? 'bg-indigo-500' : 'bg-gray-800'
            }`}
          />
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={currentStep}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          className="space-y-6"
        >
          <div>
            <h2 className="text-xl font-bold text-white mb-1">
              Step {currentStep}: {STEPS[currentStep - 1].title}
            </h2>
            <p className="text-gray-400 text-sm">{STEPS[currentStep - 1].description}</p>
          </div>

          {/* Step content */}
          <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-6">
            {currentStep === 1 && (
              <div className="space-y-2">
                <p className="text-sm text-gray-400 mb-3">
                  {completedTasks.length} of {todayTasks.length} tasks completed today.
                </p>
                {completedTasks.map((t) => (
                  <div key={t.id} className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-green-400" />
                    <span className="text-white">{t.title}</span>
                  </div>
                ))}
              </div>
            )}

            {currentStep === 2 && (
              <div className="space-y-3">
                <p className="text-sm text-gray-400">Any loose ends to capture?</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addLooseEnd()}
                    placeholder="New React task..."
                    className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
                  />
                  <button onClick={addLooseEnd} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-500">
                    Add
                  </button>
                </div>
              </div>
            )}

            {currentStep === 3 && (
              <div className="space-y-2">
                <p className="text-sm text-gray-400 mb-3">
                  {incompleteTasks.length} incomplete tasks. Reschedule to tomorrow?
                </p>
                {incompleteTasks.map((t) => (
                  <div key={t.id} className="flex items-center justify-between rounded-lg bg-gray-800/50 px-3 py-2">
                    <span className="text-sm text-white">{t.title}</span>
                    <button
                      onClick={() => rescheduleTask(t.id)}
                      className="text-xs text-indigo-400 hover:text-indigo-300"
                    >
                      → Tomorrow
                    </button>
                  </div>
                ))}
                {incompleteTasks.length === 0 && (
                  <p className="text-sm text-green-400">All clear!</p>
                )}
              </div>
            )}

            {currentStep === 4 && (
              <div className="space-y-3">
                <p className="text-sm text-gray-400">Plan your focus items for tomorrow.</p>
                {tomorrowPlan.map((item, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm text-white">
                    <span className="text-indigo-400">{i + 1}.</span> {item}
                  </div>
                ))}
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Tomorrow's focus item..."
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.target as HTMLInputElement).value) {
                        setTomorrowPlan([...tomorrowPlan, (e.target as HTMLInputElement).value]);
                        (e.target as HTMLInputElement).value = '';
                      }
                    }}
                    className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>
            )}

            {currentStep === 5 && (
              <div className="space-y-2">
                <p className="text-sm text-gray-400">
                  Assign time blocks for tomorrow&apos;s tasks in the Calendar page.
                </p>
                <p className="text-xs text-gray-600">
                  You can skip this step and assign time blocks later.
                </p>
              </div>
            )}

            {currentStep === 6 && (
              <div className="text-center space-y-3">
                <Moon className="h-12 w-12 text-indigo-400 mx-auto" />
                <p className="text-sm text-gray-400">
                  Clear your mind. Tomorrow is planned. You&apos;re done for the day.
                </p>
              </div>
            )}
          </div>

          {/* Next button */}
          <button
            onClick={advanceStep}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-3 text-sm font-medium text-white hover:bg-indigo-500 transition-colors"
          >
            {currentStep === 6 ? 'Complete Power Down' : 'Next Step'}
            <ChevronRight className="h-4 w-4" />
          </button>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
