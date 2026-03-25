'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useTheme } from 'next-themes';
import { Settings, Shield, Bell, Globe, Compass, RotateCcw, UserPlus, Mail, Sun, Moon as MoonIcon, Monitor } from 'lucide-react';
import { useToast } from '@/components/ui/ToastProvider';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

export default function SettingsPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.isAdmin ?? false;
  const { theme, setTheme } = useTheme();
  const toast = useToast();
  const [mounted, setMounted] = useState(false);

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
  const [users, setUsers] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error'>('success');

  // Dev user creation
  const [createName, setCreateName] = useState('');
  const [createEmail, setCreateEmail] = useState('');
  const [createRole, setCreateRole] = useState('user');
  const [creating, setCreating] = useState(false);

  // Invitations
  const [invitations, setInvitations] = useState<any[]>([]);
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
    if (isAdmin) {
      fetchUsers();
      fetchCompanySettings();
      fetchInvitations();
    }
  }, [isAdmin]);

  const fetchSettings = async () => {
    const res = await fetch('/api/settings?scope=user');
    if (res.ok) {
      const data = await res.json();
      setMtp(data.mtp ?? '');
      setTimezone(data.timezone ?? 'America/New_York');
      if (data.notificationPreference) {
        setNotifPrefs(data.notificationPreference);
      }
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
    await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mtp, timezone, notificationPrefs: notifPrefs }),
    });
    setMessageType('success');
    setMessage('Settings saved!');
    setSaving(false);
    setTimeout(() => setMessage(''), 2000);
  };

  const saveCompanyMtp = async () => {
    setSaving(true);
    await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope: 'company', companyMtp }),
    });
    setMessageType('success');
    setMessage('Company MTP saved!');
    setSaving(false);
    setTimeout(() => setMessage(''), 2000);
  };

  const toggleAdmin = async (userId: string, newValue: boolean) => {
    await fetch('/api/admin', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, isAdmin: newValue }),
    });
    fetchUsers();
  };

  const removeUser = async (userId: string) => {
    setPendingRemoveUserId(userId);
    setConfirmOpen(true);
  };

  const confirmRemoveUser = async () => {
    if (!pendingRemoveUserId) return;
    setConfirmOpen(false);
    const res = await fetch('/api/admin', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: pendingRemoveUserId }),
    });
    if (res.ok) {
      fetchUsers();
    } else {
      const data = await res.json();
      toast.error(data.error || 'Failed to remove user');
    }
    setPendingRemoveUserId(null);
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
      toast.success('Invitation sent!');
      setInviteEmail('');
      setInviteRole('user');
      fetchInvitations();
    } else {
      const data = await res.json();
      toast.error(data.error || 'Failed to send invitation');
    }
    setInviting(false);
  };

  const revokeInvitation = async (id: string) => {
    const res = await fetch(`/api/invitations/${id}`, {
      method: 'PATCH',
    });
    if (res.ok) {
      toast.success('Invitation revoked');
      fetchInvitations();
    }
  };

  const themeOptions = [
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'dark', label: 'Dark', icon: MoonIcon },
    { value: 'system', label: 'System', icon: Monitor },
  ];

  const inputClasses = 'w-full rounded-lg border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none';

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-[var(--text-primary)] flex items-center gap-2">
          <Settings className="h-6 w-6 text-prism-indigo" />
          Settings
        </h1>
      </div>

      {message && (
        <div className={`mb-4 rounded-lg border px-4 py-2 text-sm ${
          messageType === 'error'
            ? 'bg-red-600/20 border-red-600/30 text-red-400'
            : 'bg-green-600/20 border-green-600/30 text-green-400'
        }`}>
          {message}
        </div>
      )}

      <div className="space-y-6 max-w-2xl">
        {/* Appearance */}
        <section className="glass-panel p-6">
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
            <Sun className="h-5 w-5 text-amber-400" />
            Appearance
          </h2>
          {mounted && (
            <div className="flex gap-2">
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

        {/* MTP */}
        <section className="glass-panel p-6">
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
          <button onClick={saveUserSettings} disabled={saving}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors">
            {saving ? 'Saving...' : 'Save'}
          </button>
        </section>

        {/* Timezone */}
        <section className="glass-panel p-6">
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
        <section className="glass-panel p-6">
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
            <Bell className="h-5 w-5 text-indigo-400" />
            Notifications
          </h2>
          <div className="space-y-3">
            {[
              { key: 'emailEnabled', label: 'Email notifications' },
              { key: 'pushEnabled', label: 'Push notifications' },
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
          </div>
          <button onClick={saveUserSettings} disabled={saving}
            className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors">
            Save Preferences
          </button>
        </section>

        {/* Onboarding */}
        <section className="glass-panel p-6">
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
          <section className="glass-panel p-6">
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
          <section className="glass-panel p-6">
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
              <Shield className="h-5 w-5 text-red-400" />
              Admin Panel
            </h2>
            <div className="space-y-2">
              {users.map((user) => (
                <div key={user.id} className="flex items-center justify-between rounded-lg bg-[var(--surface)] px-4 py-3">
                  <div>
                    <span className="text-sm text-[var(--text-primary)]">{user.name ?? user.email}</span>
                    <span className="text-xs text-[var(--text-muted)] ml-2">{user.email}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleAdmin(user.id, !user.isAdmin)}
                      disabled={user.id === session?.user?.id}
                      className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
                        user.isAdmin
                          ? 'bg-red-600/20 text-red-400 hover:bg-red-600/30'
                          : 'bg-[var(--hover-bg)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      } disabled:opacity-50`}
                    >
                      {user.isAdmin ? 'Remove Admin' : 'Make Admin'}
                    </button>
                    {user.id !== session?.user?.id && (
                      <button
                        onClick={() => removeUser(user.id)}
                        className="text-xs text-red-400 hover:text-red-300"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Create User (Dev mode only) */}
        {isAdmin && isDevMode && (
          <section className="glass-panel p-6">
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
          <section className="glass-panel p-6">
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
            {invitations.filter((inv: any) => inv.status === 'PENDING').length > 0 && (
              <div className="mt-6">
                <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-3">Pending Invitations</h3>
                <div className="space-y-2">
                  {invitations
                    .filter((inv: any) => inv.status === 'PENDING')
                    .map((inv: any) => (
                      <div key={inv.id} className="flex items-center justify-between rounded-lg bg-[var(--surface)] px-4 py-3">
                        <div>
                          <span className="text-sm text-[var(--text-primary)]">{inv.email}</span>
                          <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${
                            inv.role === 'admin'
                              ? 'bg-purple-600/20 text-purple-400'
                              : 'bg-[var(--hover-bg)] text-[var(--text-secondary)]'
                          }`}>
                            {inv.role}
                          </span>
                          <span className="text-xs text-[var(--text-muted)] ml-2">
                            {new Date(inv.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        <button
                          onClick={() => revokeInvitation(inv.id)}
                          className="rounded-lg px-3 py-1 text-xs font-medium bg-red-600/20 text-red-400 hover:bg-red-600/30 transition-colors"
                        >
                          Revoke
                        </button>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Invitation History */}
            {invitations.filter((inv: any) => inv.status !== 'PENDING').length > 0 && (
              <details className="mt-4">
                <summary className="text-xs text-[var(--text-muted)] cursor-pointer hover:text-[var(--text-secondary)]">
                  Invitation History ({invitations.filter((inv: any) => inv.status !== 'PENDING').length})
                </summary>
                <div className="space-y-2 mt-2">
                  {invitations
                    .filter((inv: any) => inv.status !== 'PENDING')
                    .map((inv: any) => (
                      <div key={inv.id} className="flex items-center justify-between rounded-lg bg-[var(--surface)] px-4 py-2">
                        <div>
                          <span className="text-sm text-[var(--text-muted)]">{inv.email}</span>
                          <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${
                            inv.status === 'ACCEPTED'
                              ? 'bg-green-600/20 text-green-400'
                              : 'bg-red-600/20 text-red-400'
                          }`}>
                            {inv.status.toLowerCase()}
                          </span>
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
    </div>
  );
}
