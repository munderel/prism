'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
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
  const id = params?.id;

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

  if (meeting === undefined) {
    return <div className="text-sm text-[var(--text-muted)] py-10">Loading meeting...</div>;
  }
  if (meeting === null) {
    return (
      <div className="text-sm text-[var(--text-muted)] py-10">
        Meeting not found.{' '}
        <button onClick={() => router.push('/calendar')} className="text-emerald-400 hover:underline">
          Go back
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-6">
      <h1 className="font-display text-2xl font-bold text-[var(--text-primary)] mb-4">
        Edit Meeting
      </h1>
      <MeetingEditor
        meeting={meeting}
        onCancel={() => router.push('/calendar')}
        onSaved={(_, warnings) => {
          for (const w of warnings) toast.info(w);
          router.push('/calendar');
        }}
      />
    </div>
  );
}
