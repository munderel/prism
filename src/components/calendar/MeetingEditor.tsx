'use client';

import { useEffect, useState } from 'react';
import { Video, X } from 'lucide-react';
import { useToast } from '@/components/ui/ToastProvider';
import { getLocalDateString } from '@/lib/date-utils';
import type { MeetingEditorMeeting } from '@/types/meeting';

export type { MeetingEditorMeeting };

interface UserOption {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
}

interface MeetingEditorProps {
  /**
   * Edit an existing meeting; omit for create-new. Read once on mount —
   * the form populates from this on the first render only. To edit a
   * different meeting, remount the component (e.g. via React `key`).
   */
  meeting?: MeetingEditorMeeting | null;
  /** Fires after a successful POST/PATCH with the saved meeting + any
   *  non-persistent warnings (e.g. attendee deliverability advisory). */
  onSaved: (saved: unknown, warnings: string[]) => void;
  onCancel: () => void;
}

const CADENCE_OPTIONS = [
  { value: 'ONE_TIME', label: 'One-Time' },
  { value: 'DAILY', label: 'Daily' },
  { value: 'WEEKLY', label: 'Weekly' },
  { value: 'BIWEEKLY', label: 'Biweekly' },
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'QUARTERLY', label: 'Quarterly' },
  { value: 'YEARLY', label: 'Yearly' },
];

const DAY_OPTIONS = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
];

