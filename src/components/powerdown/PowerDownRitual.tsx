'use client';

import { useState, useEffect } from 'react';
import { m, AnimatePresence } from 'framer-motion';
import { CheckCircle2, ChevronRight, Moon, PartyPopper, AlertCircle, Heart, Lightbulb, Calendar, X } from 'lucide-react';

const STEPS = [
  { num: 1, title: 'Mark Task Completion', description: 'Review what you accomplished today.' },
  { num: 2, title: 'Record Distractions', description: 'What pulled you off track today? Log it so you can guard against it.' },
  { num: 3, title: 'Daily Gratitude', description: 'Spend 5 minutes reflecting on what you\'re grateful for.' },
  { num: 4, title: 'Capture Ideas', description: 'Dump any ideas floating in your head so they don\'t keep you up.' },
  { num: 5, title: 'Capture Loose Ends', description: 'Capture any unfinished items as React tasks.' },
  { num: 6, title: 'Reschedule Incomplete', description: 'Move incomplete tasks to tomorrow or close them.' },
  { num: 7, title: 'Clear Goals for Tomorrow', description: 'Review tomorrow\'s tasks and decompose if needed.' },
  { num: 8, title: "Tomorrow's Calendar", description: 'Review your calendar for tomorrow.' },
  { num: 9, title: 'Power Down Complete', description: 'Clear your mind. You\'re done for the day.' },
];

interface PowerDownRitualProps {
  onComplete: () => void;
}

