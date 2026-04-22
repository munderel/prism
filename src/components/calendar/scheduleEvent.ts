// Shared dispatch helpers for calendar drag / resize / external-drop.
//
// Every calendar surface (CalendarSplitView, CalendarView, InlineCalendar)
// funnels through these two functions so the "how do I PATCH this event type"
// decision lives in one place. This avoids drift like the earlier bug where
// PowerDown's aim drags silently no-op'd because of a wrong id-prefix check.

export interface TaskScheduleExtras {
  /** Optional dueDate override when scheduling a task (ISO). */
  dueDate?: string;
  /** Whether to pin the task at this time block. */
  isPinned?: boolean;
  /** Whether this schedule originated from auto-scheduling. */
  isAutoScheduled?: boolean;
}

interface CalendarEventLike {
  id: string;
  extendedProps?: Record<string, unknown>;
}

function readString(props: Record<string, unknown> | undefined, key: string): string | undefined {
  const v = props?.[key];
  return typeof v === 'string' ? v : undefined;
}

function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

async function patch(url: string, body: Record<string, unknown>): Promise<void> {
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`PATCH ${url} failed: ${res.status}`);
  }
}

/**
 * Schedule an existing calendar event at new start/end times by dispatching
 * to the correct backend endpoint based on the event's id / extendedProps.
 *
 * Throws if the PATCH fails so the caller can `info.revert()` the drag.
 */
export async function scheduleCalendarEvent(
  event: CalendarEventLike,
  newStart: Date,
  newEnd: Date,
  taskExtras: TaskScheduleExtras = {},
): Promise<void> {
  const eventId = event.id;
  const props = event.extendedProps ?? {};
  const source = readString(props, 'source');
  const itemType = readString(props, 'itemType');
  const startISO = newStart.toISOString();
  const endISO = newEnd.toISOString();

  // Google Calendar events
  if (source === 'google' || eventId.startsWith('google-')) {
    const gcalId = eventId.replace(/^google-/, '');
    const calendarId = readString(props, 'calendarId') ?? 'primary';
    await patch(`/api/calendar/events/${gcalId}`, {
      start: startISO,
      end: endISO,
      calendarId,
    });
    return;
  }

  // Meeting events (payload shape differs by cadence)
  const meetingId = readString(props, 'meetingId') ?? (eventId.startsWith('meeting-') ? eventId.replace(/^meeting-/, '') : undefined);
  if (meetingId) {
    const cadence = readString(props, 'cadence');
    const payload: Record<string, unknown> = {
      timeStart: hhmm(newStart),
      timeEnd: hhmm(newEnd),
    };
    if (cadence === 'ONE_TIME') {
      payload.occurDate = startISO;
    } else {
      payload.dayOfWeek = newStart.getDay();
    }
    await patch(`/api/meetings/${meetingId}`, payload);
    return;
  }

  // Work blocks (different body field names)
  if (eventId.startsWith('workblock-')) {
    const id = eventId.replace(/^workblock-/, '');
    await patch(`/api/work-blocks/${id}`, { start: startISO, end: endISO });
    return;
  }

  // PowerDown session one-off override
  if (eventId.startsWith('powerdown-')) {
    const sessionDate = eventId.replace(/^powerdown-/, '');
    await patch('/api/powerdown', {
      sessionDate,
      timeBlockStart: startISO,
      timeBlockEnd: endISO,
    });
    return;
  }

  // Process per-execution override (id = "process-{processId}-YYYY-MM-DD")
  if (eventId.startsWith('process-')) {
    const match = eventId.match(/^process-(.+)-(\d{4}-\d{2}-\d{2})$/);
    if (!match) throw new Error(`Invalid process event id: ${eventId}`);
    const [, processId, scheduledDate] = match;
    await patch(`/api/processes/${processId}`, {
      scheduledDate,
      timeBlockStart: startISO,
      timeBlockEnd: endISO,
    });
    return;
  }

  // Reviews
  if (source === 'reviews' || eventId.startsWith('review-')) {
    const reviewId = readString(props, 'reviewId') ?? eventId.replace(/^review-/, '');
    await patch(`/api/reviews/${reviewId}`, {
      timeBlockStart: startISO,
      timeBlockEnd: endISO,
    });
    return;
  }

  // Food blocks (different body field names: startAt/endAt)
  if (itemType === 'food' || eventId.startsWith('food-')) {
    const foodId = readString(props, 'itemId') ?? eventId.replace(/^food-/, '');
    await patch(`/api/food-blocks/${foodId}`, {
      startAt: startISO,
      endAt: endISO,
    });
    return;
  }

  // Aim instances (accept aimInstanceId, bare UUID, or aim-instance- prefix)
  if (itemType === 'aim' || eventId.startsWith('aim-')) {
    const rawItemId = readString(props, 'itemId');
    const instanceId =
      readString(props, 'aimInstanceId') ??
      (rawItemId?.startsWith('aim-instance-') ? rawItemId.slice('aim-instance-'.length) : rawItemId) ??
      eventId.replace(/^aim-(instance-|new-)?/, '');
    await patch(`/api/aims/instances/${instanceId}`, {
      timeBlockStart: startISO,
      timeBlockEnd: endISO,
    });
    return;
  }

  // Tasks (default) — timeBlock + optional dueDate/isPinned extras
  if (itemType === 'task' || eventId.startsWith('task-')) {
    const taskId = readString(props, 'itemId') ?? eventId.replace(/^task-/, '');
    await patch(`/api/tasks/${taskId}`, {
      timeBlockStart: startISO,
      timeBlockEnd: endISO,
      ...taskExtras,
    });
    return;
  }

  throw new Error(`Unknown calendar event type: id=${eventId}, source=${source}, itemType=${itemType}`);
}

/**
 * Schedule an item by its raw id + itemType, without a FullCalendar event in
 * hand. Used by external (sidebar) drops where only the unscheduled-item
 * descriptor is available.
 *
 * Throws on failure.
 */
export async function scheduleItemById(
  itemType: string,
  itemId: string,
  start: Date,
  end: Date,
  taskExtras: TaskScheduleExtras = {},
): Promise<void> {
  const startISO = start.toISOString();
  const endISO = end.toISOString();

  if (itemType === 'task') {
    await patch(`/api/tasks/${itemId}`, {
      timeBlockStart: startISO,
      timeBlockEnd: endISO,
      ...taskExtras,
    });
    return;
  }

  if (itemType === 'aim') {
    const instanceId = itemId.startsWith('aim-instance-')
      ? itemId.slice('aim-instance-'.length)
      : itemId;
    await patch(`/api/aims/instances/${instanceId}`, {
      timeBlockStart: startISO,
      timeBlockEnd: endISO,
    });
    return;
  }

  if (itemType === 'food') {
    await patch(`/api/food-blocks/${itemId}`, {
      startAt: startISO,
      endAt: endISO,
    });
    return;
  }

  throw new Error(`Unsupported itemType for external drop: ${itemType}`);
}
