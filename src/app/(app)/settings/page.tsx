'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { Settings, Shield, Bell, Globe, Compass, RotateCcw } from 'lucide-react';

export default function SettingsPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.isAdmin ?? false;

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

  useEffect(() => {
    fetchSettings();
    if (isAdmin) {
      fetchUsers();
      fetchCompanySettings();
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

  const retriggerOnboarding = async () => {
    await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hasCompletedOnboarding: false }),
    });
    window.location.href = '/';
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Settings className="h-6 w-6 text-indigo-400" />
          Settings
        </h1>
      </div>

      {message && (
        <div className="mb-4 rounded-lg bg-green-600/20 border border-green-600/30 px-4 py-2 text-sm text-green-400">
          {message}
        </div>
      )}

      <div className="space-y-6 max-w-2xl">
        {/* MTP */}
        <section className="rounded-xl border border-gray-800 bg-gray-900/50 p-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Compass className="h-5 w-5 text-indigo-400" />
            Massively Transformative Purpose
          </h2>
          <textarea
            value={mtp}
            onChange={(e) => setMtp(e.target.value)}
            rows={3}
            placeholder="What is your MTP? e.g., 'Democratize access to quality education for every child on earth'"
            className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white text-sm focus:border-indigo-500 focus:outline-none resize-none mb-3"
          />
          <button onClick={saveUserSettings} disabled={saving}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors">
            {saving ? 'Saving...' : 'Save'}
          </button>
        </section>

        {/* Timezone */}
        <section className="rounded-xl border border-gray-800 bg-gray-900/50 p-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Globe className="h-5 w-5 text-indigo-400" />
            Timezone
          </h2>
          <select
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white text-sm focus:border-indigo-500 focus:outline-none"
          >
            {['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Europe/London', 'Europe/Berlin', 'Asia/Tokyo', 'Asia/Shanghai', 'Australia/Sydney', 'UTC'].map((tz) => (
              <option key={tz} value={tz}>{tz}</option>
            ))}
          </select>
        </section>

        {/* Notifications */}
        <section className="rounded-xl border border-gray-800 bg-gray-900/50 p-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
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
                <span className="text-sm text-gray-300">{label}</span>
                <input
                  type="checkbox"
                  checked={(notifPrefs as any)[key]}
                  onChange={(e) => setNotifPrefs({ ...notifPrefs, [key]: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-600 bg-gray-800 text-indigo-600 focus:ring-indigo-500"
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
        <section className="rounded-xl border border-gray-800 bg-gray-900/50 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Onboarding Tour</h2>
          <button
            onClick={retriggerOnboarding}
            className="flex items-center gap-2 rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-400 hover:text-white hover:border-gray-600 transition-colors"
          >
            <RotateCcw className="h-4 w-4" />
            Re-trigger onboarding tour
          </button>
        </section>

        {/* Company MTP (admin only) */}
        {isAdmin && (
          <section className="rounded-xl border border-gray-800 bg-gray-900/50 p-6">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Compass className="h-5 w-5 text-purple-400" />
              Company MTP (Admin)
            </h2>
            <textarea
              value={companyMtp}
              onChange={(e) => setCompanyMtp(e.target.value)}
              rows={3}
              placeholder="Company Massively Transformative Purpose..."
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white text-sm focus:border-indigo-500 focus:outline-none resize-none mb-3"
            />
            <button onClick={saveCompanyMtp} disabled={saving}
              className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-500 disabled:opacity-50 transition-colors">
              Save Company MTP
            </button>
          </section>
        )}

        {/* Admin panel */}
        {isAdmin && (
          <section className="rounded-xl border border-gray-800 bg-gray-900/50 p-6">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Shield className="h-5 w-5 text-red-400" />
              Admin Panel
            </h2>
            <div className="space-y-2">
              {users.map((user) => (
                <div key={user.id} className="flex items-center justify-between rounded-lg bg-gray-800/50 px-4 py-3">
                  <div>
                    <span className="text-sm text-white">{user.name ?? user.email}</span>
                    <span className="text-xs text-gray-500 ml-2">{user.email}</span>
                  </div>
                  <button
                    onClick={() => toggleAdmin(user.id, !user.isAdmin)}
                    disabled={user.id === session?.user?.id}
                    className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
                      user.isAdmin
                        ? 'bg-red-600/20 text-red-400 hover:bg-red-600/30'
                        : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                    } disabled:opacity-50`}
                  >
                    {user.isAdmin ? 'Remove Admin' : 'Make Admin'}
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
