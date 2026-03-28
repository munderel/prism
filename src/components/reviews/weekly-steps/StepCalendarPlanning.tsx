'use client';

import { useState, useEffect, useCallback } from 'react';
import { Calendar, Brain, ListTodo, Target, Plus, Trash2, Clock } from 'lucide-react';

type BlockType = 'deep_work' | 'normal' | 'aim';

interface WorkBlock {
  id: string;
  name: string;
  type: BlockType;
  durationMinutes: number;
  preferredTime: string;
}

const BLOCK_TYPE_META: Record<BlockType, { label: string; description: string; color: string; icon: typeof Brain }> = {
  deep_work: {
    label: 'Deep Work Block',
    description: 'For the MIT and important tasks',
    color: 'purple',
    icon: Brain,
  },
  normal: {
    label: 'Normal Work Block',
    description: 'For regular tasks',
    color: 'blue',
    icon: ListTodo,
  },
  aim: {
    label: 'AIM Block',
    description: 'For scheduled aims/habits',
    color: 'emerald',
    icon: Target,
  },
};

const PREFERRED_TIMES = [
  'Early Morning (6-8am)',
  'Morning (8-10am)',
  'Late Morning (10am-12pm)',
  'Early Afternoon (12-2pm)',
  'Afternoon (2-4pm)',
  'Late Afternoon (4-6pm)',
  'Evening (6-8pm)',
];

const DURATION_OPTIONS = [
  { label: '30 min', value: 30 },
  { label: '1 hr', value: 60 },
  { label: '1.5 hr', value: 90 },
  { label: '2 hr', value: 120 },
  { label: '2.5 hr', value: 150 },
  { label: '3 hr', value: 180 },
  { label: '4 hr', value: 240 },
];

interface StepCalendarPlanningProps {
  reviewId: string;
  initialBlocks?: WorkBlock[];
  onBlocksChange: (blocks: WorkBlock[]) => void;
}

