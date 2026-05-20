'use client';

import { useEffect, useState, useCallback } from 'react';
import useSWR, { mutate } from 'swr';
import { Bell, Monitor, Smartphone, Mail, AppWindow, Pencil, Trash2, Check, X } from 'lucide-react';
import { useToast } from '@/components/ui/ToastProvider';
import { subscribeForPush, isIosNonStandalone } from '@/lib/push-client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type NotifType =
  | 'DERAILING'
  | 'MENTION'
  | 'REVIEW_NAG'
  | 'MEETING_REMINDER'
  | 'AIM_INVITE'
  | 'WORKBLOCK_INVITE'
  | 'GENERIC';

type Channel = 'EMAIL' | 'PUSH_DESKTOP' | 'PUSH_MOBILE' | 'IN_APP';

interface ChannelPref {
  id: string;
  notifType: NotifType;
  channel: Channel;
  enabled: boolean;
}

interface PushDevice {
  id: string;
  label: string | null;
  deviceType: string | null;
  lastSeenAt: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NOTIF_TYPE_LABELS: Record<NotifType, string> = {
  DERAILING: 'Derailing Tasks',
  MENTION: 'Mentions',
  REVIEW_NAG: 'Review Nags',
  MEETING_REMINDER: 'Meeting Reminders',
  AIM_INVITE: 'AIM Invites',
  WORKBLOCK_INVITE: 'Work Block Invites',
  GENERIC: 'Other',
};

const CHANNEL_LABELS: Record<Channel, string> = {
  EMAIL: 'Email',
  PUSH_DESKTOP: 'Push (Desktop)',
  PUSH_MOBILE: 'Push (Mobile)',
  IN_APP: 'In-App',
};

const CHANNEL_ICONS: Record<Channel, React.ReactNode> = {
  EMAIL: <Mail size={14} />,
  PUSH_DESKTOP: <Monitor size={14} />,
  PUSH_MOBILE: <Smartphone size={14} />,
  IN_APP: <AppWindow size={14} />,
};

const ALL_TYPES: NotifType[] = [
  'DERAILING',
  'MENTION',
  'REVIEW_NAG',
  'MEETING_REMINDER',
  'AIM_INVITE',
  'WORKBLOCK_INVITE',
  'GENERIC',
];

const ALL_CHANNELS: Channel[] = ['EMAIL', 'PUSH_DESKTOP', 'PUSH_MOBILE', 'IN_APP'];

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// ---------------------------------------------------------------------------
// Device list component
// ---------------------------------------------------------------------------

function DeviceRow({ device, onRemove, onRename }: {
  device: PushDevice;
  onRemove: (id: string) => void;
  onRename: (id: string, label: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(device.label ?? 'Unknown Device');

  function handleSave() {
    onRename(device.id, label);
    setEditing(false);
  }

  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-white/5 last:border-0">
      <div className="flex items-center gap-3 min-w-0">
        <div className="shrink-0 w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center">
          {device.deviceType === 'mobile' || device.deviceType === 'tablet'
            ? <Smartphone size={14} className="text-indigo-400" />
            : <Monitor size={14} className="text-indigo-400" />
          }
        </div>
        <div className="min-w-0">
          {editing ? (
            <div className="flex items-center gap-2">
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSave();
                  if (e.key === 'Escape') setEditing(false);
                }}
                className="text-sm bg-white/5 border border-white/10 rounded px-2 py-0.5 text-[var(--text-primary)] focus:outline-none focus:border-indigo-500"
                autoFocus
              />
              <button onClick={handleSave} className="text-green-400 hover:text-green-300" aria-label="Save label">
                <Check size={14} />
              </button>
              <button onClick={() => setEditing(false)} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]" aria-label="Cancel">
                <X size={14} />
              </button>
            </div>
          ) : (
            <p className="text-sm font-medium text-[var(--text-primary)] truncate">
              {device.label ?? 'Unknown Device'}
            </p>
          )}
          <p className="text-xs text-[var(--text-secondary)]">
            Last seen {new Date(device.lastSeenAt).toLocaleDateString()}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => setEditing(true)}
          aria-label="Rename device"
          className="p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
        >
          <Pencil size={14} />
        </button>
        <button
          onClick={() => onRemove(device.id)}
          aria-label="Remove device"
          className="p-1 text-red-400 hover:text-red-300 transition-colors"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toggle cell
// ---------------------------------------------------------------------------

