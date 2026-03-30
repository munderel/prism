'use client';

import { useState } from 'react';
import { Plus, X, Save, Trophy, AlertTriangle } from 'lucide-react';

interface SuccessesAndDifficultiesStepProps {
  reviewId: string;
  initialSuccesses?: string[];
  initialDifficulties?: string[];
  onSave: (successes: string[], difficulties: string[]) => void;
}

export function SuccessesAndDifficultiesStep({
  reviewId: _reviewId,
  initialSuccesses = [],
  initialDifficulties = [],
  onSave,
}: SuccessesAndDifficultiesStepProps) {
  const [successes, setSuccesses] = useState<string[]>(initialSuccesses);
  const [difficulties, setDifficulties] = useState<string[]>(initialDifficulties);
  const [successInput, setSuccessInput] = useState('');
  const [difficultyInput, setDifficultyInput] = useState('');

  const addSuccess = () => {
    const trimmed = successInput.trim();
    if (!trimmed) return;
    setSuccesses((prev) => [...prev, trimmed]);
    setSuccessInput('');
  };

  const removeSuccess = (index: number) => {
    setSuccesses((prev) => prev.filter((_, i) => i !== index));
  };

  const addDifficulty = () => {
    const trimmed = difficultyInput.trim();
    if (!trimmed) return;
    setDifficulties((prev) => [...prev, trimmed]);
    setDifficultyInput('');
  };

  const removeDifficulty = (index: number) => {
    setDifficulties((prev) => prev.filter((_, i) => i !== index));
  };

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    action: () => void
  ) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      action();
    }
  };

  return (
    <div className="space-y-8">
      {/* Successes Section */}
      <div className="rounded-lg border border-green-200 bg-green-50/50 p-5">
        <div className="mb-4 flex items-center gap-2">
          <Trophy className="h-5 w-5 text-green-600" />
          <h3 className="text-lg font-semibold text-green-800">
            Successes &amp; Wins
          </h3>
        </div>

        <div className="mb-3 flex gap-2">
          <input
            type="text"
            value={successInput}
            onChange={(e) => setSuccessInput(e.target.value)}
            onKeyDown={(e) => handleKeyDown(e, addSuccess)}
            placeholder="What went well?"
            className="flex-1 rounded-md border border-green-300 bg-white px-3 py-2 text-sm placeholder:text-green-400 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
          />
          <button
            type="button"
            onClick={addSuccess}
            disabled={!successInput.trim()}
            className="inline-flex items-center gap-1 rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            Add
          </button>
        </div>

        {successes.length > 0 && (
          <ul className="space-y-2">
            {successes.map((item, index) => (
              <li
                key={index}
                className="flex items-center justify-between rounded-md border border-green-200 bg-white px-3 py-2 text-sm text-gray-800"
              >
                <span>{item}</span>
                <button
                  type="button"
                  onClick={() => removeSuccess(index)}
                  className="ml-2 rounded p-0.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {successes.length === 0 && (
          <p className="text-sm text-green-600/70">
            No successes added yet. Celebrate your wins!
          </p>
        )}
      </div>

      {/* Difficulties Section */}
      <div className="rounded-lg border border-red-200 bg-red-50/50 p-5">
        <div className="mb-4 flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-red-600" />
          <h3 className="text-lg font-semibold text-red-800">
            Difficulties &amp; Challenges
          </h3>
        </div>

        <div className="mb-3 flex gap-2">
          <input
            type="text"
            value={difficultyInput}
            onChange={(e) => setDifficultyInput(e.target.value)}
            onKeyDown={(e) => handleKeyDown(e, addDifficulty)}
            placeholder="What was challenging?"
            className="flex-1 rounded-md border border-red-300 bg-white px-3 py-2 text-sm placeholder:text-red-400 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
          />
          <button
            type="button"
            onClick={addDifficulty}
            disabled={!difficultyInput.trim()}
            className="inline-flex items-center gap-1 rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            Add
          </button>
        </div>

        {difficulties.length > 0 && (
          <ul className="space-y-2">
            {difficulties.map((item, index) => (
              <li
                key={index}
                className="flex items-center justify-between rounded-md border border-red-200 bg-white px-3 py-2 text-sm text-gray-800"
              >
                <span>{item}</span>
                <button
                  type="button"
                  onClick={() => removeDifficulty(index)}
                  className="ml-2 rounded p-0.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {difficulties.length === 0 && (
          <p className="text-sm text-red-600/70">
            No difficulties added yet. Reflect on what was hard.
          </p>
        )}
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => onSave(successes, difficulties)}
          className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
        >
          <Save className="h-4 w-4" />
          Save
        </button>
      </div>
    </div>
  );
}
