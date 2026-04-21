'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Palette, RotateCcw } from 'lucide-react';
import { PRISM_COLORS, type ColorDef, type ItemType } from '@/lib/prism-colors';

interface OverrideRow {
  id: string;
  itemType: string;
  color: string;
}

interface OverridesResponse {
  overrides: OverrideRow[];
}

const COLOR_KEYS: ItemType[] = [
  'IMPROVE',
  'REACT',
  'MAINTENANCE',
  'REVIEW',
  'AIM',
  'MEETING',
  'FOOD',
  'POWER_DOWN',
  'GOOGLE_CAL',
];

export function TaskTypeColorsSection() {
  const { data, mutate } = useSWR<OverridesResponse>('/api/settings/task-type-colors', {
    revalidateOnFocus: false,
  });
  const [saving, setSaving] = useState<string | null>(null);

  const overridesByType = new Map<string, string>();
  for (const o of data?.overrides ?? []) overridesByType.set(o.itemType, o.color);

  const setColor = async (itemType: ItemType, color: string) => {
    setSaving(itemType);
    try {
      const res = await fetch('/api/settings/task-type-colors', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemType, color }),
      });
      if (!res.ok) throw new Error('Save failed');
      await mutate();
    } finally {
      setSaving(null);
    }
  };

  const resetColor = async (itemType: ItemType) => {
    setSaving(itemType);
    try {
      const res = await fetch(
        `/api/settings/task-type-colors?itemType=${encodeURIComponent(itemType)}`,
        { method: 'DELETE' },
      );
      if (!res.ok) throw new Error('Reset failed');
      await mutate();
    } finally {
      setSaving(null);
    }
  };

  return (
    <section className="glass-panel p-4 sm:p-6">
      <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-1 flex items-center gap-2">
        <Palette className="h-4 w-4 text-indigo-400" />
        Task Type Colors
      </h2>
      <p className="text-xs text-[var(--text-muted)] mb-4">
        Per-user overrides for calendar events. Your colors apply to every calendar you see
        (including other users&apos; schedules).
      </p>
      <div className="space-y-2">
        {COLOR_KEYS.map((key) => {
          const def: ColorDef = PRISM_COLORS[key];
          const override = overridesByType.get(key);
          const effective = override ?? def.color;
          const isOverridden = !!override;
          return (
            <div
              key={key}
              className="flex items-center gap-3 rounded-lg border border-[var(--border-color)] bg-[var(--hover-bg)] px-3 py-2"
            >
              <span className="text-lg" aria-hidden>
                {def.emoji}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[var(--text-primary)]">{def.label}</p>
                {def.description && (
                  <p className="text-xs text-[var(--text-muted)] truncate">{def.description}</p>
                )}
              </div>
              <div
                className="h-6 w-6 flex-shrink-0 rounded"
                style={{ backgroundColor: effective }}
                aria-hidden
              />
              <input
                type="color"
                value={effective}
                onChange={(e) => setColor(key, e.target.value)}
                disabled={saving === key}
                className="h-8 w-12 flex-shrink-0 cursor-pointer rounded border border-[var(--border-color)] bg-transparent"
                title={`Pick color for ${def.label}`}
              />
              {isOverridden && (
                <button
                  onClick={() => resetColor(key)}
                  disabled={saving === key}
                  className="flex-shrink-0 rounded p-1.5 text-[var(--text-muted)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)] disabled:opacity-50"
                  title="Reset to default"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
