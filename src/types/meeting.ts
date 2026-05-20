/**
 * Shape of a Meeting row as returned by /api/meetings (Prisma Meeting +
 * createdBy summary). Single source of truth — both the list (MeetingsManager)
 * and the focused edit page consume this. Editor-only inputs are a Pick.
 */
export interface Meeting {
  id: string;
  title: string;
  description: string | null;
  cadence: string;
  dayOfWeek: number | null;
  occurDate: string | null;
  timeStart: string;
  timeEnd: string;
  attendeeIds: string[];
  meetLink: string | null;
  calendarEventId: string | null;
  syncedAt: string | null;
  syncError: string | null;
  createdBy: { id: string; name: string | null; email: string };
}

/** Shape POST/PATCH /api/meetings actually returns — the Meeting row plus a
 * transient `warnings` array (attendee-deliverability advisory etc.). The
 * warnings are not persisted, only surfaced to whoever just saved. */
export type SavedMeeting = Meeting & { warnings?: string[] };

/** Subset of Meeting that MeetingEditor actually reads to populate the form. */
export type MeetingEditorMeeting = Pick<
  Meeting,
  | 'id'
  | 'title'
  | 'description'
  | 'cadence'
  | 'dayOfWeek'
  | 'occurDate'
  | 'timeStart'
  | 'timeEnd'
  | 'attendeeIds'
  | 'meetLink'
>;
