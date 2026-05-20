'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { mutate } from 'swr';
import { useToast } from '@/components/ui/ToastProvider';
import { MeetingEditor, type MeetingEditorMeeting } from '@/components/calendar/MeetingEditor';

/**
 * URL-addressable meeting edit page. Calendar event-click handlers route here
 * for meeting events; the focused MeetingEditor renders inline (no modal).
 */
export default function MeetingEditPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const toast = useToast();
  const { data: session, status } = useSession();
  const id = params?.id;
  const isAdmin = session?.user?.isAdmin ?? false;

  const [meeting, setMeeting] = useState<MeetingEditorMeeting | null | undefined>(undefined);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/meetings/${id}`);
      if (cancelled) return;
      if (!res.ok) {
        toast.error('Meeting not found');
        setMeeting(null);
        return;
      }
      setMeeting(await res.json());
    })();
    return () => { cancelled = true; };
  }, [id, toast]);

  // Shared outer chrome so every state (loading / unauth / not-found / form)
  // sits inside the same max-width column.
  const Chrome = ({ children }: { children: React.ReactNode }) => (
    <div className="max-w-2xl mx-auto py-6">{children}</div>
  );

  if (status === 'loading' || meeting === undefined) {
    return (
      <Chrome>
        <div className="text-sm text-[var(--text-muted)] py-10">Loading meeting...</div>
      </Chrome>
    );
  }

  // PATCH /api/meetings/[id] requires admin. Render a forbidden state for
  // non-admins rather than letting them edit a form whose submit will 403.
  if (!isAdmin) {
    return (
      <Chrome>
        <div className="text-sm text-[var(--text-muted)] py-10">
          Only admins can edit meetings.{' '}
          <button
            onClick={() => router.push('/calendar')}
            className="text-emerald-400 hover:underline"
          >
            Go back
          </button>
        </div>
      </Chrome>
    );
  }

  if (meeting === null) {
    return (
      <Chrome>
        <div className="text-sm text-[var(--text-muted)] py-10">
          Meeting not found.{' '}
          <button
            onClick={() => router.push('/calendar')}
            className="text-emerald-400 hover:underline"
          >
            Go back
          </button>
        </div>
      </Chrome>
    );
  }

  return (
    <Chrome>
      <h1 className="font-display text-2xl font-bold text-[var(--text-primary)] mb-4">
        Edit Meeting
      </h1>
      <MeetingEditor
        meeting={meeting}
        onCancel={() => router.push('/calendar')}
        onSaved={(_saved, warnings) => {
          for (const w of warnings) toast.info(w);
          // Revalidate caches the user will see when they land on /calendar.
          // SWR is the only client-side store; without mutate the calendar
          // displays stale meeting title/time until the page hard-refreshes.
          // The dashboard's calendar feed uses query-string SWR keys (start,
          // end, source) so match by prefix via a function.
          mutate('/api/meetings');
          mutate(
            (key) => typeof key === 'string' && key.startsWith('/api/calendar'),
            undefined,
            { revalidate: true },
          );
          router.push('/calendar');
        }}
      />
    </Chrome>
  );
}
