'use client';

import { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Plus, X, Save, Trophy, AlertTriangle } from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Reusable list section (shared between successes & difficulties)     */
/* ------------------------------------------------------------------ */

const COLOR_CLASSES = {
  green: {
    container: 'border-green-200 bg-green-50/50',
    icon: 'text-green-600',
    heading: 'text-green-800',
    input: 'border-green-300 placeholder:text-green-700 focus:border-green-500 focus:ring-green-500',
    button: 'bg-green-600 hover:bg-green-700',
    listItem: 'border-green-200',
    empty: 'text-green-700',
  },
  red: {
    container: 'border-red-200 bg-red-50/50',
    icon: 'text-red-600',
    heading: 'text-red-800',
    input: 'border-red-300 placeholder:text-red-700 focus:border-red-500 focus:ring-red-500',
    button: 'bg-red-600 hover:bg-red-700',
    listItem: 'border-red-200',
    empty: 'text-red-700',
  },
} as const;

interface ItemListSectionProps {
  icon: LucideIcon;
  title: string;
  items: string[];
  inputValue: string;
  onInputChange: (value: string) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
  placeholder: string;
  emptyMessage: string;
  color: keyof typeof COLOR_CLASSES;
}

function ItemListSection({
  icon: Icon,
  title,
  items,
  inputValue,
  onInputChange,
  onAdd,
  onRemove,
  placeholder,
  emptyMessage,
  color,
}: ItemListSectionProps) {
  const c = COLOR_CLASSES[color];

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      onAdd();
    }
  }

  return (
    <div className={`rounded-lg border p-5 ${c.container}`}>
      <div className="mb-4 flex items-center gap-2">
        <Icon className={`h-5 w-5 ${c.icon}`} />
        <h3 className={`text-lg font-semibold ${c.heading}`}>{title}</h3>
      </div>

      <div className="mb-3 flex gap-2">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={`flex-1 rounded-md border bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 ${c.input}`}
        />
        <button
          type="button"
          onClick={onAdd}
          disabled={!inputValue.trim()}
          className={`inline-flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${c.button}`}
        >
          <Plus className="h-4 w-4" />
          Add
        </button>
      </div>

      {items.length > 0 ? (
        <ul className="space-y-2">
          {items.map((item, index) => (
            <li
              key={index}
              className={`flex items-center justify-between rounded-md border bg-white px-3 py-2 text-sm text-gray-800 ${c.listItem}`}
            >
              <span>{item}</span>
              <button
                type="button"
                onClick={() => onRemove(index)}
                className="ml-2 rounded p-0.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className={`text-sm ${c.empty}`}>{emptyMessage}</p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                      */
/* ------------------------------------------------------------------ */

interface SuccessesAndDifficultiesStepProps {
  /** @deprecated No longer used internally -- will be removed in a future version */
  reviewId?: string;
  initialSuccesses?: string[];
  initialDifficulties?: string[];
  onSave: (successes: string[], difficulties: string[]) => void;
}

export function SuccessesAndDifficultiesStep({
  initialSuccesses = [],
  initialDifficulties = [],
  onSave,
}: SuccessesAndDifficultiesStepProps) {
  const [successes, setSuccesses] = useState<string[]>(initialSuccesses);
  const [difficulties, setDifficulties] = useState<string[]>(initialDifficulties);
  const [successInput, setSuccessInput] = useState('');
  const [difficultyInput, setDifficultyInput] = useState('');

  function addItem(
    input: string,
    setItems: React.Dispatch<React.SetStateAction<string[]>>,
    clearInput: () => void,
  ) {
    const trimmed = input.trim();
    if (!trimmed) return;
    setItems((prev) => [...prev, trimmed]);
    clearInput();
  }

  function removeItem(
    index: number,
    setItems: React.Dispatch<React.SetStateAction<string[]>>,
  ) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-8">
      <ItemListSection
        icon={Trophy}
        title="Successes &amp; Wins"
        items={successes}
        inputValue={successInput}
        onInputChange={setSuccessInput}
        onAdd={() => addItem(successInput, setSuccesses, () => setSuccessInput(''))}
        onRemove={(i) => removeItem(i, setSuccesses)}
        placeholder="What went well?"
        emptyMessage="No successes added yet. Celebrate your wins!"
        color="green"
      />

      <ItemListSection
        icon={AlertTriangle}
        title="Difficulties &amp; Challenges"
        items={difficulties}
        inputValue={difficultyInput}
        onInputChange={setDifficultyInput}
        onAdd={() => addItem(difficultyInput, setDifficulties, () => setDifficultyInput(''))}
        onRemove={(i) => removeItem(i, setDifficulties)}
        placeholder="What was challenging?"
        emptyMessage="No difficulties added yet. Reflect on what was hard."
        color="red"
      />

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
