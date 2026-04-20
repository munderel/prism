'use client';

import useSWR from 'swr';
import { useMemo } from 'react';

import { PRISM_COLORS, type ColorDef, type ItemType } from '@/lib/prism-colors';

interface Override {
  itemType: string;
  color: string;
}

interface OverridesResponse {
  overrides: Override[];
}

// Parse "#RGB" or "#RRGGBB" into an {r, g, b} triplet.
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const normalized = hex.startsWith('#') ? hex.slice(1) : hex;
  const expanded =
    normalized.length === 3
      ? normalized
          .split('')
          .map((c) => c + c)
          .join('')
      : normalized;
  if (expanded.length !== 6) return null;
  const n = parseInt(expanded, 16);
  if (Number.isNaN(n)) return null;
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

function deriveBg(hex: string, alpha = 0.15): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return `rgba(0,0,0,${alpha})`;
  return `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`;
}

/**
 * Returns the effective color map for the current viewer. Starts from the
 * PRISM_COLORS defaults and overlays any per-user overrides stored in the DB.
 *
 * Uses the viewer's overrides regardless of whose data is being displayed —
 * i.e., admins looking at a user's schedule see colors in the admin's palette,
 * not the data-owner's. Rationale: color is a personal visual preference.
 *
 * Note: overrides replace the raw hex (`color`, `border`) and the derived
 * translucent `bg`. Tailwind class strings (`textClass`, `bgClass`, etc.) are
 * NOT overridden because they're fixed palette slots; consumers that care
 * about matching the override hue should read `color`/`bg`/`border` directly.
 */
export function useTaskTypeColors(): {
  colors: Record<ItemType, ColorDef>;
  isLoading: boolean;
  mutate: () => void;
} {
  const { data, isLoading, mutate } = useSWR<OverridesResponse>(
    '/api/settings/task-type-colors',
    { revalidateOnFocus: false },
  );

  const colors = useMemo(() => {
    if (!data?.overrides?.length) return PRISM_COLORS;
    const merged = { ...PRISM_COLORS } as Record<ItemType, ColorDef>;
    for (const o of data.overrides) {
      const key = o.itemType as ItemType;
      const base = merged[key];
      if (!base) continue; // unknown itemType — skip rather than crash
      merged[key] = {
        ...base,
        color: o.color,
        border: o.color,
        bg: deriveBg(o.color),
      };
    }
    return merged;
  }, [data]);

  return { colors, isLoading, mutate: () => void mutate() };
}