export function MeetingEditor({ meeting, onSaved, onCancel }: MeetingEditorProps) {
  const toast = useToast();
  const editingId = meeting?.id ?? null;

  const [title, setTitle] = useState(meeting?.title ?? '');
  const [description, setDescription] = useState(meeting?.description ?? '');
  const [cadence, setCadence] = useState(meeting?.cadence ?? 'ONE_TIME');
  const [dayOfWeek, setDayOfWeek] = useState<number | null>(meeting?.dayOfWeek ?? 1);
  // Meeting.occurDate is stored as UTC midnight; extract the YYYY-MM-DD prefix
  // directly so the date input shows the same day the user originally chose.
  const [occurDate, setOccurDate] = useState<string>(
    meeting?.occurDate ? meeting.occurDate.slice(0, 10) : getLocalDateString(),
  );
  const [timeStart, setTimeStart] = useState(meeting?.timeStart ?? '09:00');
  const [timeEnd, setTimeEnd] = useState(meeting?.timeEnd ?? '10:00');
  const [selectedAttendees, setSelectedAttendees] = useState<UserOption[]>(
    (meeting?.attendeeIds ?? []).map((id) => ({ id, name: null, email: '', image: null })),
  );
  const [userSearch, setUserSearch] = useState('');
  const [userResults, setUserResults] = useState<UserOption[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [addMeetLink, setAddMeetLink] = useState(meeting ? !!meeting.meetLink : true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!userSearch.trim()) {
      setUserResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearchingUsers(true);
      const res = await fetch(`/api/users/search?q=${encodeURIComponent(userSearch)}`);
      if (res.ok) {
        const users = await res.json();
        const selectedIds = new Set(selectedAttendees.map((a) => a.id));
        setUserResults(users.filter((u: UserOption) => !selectedIds.has(u.id)));
      }
      setSearchingUsers(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [userSearch, selectedAttendees]);

  const addAttendee = (user: UserOption) => {
    setSelectedAttendees((prev) => [...prev, user]);
    setUserSearch('');
    setUserResults([]);
  };

  const removeAttendee = (id: string) => {
    setSelectedAttendees((prev) => prev.filter((a) => a.id !== id));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const payload = {
      title,
      description: description || null,
      cadence,
      dayOfWeek: cadence === 'ONE_TIME' ? null : dayOfWeek,
      // Bare YYYY-MM-DD; server parses in local TZ (avoids the UTC-midnight
      // off-by-one for users in negative offsets).
      occurDate: cadence === 'ONE_TIME' && occurDate ? occurDate : null,
      timeStart,
      timeEnd,
      attendeeIds: selectedAttendees.map((a) => a.id),
      addMeetLink,
    };

    const url = editingId ? `/api/meetings/${editingId}` : '/api/meetings';
    const method = editingId ? 'PATCH' : 'POST';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    setSaving(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast.error(body?.error || 'Failed to save meeting');
      return;
    }
    const saved = await res.json().catch(() => ({}));
    const warnings: string[] = Array.isArray(saved?.warnings) ? saved.warnings : [];
    onSaved(saved, warnings);
  };

  return (
    <form onSubmit={submit} className="space-y-4 glass-panel p-4">
      <h3 className="text-sm font-semibold text-[var(--text-primary)]">
        {editingId ? 'Edit Meeting' : 'New Meeting'}
      </h3>

      <div>
        <label className="block text-xs text-[var(--text-secondary)] mb-1">Title</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:border-emerald-500 focus:outline-none"
          placeholder="e.g., Weekly Team Standup"
        />
      </div>

      <div>
        <label className="block text-xs text-[var(--text-secondary)] mb-1">Description (optional)</label>
        <textarea
          value={description ?? ''}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:border-emerald-500 focus:outline-none resize-none"
          placeholder="Meeting agenda or notes..."
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-[var(--text-secondary)] mb-1">Cadence</label>
          <select
            value={cadence}
            onChange={(e) => setCadence(e.target.value)}
            className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-emerald-500 focus:outline-none"
          >
            {CADENCE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div>
          {cadence === 'ONE_TIME' ? (
            <>
              <label className="block text-xs text-[var(--text-secondary)] mb-1">Date</label>
              <input
                type="date"
                value={occurDate}
                onChange={(e) => setOccurDate(e.target.value)}
                required
                className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-emerald-500 focus:outline-none"
              />
            </>
          ) : (
            <>
              <label className="block text-xs text-[var(--text-secondary)] mb-1">Day of Week</label>
              <select
                value={dayOfWeek ?? ''}
                onChange={(e) => setDayOfWeek(e.target.value === '' ? null : Number(e.target.value))}
                className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-emerald-500 focus:outline-none"
              >
                <option value="">Any / N/A</option>
                {DAY_OPTIONS.map((d) => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-[var(--text-secondary)] mb-1">Start Time</label>
          <input
            type="time"
            value={timeStart}
            onChange={(e) => setTimeStart(e.target.value)}
            required
            className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-emerald-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs text-[var(--text-secondary)] mb-1">End Time</label>
          <input
            type="time"
            value={timeEnd}
            onChange={(e) => setTimeEnd(e.target.value)}
            required
            className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-emerald-500 focus:outline-none"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs text-[var(--text-secondary)] mb-1">Attendees</label>
        {selectedAttendees.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {selectedAttendees.map((a) => (
              <span
                key={a.id}
                className="inline-flex items-center gap-1 rounded-full bg-emerald-900/40 px-3 py-1 text-xs text-emerald-300"
              >
                {a.name || a.email || a.id}
                <button
                  type="button"
                  onClick={() => removeAttendee(a.id)}
                  className="hover:text-[var(--text-primary)]"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="relative">
          <input
            type="text"
            value={userSearch}
            onChange={(e) => setUserSearch(e.target.value)}
            placeholder="Search users by name or email..."
            className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:border-emerald-500 focus:outline-none"
          />
          {(userResults.length > 0 || searchingUsers) && (
            <div className="absolute z-10 mt-1 w-full rounded-lg border border-[var(--border-color)] bg-background shadow-xl max-h-40 overflow-y-auto">
              {searchingUsers && (
                <p className="px-3 py-2 text-xs text-[var(--text-muted)]">Searching...</p>
              )}
              {userResults.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => addAttendee(u)}
                  className="w-full text-left px-3 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)] transition-colors"
                >
                  {u.name || u.email}
                  {u.name && (
                    <span className="ml-2 text-xs text-[var(--text-muted)]">{u.email}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="meetingEditorAddMeetLink"
          checked={addMeetLink}
          onChange={(e) => setAddMeetLink(e.target.checked)}
          className="rounded border-[var(--border-color)] bg-[var(--surface-raised)] text-emerald-600 focus:ring-emerald-500 h-4 w-4"
        />
        <label
          htmlFor="meetingEditorAddMeetLink"
          className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]"
        >
          <Video className="h-3.5 w-3.5 text-emerald-400" />
          Create Google Meet link
        </label>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving...' : editingId ? 'Update Meeting' : 'Create Meeting'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-[var(--border-color)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--glass-border)] transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
