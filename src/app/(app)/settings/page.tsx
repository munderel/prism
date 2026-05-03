'use client';

import { useState, useEffect } from 'react';
import { useSession, signIn } from 'next-auth/react';
import { useTheme } from 'next-themes';
import { Settings, Shield, Bell, Globe, Compass, RotateCcw, UserPlus, Mail, Sun, Moon as MoonIcon, Monitor, Eye, Clock, Calendar, Sunset, RefreshCw, Link2, Check, Flame, User, Lock, LockOpen, KeyRound } from 'lucide-react';
import { useSWRConfig } from 'swr';
import { useToast } from '@/components/ui/ToastProvider';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { TaskTypeColorsSection } from '@/components/settings/TaskTypeColorsSection';

interface TeamUser {
  id: string;
  name: string | null;
  email: string;
  isAdmin: boolean;
  is2FAEnabled?: boolean;
  isLockedOut?: boolean;
  lockoutUntil?: string | null;
}

// Subset of `adminUserActionSchema` actions surfaced in the admin UI.
// Reset-password is intentionally omitted (no UI for it yet).
type AdminUserAction = 'lockout' | 'unlock' | 'reset-2fa';

const OPTIMISTIC_USER_PATCH: Record<AdminUserAction, Partial<TeamUser>> = {
  lockout: { isLockedOut: true },
  unlock: { isLockedOut: false, lockoutUntil: null },
  'reset-2fa': { is2FAEnabled: false },
};

interface Invitation {
  id: string;
  email: string;
  role: string;
  status: string;
  token: string;
  createdAt: string;
  revokedAt?: string | null;
  acceptedAt?: string | null;
  isExpired?: boolean;
}

function DurationInput({ value, onChange, inputClasses }: { value: number; onChange: (v: number) => void; inputClasses: string }) {
  return (
    <div>
      <label className="block text-xs text-[var(--text-secondary)] mb-1">Duration (minutes)</label>
      <input
        type="number"
        min={15}
        max={480}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={`${inputClasses} w-32`}
      />
    </div>
  );
}

function SaveButton({ onClick, label = 'Save', className: extraClass, saving }: { onClick: () => void; label?: string; className?: string; saving: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={saving}
      className={`rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors ${extraClass ?? ''}`}
    >
      {saving ? 'Saving...' : label}
    </button>
  );
}

