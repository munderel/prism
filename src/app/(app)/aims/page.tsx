'use client';

import { useState, useCallback } from 'react';
import useSWR from 'swr';
import {
  Flame,
  Clock,
  Repeat,
  Users,
  ToggleLeft,
  ToggleRight,
  Plus,
  X,
  Pencil,
  Check,
} from 'lucide-react';

interface AimCategory {
  id: string;
  name: string;
  description: string | null;
  defaultFrequency: number;
  defaultDurationMin: number;
  isGroupable: boolean;
  isDefault: boolean;
  isDaily: boolean;
  activities: string[] | null;
}

interface UserAim {
  id: string;
  userId: string;
  aimCategoryId: string;
  isActive: boolean;
  customDuration: number | null;
  customFrequency: number | null;
  customActivities: string[] | null;
  aimCategory: AimCategory;
}

export default function AimsPage() {
  const { data: categories, isLoading: catsLoading } = useSWR<AimCategory[]>('/api/aims/categories');
  const { data: userAims, isLoading: aimsLoading, mutate: mutateAims } = useSWR<UserAim[]>('/api/aims/user');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDuration, setEditDuration] = useState<number>(0);
  const [editFrequency, setEditFrequency] = useState<number>(0);
  const [newActivity, setNewActivity] = useState('');
  const [editActivities, setEditActivities] = useState<string[]>([]);

  const isLoading = catsLoading || aimsLoading;

  const userAimMap = new Map<string, UserAim>();
  userAims?.forEach((ua) => userAimMap.set(ua.aimCategoryId, ua));

  const isActive = (catId: string) => {
    const ua = userAimMap.get(catId);
    return ua ? ua.isActive : true;
  };

  const getDuration = (cat: AimCategory) => {
    const ua = userAimMap.get(cat.id);
    return ua?.customDuration ?? cat.defaultDurationMin;
  };

  const getFrequency = (cat: AimCategory) => {
    const ua = userAimMap.get(cat.id);
    return ua?.customFrequency ?? cat.defaultFrequency;
  };

  const getActivities = (cat: AimCategory) => {
    const ua = userAimMap.get(cat.id);
    return (ua?.customActivities ?? cat.activities ?? []) as string[];
  };

  const toggleAim = useCallback(
    async (catId: string) => {
      const currentlyActive = isActive(catId);
      await fetch('/api/aims/user', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aims: [{ aimCategoryId: catId, isActive: !currentlyActive }],
        }),
      });
      mutateAims();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [userAims, mutateAims]
  );

  const startEditing = (cat: AimCategory) => {
    setEditingId(cat.id);
    setEditDuration(getDuration(cat));
    setEditFrequency(getFrequency(cat));
    setEditActivities(getActivities(cat));
  };

  const saveEditing = async (cat: AimCategory) => {
    const payload: Record<string, any> = {
      aimCategoryId: cat.id,
      isActive: isActive(cat.id),
      customDuration: editDuration !== cat.defaultDurationMin ? editDuration : null,
      customFrequency: editFrequency !== cat.defaultFrequency ? editFrequency : null,
    };

    if (cat.activities) {
      const defaultActs = (cat.activities as string[]) || [];
      const changed =
        editActivities.length !== defaultActs.length ||
        editActivities.some((a, i) => a !== defaultActs[i]);
      if (changed) {
        payload.customActivities = editActivities;
      }
    }

    await fetch('/api/aims/user', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aims: [payload] }),
    });
    setEditingId(null);
    mutateAims();
  };

  const addActivity = () => {
    const trimmed = newActivity.trim().toLowerCase();
    if (trimmed && !editActivities.includes(trimmed)) {
      setEditActivities([...editActivities, trimmed]);
      setNewActivity('');
    }
  };

  const removeActivity = (act: string) => {
    setEditActivities(editActivities.filter((a) => a !== act));
  };

  const dailyCategories = categories?.filter((c) => c.isDaily) ?? [];
  const weeklyCategories = categories?.filter((c) => !c.isDaily) ?? [];

  const formatFrequency = (cat: AimCategory) => {
    const freq = getFrequency(cat);
    if (cat.isDaily) return 'Daily';
    return `${freq}x / week`;
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold font-display text-[var(--text-primary)]">
          Aims
        </h1>
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--accent-primary)]" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold font-display text-[var(--text-primary)] flex items-center gap-2">
          <Flame className="h-6 w-6 text-teal-500" />
          Aims
        </h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Daily and weekly rituals that fuel peak performance. Toggle on/off and customize duration and frequency.
        </p>
      </div>

      {/* Daily Aims Section */}
      {dailyCategories.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">
            Daily Aims
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {dailyCategories.map((cat) => (
              <AimCard
                key={cat.id}
                category={cat}
                active={isActive(cat.id)}
                duration={getDuration(cat)}
                frequency={formatFrequency(cat)}
                activities={getActivities(cat)}
                isEditing={editingId === cat.id}
                editDuration={editDuration}
                editFrequency={editFrequency}
                editActivities={editActivities}
                newActivity={newActivity}
                onToggle={() => toggleAim(cat.id)}
                onStartEdit={() => startEditing(cat)}
                onSaveEdit={() => saveEditing(cat)}
                onCancelEdit={() => setEditingId(null)}
                onEditDurationChange={setEditDuration}
                onEditFrequencyChange={setEditFrequency}
                onNewActivityChange={setNewActivity}
                onAddActivity={addActivity}
                onRemoveActivity={removeActivity}
              />
            ))}
          </div>
        </section>
      )}

      {/* Weekly Aims Section */}
      <section>
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">
          Weekly Aims
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {weeklyCategories.map((cat) => (
            <AimCard
              key={cat.id}
              category={cat}
              active={isActive(cat.id)}
              duration={getDuration(cat)}
              frequency={formatFrequency(cat)}
              activities={getActivities(cat)}
              isEditing={editingId === cat.id}
              editDuration={editDuration}
              editFrequency={editFrequency}
              editActivities={editActivities}
              newActivity={newActivity}
              onToggle={() => toggleAim(cat.id)}
              onStartEdit={() => startEditing(cat)}
              onSaveEdit={() => saveEditing(cat)}
              onCancelEdit={() => setEditingId(null)}
              onEditDurationChange={setEditDuration}
              onEditFrequencyChange={setEditFrequency}
              onNewActivityChange={setNewActivity}
              onAddActivity={addActivity}
              onRemoveActivity={removeActivity}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

interface AimCardProps {
  category: AimCategory;
  active: boolean;
  duration: number;
  frequency: string;
  activities: string[];
  isEditing: boolean;
  editDuration: number;
  editFrequency: number;
  editActivities: string[];
  newActivity: string;
  onToggle: () => void;
  onStartEdit: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onEditDurationChange: (v: number) => void;
  onEditFrequencyChange: (v: number) => void;
  onNewActivityChange: (v: string) => void;
  onAddActivity: () => void;
  onRemoveActivity: (act: string) => void;
}

function AimCard({
  category,
  active,
  duration,
  frequency,
  activities,
  isEditing,
  editDuration,
  editFrequency,
  editActivities,
  newActivity,
  onToggle,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onEditDurationChange,
  onEditFrequencyChange,
  onNewActivityChange,
  onAddActivity,
  onRemoveActivity,
}: AimCardProps) {
  return (
    <div
      className={`glass-panel rounded-xl p-4 transition-opacity ${
        active ? 'opacity-100' : 'opacity-50'
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-[var(--text-primary)] truncate">
            {category.name}
          </h3>
          {category.description && (
            <p className="text-xs text-[var(--text-muted)] mt-0.5 line-clamp-2">
              {category.description}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 ml-2 shrink-0">
          {!isEditing && (
            <button
              onClick={onStartEdit}
              className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)] transition-colors"
              title="Edit"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={onToggle}
            className="transition-colors"
            title={active ? 'Disable' : 'Enable'}
          >
            {active ? (
              <ToggleRight className="h-6 w-6 text-teal-500" />
            ) : (
              <ToggleLeft className="h-6 w-6 text-[var(--text-muted)]" />
            )}
          </button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="flex items-center gap-3 mt-3 text-xs text-[var(--text-secondary)]">
        <span className="flex items-center gap-1">
          <Clock className="h-3.5 w-3.5" />
          {duration} min
        </span>
        <span className="flex items-center gap-1">
          <Repeat className="h-3.5 w-3.5" />
          {frequency}
        </span>
        {category.isGroupable && (
          <span className="flex items-center gap-1 text-teal-500 bg-teal-500/10 px-1.5 py-0.5 rounded-full">
            <Users className="h-3 w-3" />
            Groupable
          </span>
        )}
      </div>

      {/* Activities (non-editing) */}
      {!isEditing && activities.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {activities.map((act) => (
            <span
              key={act}
              className="text-xs px-2 py-0.5 rounded-full bg-[var(--surface-raised)] text-[var(--text-secondary)] border border-[var(--border-color)]"
            >
              {act}
            </span>
          ))}
        </div>
      )}

      {/* Editing Mode */}
      {isEditing && (
        <div className="mt-3 space-y-3 border-t border-[var(--border-color)] pt-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-[var(--text-secondary)]">
                Duration (min)
              </label>
              <input
                type="number"
                min={5}
                step={5}
                value={editDuration}
                onChange={(e) => onEditDurationChange(parseInt(e.target.value) || 0)}
                className="mt-1 w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface)] px-2 py-1.5 text-sm text-[var(--text-primary)]"
              />
            </div>
            {!category.isDaily && (
              <div>
                <label className="text-xs font-medium text-[var(--text-secondary)]">
                  Frequency (/week)
                </label>
                <input
                  type="number"
                  min={1}
                  max={7}
                  value={editFrequency}
                  onChange={(e) => onEditFrequencyChange(parseInt(e.target.value) || 1)}
                  className="mt-1 w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface)] px-2 py-1.5 text-sm text-[var(--text-primary)]"
                />
              </div>
            )}
          </div>

          {/* Activities Editor (for categories that have activities) */}
          {category.activities && (
            <div>
              <label className="text-xs font-medium text-[var(--text-secondary)]">
                Activities
              </label>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {editActivities.map((act) => (
                  <span
                    key={act}
                    className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-[var(--surface-raised)] text-[var(--text-secondary)] border border-[var(--border-color)]"
                  >
                    {act}
                    <button
                      onClick={() => onRemoveActivity(act)}
                      className="text-[var(--text-muted)] hover:text-red-400 transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2 mt-2">
                <input
                  type="text"
                  value={newActivity}
                  onChange={(e) => onNewActivityChange(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && onAddActivity()}
                  placeholder="Add activity..."
                  className="flex-1 rounded-lg border border-[var(--border-color)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--text-primary)]"
                />
                <button
                  onClick={onAddActivity}
                  className="rounded-lg bg-teal-600 px-2 py-1 text-xs text-white hover:bg-teal-700 transition-colors"
                >
                  <Plus className="h-3 w-3" />
                </button>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              onClick={onCancelEdit}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onSaveEdit}
              className="flex items-center gap-1 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700 transition-colors"
            >
              <Check className="h-3 w-3" />
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
