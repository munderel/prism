'use client';

import { useState } from 'react';
import { X } from 'lucide-react';

interface ActivitySelectModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (activity: string) => void;
  activities: string[];
  aimName: string;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function ActivitySelectModal({ open, onClose, onSelect, activities, aimName }: ActivitySelectModalProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [customValue, setCustomValue] = useState('');

  if (!open) return null;

  const handleConfirm = () => {
    const value = selected ?? customValue.trim();
    if (value) {
      onSelect(value);
      setSelected(null);
      setCustomValue('');
    }
  };

  const handleChipClick = (activity: string) => {
    setSelected(activity);
    setCustomValue('');
  };

  const handleCustomChange = (val: string) => {
    setCustomValue(val);
    setSelected(null);
  };

  const handleClose = () => {
    setSelected(null);
    setCustomValue('');
    onClose();
  };

  const isConfirmDisabled = !selected && !customValue.trim();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal card */}
      <div className="glass-panel relative z-10 w-full max-w-md mx-4 rounded-xl border border-[var(--border-color)] bg-[var(--surface)] p-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">
            Select Activity for {aimName}
          </h2>
          <button
            onClick={handleClose}
            className="rounded-lg p-1.5 text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Activity chips */}
        <div className="flex flex-wrap gap-2 mb-5">
          {activities.map((activity) => (
            <button
              key={activity}
              onClick={() => handleChipClick(activity)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all border ${
                selected === activity
                  ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/50 ring-1 ring-indigo-500/30'
                  : 'bg-[var(--surface)] text-[var(--text-secondary)] border-[var(--border-color)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]'
              }`}
            >
              {capitalize(activity)}
            </button>
          ))}
        </div>

        {/* Custom input */}
        <input
          type="text"
          value={customValue}
          onChange={(e) => handleCustomChange(e.target.value)}
          placeholder="Custom activity..."
          className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-colors mb-5"
        />

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <button
            onClick={handleClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={isConfirmDisabled}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              isConfirmDisabled
                ? 'bg-indigo-500/20 text-indigo-300/40 cursor-not-allowed'
                : 'bg-indigo-500 text-white hover:bg-indigo-600'
            }`}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