export function PowerDownRitual({ onComplete }: PowerDownRitualProps) {
  const [session, setSession] = useState<any>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [todayTasks, setTodayTasks] = useState<any[]>([]);
  const [tomorrowTasks, setTomorrowTasks] = useState<any[]>([]);
  const [tomorrowPlan, setTomorrowPlan] = useState<string[]>([]);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [completed, setCompleted] = useState(false);

  const [distractions, setDistractions] = useState<string[]>([]);
  const [newDistraction, setNewDistraction] = useState('');
  const [gratitudes, setGratitudes] = useState<string[]>([]);
  const [newGratitude, setNewGratitude] = useState('');
  const [ideas, setIdeas] = useState<string[]>([]);
  const [newIdea, setNewIdea] = useState('');
  const [clearGoals, setClearGoals] = useState<any[]>([]);

  const [timerSeconds, setTimerSeconds] = useState(300);
  const [timerRunning, setTimerRunning] = useState(false);

  useEffect(() => {
    if (!timerRunning || timerSeconds <= 0) return;
    const id = setInterval(() => setTimerSeconds((s) => s - 1), 1000);
    return () => clearInterval(id);
  }, [timerRunning, timerSeconds]);

  useEffect(() => {
    initSession();
    fetchTodayTasks();
    fetchTomorrowTasks();
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
    setDistractions(data.distractions ?? []);
    setGratitudes(data.gratitudes ?? []);
    setIdeas(data.ideas ?? []);
    setClearGoals(data.clearGoals ?? []);
    setLoading(false);
  };

  const fetchTodayTasks = async () => {
    const today = new Date().toISOString().split('T')[0];
    const res = await fetch(`/api/tasks?date=${today}`);
    if (res.ok) setTodayTasks(await res.json());
  };

  const fetchTomorrowTasks = async () => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const res = await fetch(`/api/tasks?date=${tomorrow}`);
    if (res.ok) setTomorrowTasks(await res.json());
  };

  const persistStep = async (nextStep: number, extra: Record<string, any> = {}) => {
    if (!session) return;
    await fetch('/api/powerdown', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: session.id,
        currentStep: nextStep,
        tomorrowPlan,
        distractions,
        gratitudes,
        ideas,
        clearGoals,
        ...extra,
      }),
    });
  };

  const advanceStep = async () => {
    if (!session) return;
    const next = currentStep + 1;

    if (next > 9) {
      // Complete
      await persistStep(9, { complete: true });
      setCompleted(true);
      return;
    }

    await persistStep(next);
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
        estimatedMinutes: 30,
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

  const handleDecompose = async (task: any) => {
    const res = await fetch('/api/powerdown/decompose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: task.title, description: task.description }),
    });
    if (res.ok) {
      const data = await res.json();
      setClearGoals((prev) => [...prev, { taskId: task.id, taskTitle: task.title, steps: data.steps ?? data }]);
    }
  };

  if (loading) return <div className="text-gray-500 py-12 text-center">Loading...</div>;

  if (completed) {
    return (
      <m.div
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
      </m.div>
    );
  }

  const completedTasks = todayTasks.filter((t) => t.status === 'DONE');
  const incompleteTasks = todayTasks.filter((t) => t.status !== 'DONE' && t.status !== 'DROPPED');

  const timerDisplay = `${Math.floor(timerSeconds / 60)}:${String(timerSeconds % 60).padStart(2, '0')}`;

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
        <m.div
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
          <div className="glass-panel p-6">
            {/* Step 1: Mark Task Completion */}
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

            {/* Step 2: Record Distractions */}
            {currentStep === 2 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle className="h-5 w-5 text-orange-400" />
                  <p className="text-sm text-gray-400">What distracted you today?</p>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newDistraction}
                    onChange={(e) => setNewDistraction(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newDistraction.trim()) {
                        setDistractions([...distractions, newDistraction.trim()]);
                        setNewDistraction('');
                      }
                    }}
                    placeholder="e.g. Slack notifications, impromptu meeting..."
                    className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
                  />
                  <button
                    onClick={() => {
                      if (newDistraction.trim()) {
                        setDistractions([...distractions, newDistraction.trim()]);
                        setNewDistraction('');
                      }
                    }}
                    className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-500"
                  >
                    Add
                  </button>
                </div>
                {distractions.map((item, i) => (
                  <div key={i} className="flex items-center justify-between rounded-lg bg-gray-800/50 px-3 py-2">
                    <span className="text-sm text-white">{item}</span>
                    <button
                      onClick={() => setDistractions(distractions.filter((_, j) => j !== i))}
                      className="text-gray-500 hover:text-red-400"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                {distractions.length === 0 && (
                  <p className="text-xs text-gray-600">No distractions recorded yet. Skip if it was a focused day!</p>
                )}
              </div>
            )}

            {/* Step 3: Daily Gratitude */}
            {currentStep === 3 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 mb-2">
                  <Heart className="h-5 w-5 text-pink-400" />
                  <p className="text-sm text-gray-400">What are you grateful for today?</p>
                </div>
                <div className="text-center mb-4">
                  <span className="text-3xl font-mono text-white">{timerDisplay}</span>
                  <div className="mt-2">
                    <button
                      onClick={() => setTimerRunning(!timerRunning)}
                      className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                        timerRunning
                          ? 'bg-red-600 text-white hover:bg-red-500'
                          : 'bg-green-600 text-white hover:bg-green-500'
                      }`}
                    >
                      {timerRunning ? 'Pause' : timerSeconds === 300 ? 'Start 5-min Timer' : 'Resume'}
                    </button>
                    {timerSeconds < 300 && !timerRunning && (
                      <button
                        onClick={() => setTimerSeconds(300)}
                        className="ml-2 rounded-lg bg-gray-700 px-4 py-2 text-sm text-gray-300 hover:bg-gray-600"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newGratitude}
                    onChange={(e) => setNewGratitude(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newGratitude.trim()) {
                        setGratitudes([...gratitudes, newGratitude.trim()]);
                        setNewGratitude('');
                      }
                    }}
                    placeholder="I'm grateful for..."
                    className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
                  />
                  <button
                    onClick={() => {
                      if (newGratitude.trim()) {
                        setGratitudes([...gratitudes, newGratitude.trim()]);
                        setNewGratitude('');
                      }
                    }}
                    className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-500"
                  >
                    Add
                  </button>
                </div>
                {gratitudes.map((item, i) => (
                  <div key={i} className="flex items-center justify-between rounded-lg bg-gray-800/50 px-3 py-2">
                    <span className="text-sm text-white">{item}</span>
                    <button
                      onClick={() => setGratitudes(gratitudes.filter((_, j) => j !== i))}
                      className="text-gray-500 hover:text-red-400"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Step 4: Capture Ideas */}
            {currentStep === 4 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 mb-2">
                  <Lightbulb className="h-5 w-5 text-yellow-400" />
                  <p className="text-sm text-gray-400">Any ideas bouncing around? Get them out of your head.</p>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newIdea}
                    onChange={(e) => setNewIdea(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newIdea.trim()) {
                        setIdeas([...ideas, newIdea.trim()]);
                        setNewIdea('');
                      }
                    }}
                    placeholder="Idea, thought, or shower insight..."
                    className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
                  />
                  <button
                    onClick={() => {
                      if (newIdea.trim()) {
                        setIdeas([...ideas, newIdea.trim()]);
                        setNewIdea('');
                      }
                    }}
                    className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-500"
                  >
                    Add
                  </button>
                </div>
                {ideas.map((item, i) => (
                  <div key={i} className="flex items-center justify-between rounded-lg bg-gray-800/50 px-3 py-2">
                    <span className="text-sm text-white">{item}</span>
                    <button
                      onClick={() => setIdeas(ideas.filter((_, j) => j !== i))}
                      className="text-gray-500 hover:text-red-400"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                {ideas.length === 0 && (
                  <p className="text-xs text-gray-600">No ideas? That&apos;s fine -- skip ahead.</p>
                )}
              </div>
            )}

            {/* Step 5: Capture Loose Ends (was step 2) */}
            {currentStep === 5 && (
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

            {/* Step 6: Reschedule Incomplete (was step 3) */}
            {currentStep === 6 && (
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
                      &rarr; Tomorrow
                    </button>
                  </div>
                ))}
                {incompleteTasks.length === 0 && (
                  <p className="text-sm text-green-400">All clear!</p>
                )}
              </div>
            )}

            {/* Step 7: Clear Goals for Tomorrow */}
            {currentStep === 7 && (
              <div className="space-y-3">
                <p className="text-sm text-gray-400 mb-3">
                  Review tomorrow&apos;s tasks. Decompose anything that feels too big.
                </p>
                {tomorrowTasks.length === 0 && (
                  <p className="text-sm text-gray-500">No tasks scheduled for tomorrow yet.</p>
                )}
                {tomorrowTasks.map((t) => {
                  const decomposed = clearGoals.find((cg) => cg.taskId === t.id);
                  return (
                    <div key={t.id} className="rounded-lg bg-gray-800/50 px-3 py-2 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-white">{t.title}</span>
                        {!decomposed && (
                          <button
                            onClick={() => handleDecompose(t)}
                            className="text-xs rounded bg-indigo-600 px-3 py-1 text-white hover:bg-indigo-500"
                          >
                            Decompose
                          </button>
                        )}
                      </div>
                      {decomposed && (
                        <div className="ml-4 space-y-1">
                          {(decomposed.steps || []).map((step: any, i: number) => (
                            <div key={i} className="text-xs text-gray-400 flex items-center gap-2">
                              <span className="text-indigo-400">{i + 1}.</span>
                              <span>{typeof step === 'string' ? step : step.title || step.step}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Step 8: Tomorrow's Calendar */}
            {currentStep === 8 && (
              <div className="text-center space-y-4">
                <Calendar className="h-12 w-12 text-indigo-400 mx-auto" />
                <p className="text-sm text-gray-400">
                  Review your calendar for tomorrow to avoid surprises.
                </p>
                <a
                  href="/calendar"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block rounded-lg bg-gray-700 px-5 py-2 text-sm text-white hover:bg-gray-600 transition-colors"
                >
                  Open Calendar &rarr;
                </a>
              </div>
            )}

            {/* Step 9: Power Down Complete */}
            {currentStep === 9 && (
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
            {currentStep === 9 ? 'Complete Power Down' : 'Next Step'}
            <ChevronRight className="h-4 w-4" />
          </button>
        </m.div>
      </AnimatePresence>
    </div>
  );
}
