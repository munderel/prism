'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Plus, Pencil, Trash2, Users, Clock } from 'lucide-react';
import { getLocalDateString } from '@/lib/date-utils';

interface Meeting {
  id: string;
  title: string;
  description: string | null;
  cadence: string;
  dayOfWeek: number | null;
  occurDate: string | null;
  timeStart: string;
  timeEnd: string;
  attendeeIds: string[];
  createdBy: { id: string; name: string | null; email: string };
}

interface UserOption {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
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

const CADENCE_LABEL: Record<string, string> = {
  ONE_TIME: 'One-Time',
  DAILY: 'Daily',
  WEEKLY: 'Weekly',
  BIWEEKLY: 'Biweekly',
  MONTHLY: 'Monthly',
  QUARTERLY: 'Quarterly',
  YEARLY: 'Yearly',
};

interface MeetingsManagerProps {
  open: boolean;
  onClose: () => void;
}

export function MeetingsManager({ open, onClose }: MeetingsManagerProps) {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [cadence, setCadence] = useState('WEEKLY');
  const [dayOfWeek, setDayOfWeek] = useState<number | null>(1);
  const [occurDate, setOccurDate] = useState('');
  const [timeStart, setTimeStart] = useState('09:00');
  const [timeEnd, setTimeEnd] = useState('10:00');
  const [selectedAttendees, setSelectedAttendees] = useState<UserOption[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [userResults, setUserResults] = useState<UserOption[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchMeetings = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/meetings');
    if (res.ok) {
      setMeetings(await res.json());
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open) fetchMeetings();
  }, [open, fetchMeetings]);

  // Debounced user search
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
        // Filter out already selected
        const selectedIds = new Set(selectedAttendees.map((a) => a.id));
        setUserResults(users.filter((u: UserOption) => !selectedIds.has(u.id)));
      }
      setSearchingUsers(false);
    }, 300);

    return () => clearTimeout(timer);
  }, [userSearch, selectedAttendees]);

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setCadence('WEEKLY');
    setDayOfWeek(1);
    setOccurDate('');
    setTimeStart('09:00');
    setTimeEnd('10:00');
    setSelectedAttendees([]);
    setUserSearch('');
    setEditingId(null);
    setShowForm(false);
  };

  const startEdit = (meeting: Meeting) => {
    setTitle(meeting.title);
    setDescription(meeting.description || '');
    setCadence(meeting.cadence);
    setDayOfWeek(meeting.dayOfWeek);
    setOccurDate(meeting.occurDate ? getLocalDateString(new Date(meeting.occurDate)) : '');
    setTimeStart(meeting.timeStart);
    setTimeEnd(meeting.timeEnd);
    setEditingId(meeting.id);
    // We don't have full user objects for attendees, so set minimal info
    setSelectedAttendees(
      (meeting.attendeeIds || []).map((id: string) => ({
        id,
        name: null,
        email: '',
        image: null,
      }))
    );
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    const payload: any = {
      title,
      description: description || null,
      cadence,
      dayOfWeek: cadence === 'ONE_TIME' ? null : dayOfWeek,
      occurDate: cadence === 'ONE_TIME' && occurDate ? new Date(occurDate).toISOString() : null,
      timeStart,
      timeEnd,
      attendeeIds: selectedAttendees.map((a) => a.id),
    };

    if (editingId) {
      await fetch(`/api/meetings/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } else {
      await fetch('/api/meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    }

    setSaving(false);
    resetForm();
    fetchMeetings();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this meeting?')) return;
    await fetch(`/api/meetings/${id}`, { method: 'DELETE' });
    fetchMeetings();
  };

  const addAttendee = (user: UserOption) => {
    setSelectedAttendees((prev) => [...prev, user]);
    setUserSearch('');
    setUserResults([]);
  };

  const removeAttendee = (userId: string) => {
    setSelectedAttendees((prev) => prev.filter((a) => a.id !== userId));
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-[var(--surface-raised)] bg-background p-6 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        <h2 className="text-xl font-bold text-[var(--text-primary)] mb-6 flex items-center gap-2">
          <Users className="h-5 w-5 text-emerald-400" />
          Manage Meetings
        </h2>

        {/* Meeting list */}
        {loading ? (
          <p className="text-[var(--text-muted)] text-sm">Loading meetings...</p>
        ) : (
          <div className="space-y-3 mb-6">
            {meetings.length === 0 && !showForm && (
              <p className="text-[var(--text-muted)] text-sm text-center py-4">
                No meetings yet. Create one to get started.
              </p>
            )}
            {meetings.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between glass-panel p-4"
              >
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-[var(--text-primary)] truncate">{m.title}</h3>
                  <div className="flex items-center gap-3 mt-1 text-xs text-[var(--text-muted)]">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {m.timeStart} - {m.timeEnd}
                    </span>
                    <span className="rounded bg-emerald-900/40 px-2 py-0.5 text-emerald-400">
                      {CADENCE_LABEL[m.cadence] || m.cadence}
                    </span>
                    {m.cadence === 'ONE_TIME' && m.occurDate && (
                      <span>{new Date(m.occurDate).toLocaleDateString()}</span>
                    )}
                    {m.cadence !== 'ONE_TIME' && m.dayOfWeek !== null && (
                      <span>{DAY_OPTIONS.find((d) => d.value === m.dayOfWeek)?.label}</span>
                    )}
                    <span>
                      {(m.attendeeIds as string[])?.length || 0} attendee
                      {((m.attendeeIds as string[])?.length || 0) !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-4">
                  <button
                    onClick={() => startEdit(m)}
                    className="rounded-lg p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-raised)] transition-colors"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(m.id)}
                    className="rounded-lg p-2 text-[var(--text-muted)] hover:text-red-400 hover:bg-[var(--surface-raised)] transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Create / Edit form */}
        {showForm ? (
          <form onSubmit={handleSubmit} className="space-y-4 glass-panel p-4">
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
                value={description}
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
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
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
                      onChange={(e) =>
                        setDayOfWeek(e.target.value === '' ? null : Number(e.target.value))
                      }
                      className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-emerald-500 focus:outline-none"
                    >
                      <option value="">Any / N/A</option>
                      {DAY_OPTIONS.map((d) => (
                        <option key={d.value} value={d.value}>
                          {d.label}
                        </option>
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

            {/* Attendee multi-select */}
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
                onClick={resetForm}
                className="rounded-lg border border-[var(--border-color)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--glass-border)] transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 transition-colors"
          >
            <Plus className="h-4 w-4" />
            New Meeting
          </button>
        )}
      </div>
    </div>
  );
}
