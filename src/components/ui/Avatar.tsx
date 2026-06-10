'use client';

import type { CSSProperties } from 'react';

/** Presentational avatar component.
 *
 * Renders user.image when present; falls back to initials circle otherwise.
 * Size can be specified as a named preset ('sm' | 'md' | 'lg') or an explicit
 * pixel number for one-off sizes.
 */

interface AvatarUser {
  name: string | null;
  image: string | null;
}

type AvatarSize = 'sm' | 'md' | 'lg' | number;

interface AvatarProps {
  user: AvatarUser;
  size?: AvatarSize;
  className?: string;
}

const SIZE_PX: Record<Exclude<AvatarSize, number>, number> = {
  sm: 20,
  md: 32,
  lg: 40,
};

function resolveSize(size: AvatarSize): number {
  if (typeof size === 'number') return size;
  return SIZE_PX[size];
}

/** Extract up-to-two uppercase initials from a display name.
 *
 * - Two-plus words → first + last word's first letter.
 * - One word → first letter only.
 * - Null / empty / whitespace → "?".
 */
export function getInitials(name: string | null): string {
  if (!name || !name.trim()) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Avatar({ user, size = 'md', className = '' }: AvatarProps) {
  const px = resolveSize(size);
  const initials = getInitials(user.name);
  const label = user.name ?? 'User';

  const baseStyle: CSSProperties = {
    width: px,
    height: px,
    minWidth: px,
    fontSize: Math.max(8, Math.round(px * 0.38)),
    borderRadius: '50%',
  };

  if (user.image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={user.image}
        alt={label}
        title={label}
        style={baseStyle}
        className={`object-cover flex-shrink-0${className ? ` ${className}` : ''}`}
      />
    );
  }

  return (
    <span
      title={label}
      aria-label={label}
      style={baseStyle}
      className={`inline-flex items-center justify-center flex-shrink-0 bg-white/10 border border-white/20 font-semibold uppercase text-[var(--text-secondary)] select-none${className ? ` ${className}` : ''}`}
    >
      {initials}
    </span>
  );
}
