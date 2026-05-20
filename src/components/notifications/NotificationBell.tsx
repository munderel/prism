'use client';

import { useRef, useState } from 'react';
import useSWR, { mutate as globalMutate } from 'swr';
import { Bell, Check, X } from 'lucide-react';
import { useClickOutside } from '@/hooks/useClickOutside';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NotificationPayload {
  title: string;
  body: string;
  url?: string | null;
}

interface NotificationRow {
  id: string;
  type: string;
  payload: NotificationPayload;
  readAt: string | null;
  createdAt: string;
}

interface NotificationsResponse {
  notifications: NotificationRow[];
  unreadCount: number;
}

const INVITE_TYPES = new Set(['AIM_INVITE', 'WORKBLOCK_INVITE']);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractInvitationId(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = url.match(/invitation=([^&]+)/);
  return match?.[1] ?? null;
}

function respondEndpoint(type: string, invitationId: string): string {
  if (type === 'AIM_INVITE') return `/api/invitations/aim/${invitationId}/respond`;
  return `/api/invitations/workblock/${invitationId}/respond`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false), open);

  // Fetch unread count — polling every 30 s
  const { data, mutate } = useSWR<NotificationsResponse>(
    '/api/notifications?unread=false&limit=10',
    { refreshInterval: 30_000 },
  );

  const unreadCount = data?.unreadCount ?? 0;
  const notifications = data?.notifications ?? [];

  const markRead = async (ids: string[]) => {
    if (ids.length === 0) return;
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });
    await mutate();
    globalMutate('/api/notifications?unread=false&limit=10');
  };

  const handleMarkAllRead = async () => {
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ all: true }),
    });
    await mutate();
  };

  const handleRespond = async (notification: NotificationRow, status: 'ACCEPTED' | 'DECLINED') => {
    const invId = extractInvitationId(notification.payload.url);
    if (!invId) return;

    await fetch(respondEndpoint(notification.type, invId), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });

    // Mark the notification read
    await markRead([notification.id]);
  };

  const handleBellClick = () => {
    setOpen((prev) => !prev);
    // When opening the dropdown, mark all unread as read after a short delay
    // (give the user a moment to see the badge before it clears)
  };

  return (
    <div className="relative" ref={ref}>
      {/* Bell button */}
      <button
        onClick={handleBellClick}
        className="relative flex items-center justify-center rounded-lg p-1.5 text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)] transition-colors"
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-indigo-600 px-0.5 text-[10px] font-bold leading-none text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-10 w-80 max-w-[calc(100vw-1rem)] rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)] shadow-2xl z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--border-color)]">
            <span className="text-sm font-semibold text-[var(--text-primary)]">Notifications</span>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-96 overflow-y-auto divide-y divide-[var(--border-color)]">
            {notifications.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-[var(--text-muted)]">
                No notifications yet.
              </p>
            ) : (
              notifications.map((n) => {
                const isUnread = !n.readAt;
                const isInvite = INVITE_TYPES.has(n.type);

                return (
                  <div
                    key={n.id}
                    className={`px-4 py-3 transition-colors ${isUnread ? 'bg-indigo-600/5' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium truncate ${isUnread ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>
                          {n.payload.title}
                        </p>
                        <p className="text-xs text-[var(--text-muted)] mt-0.5 line-clamp-2">
                          {n.payload.body}
                        </p>
                        <p className="text-[10px] text-[var(--text-muted)] mt-1">
                          {new Date(n.createdAt).toLocaleString()}
                        </p>
                      </div>
                      {/* Unread dot */}
                      {isUnread && !isInvite && (
                        <button
                          onClick={() => markRead([n.id])}
                          className="mt-1 shrink-0 h-2 w-2 rounded-full bg-indigo-500 hover:bg-indigo-300 transition-colors"
                          title="Mark read"
                        />
                      )}
                    </div>

                    {/* Accept / Decline buttons for invite types */}
                    {isInvite && (
                      <div className="mt-2 flex items-center gap-2">
                        <button
                          onClick={() => handleRespond(n, 'ACCEPTED')}
                          className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-500 transition-colors"
                        >
                          <Check className="h-3 w-3" />
                          Accept
                        </button>
                        <button
                          onClick={() => handleRespond(n, 'DECLINED')}
                          className="inline-flex items-center gap-1 rounded-md border border-[var(--border-color)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] transition-colors"
                        >
                          <X className="h-3 w-3" />
                          Decline
                        </button>
                        {n.payload.url && (
                          <a
                            href={n.payload.url}
                            className="ml-auto text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                            onClick={() => setOpen(false)}
                          >
                            View
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
