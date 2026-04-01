'use client';

import { useState } from 'react';
import { Plus, X } from 'lucide-react';

interface WorkoutSubType {
  id: string;
  name: string;
  frequencyPerWeek: number;
}

interface WorkoutSubTypesProps {
  subTypes: WorkoutSubType[];
  onChange: (subTypes: WorkoutSubType[]) => void;
  editable?: boolean;
}

export function WorkoutSubTypes({ subTypes, onChange, editable = true }: WorkoutSubTypesProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newFrequency, setNewFrequency] = useState(3);

  const handleAdd = () => {
    const trimmed = newName.trim();
    if (!trimmed) return;

    const newSubType: WorkoutSubType = {
      id: crypto.randomUUID(),
      name: trimmed,
      frequencyPerWeek: newFrequency,
    };

    onChange([...subTypes, newSubType]);
    setNewName('');
    setNewFrequency(3);
    setIsAdding(false);
  };

  const handleRemove = (id: string) => {
    onChange(subTypes.filter((st) => st.id !== id));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    } else if (e.key === 'Escape') {
      setIsAdding(false);
      setNewName('');
    }
  };

  return (
    <div className="space-y-2">
      {subTypes.length === 0 && !isAdding && (
        <p className="text-sm text-gray-400 dark:text-gray-500">
          No specific workout types set
        </p>
      )}

      {subTypes.map((st) => (
        <div
          key={st.id}
          className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2 dark:border-gray-700"
        >
          <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
            {st.name}
          </span>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400">
              {st.frequencyPerWeek}x/week
            </span>
            {editable && (
              <button
                onClick={() => handleRemove(st.id)}
                className="rounded p-0.5 text-gray-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      ))}

      {/* Add form */}
      {editable && (
        <>
          {isAdding ? (
            <div className="flex items-center gap-2 rounded-md border border-dashed border-gray-300 px-3 py-2 dark:border-gray-600">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="e.g. Leg Day"
                autoFocus
                className="min-w-0 flex-1 bg-transparent text-sm text-gray-800 placeholder-gray-400 outline-none dark:text-gray-200"
              />
              <select
                value={newFrequency}
                onChange={(e) => setNewFrequency(Number(e.target.value))}
                className="rounded border border-gray-200 bg-white px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
              >
                {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                  <option key={n} value={n}>
                    {n}x/week
                  </option>
                ))}
              </select>
              <button
                onClick={handleAdd}
                disabled={!newName.trim()}
                className="rounded bg-indigo-600 px-2 py-1 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-40"
              >
                Add
              </button>
              <button
                onClick={() => { setIsAdding(false); setNewName(''); }}
                className="rounded p-1 text-gray-400 hover:text-gray-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setIsAdding(true)}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-indigo-600 dark:text-gray-400 dark:hover:text-indigo-400"
            >
              <Plus className="h-3.5 w-3.5" />
              Add workout type
            </button>
          )}
        </>
      )}
    </div>
  );
}