function TestEmailButton({ toast }: { toast: ReturnType<typeof useToast> }) {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ sent: boolean; configured: boolean; error?: string } | null>(null);

  const sendTest = async () => {
    setTesting(true);
    setResult(null);
    try {
      const res = await fetch('/api/notifications/test', { method: 'POST' });
      const data = await res.json();
      setResult(data);
      if (data.sent) toast.success('Test email sent! Check your inbox.');
      else if (!data.configured) toast.error('Email not configured. Set RESEND_API_KEY in Vercel.');
      else toast.error(data.error || 'Email send failed.');
    } catch {
      toast.error('Failed to send test email.');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={sendTest}
        disabled={testing}
        className="rounded-lg border border-[var(--border-color)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] transition-colors disabled:opacity-50"
      >
        <Mail className="h-4 w-4 inline mr-1.5" />
        {testing ? 'Sending...' : 'Send test email'}
      </button>
      {result && (
        <span className={`text-xs ${result.sent ? 'text-emerald-400' : 'text-red-400'}`}>
          {result.sent ? 'Delivered' : result.error || 'Failed'}
        </span>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.isAdmin ?? false;
  const { theme, setTheme } = useTheme();
  const toast = useToast();
  const { mutate: globalMutate } = useSWRConfig();
  const { isSubscribed: isPushSubscribed, isSupported: isPushSupported, subscribe: subscribePush, unsubscribe: unsubscribePush } = usePushNotifications();
  const [mounted, setMounted] = useState(false);

  const [displayName, setDisplayName] = useState(session?.user?.name ?? '');
  const [mtp, setMtp] = useState('');
  const [companyMtp, setCompanyMtp] = useState('');
  const [timezone, setTimezone] = useState('America/New_York');
  const [notifPrefs, setNotifPrefs] = useState({
    emailEnabled: true,
    pushEnabled: true,
    derailingAlerts: true,
    mentionAlerts: true,
    reviewNags: true,
  });
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [hiddenFeatures, setHiddenFeatures] = useState<string[]>([]);
  const [workingHoursStart, setWorkingHoursStart] = useState('09:00');
  const [workingHoursEnd, setWorkingHoursEnd] = useState('17:00');
  const [casualHoursStart, setCasualHoursStart] = useState('17:00');
  const [casualHoursEnd, setCasualHoursEnd] = useState('22:00');
  const [taskSchedulePeriod, setTaskSchedulePeriod] = useState('both');
  const [saving, setSaving] = useState(false);
  const [seedingAims, setSeedingAims] = useState(false);
  const [seedAimResult, setSeedAimResult] = useState('');
  const [enforce2FA, setEnforce2FA] = useState(false);
  const [enforce2FALoaded, setEnforce2FALoaded] = useState(false);
  const [pendingUserAction, setPendingUserAction] = useState<{
    action: AdminUserAction;
    userId: string;
    userName: string;
  } | null>(null);

  // Connected Calendars
  const [availableCalendars, setAvailableCalendars] = useState<{ id: string; summary: string; primary: boolean; backgroundColor: string }[]>([]);
  const [selectedCalendarIds, setSelectedCalendarIds] = useState<string[]>([]);
  const [syncTargetCalendarId, setSyncTargetCalendarId] = useState<string>('');
  const [calendarColorOverrides, setCalendarColorOverrides] = useState<Record<string, string>>({});
  const [weeklyTargetCalendarIds, setWeeklyTargetCalendarIds] = useState<string[]>([]);
  const [loadingCalendars, setLoadingCalendars] = useState(false);
  const [googleCalConnected, setGoogleCalConnected] = useState(true);
  const [calendarError, setCalendarError] = useState<string | null>(null);

  // Powerdown Time
  const [powerdownTime, setPowerdownTime] = useState('17:30');
  const [defaultWorkBlockMinutes, setDefaultWorkBlockMinutes] = useState(30);

  // Streak preferences — daily streak now fires solely on powerdown completion;
  // the per-category opt-in flags were removed.
  const [streakGraceDays, setStreakGraceDays] = useState(false);

  // Beeminder
  const [beeminderAuthToken, setBeeminderAuthToken] = useState('');
  const [beeminderGoalSlug, setBeeminderGoalSlug] = useState('');

  // Weekly Review Schedule
  const [weeklyReviewDayOfWeek, setWeeklyReviewDayOfWeek] = useState<number>(0);
  const [weeklyReviewTime, setWeeklyReviewTime] = useState('10:00');
  const [weeklyReviewDuration, setWeeklyReviewDuration] = useState(60);

  // Monthly Review Schedule
  const [monthlyReviewRecurrenceRule, setMonthlyReviewRecurrenceRule] = useState<string | null>(null);
  const [monthlyReviewTime, setMonthlyReviewTime] = useState('10:00');
  const [monthlyReviewDuration, setMonthlyReviewDuration] = useState(60);

  // Yearly Review Schedule
  const [yearlyReviewRecurrenceRule, setYearlyReviewRecurrenceRule] = useState<string | null>(null);
  const [yearlyReviewTime, setYearlyReviewTime] = useState('10:00');
  const [yearlyReviewDuration, setYearlyReviewDuration] = useState(60);

  // Dev user creation
  const [createName, setCreateName] = useState('');
  const [createEmail, setCreateEmail] = useState('');
  const [createRole, setCreateRole] = useState('user');
  const [creating, setCreating] = useState(false);

  // Invitations
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('user');
  const [inviting, setInviting] = useState(false);

  // Confirm dialog state
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingRemoveUserId, setPendingRemoveUserId] = useState<string | null>(null);

  const isDevMode = process.env.NEXT_PUBLIC_DEV_LOGIN === 'true';

  useEffect(() => {
    setMounted(true);
    fetchSettings();
    fetchCalendars();
    if (isAdmin) {
      fetchUsers();
      fetchCompanySettings();
      fetchInvitations();
      fetchAuthSettings();
    }
  }, [isAdmin]);

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/settings?scope=user');
      if (!res.ok) {
        throw new Error('Failed to load settings');
      }

      const data = await res.json();
      setDisplayName(data.name ?? '');
      setMtp(data.mtp ?? '');
      setTimezone(data.timezone ?? 'America/New_York');
      if (Array.isArray(data.hiddenFeatures)) {
        setHiddenFeatures(data.hiddenFeatures);
      }
      if (data.notificationPreference) {
        setNotifPrefs(data.notificationPreference);
      }
      if (data.workingHoursStart) setWorkingHoursStart(data.workingHoursStart);
      if (data.workingHoursEnd) setWorkingHoursEnd(data.workingHoursEnd);
      if (data.casualHoursStart) setCasualHoursStart(data.casualHoursStart);
      if (data.casualHoursEnd) setCasualHoursEnd(data.casualHoursEnd);
      if (data.taskSchedulePeriod) setTaskSchedulePeriod(data.taskSchedulePeriod);
      if (Array.isArray(data.selectedCalendarIds)) setSelectedCalendarIds(data.selectedCalendarIds);
      if (Array.isArray(data.weeklyTargetCalendarIds)) setWeeklyTargetCalendarIds(data.weeklyTargetCalendarIds);
      setSyncTargetCalendarId(data.syncTargetCalendarId ?? '');
      if (data.calendarColorOverrides && typeof data.calendarColorOverrides === 'object') {
        setCalendarColorOverrides(data.calendarColorOverrides);
      } else {
        setCalendarColorOverrides({});
      }
      if (data.powerdownTime) setPowerdownTime(data.powerdownTime);
      if (typeof data.defaultWorkBlockMinutes === 'number') setDefaultWorkBlockMinutes(data.defaultWorkBlockMinutes);
      if (data.streakGraceDays !== undefined) setStreakGraceDays(data.streakGraceDays);
      if (data.beeminderAuthToken) setBeeminderAuthToken(data.beeminderAuthToken);
      if (data.beeminderGoalSlug) setBeeminderGoalSlug(data.beeminderGoalSlug);
      if (data.weeklyReviewDayOfWeek != null) setWeeklyReviewDayOfWeek(data.weeklyReviewDayOfWeek);
      if (data.weeklyReviewTime) setWeeklyReviewTime(data.weeklyReviewTime);
      if (data.weeklyReviewDuration) setWeeklyReviewDuration(data.weeklyReviewDuration);
      setMonthlyReviewRecurrenceRule(data.monthlyReviewRecurrenceRule ?? null);
      if (data.monthlyReviewTime) setMonthlyReviewTime(data.monthlyReviewTime);
      if (data.monthlyReviewDuration) setMonthlyReviewDuration(data.monthlyReviewDuration);
      setYearlyReviewRecurrenceRule(data.yearlyReviewRecurrenceRule ?? null);
      if (data.yearlyReviewTime) setYearlyReviewTime(data.yearlyReviewTime);
      if (data.yearlyReviewDuration) setYearlyReviewDuration(data.yearlyReviewDuration);
    } catch {
      toast.error('Failed to load settings');
    }
  };

  const fetchCalendars = async () => {
    setLoadingCalendars(true);
    setCalendarError(null);
    try {
      const res = await fetch('/api/calendar/list');
      if (res.ok) {
        const data = await res.json();
        setAvailableCalendars(data.calendars ?? []);
        setGoogleCalConnected(data.connected !== false);
        setCalendarError(data.error ?? null);
      } else {
        setGoogleCalConnected(false);
        setCalendarError('Failed to load Google Calendars.');
      }
    } catch {
      setGoogleCalConnected(false);
      setCalendarError('Failed to load Google Calendars.');
    } finally {
      setLoadingCalendars(false);
    }
  };

  const fetchCompanySettings = async () => {
    const res = await fetch('/api/settings?scope=company');
    if (res.ok) {
      const data = await res.json();
      setCompanyMtp(data.companyMtp ?? '');
    }
  };

  const fetchUsers = async () => {
    const res = await fetch('/api/admin');
    if (res.ok) setUsers(await res.json());
  };

  const saveUserSettings = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: displayName, mtp, timezone, hiddenFeatures, notificationPrefs: notifPrefs, workingHoursStart, workingHoursEnd, casualHoursStart, casualHoursEnd, taskSchedulePeriod, selectedCalendarIds, syncTargetCalendarId: syncTargetCalendarId || null, calendarColorOverrides, weeklyTargetCalendarIds, powerdownTime, defaultWorkBlockMinutes, weeklyReviewDayOfWeek, weeklyReviewTime, weeklyReviewDuration, monthlyReviewRecurrenceRule, monthlyReviewTime, monthlyReviewDuration, yearlyReviewRecurrenceRule, yearlyReviewTime, yearlyReviewDuration, streakGraceDays, beeminderAuthToken: beeminderAuthToken || null, beeminderGoalSlug: beeminderGoalSlug || null }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to save settings');
      }

      const now = new Date();
      const syncStart = new Date(now.getTime() - 30 * 86400000).toISOString();
      const syncEnd = new Date(now.getTime() + 395 * 86400000).toISOString();
      const syncRes = await fetch('/api/calendar/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start: syncStart, end: syncEnd }),
      });

      await Promise.all([
        fetchSettings(),
        fetchCalendars(),
        globalMutate('/api/settings?scope=user'),
        globalMutate(
          (key: unknown) => typeof key === 'string' && key.startsWith('/api/calendar'),
          undefined,
          { revalidate: true },
        ),
      ]);

      if (!syncRes.ok) {
        const syncData = await syncRes.json().catch(() => ({}));
        throw new Error(syncData.error || 'Settings saved, but calendar sync failed');
      }

      toast.success('Settings saved!');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const saveCompanyMtp = async () => {
    setSaving(true);
    await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope: 'company', companyMtp }),
    });
    toast.success('Company MTP saved!');
    setSaving(false);
  };

  const toggleAdmin = async (userId: string, newValue: boolean) => {
    // Optimistic update
    setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, isAdmin: newValue } : u));

    const res = await fetch('/api/admin', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, isAdmin: newValue }),
    });
    if (!res.ok) {
      fetchUsers(); // rollback
      toast.error('Failed to update admin status');
    }
  };

  const removeUser = async (userId: string) => {
    setPendingRemoveUserId(userId);
    setConfirmOpen(true);
  };

  const confirmRemoveUser = async () => {
    if (!pendingRemoveUserId) return;
    setConfirmOpen(false);
    const removedId = pendingRemoveUserId;
    setPendingRemoveUserId(null);

    // Optimistic: immediately remove from local state
    setUsers((prev) => prev.filter((u) => u.id !== removedId));

    const res = await fetch('/api/admin', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: removedId }),
    });
    if (!res.ok) {
      fetchUsers(); // rollback
      const data = await res.json().catch(() => ({}));
      toast.error(data.error || 'Failed to remove user');
    }
  };

  const fetchAuthSettings = async () => {
    const res = await fetch('/api/settings/auth');
    if (res.ok) {
      const data = await res.json();
      setEnforce2FA(Boolean(data?.enforce2FA));
      setEnforce2FALoaded(true);
    }
  };

  const toggleEnforce2FA = async (next: boolean) => {
    setEnforce2FA(next); // optimistic
    const res = await fetch('/api/settings/auth', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enforce2FA: next }),
    });
    if (!res.ok) {
      setEnforce2FA(!next);
      toast.error('Failed to update 2FA enforcement');
    } else {
      toast.success(next ? '2FA enforcement enabled.' : '2FA enforcement disabled.');
    }
  };

  const performUserAction = async (userId: string, action: AdminUserAction) => {
    const patch = OPTIMISTIC_USER_PATCH[action];
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, ...patch } : u)));
    const res = await fetch(`/api/users/${userId}/admin`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    if (!res.ok) {
      fetchUsers(); // rollback
      const data = await res.json().catch(() => ({}));
      toast.error(data.error || `Failed to ${action} user`);
    }
  };

  const retriggerOnboarding = async () => {
    await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hasCompletedOnboarding: false }),
    });
    window.location.href = '/';
  };

  const fetchInvitations = async () => {
    const res = await fetch('/api/invitations');
    if (res.ok) setInvitations(await res.json());
  };

  const createUser = async () => {
    if (!createEmail.trim()) return;
    setCreating(true);
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: createEmail, name: createName, role: createRole }),
    });
    if (res.ok) {
      toast.success('User created! They can now log in via dev login.');
      setCreateEmail('');
      setCreateName('');
      setCreateRole('user');
      fetchUsers();
    } else {
      const data = await res.json();
      toast.error(data.error || 'Failed to create user');
    }
    setCreating(false);
  };

  const sendInvitation = async () => {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    const res = await fetch('/api/invitations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
    });
    if (res.ok) {
      const invitation = await res.json();
      const inviteUrl = `${window.location.origin}${invitation.inviteUrl}`;
      try {
        await navigator.clipboard.writeText(inviteUrl);
        if (invitation.emailSent) {
          toast.success('Invite email sent and link copied!');
        } else if (invitation.emailConfigured) {
          toast.error(
            invitation.emailError
              ? `Invite email failed: ${invitation.emailError}. Link copied so you can share it manually.`
              : 'Invite email failed. Link copied so you can share it manually.'
          );
        } else {
          toast.success('Invite link copied! Share it manually - email is not configured.');
        }
      } catch {
        if (invitation.emailSent) {
          toast.success('Invite email sent!');
        } else if (invitation.emailConfigured) {
          toast.error(
            invitation.emailError
              ? `Invitation created, but email failed: ${invitation.emailError}`
              : 'Invitation created, but email failed.'
          );
        } else {
          toast.success('Invitation created. Email is not configured.');
        }
      }
      setInviteEmail('');
      setInviteRole('user');
      fetchInvitations();
    } else {
      const data = await res.json();
      toast.error(data.error || 'Failed to send invitation');
    }
    setInviting(false);
  };

  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyInviteLink = async (invitationId: string, token: string) => {
    const inviteUrl = `${window.location.origin}/accept-invite/${invitationId}?token=${token}`;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopiedId(invitationId);
      toast.success('Invite link copied!');
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast.error('Failed to copy link');
    }
  };

  const resendInvitation = async (invitationId: string, email: string, role: string) => {
    // Revoke the old one first, then create a new one
    const revokeRes = await fetch(`/api/invitations/${invitationId}`, {
      method: 'PATCH',
    });
    if (!revokeRes.ok) {
      toast.error('Failed to revoke old invitation');
      return;
    }

    const createRes = await fetch('/api/invitations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, role }),
    });
    if (createRes.ok) {
      const newInvitation = await createRes.json();
      const inviteUrl = `${window.location.origin}${newInvitation.inviteUrl}`;
      try {
        await navigator.clipboard.writeText(inviteUrl);
        if (newInvitation.emailSent) {
          toast.success('Invite email resent and new link copied!');
        } else if (newInvitation.emailConfigured) {
          toast.error(
            newInvitation.emailError
              ? `Invite email failed: ${newInvitation.emailError}. New link copied so you can share it manually.`
              : 'Invite email failed. New link copied so you can share it manually.'
          );
        } else {
          toast.success('New invite link copied! Email is not configured.');
        }
      } catch {
        if (newInvitation.emailSent) {
          toast.success('Invitation resent!');
        } else if (newInvitation.emailConfigured) {
          toast.error(
            newInvitation.emailError
              ? `Invitation recreated, but email failed: ${newInvitation.emailError}`
              : 'Invitation recreated, but email failed.'
          );
        } else {
          toast.success('Invitation recreated. Email is not configured.');
        }
      }
      fetchInvitations();
    } else {
      const data = await createRes.json();
      toast.error(data.error || 'Failed to resend invitation');
    }
  };

  const revokeInvitation = async (id: string) => {
    // Optimistic: immediately mark as REVOKED in local state
    setInvitations((prev) =>
      prev.map((inv) => inv.id === id ? { ...inv, status: 'REVOKED', revokedAt: new Date().toISOString() } : inv)
    );
    toast.success('Invitation revoked');

    const res = await fetch(`/api/invitations/${id}`, { method: 'PATCH' });
    if (!res.ok) {
      // Rollback on failure
      fetchInvitations();
      toast.error('Failed to revoke invitation');
    }
  };

  const pendingInvitations = invitations.filter((inv) => inv.status === 'PENDING');
  const historyInvitations = invitations.filter((inv) => inv.status !== 'PENDING');

  const themeOptions = [
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'dark', label: 'Dark', icon: MoonIcon },
    { value: 'system', label: 'System', icon: Monitor },
  ];

  const inputClasses = 'w-full rounded-lg border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none';

  return (
    <div>
      <div className="mb-4 sm:mb-6">
        <h1 className="font-display text-xl sm:text-2xl font-bold text-[var(--text-primary)] flex items-center gap-2">
          <Settings className="h-5 w-5 sm:h-6 sm:w-6 text-prism-indigo" />
          Settings
        </h1>
      </div>

      <div className="space-y-4 sm:space-y-6 max-w-2xl w-full">
        {/* Profile */}
        <section className="glass-panel p-4 sm:p-6">
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
            <User className="h-5 w-5 text-violet-400" />
            Profile
          </h2>
          <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Display Name</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your name"
            className={`${inputClasses} mb-3`}
            maxLength={100}
          />
          <SaveButton onClick={saveUserSettings} saving={saving} />
        </section>

        {/* Appearance */}
        <section className="glass-panel p-4 sm:p-6">
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
            <Sun className="h-5 w-5 text-amber-400" />
            Appearance
          </h2>
          {mounted && (
            <div className="flex flex-wrap gap-2">
              {themeOptions.map((opt) => {
                const isActive = theme === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => setTheme(opt.value)}
                    className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all ${
                      isActive
                        ? 'bg-prism-indigo text-white shadow-md shadow-prism-indigo/20'
                        : 'bg-[var(--surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)] border border-[var(--border-color)]'
                    }`}
                  >
                    <opt.icon className="h-4 w-4" />
                    {opt.label}
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* Visible Features */}
        <section className="glass-panel p-4 sm:p-6">
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
            <Eye className="h-5 w-5 text-indigo-400" />
            Visible Features
          </h2>
          <p className="text-xs text-[var(--text-muted)] mb-4">Toggle which features appear in your sidebar. Hidden features are still accessible via URL.</p>
          <div className="space-y-3">
            {[
              { href: '/goals', label: 'Goal Stack' },
              { href: '/training', label: 'Training' },
              { href: '/tasks', label: 'Tasks' },
              { href: '/ideas', label: 'Ideas' },
              { href: '/aims', label: 'Aims' },
              { href: '/calendar', label: 'Calendar' },
              { href: '/reviews', label: 'Reviews' },
              { href: '/powerdown', label: 'Power Down' },
              { href: '/leaderboard', label: 'Leaderboard' },
              { href: '/reports', label: 'Reports' },
              { href: '/processes', label: 'Processes' },
            ].map(({ href, label }) => (
              <label key={href} className="flex items-center justify-between">
                <span className="text-sm text-[var(--text-secondary)]">{label}</span>
                <input
                  type="checkbox"
                  checked={!hiddenFeatures.includes(href)}
                  onChange={(e) => {
                    setHiddenFeatures((prev) =>
                      e.target.checked
                        ? prev.filter((f) => f !== href)
                        : [...prev, href]
                    );
                  }}
                  className="h-4 w-4 rounded border-[var(--border-color)] bg-[var(--input-bg)] text-indigo-600 focus:ring-indigo-500"
                />
              </label>
            ))}
          </div>
          <SaveButton onClick={saveUserSettings} saving={saving} className="mt-4" />
        </section>

        {/* MTP */}
        <section className="glass-panel p-4 sm:p-6">
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
            <Compass className="h-5 w-5 text-indigo-400" />
            Massively Transformative Purpose
          </h2>
          <textarea
            value={mtp}
            onChange={(e) => setMtp(e.target.value)}
            rows={3}
            placeholder="What is your MTP? e.g., 'Democratize access to quality education for every child on earth'"
            className={`${inputClasses} resize-none mb-3`}
          />
          <SaveButton onClick={saveUserSettings} saving={saving} />
        </section>

        {/* Timezone */}
        <section className="glass-panel p-4 sm:p-6">
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
            <Globe className="h-5 w-5 text-indigo-400" />
            Timezone
          </h2>
          <select
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className={inputClasses}
          >
            {['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Europe/London', 'Europe/Berlin', 'Asia/Tokyo', 'Asia/Shanghai', 'Australia/Sydney', 'UTC'].map((tz) => (
              <option key={tz} value={tz}>{tz}</option>
            ))}
          </select>
        </section>

        {/* Notifications */}
        <section className="glass-panel p-4 sm:p-6">
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
            <Bell className="h-5 w-5 text-indigo-400" />
            Notifications
          </h2>
          <div className="space-y-3">
            {[
              { key: 'emailEnabled', label: 'Email notifications' },
              { key: 'derailingAlerts', label: 'Derailing alerts' },
              { key: 'mentionAlerts', label: '@mention alerts' },
              { key: 'reviewNags', label: 'Review reminders' },
            ].map(({ key, label }) => (
              <label key={key} className="flex items-center justify-between">
                <span className="text-sm text-[var(--text-secondary)]">{label}</span>
                <input
                  type="checkbox"
                  checked={(notifPrefs as any)[key]}
                  onChange={(e) => setNotifPrefs({ ...notifPrefs, [key]: e.target.checked })}
                  className="h-4 w-4 rounded border-[var(--border-color)] bg-[var(--input-bg)] text-indigo-600 focus:ring-indigo-500"
                />
              </label>
            ))}
            {isPushSupported && (
              <label className="flex items-center justify-between">
                <span className="text-sm text-[var(--text-secondary)]">Push notifications</span>
                <input
                  type="checkbox"
                  checked={isPushSubscribed && notifPrefs.pushEnabled}
                  onChange={async (e) => {
                    if (e.target.checked) {
                      const ok = await subscribePush();
                      if (ok) {
                        setNotifPrefs({ ...notifPrefs, pushEnabled: true });
                        toast.success('Push notifications enabled');
                      } else {
                        toast.error('Could not enable push notifications. Check browser permissions.');
                      }
                    } else {
                      await unsubscribePush();
                      setNotifPrefs({ ...notifPrefs, pushEnabled: false });
                      toast.success('Push notifications disabled');
                    }
                  }}
                  className="h-4 w-4 rounded border-[var(--border-color)] bg-[var(--input-bg)] text-indigo-600 focus:ring-indigo-500"
                />
              </label>
            )}
          </div>
          <div className="mt-4 flex items-center gap-3">
            <SaveButton onClick={saveUserSettings} saving={saving} label="Save Preferences" />
            <TestEmailButton toast={toast} />
          </div>
        </section>

        {/* Scheduling */}
        <section className="glass-panel p-4 sm:p-6">
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
            <Clock className="h-5 w-5 text-indigo-400" />
            Scheduling
          </h2>
          <div className="space-y-5">
            <div>
              <label className="text-sm text-[var(--text-secondary)]">Working Hours</label>
              <p className="text-xs text-[var(--text-muted)] mt-0.5 mb-2">Time range for work-related tasks and aims</p>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <input
                  type="time"
                  value={workingHoursStart}
                  onChange={(e) => setWorkingHoursStart(e.target.value)}
                  className={inputClasses}
                />
                <span className="text-sm text-[var(--text-muted)]">to</span>
                <input
                  type="time"
                  value={workingHoursEnd}
                  onChange={(e) => setWorkingHoursEnd(e.target.value)}
                  className={inputClasses}
                />
              </div>
            </div>

            <div>
              <label className="text-sm text-[var(--text-secondary)]">Casual Hours</label>
              <p className="text-xs text-[var(--text-muted)] mt-0.5 mb-2">Time range for personal activities like exercise and recovery</p>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <input
                  type="time"
                  value={casualHoursStart}
                  onChange={(e) => setCasualHoursStart(e.target.value)}
                  className={inputClasses}
                />
                <span className="text-sm text-[var(--text-muted)]">to</span>
                <input
                  type="time"
                  value={casualHoursEnd}
                  onChange={(e) => setCasualHoursEnd(e.target.value)}
                  className={inputClasses}
                />
              </div>
            </div>

            <div>
              <label className="text-sm text-[var(--text-secondary)]">Default work-block duration</label>
              <p className="text-xs text-[var(--text-muted)] mt-0.5 mb-2">
                Length of a new work block when a task is dragged onto the calendar. Capped by the task&apos;s remaining estimate.
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={15}
                  max={480}
                  step={5}
                  value={defaultWorkBlockMinutes}
                  onChange={(e) => setDefaultWorkBlockMinutes(Math.max(15, Math.min(480, Number(e.target.value) || 0)))}
                  className={`${inputClasses} w-32`}
                />
                <span className="text-sm text-[var(--text-muted)]">minutes</span>
              </div>
            </div>

            <div>
              <label className="text-sm text-[var(--text-secondary)]">Schedule tasks in</label>
              <select
                value={taskSchedulePeriod}
                onChange={(e) => setTaskSchedulePeriod(e.target.value)}
                className={`${inputClasses} mt-1`}
              >
                <option value="both">Both periods (Recommended)</option>
                <option value="working">Working hours only</option>
                <option value="casual">Casual hours only</option>
              </select>
            </div>
          </div>
          <SaveButton onClick={saveUserSettings} saving={saving} className="mt-4" />
        </section>

        <TaskTypeColorsSection />

        {/* Connected Calendars */}
        <section className="glass-panel p-4 sm:p-6">
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
            <Calendar className="h-5 w-5 text-purple-400" />
            Connected Calendars
          </h2>
          <p className="text-xs text-[var(--text-muted)] mb-4">Select which Google Calendars to show in your calendar view and configure sync settings.</p>
          {loadingCalendars ? (
            <p className="text-sm text-[var(--text-muted)]">Loading calendars...</p>
          ) : !googleCalConnected ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-[var(--text-muted)]">Google Calendar is not connected or your access has expired.</p>
              <button
                onClick={() => signIn('google', { callbackUrl: '/settings' })}
                className="self-start flex items-center gap-2 px-3 py-1.5 text-sm rounded-md bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
              >
                <RefreshCw className="h-4 w-4" />
                Reconnect Google Calendar
              </button>
            </div>
          ) : availableCalendars.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">No calendars found in your Google account.</p>
          ) : (
            <>
              <div className="space-y-2 mb-4">
                {availableCalendars.map((cal) => (
                  <div key={cal.id} className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={selectedCalendarIds.includes(cal.id)}
                      onChange={(e) => {
                        setSelectedCalendarIds((prev) =>
                          e.target.checked
                            ? [...prev, cal.id]
                            : prev.filter((id) => id !== cal.id)
                        );
                      }}
                      className="h-4 w-4 rounded border-[var(--border-color)] bg-[var(--input-bg)] text-indigo-600 focus:ring-indigo-500"
                    />
                    <input
                      type="color"
                      value={calendarColorOverrides[cal.id] || cal.backgroundColor || '#9333ea'}
                      onChange={(e) => {
                        setCalendarColorOverrides((prev) => ({ ...prev, [cal.id]: e.target.value }));
                      }}
                      className="h-6 w-6 rounded cursor-pointer border-0 p-0 bg-transparent"
                      title={`Color for ${cal.summary}`}
                    />
                    <span className="text-sm text-[var(--text-secondary)]">
                      {cal.summary}
                      {cal.primary && <span className="text-xs text-[var(--text-muted)] ml-1">(Primary)</span>}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mb-2">
                <label className="text-sm text-[var(--text-secondary)]">Sync events to</label>
                <p className="text-xs text-[var(--text-muted)] mb-1">Events created in the app will appear in this Google Calendar.</p>
                <select
                  value={syncTargetCalendarId}
                  onChange={(e) => setSyncTargetCalendarId(e.target.value)}
                  className={`${inputClasses} mt-1`}
                >
                  <option value="">Primary Calendar</option>
                  {availableCalendars.map((cal) => (
                    <option key={cal.id} value={cal.id}>
                      {cal.summary}{cal.primary ? ' (Primary)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mt-4">
                <label className="text-sm text-[var(--text-secondary)]">Count toward weekly target</label>
                <p className="text-xs text-[var(--text-muted)] mb-2">Select which calendars&apos; events count toward your weekly scheduled hours target.</p>
                <div className="space-y-2">
                  {availableCalendars.map((cal) => (
                    <label key={cal.id} className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={weeklyTargetCalendarIds.includes(cal.id)}
                        onChange={(e) => {
                          setWeeklyTargetCalendarIds((prev) =>
                            e.target.checked
                              ? [...prev, cal.id]
                              : prev.filter((id) => id !== cal.id)
                          );
                        }}
                        className="h-4 w-4 rounded border-[var(--border-color)] bg-[var(--input-bg)] text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-sm text-[var(--text-secondary)]">
                        {cal.summary}
                        {cal.primary && <span className="text-xs text-[var(--text-muted)] ml-1">(Primary)</span>}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </>
          )}
          {calendarError && (
            <p className="mt-3 text-sm text-amber-400">{calendarError}</p>
          )}
          <button
            onClick={() => signIn('google', { callbackUrl: '/settings' })}
            className="mt-4 flex items-center gap-2 px-3 py-1.5 text-sm rounded-md border border-[var(--border-color)] hover:bg-[var(--hover-bg)] text-[var(--text-secondary)] transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            {googleCalConnected ? 'Reconnect Google Calendar' : 'Connect Google Calendar'}
          </button>
          <SaveButton onClick={saveUserSettings} saving={saving} className="mt-4" />
        </section>

        {/* Powerdown Time */}
        <section className="glass-panel p-4 sm:p-6">
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
            <Sunset className="h-5 w-5 text-violet-400" />
            Powerdown Time
          </h2>
          <p className="text-xs text-[var(--text-muted)] mb-4">Set your daily power-down ritual time. This will appear as a recurring event on your calendar.</p>
          <input
            type="time"
            value={powerdownTime}
            onChange={(e) => setPowerdownTime(e.target.value)}
            className={inputClasses}
          />
          <SaveButton onClick={saveUserSettings} saving={saving} className="mt-4" />
        </section>

        {/* Streak Preferences */}
        <section className="glass-panel p-4 sm:p-6">
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-1 flex items-center gap-2">
            <Flame className="h-5 w-5 text-amber-400" />
            Daily Streak
          </h2>
          <p className="text-sm text-[var(--text-muted)] mb-4">
            Your daily streak advances when you complete a Power Down that day.
          </p>
          <label className="flex items-center justify-between">
            <div>
              <span className="text-sm text-[var(--text-secondary)]">Grace Day</span>
              <p className="text-xs text-[var(--text-muted)]">Allow 1 extra day before a streak breaks</p>
            </div>
            <input
              type="checkbox"
              checked={streakGraceDays}
              onChange={(e) => setStreakGraceDays(e.target.checked)}
              className="h-4 w-4 rounded border-[var(--border-color)] bg-[var(--input-bg)] text-indigo-600 focus:ring-indigo-500"
            />
          </label>
          <SaveButton onClick={saveUserSettings} saving={saving} className="mt-4" />
        </section>

        {/* Beeminder Integration */}
        <section className="glass-panel p-4 sm:p-6">
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-1 flex items-center gap-2">
            <Link2 className="h-5 w-5 text-yellow-500" />
            Beeminder
          </h2>
          <p className="text-sm text-[var(--text-muted)] mb-4">
            Automatically post a datapoint to your Beeminder goal each day your daily streak advances.
          </p>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-[var(--text-secondary)] mb-1">Auth Token</label>
              <input
                type="password"
                value={beeminderAuthToken}
                onChange={(e) => setBeeminderAuthToken(e.target.value)}
                placeholder="Your Beeminder auth token"
                className={inputClasses}
              />
              <p className="text-xs text-[var(--text-muted)] mt-1">
                Get your token from beeminder.com/api/v1/auth_token.json
              </p>
            </div>
            <div>
              <label className="block text-xs text-[var(--text-secondary)] mb-1">Goal Slug</label>
              <input
                type="text"
                value={beeminderGoalSlug}
                onChange={(e) => setBeeminderGoalSlug(e.target.value)}
                placeholder="e.g. daily-streak"
                className={inputClasses}
              />
            </div>
          </div>
          <SaveButton onClick={saveUserSettings} saving={saving} className="mt-4" />
        </section>

        {/* Review Schedule */}
        <section className="glass-panel p-4 sm:p-6">
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
            <Calendar className="h-5 w-5 text-blue-400" />
            Review Schedule
          </h2>
          <p className="text-xs text-[var(--text-muted)] mb-6">Configure your review cadences. Each will appear as a recurring event on your calendar.</p>

          {/* Weekly Review */}
          <div className="mb-6 pb-6 border-b border-[var(--border-color)]">
            <h3 className="text-sm font-semibold text-green-700 dark:text-green-400 mb-3">Weekly Review</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-4">
              <div>
                <label className="block text-xs text-[var(--text-secondary)] mb-1">Day of Week</label>
                <select
                  value={weeklyReviewDayOfWeek}
                  onChange={(e) => setWeeklyReviewDayOfWeek(Number(e.target.value))}
                  className={inputClasses}
                >
                  {['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map((day, i) => (
                    <option key={i} value={i}>{day}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-[var(--text-secondary)] mb-1">Time</label>
                <input type="time" value={weeklyReviewTime} onChange={(e) => setWeeklyReviewTime(e.target.value)} className={inputClasses} />
              </div>
            </div>
            <DurationInput value={weeklyReviewDuration} onChange={setWeeklyReviewDuration} inputClasses={inputClasses} />
          </div>

          {/* Monthly Review */}
          <div className="mb-6 pb-6 border-b border-[var(--border-color)]">
            <h3 className="text-sm font-semibold text-blue-700 dark:text-blue-400 mb-3">Monthly Review</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-4">
              <div>
                <label className="block text-xs text-[var(--text-secondary)] mb-1">Recurrence</label>
                <select
                  value={monthlyReviewRecurrenceRule ?? ''}
                  onChange={(e) => setMonthlyReviewRecurrenceRule(e.target.value || null)}
                  className={inputClasses}
                >
                  <option value="">Not scheduled</option>
                  <optgroup label="Last week of month">
                    <option value="last-sunday">Last Sunday</option>
                    <option value="last-monday">Last Monday</option>
                    <option value="last-tuesday">Last Tuesday</option>
                    <option value="last-wednesday">Last Wednesday</option>
                    <option value="last-thursday">Last Thursday</option>
                    <option value="last-friday">Last Friday</option>
                    <option value="last-saturday">Last Saturday</option>
                  </optgroup>
                  <optgroup label="First week of month">
                    <option value="1st-sunday">1st Sunday</option>
                    <option value="1st-monday">1st Monday</option>
                    <option value="1st-tuesday">1st Tuesday</option>
                    <option value="1st-wednesday">1st Wednesday</option>
                    <option value="1st-thursday">1st Thursday</option>
                    <option value="1st-friday">1st Friday</option>
                    <option value="1st-saturday">1st Saturday</option>
                  </optgroup>
                  <optgroup label="Second week of month">
                    <option value="2nd-sunday">2nd Sunday</option>
                    <option value="2nd-monday">2nd Monday</option>
                    <option value="2nd-tuesday">2nd Tuesday</option>
                    <option value="2nd-wednesday">2nd Wednesday</option>
                    <option value="2nd-thursday">2nd Thursday</option>
                    <option value="2nd-friday">2nd Friday</option>
                    <option value="2nd-saturday">2nd Saturday</option>
                  </optgroup>
                  <optgroup label="Third week of month">
                    <option value="3rd-sunday">3rd Sunday</option>
                    <option value="3rd-monday">3rd Monday</option>
                    <option value="3rd-tuesday">3rd Tuesday</option>
                    <option value="3rd-wednesday">3rd Wednesday</option>
                    <option value="3rd-thursday">3rd Thursday</option>
                    <option value="3rd-friday">3rd Friday</option>
                    <option value="3rd-saturday">3rd Saturday</option>
                  </optgroup>
                  <optgroup label="Specific day of month">
                    <option value="1st">1st</option>
                    <option value="15th">15th</option>
                    <option value="28th">28th</option>
                  </optgroup>
                </select>
              </div>
              <div>
                <label className="block text-xs text-[var(--text-secondary)] mb-1">Time</label>
                <input type="time" value={monthlyReviewTime} onChange={(e) => setMonthlyReviewTime(e.target.value)} className={inputClasses} />
              </div>
            </div>
            <DurationInput value={monthlyReviewDuration} onChange={setMonthlyReviewDuration} inputClasses={inputClasses} />
          </div>

          {/* Yearly Review */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-yellow-700 dark:text-yellow-400 mb-3">Yearly Review</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-4">
              <div>
                <label className="block text-xs text-[var(--text-secondary)] mb-1">Recurrence</label>
                <select
                  value={yearlyReviewRecurrenceRule?.startsWith('custom:') ? 'custom' : (yearlyReviewRecurrenceRule ?? '')}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === 'custom') {
                      setYearlyReviewRecurrenceRule('custom:12-30');
                    } else {
                      setYearlyReviewRecurrenceRule(val || null);
                    }
                  }}
                  className={inputClasses}
                >
                  <option value="">Not scheduled</option>
                  <option value="last-sat-dec">Last Saturday of December</option>
                  <option value="dec-30">December 30</option>
                  <option value="dec-31">December 31</option>
                  <option value="custom">Custom date</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-[var(--text-secondary)] mb-1">Time</label>
                <input
                  type="time"
                  value={yearlyReviewTime}
                  onChange={(e) => setYearlyReviewTime(e.target.value)}
                  className={inputClasses}
                />
              </div>
            </div>
            {yearlyReviewRecurrenceRule?.startsWith('custom:') && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-4">
                <div>
                  <label className="block text-xs text-[var(--text-secondary)] mb-1">Month</label>
                  <select
                    value={parseInt(yearlyReviewRecurrenceRule.split(':')[1]?.split('-')[0] ?? '12')}
                    onChange={(e) => {
                      const month = e.target.value.padStart(2, '0');
                      const day = yearlyReviewRecurrenceRule.split(':')[1]?.split('-')[1] ?? '30';
                      setYearlyReviewRecurrenceRule(`custom:${month}-${day}`);
                    }}
                    className={inputClasses}
                  >
                    {['January','February','March','April','May','June','July','August','September','October','November','December'].map((m, i) => (
                      <option key={i} value={i + 1}>{m}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-[var(--text-secondary)] mb-1">Day</label>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={parseInt(yearlyReviewRecurrenceRule.split(':')[1]?.split('-')[1] ?? '30')}
                    onChange={(e) => {
                      const month = yearlyReviewRecurrenceRule.split(':')[1]?.split('-')[0] ?? '12';
                      const day = e.target.value.padStart(2, '0');
                      setYearlyReviewRecurrenceRule(`custom:${month}-${day}`);
                    }}
                    className={`${inputClasses} w-32`}
                  />
                </div>
              </div>
            )}
            <DurationInput value={yearlyReviewDuration} onChange={setYearlyReviewDuration} inputClasses={inputClasses} />
          </div>

          <SaveButton onClick={saveUserSettings} saving={saving} className="mt-2" />
        </section>

        {/* Onboarding */}
        <section className="glass-panel p-4 sm:p-6">
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Onboarding Tour</h2>
          <button
            onClick={retriggerOnboarding}
            className="flex items-center gap-2 rounded-lg border border-[var(--border-color)] px-4 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--glass-border)] transition-colors"
          >
            <RotateCcw className="h-4 w-4" />
            Re-trigger onboarding tour
          </button>
        </section>

        {/* Company MTP (admin only) */}
        {isAdmin && (
          <section className="glass-panel p-4 sm:p-6">
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
              <Compass className="h-5 w-5 text-purple-400" />
              Company MTP (Admin)
            </h2>
            <textarea
              value={companyMtp}
              onChange={(e) => setCompanyMtp(e.target.value)}
              rows={3}
              placeholder="Company Massively Transformative Purpose..."
              className={`${inputClasses} resize-none mb-3`}
            />
            <button onClick={saveCompanyMtp} disabled={saving}
              className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-500 disabled:opacity-50 transition-colors">
              Save Company MTP
            </button>
          </section>
        )}

        {/* Admin panel */}
        {isAdmin && (
          <section className="glass-panel p-4 sm:p-6">
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
              <Shield className="h-5 w-5 text-red-400" />
              Admin Panel
            </h2>

            {/* Org-wide 2FA enforcement */}
            <div className="mb-4 flex items-center justify-between rounded-lg border border-[var(--border-color)] bg-[var(--surface)] px-4 py-3">
              <div>
                <p className="text-sm font-medium text-[var(--text-primary)]">Enforce 2FA org-wide</p>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  When enabled, users without 2FA cannot complete login.
                </p>
              </div>
              <button
                onClick={() => toggleEnforce2FA(!enforce2FA)}
                disabled={!enforce2FALoaded}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${
                  enforce2FA ? 'bg-red-600' : 'bg-[var(--hover-bg)]'
                }`}
                aria-pressed={enforce2FA}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    enforce2FA ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            <div className="space-y-2">
              {users.map((user) => {
                const isSelf = user.id === session?.user?.id;
                return (
                <div key={user.id} className="flex items-center justify-between rounded-lg bg-[var(--surface)] px-4 py-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm text-[var(--text-primary)]">{user.name ?? user.email}</span>
                    <span className="text-xs text-[var(--text-muted)]">{user.email}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      user.is2FAEnabled
                        ? 'bg-green-600/15 text-green-400'
                        : 'bg-[var(--hover-bg)] text-[var(--text-muted)]'
                    }`}>
                      {user.is2FAEnabled ? '2FA on' : '2FA off'}
                    </span>
                    {user.isLockedOut && (
                      <span className="rounded-full bg-red-600/15 px-2 py-0.5 text-[10px] font-medium text-red-400">
                        Locked
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleAdmin(user.id, !user.isAdmin)}
                      disabled={isSelf}
                      className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
                        user.isAdmin
                          ? 'bg-red-600 text-white hover:bg-red-700'
                          : 'bg-[var(--hover-bg)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      } disabled:opacity-50`}
                    >
                      {user.isAdmin ? 'Remove Admin' : 'Make Admin'}
                    </button>
                    {!isSelf && (
                      <>
                        {user.isLockedOut ? (
                          <button
                            onClick={() => performUserAction(user.id, 'unlock')}
                            className="inline-flex items-center gap-1 rounded-lg bg-amber-600/15 px-2.5 py-1 text-xs font-medium text-amber-400 hover:bg-amber-600/25 transition-colors"
                          >
                            <LockOpen className="h-3 w-3" />
                            Unlock
                          </button>
                        ) : (
                          <button
                            onClick={() => setPendingUserAction({ action: 'lockout', userId: user.id, userName: user.name ?? user.email })}
                            className="inline-flex items-center gap-1 rounded-lg bg-[var(--hover-bg)] px-2.5 py-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                          >
                            <Lock className="h-3 w-3" />
                            Lock
                          </button>
                        )}
                        {user.is2FAEnabled && (
                          <button
                            onClick={() => setPendingUserAction({ action: 'reset-2fa', userId: user.id, userName: user.name ?? user.email })}
                            className="inline-flex items-center gap-1 rounded-lg bg-[var(--hover-bg)] px-2.5 py-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                          >
                            <KeyRound className="h-3 w-3" />
                            Reset 2FA
                          </button>
                        )}
                        <button
                          onClick={() => removeUser(user.id)}
                          className="text-xs text-red-400 hover:text-red-300"
                        >
                          Remove
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );})}
            </div>

            {/* AIM Categories */}
            <div className="mt-4 pt-4 border-t border-[var(--border-color)]">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-[var(--text-primary)]">AIM Categories</p>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">
                    Seed the 7 default AIM categories if none exist.
                  </p>
                </div>
                <button
                  onClick={async () => {
                    setSeedingAims(true);
                    setSeedAimResult('');
                    try {
                      const res = await fetch('/api/admin/seed-aims', { method: 'POST' });
                      const data = await res.json();
                      setSeedAimResult(res.ok ? `Seeded ${data.count} categories.` : (data.error || 'Failed'));
                    } catch {
                      setSeedAimResult('Network error');
                    } finally {
                      setSeedingAims(false);
                    }
                  }}
                  disabled={seedingAims}
                  className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-500 disabled:opacity-50 transition-colors"
                >
                  {seedingAims ? 'Seeding...' : 'Seed Default AIMs'}
                </button>
              </div>
              {seedAimResult && (
                <p className="text-xs text-teal-400 mt-2">{seedAimResult}</p>
              )}
            </div>
          </section>
        )}

        {/* Create User (Dev mode only) */}
        {isAdmin && isDevMode && (
          <section className="glass-panel p-4 sm:p-6">
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-green-400" />
              Create User (Dev)
            </h2>
            <p className="text-xs text-[var(--text-muted)] mb-4">Create users directly for local testing. They can log in via the dev login form.</p>
            <div className="space-y-3">
              <input
                type="text"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="Name"
                className={inputClasses}
              />
              <input
                type="email"
                value={createEmail}
                onChange={(e) => setCreateEmail(e.target.value)}
                placeholder="Email"
                className={inputClasses}
              />
              <select
                value={createRole}
                onChange={(e) => setCreateRole(e.target.value)}
                className={inputClasses}
              >
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
              <button
                onClick={createUser}
                disabled={creating || !createEmail.trim()}
                className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-500 disabled:opacity-50 transition-colors"
              >
                {creating ? 'Creating...' : 'Create User'}
              </button>
            </div>
          </section>
        )}

        {/* Invite User */}
        {isAdmin && (
          <section className="glass-panel p-4 sm:p-6">
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
              <Mail className="h-5 w-5 text-indigo-400" />
              Invite User
            </h2>
            <p className="text-xs text-[var(--text-muted)] mb-4">Invite users by email. When they sign in via Google, they&apos;ll be assigned the selected role.</p>
            <div className="space-y-3">
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="Email address"
                className={inputClasses}
              />
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
                className={inputClasses}
              >
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
              <button
                onClick={sendInvitation}
                disabled={inviting || !inviteEmail.trim()}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
              >
                {inviting ? 'Sending...' : 'Send Invitation'}
              </button>
            </div>

            {/* Pending Invitations */}
            {pendingInvitations.length > 0 && (
              <div className="mt-6">
                <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-3">Pending Invitations</h3>
                <div className="space-y-2">
                  {pendingInvitations.map((inv) => (
                      <div key={inv.id} className="rounded-lg bg-[var(--surface)] px-4 py-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center flex-wrap gap-1">
                            <span className="text-sm text-[var(--text-primary)]">{inv.email}</span>
                            <span className={`ml-1 text-xs px-2 py-0.5 rounded-full ${
                              inv.role === 'admin'
                                ? 'bg-purple-600/20 text-purple-400'
                                : 'bg-[var(--hover-bg)] text-[var(--text-secondary)]'
                            }`}>
                              {inv.role}
                            </span>
                            {inv.isExpired && (
                              <span className="ml-1 text-xs px-2 py-0.5 rounded-full bg-amber-600/20 text-amber-400">
                                expired
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => copyInviteLink(inv.id, inv.token)}
                              className="rounded-lg p-1.5 text-xs font-medium bg-[var(--hover-bg)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                              title="Copy invite link"
                            >
                              {copiedId === inv.id ? (
                                <Check className="h-3.5 w-3.5 text-green-400" />
                              ) : (
                                <Link2 className="h-3.5 w-3.5" />
                              )}
                            </button>
                            <button
                              onClick={() => resendInvitation(inv.id, inv.email, inv.role)}
                              className="rounded-lg px-2.5 py-1 text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
                              title="Revoke and resend with new link"
                            >
                              <RefreshCw className="h-3.5 w-3.5 inline-block mr-1" />
                              Resend
                            </button>
                            <button
                              onClick={() => revokeInvitation(inv.id)}
                              className="rounded-lg px-2.5 py-1 text-xs font-medium bg-red-600/20 text-red-400 hover:bg-red-600/30 transition-colors"
                            >
                              Revoke
                            </button>
                          </div>
                        </div>
                        <div className="mt-1 text-xs text-[var(--text-muted)]">
                          Sent {new Date(inv.createdAt).toLocaleDateString()}
                          {!inv.isExpired && (
                            <> &middot; Expires {new Date(new Date(inv.createdAt).getTime() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString()}</>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Invitation History */}
            {historyInvitations.length > 0 && (
              <details className="mt-4">
                <summary className="text-xs text-[var(--text-muted)] cursor-pointer hover:text-[var(--text-secondary)]">
                  Invitation History ({historyInvitations.length})
                </summary>
                <div className="space-y-2 mt-2">
                  {historyInvitations.map((inv) => (
                      <div key={inv.id} className="rounded-lg bg-[var(--surface)] px-4 py-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center flex-wrap gap-1">
                            <span className="text-sm text-[var(--text-muted)]">{inv.email}</span>
                            <span className={`ml-1 text-xs px-2 py-0.5 rounded-full ${
                              inv.status === 'ACCEPTED'
                                ? 'bg-green-600/20 text-green-400'
                                : 'bg-red-600/20 text-red-400'
                            }`}>
                              {inv.status.toLowerCase()}
                            </span>
                          </div>
                        </div>
                        <div className="mt-1 text-xs text-[var(--text-muted)]">
                          Sent {new Date(inv.createdAt).toLocaleDateString()}
                          {inv.status === 'ACCEPTED' && inv.acceptedAt && (
                            <> &middot; Accepted {new Date(inv.acceptedAt).toLocaleDateString()}</>
                          )}
                          {inv.status === 'REVOKED' && inv.revokedAt && (
                            <> &middot; Revoked {new Date(inv.revokedAt).toLocaleDateString()}</>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              </details>
            )}
          </section>
        )}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Remove User"
        message="Are you sure you want to remove this user? This cannot be undone."
        confirmLabel="Remove"
        variant="danger"
        onConfirm={confirmRemoveUser}
        onCancel={() => { setConfirmOpen(false); setPendingRemoveUserId(null); }}
      />

      <ConfirmDialog
        open={pendingUserAction !== null}
        title={pendingUserAction?.action === 'lockout' ? 'Lock User' : 'Reset 2FA'}
        message={
          pendingUserAction?.action === 'lockout'
            ? `Lock ${pendingUserAction.userName} out of their account? They will be signed out within 5 minutes and cannot log back in until you unlock them.`
            : `Reset 2FA for ${pendingUserAction?.userName}? Their TOTP secret will be cleared and they will be prompted to set up 2FA again on their next login.`
        }
        confirmLabel={pendingUserAction?.action === 'lockout' ? 'Lock' : 'Reset 2FA'}
        variant="danger"
        onConfirm={() => {
          if (!pendingUserAction) return;
          performUserAction(pendingUserAction.userId, pendingUserAction.action);
          setPendingUserAction(null);
        }}
        onCancel={() => setPendingUserAction(null)}
      />
    </div>
  );
}