function ToggleCell({
  enabled,
  onChange,
  label,
}: {
  enabled: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={enabled}
      aria-label={label}
      onClick={() => onChange(!enabled)}
      className={`w-8 h-4 rounded-full transition-colors relative mx-auto block ${enabled ? 'bg-indigo-600' : 'bg-white/10'}`}
    >
      <span
        className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-4' : 'translate-x-0.5'}`}
      />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function NotificationsSettingsPage() {
  const toast = useToast();

  // Fetch preferences
  const { data: prefs, isLoading: prefsLoading } = useSWR<ChannelPref[]>(
    '/api/notifications/preferences',
    fetcher,
  );

  // Fetch subscribed devices
  const { data: devices, isLoading: devicesLoading } = useSWR<PushDevice[]>(
    '/api/notifications/subscribe',
    fetcher,
  );

  // Local optimistic state for prefs
  const [localPrefs, setLocalPrefs] = useState<ChannelPref[]>([]);
  useEffect(() => {
    if (prefs) setLocalPrefs(prefs);
  }, [prefs]);

  // iOS detection
  const [showIosHint, setShowIosHint] = useState(false);
  useEffect(() => {
    setShowIosHint(isIosNonStandalone());
  }, []);

  // Helper: get enabled state from local prefs
  function getEnabled(notifType: NotifType, channel: Channel): boolean {
    return localPrefs.find(
      (p) => p.notifType === notifType && p.channel === channel,
    )?.enabled ?? true;
  }

  // Patch a preference
  const handleToggle = useCallback(async (notifType: NotifType, channel: Channel, enabled: boolean) => {
    // Optimistic update
    setLocalPrefs((prev) =>
      prev.map((p) =>
        p.notifType === notifType && p.channel === channel ? { ...p, enabled } : p,
      )
    );

    try {
      const res = await fetch('/api/notifications/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notifType, channel, enabled }),
      });
      if (!res.ok) throw new Error('Failed to update preference');
      await mutate('/api/notifications/preferences');
    } catch {
      toast.error('Failed to update preference');
      // Revert
      setLocalPrefs((prev) =>
        prev.map((p) =>
          p.notifType === notifType && p.channel === channel ? { ...p, enabled: !enabled } : p,
        )
      );
    }
  }, [toast]);

  // Remove a device
  const handleRemoveDevice = useCallback(async (id: string) => {
    try {
      await fetch(`/api/notifications/subscribe/${id}`, { method: 'DELETE' });
      await mutate('/api/notifications/subscribe');
      toast.success('Device removed');
    } catch {
      toast.error('Failed to remove device');
    }
  }, [toast]);

  // Rename a device
  const handleRenameDevice = useCallback(async (id: string, label: string) => {
    try {
      await fetch(`/api/notifications/subscribe/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label }),
      });
      await mutate('/api/notifications/subscribe');
    } catch {
      toast.error('Failed to rename device');
    }
  }, [toast]);

  // Add this device
  const [addingDevice, setAddingDevice] = useState(false);
  const handleAddDevice = useCallback(async () => {
    if (showIosHint) {
      toast.info('Install Prism to your home screen on iOS to enable push notifications');
      return;
    }
    setAddingDevice(true);
    const result = await subscribeForPush();
    setAddingDevice(false);
    if (result === 'subscribed') {
      await mutate('/api/notifications/subscribe');
      toast.success('Push notifications enabled for this device');
    } else if (result === 'denied') {
      toast.error('Notification permission denied. Enable it in browser settings.');
    } else if (result === 'unsupported') {
      toast.error('Push notifications are not supported in this browser');
    } else {
      toast.error('Could not enable push notifications. Try again.');
    }
  }, [showIosHint, toast]);

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)] flex items-center gap-2">
          <Bell size={22} className="text-indigo-400" />
          Notification Settings
        </h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          Control which notifications you receive and on which devices.
        </p>
      </div>

      {/* Devices */}
      <section className="glass-panel p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-[var(--text-primary)]">Subscribed Devices</h2>
          <button
            onClick={handleAddDevice}
            disabled={addingDevice}
            className="text-xs font-medium px-3 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 disabled:opacity-60 transition-colors"
          >
            {addingDevice ? 'Enabling…' : '+ Add this device'}
          </button>
        </div>

        {devicesLoading ? (
          <p className="text-sm text-[var(--text-secondary)]">Loading devices…</p>
        ) : !devices || devices.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">
            No push subscriptions yet.{' '}
            {showIosHint
              ? 'Install Prism to your home screen on iOS to enable push.'
              : 'Click "Add this device" to enable push notifications in this browser.'}
          </p>
        ) : (
          <div>
            {devices.map((device) => (
              <DeviceRow
                key={device.id}
                device={device}
                onRemove={handleRemoveDevice}
                onRename={handleRenameDevice}
              />
            ))}
          </div>
        )}
      </section>

      {/* Preferences matrix */}
      <section className="glass-panel p-4 sm:p-6">
        <h2 className="text-base font-semibold text-[var(--text-primary)] mb-1">Notification Channels</h2>
        <p className="text-xs text-[var(--text-secondary)] mb-4">
          Toggle which channels receive each notification type. Push channels apply to devices of that type.
        </p>

        {prefsLoading ? (
          <p className="text-sm text-[var(--text-secondary)]">Loading preferences…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="text-left text-xs font-medium text-[var(--text-secondary)] pb-2 pr-4 w-40">
                    Notification
                  </th>
                  {ALL_CHANNELS.map((ch) => (
                    <th key={ch} className="text-center pb-2 px-2 min-w-[80px]">
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-[var(--text-secondary)]">{CHANNEL_ICONS[ch]}</span>
                        <span className="text-xs font-medium text-[var(--text-secondary)] whitespace-nowrap">
                          {CHANNEL_LABELS[ch]}
                        </span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ALL_TYPES.map((type) => (
                  <tr key={type} className="border-t border-white/5">
                    <td className="py-3 pr-4 text-sm text-[var(--text-primary)] font-medium">
                      {NOTIF_TYPE_LABELS[type]}
                    </td>
                    {ALL_CHANNELS.map((ch) => (
                      <td key={ch} className="py-3 px-2 text-center">
                        <ToggleCell
                          enabled={getEnabled(type, ch)}
                          onChange={(v) => handleToggle(type, ch, v)}
                          label={`${NOTIF_TYPE_LABELS[type]} via ${CHANNEL_LABELS[ch]}`}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Quiet hours – deferred to Component 19b */}
      <section className="glass-panel p-4 sm:p-6 opacity-60">
        <h2 className="text-base font-semibold text-[var(--text-primary)] mb-1">Quiet Hours</h2>
        <p className="text-xs text-[var(--text-secondary)]">
          Do-not-disturb time window — coming in a future update (Component 19b).
        </p>
      </section>
    </div>
  );
}
