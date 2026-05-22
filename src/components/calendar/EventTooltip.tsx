/**
 * Rich hover-tooltip for FullCalendar events.
 *
 * Builds a detached HTMLElement showing avatar(s) + name(s) for the event's
 * assignee (tasks/workblocks) or attendees (meetings), plus a title and an
 * optional subtitle (goal title / task title). Wired into each calendar's
 * `eventDidMount` to show on hover and hide on leave / unmount.
 *
 * Touch devices skip the tooltip — callers should gate on
 * `matchMedia('(hover: hover)').matches`.
 */

interface AvatarUserLike {
  id?: string;
  name: string | null;
  image: string | null;
}

interface TooltipEventLike {
  title?: string | null;
  extendedProps?: Record<string, unknown>;
}

function getInitials(name: string | null | undefined): string {
  if (!name || !name.trim()) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Build an avatar element (24x24 by default) matching the Avatar component visual style. */
function buildAvatarEl(user: AvatarUserLike, size = 24): HTMLElement {
  const label = user.name ?? 'User';
  if (user.image) {
    const img = document.createElement('img');
    img.src = user.image;
    img.alt = label;
    img.title = label;
    img.width = size;
    img.height = size;
    img.style.width = `${size}px`;
    img.style.height = `${size}px`;
    img.style.minWidth = `${size}px`;
    img.style.borderRadius = '50%';
    img.style.objectFit = 'cover';
    img.style.flexShrink = '0';
    return img;
  }
  const span = document.createElement('span');
  span.title = label;
  span.setAttribute('aria-label', label);
  span.textContent = getInitials(user.name);
  span.style.display = 'inline-flex';
  span.style.alignItems = 'center';
  span.style.justifyContent = 'center';
  span.style.width = `${size}px`;
  span.style.height = `${size}px`;
  span.style.minWidth = `${size}px`;
  span.style.borderRadius = '50%';
  span.style.background = 'rgba(255,255,255,0.1)';
  span.style.border = '1px solid rgba(255,255,255,0.2)';
  span.style.color = '#e2e8f0';
  span.style.fontWeight = '600';
  span.style.textTransform = 'uppercase';
  span.style.flexShrink = '0';
  span.style.userSelect = 'none';
  span.style.fontSize = `${Math.max(8, Math.round(size * 0.38))}px`;
  return span;
}

/**
 * Build the tooltip element for an event, or return null if the event has
 * nothing extra worth showing (no assignee/attendees and no useful subtitle).
 */
export function buildTooltipEl(event: TooltipEventLike): HTMLElement | null {
  const props = (event.extendedProps ?? {}) as Record<string, unknown>;
  const title = (event.title ?? '').toString();

  const assignee = (props.assignee as AvatarUserLike | null | undefined) ?? null;
  const attendeesRaw = props.attendees as AvatarUserLike[] | null | undefined;
  const attendees = Array.isArray(attendeesRaw) ? attendeesRaw : [];

  // Subtitle preference: goalTitle for tasks/workblocks, taskTitle for workblocks,
  // createdBy for meetings.
  const goalTitle = typeof props.goalTitle === 'string' ? props.goalTitle : '';
  const taskTitle = typeof props.taskTitle === 'string' ? props.taskTitle : '';
  const createdBy = typeof props.createdBy === 'string' ? props.createdBy : '';
  const subtitle = goalTitle || taskTitle || (createdBy ? `Organized by ${createdBy}` : '');

  const hasPeople = !!assignee || attendees.length > 0;
  // If nothing extra to show beyond the bare title, skip the tooltip
  if (!hasPeople && !subtitle) return null;

  const root = document.createElement('div');
  root.setAttribute('data-prism-event-tooltip', 'true');
  root.className = 'pointer-events-none fixed z-50 max-w-xs rounded-md bg-black/80 px-3 py-2 text-white shadow-lg backdrop-blur-md border border-white/10';
  // Inline fallback styles so tests / non-Tailwind environments still see something sane
  root.style.position = 'fixed';
  root.style.zIndex = '9999';
  root.style.pointerEvents = 'none';
  root.style.maxWidth = '20rem';
  root.style.fontSize = '12px';
  root.style.lineHeight = '1.35';

  // Title row
  if (title) {
    const titleEl = document.createElement('div');
    titleEl.textContent = title;
    titleEl.style.fontWeight = '600';
    titleEl.style.fontSize = '13px';
    titleEl.style.marginBottom = subtitle || hasPeople ? '4px' : '0';
    root.appendChild(titleEl);
  }

  // Subtitle row
  if (subtitle) {
    const subEl = document.createElement('div');
    subEl.textContent = subtitle;
    subEl.style.opacity = '0.75';
    subEl.style.fontSize = '11px';
    subEl.style.marginBottom = hasPeople ? '6px' : '0';
    root.appendChild(subEl);
  }

  // Assignee (single)
  if (assignee) {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.gap = '8px';
    row.appendChild(buildAvatarEl(assignee));
    const name = document.createElement('span');
    name.textContent = assignee.name ?? 'Unassigned';
    name.style.fontSize = '12px';
    row.appendChild(name);
    root.appendChild(row);
  }

  // Attendees (multi)
  if (attendees.length > 0) {
    const list = document.createElement('div');
    list.style.display = 'flex';
    list.style.flexDirection = 'column';
    list.style.gap = '4px';
    for (const a of attendees) {
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.gap = '8px';
      row.appendChild(buildAvatarEl(a, 20));
      const name = document.createElement('span');
      name.textContent = a.name ?? 'User';
      name.style.fontSize = '12px';
      row.appendChild(name);
      list.appendChild(row);
    }
    root.appendChild(list);
  }

  return root;
}

/**
 * Position a tooltip element next to a calendar event element.
 * Pins to the event's right edge with a small offset, falling back to left
 * side if it would overflow the viewport.
 */
export function positionTooltip(tooltipEl: HTMLElement, anchorEl: Element): void {
  const rect = anchorEl.getBoundingClientRect();
  const offset = 8;
  // First place to measure, then adjust
  tooltipEl.style.left = '0px';
  tooltipEl.style.top = '0px';
  const ttRect = tooltipEl.getBoundingClientRect();
  let left = rect.right + offset;
  let top = rect.top;
  if (left + ttRect.width > window.innerWidth - 4) {
    left = Math.max(4, rect.left - ttRect.width - offset);
  }
  if (top + ttRect.height > window.innerHeight - 4) {
    top = Math.max(4, window.innerHeight - ttRect.height - 4);
  }
  tooltipEl.style.left = `${left}px`;
  tooltipEl.style.top = `${top}px`;
}

/**
 * Returns true if the current device supports a true hover (mouse / trackpad).
 * Falls back to true if matchMedia is unavailable (e.g. SSR / older jsdom).
 */
export function hasHoverCapability(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
  try {
    return window.matchMedia('(hover: hover)').matches;
  } catch {
    return true;
  }
}