export function StepCalendarPlanning({ reviewId, initialBlocks, onBlocksChange }: StepCalendarPlanningProps) {
  const [blocks, setBlocks] = useState<WorkBlock[]>(initialBlocks ?? []);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newBlockType, setNewBlockType] = useState<BlockType>('deep_work');
  const [newBlockName, setNewBlockName] = useState('');
  const [newBlockDuration, setNewBlockDuration] = useState(90);
  const [newBlockTime, setNewBlockTime] = useState(PREFERRED_TIMES[1]);

  useEffect(() => {
    if (initialBlocks) setBlocks(initialBlocks);
  }, [initialBlocks]);

  const totalMinutes = blocks.reduce((sum, b) => sum + b.durationMinutes, 0);
  const totalHours = totalMinutes / 60;
  const targetMinHours = 20;
  const targetMaxHours = 30;

  const notifyParent = useCallback((updated: WorkBlock[]) => {
    onBlocksChange(updated);
  }, [onBlocksChange]);

  const addBlock = () => {
    if (!newBlockName.trim()) return;
    const block: WorkBlock = {
      id: crypto.randomUUID(),
      name: newBlockName.trim(),
      type: newBlockType,
      durationMinutes: newBlockDuration,
      preferredTime: newBlockTime,
    };
    const updated = [...blocks, block];
    setBlocks(updated);
    notifyParent(updated);
    setNewBlockName('');
    setShowAddForm(false);
  };

  const removeBlock = (id: string) => {
    const updated = blocks.filter((b) => b.id !== id);
    setBlocks(updated);
    notifyParent(updated);
  };

  const getBlockColor = (type: BlockType) => {
    switch (type) {
      case 'deep_work': return { border: 'border-purple-500/30', bg: 'bg-purple-500/10', text: 'text-purple-400' };
      case 'normal': return { border: 'border-blue-500/30', bg: 'bg-blue-500/10', text: 'text-blue-400' };
      case 'aim': return { border: 'border-emerald-500/30', bg: 'bg-emerald-500/10', text: 'text-emerald-400' };
    }
  };

  return (
    <div className="space-y-6">
      {/* Target banner */}
      <div className="rounded-lg border border-indigo-500/20 bg-indigo-500/5 px-4 py-3 text-center">
        <p className="text-sm font-medium text-indigo-400">
          Goal: Schedule {targetMinHours}-{targetMaxHours} hours of focused work this week
        </p>
      </div>

      {/* Running total */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-[var(--text-secondary)]">Hours scheduled</span>
          <span className={`font-bold ${
            totalHours >= targetMinHours && totalHours <= targetMaxHours
              ? 'text-green-400'
              : totalHours > targetMaxHours
              ? 'text-amber-400'
              : 'text-[var(--text-muted)]'
          }`}>
            {totalHours.toFixed(1)} / {targetMinHours}-{targetMaxHours} hours
          </span>
        </div>
        <div className="w-full h-3 bg-[var(--surface-raised)] rounded-full overflow-hidden relative">
          {/* Target zone indicator */}
          <div
            className="absolute h-full bg-green-500/10 border-l border-r border-green-500/30"
            style={{
              left: `${(targetMinHours / targetMaxHours) * 100}%`,
              right: '0%',
            }}
          />
          <div
            className={`h-full rounded-full transition-all ${
              totalHours >= targetMinHours && totalHours <= targetMaxHours
                ? 'bg-green-500'
                : totalHours > targetMaxHours
                ? 'bg-amber-500'
                : 'bg-indigo-500'
            }`}
            style={{ width: `${Math.min(100, (totalHours / targetMaxHours) * 100)}%` }}
          />
        </div>
      </div>

      {/* Block type cards */}
      <div className="grid grid-cols-3 gap-2">
        {(Object.entries(BLOCK_TYPE_META) as [BlockType, typeof BLOCK_TYPE_META['deep_work']][]).map(([type, meta]) => {
          const Icon = meta.icon;
          const count = blocks.filter((b) => b.type === type).length;
          const colors = getBlockColor(type);
          return (
            <div
              key={type}
              className={`rounded-lg border ${colors.border} ${colors.bg} px-3 py-2 text-center`}
            >
              <Icon className={`h-4 w-4 ${colors.text} mx-auto mb-1`} />
              <p className={`text-xs font-medium ${colors.text}`}>{meta.label}</p>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">{count} blocks</p>
            </div>
          );
        })}
      </div>

      {/* Existing blocks list */}
      {blocks.length > 0 && (
        <div className="space-y-2">
          {blocks.map((block) => {
            const colors = getBlockColor(block.type);
            const meta = BLOCK_TYPE_META[block.type];
            const Icon = meta.icon;
            return (
              <div
                key={block.id}
                className={`flex items-center gap-3 rounded-lg border ${colors.border} ${colors.bg} px-4 py-3`}
              >
                <Icon className={`h-4 w-4 ${colors.text} flex-shrink-0`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[var(--text-primary)] truncate">{block.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-[var(--text-muted)]">
                      <Clock className="h-3 w-3 inline mr-0.5" />
                      {block.durationMinutes >= 60
                        ? `${(block.durationMinutes / 60).toFixed(block.durationMinutes % 60 ? 1 : 0)} hr`
                        : `${block.durationMinutes} min`}
                    </span>
                    <span className="text-xs text-[var(--text-muted)]">{block.preferredTime}</span>
                  </div>
                </div>
                <button
                  onClick={() => removeBlock(block.id)}
                  className="text-[var(--text-muted)] hover:text-red-400 transition-colors p-1"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Add block form */}
      {showAddForm ? (
        <div className="rounded-lg border border-[var(--border-color)] bg-[var(--surface)] p-4 space-y-4">
          <h4 className="text-sm font-medium text-[var(--text-primary)]">Add Work Block</h4>

          {/* Block type selector */}
          <div className="flex gap-2">
            {(Object.entries(BLOCK_TYPE_META) as [BlockType, typeof BLOCK_TYPE_META['deep_work']][]).map(([type, meta]) => {
              const colors = getBlockColor(type);
              return (
                <button
                  key={type}
                  onClick={() => setNewBlockType(type)}
                  className={`flex-1 text-xs px-2 py-2 rounded-lg border transition-all ${
                    newBlockType === type
                      ? `${colors.border} ${colors.bg} ${colors.text} font-medium`
                      : 'border-[var(--border-color)] text-[var(--text-muted)] hover:border-[var(--text-muted)]'
                  }`}
                >
                  {meta.label}
                </button>
              );
            })}
          </div>

          {/* Block name */}
          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1">Block Name</label>
            <input
              type="text"
              value={newBlockName}
              onChange={(e) => setNewBlockName(e.target.value)}
              placeholder={`e.g., ${newBlockType === 'deep_work' ? 'MIT Deep Focus' : newBlockType === 'aim' ? 'Morning Routine' : 'Admin Tasks'}`}
              className="w-full rounded border border-[var(--border-color)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-indigo-500 focus:outline-none"
            />
          </div>

          {/* Duration */}
          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1">Duration</label>
            <div className="flex flex-wrap gap-1.5">
              {DURATION_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setNewBlockDuration(opt.value)}
                  className={`text-xs px-2.5 py-1.5 rounded-lg border transition-all ${
                    newBlockDuration === opt.value
                      ? 'border-indigo-500/50 bg-indigo-500/10 text-indigo-400 font-medium'
                      : 'border-[var(--border-color)] text-[var(--text-muted)] hover:border-indigo-500/30'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Preferred time */}
          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1">Preferred Time</label>
            <select
              value={newBlockTime}
              onChange={(e) => setNewBlockTime(e.target.value)}
              className="w-full rounded border border-[var(--border-color)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-indigo-500 focus:outline-none"
            >
              {PREFERRED_TIMES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={addBlock}
              disabled={!newBlockName.trim()}
              className="text-sm bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-500 transition-colors disabled:opacity-50"
            >
              Add Block
            </button>
            <button
              onClick={() => setShowAddForm(false)}
              className="text-sm text-[var(--text-muted)] hover:text-[var(--text-secondary)] px-3 py-2 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowAddForm(true)}
          className="flex items-center justify-center gap-2 w-full rounded-lg border border-dashed border-[var(--border-color)] px-4 py-3 text-sm text-[var(--text-muted)] hover:border-indigo-500/30 hover:text-indigo-400 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Work Block
        </button>
      )}
    </div>
  );
}
