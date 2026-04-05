import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { safeParseJson } from '@/lib/api-helpers';
import { listGoogleEvents, createGoogleEvent, getGoogleSyncInfo } from '@/lib/calendar';
import { getCompletionUrl, getAimCompletionUrl, getBaseUrl } from '@/lib/completion-token';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';

type GCalEntry = { start: string; end: string; summary: string; status: string };

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Check if a GCal event's time differs from a Prism item's time by more than 1 minute. */
function hasTimeDrifted(
  gcalStart: Date,
  gcalEnd: Date,
  prismStart: Date | null,
  prismEnd: Date | null,
): boolean {
  if (!prismStart || !prismEnd) return false;
  return (
    Math.abs(gcalStart.getTime() - prismStart.getTime()) > 60000 ||
    Math.abs(gcalEnd.getTime() - prismEnd.getTime()) > 60000
  );
}

// --- Review occurrence helpers (mirrored from calendar/route.ts) ---

function matchesMonthlyRule(d: Date, rule: string): boolean {
  const day = d.getDay();
  const date = d.getDate();
  const month = d.getMonth();
  const lastDay = new Date(d.getFullYear(), month + 1, 0).getDate();

  switch (rule) {
    case 'last-friday': {
      const lastDate = new Date(d.getFullYear(), month + 1, 0);
      const diff = (lastDate.getDay() - 5 + 7) % 7;
      return date === lastDay - diff;
    }
    case 'last-monday': {
      const lastDate = new Date(d.getFullYear(), month + 1, 0);
      const diff = (lastDate.getDay() - 1 + 7) % 7;
      return date === lastDay - diff;
    }
    case '1st-monday': return date <= 7 && day === 1;
    case '1st-friday': return date <= 7 && day === 5;
    case '15th': return date === 15;
    default: return false;
  }
}

function matchesYearlyRule(d: Date, rule: string): boolean {
  const month = d.getMonth();
  const date = d.getDate();

  switch (rule) {
    case 'dec-30': return month === 11 && date === 30;
    case 'dec-31': return month === 11 && date === 31;
    case 'last-sat-dec': {
      if (month !== 11) return false;
      const lastDate = new Date(d.getFullYear(), 12, 0);
      const lastDay = lastDate.getDate();
      const diff = (lastDate.getDay() - 6 + 7) % 7;
      return date === lastDay - diff;
    }
    default: {
      if (rule.startsWith('custom:')) {
        const parts = rule.slice(7).split('-');
        const ruleMonth = parseInt(parts[0]) - 1;
        const ruleDay = parseInt(parts[1]);
        return month === ruleMonth && date === ruleDay;
      }
      return false;
    }
  }
}

/**
 * POST /api/calendar/sync
 * Bidirectional sync between Google Calendar and Prism.
 * Phase 1: Pull GCal changes → apply to Prism tasks/reviews/aims/powerdown.
 * Phase 2: Push unsynced Prism items → create in GCal (tasks, aims, reviews, powerdown).
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const parsed = await safeParseJson(request);
  if ('error' in parsed) return parsed.error;
  const { start, end } = parsed.data;
  if (!start || !end) {
    return Response.json({ error: 'start and end are required' }, { status: 400 });
  }

  const { hasGoogle, calendarId: targetCalendarId } = await getGoogleSyncInfo(auth.userId);
  if (!hasGoogle) {
    return Response.json(
      { error: 'Google Calendar is not connected. Sign out and sign in with Google again to enable sync.' },
      { status: 400 },
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: {
      selectedCalendarIds: true,
      timezone: true,
      powerdownTime: true,
      weeklyReviewDayOfWeek: true,
      weeklyReviewTime: true,
      weeklyReviewDuration: true,
      monthlyReviewRecurrenceRule: true,
      monthlyReviewTime: true,
      monthlyReviewDuration: true,
      yearlyReviewRecurrenceRule: true,
      yearlyReviewTime: true,
      yearlyReviewDuration: true,
    },
  });

  const rawIds = Array.isArray(user?.selectedCalendarIds) ? (user.selectedCalendarIds as string[]) : undefined;
  const calendarIds = rawIds === undefined ? undefined
    : rawIds.length > 0 ? (rawIds.includes('primary') ? rawIds : ['primary', ...rawIds])
    : rawIds;

  const userTz = user?.timezone ?? 'America/New_York';
  const rangeStart = new Date(start);
  const rangeEnd = new Date(end);

  const [gcalEvents, tasks, aimInstances, reviews, powerdownSessions] = await Promise.all([
    listGoogleEvents(auth.userId, start, end, calendarIds, { showDeleted: true }),
    prisma.task.findMany({
      where: {
        ownerId: auth.userId,
        calendarEventId: { not: null },
        timeBlockStart: { gte: rangeStart, lte: rangeEnd },
      },
      select: { id: true, calendarEventId: true, timeBlockStart: true, timeBlockEnd: true, title: true },
    }),
    prisma.aimInstance.findMany({
      where: {
        userId: auth.userId,
        timeBlockStart: { gte: rangeStart, lte: rangeEnd },
      },
      include: { aimCategory: { select: { name: true } } },
    }),
    prisma.review.findMany({
      where: {
        userId: auth.userId,
        calendarEventId: { not: null },
        timeBlockStart: { gte: rangeStart, lte: rangeEnd },
      },
      select: { id: true, calendarEventId: true, timeBlockStart: true, timeBlockEnd: true, reviewType: true },
    }),
    prisma.powerdownSession.findMany({
      where: {
        userId: auth.userId,
        calendarEventId: { not: null },
        sessionDate: { gte: rangeStart, lte: rangeEnd },
      },
      select: { id: true, calendarEventId: true, timeBlockStart: true, timeBlockEnd: true, sessionDate: true },
    }),
  ]);

  // Build lookup of GCal events by ID
  const gcalMap = new Map<string, GCalEntry>();
  for (const event of gcalEvents) {
    if (event.id) {
      gcalMap.set(event.id, {
        start: event.start?.dateTime ?? event.start?.date ?? '',
        end: event.end?.dateTime ?? event.end?.date ?? '',
        summary: event.summary ?? '',
        status: event.status ?? 'confirmed',
      });
    }
  }

  const updates: string[] = [];

  // === PHASE 1: PULL (GCal → Prism) ===

  // Sync tasks: if GCal event moved/cancelled, update Prism
  for (const task of tasks) {
    if (!task.calendarEventId) continue;
    const gcalEvent = gcalMap.get(task.calendarEventId);

    if (gcalEvent?.status === 'cancelled') {
      await prisma.task.update({
        where: { id: task.id },
        data: { timeBlockStart: null, timeBlockEnd: null, calendarEventId: null },
      });
      updates.push(`Unscheduled task (deleted in GCal): ${task.title}`);
      continue;
    }

    if (!gcalEvent) {
      console.warn(`[sync] GCal event ${task.calendarEventId} for task "${task.title}" not found in batch -- skipping`);
      continue;
    }

    const gcalStart = new Date(gcalEvent.start);
    const gcalEnd = new Date(gcalEvent.end);
    if (hasTimeDrifted(gcalStart, gcalEnd, task.timeBlockStart, task.timeBlockEnd)) {
      await prisma.task.update({
        where: { id: task.id },
        data: { timeBlockStart: gcalStart, timeBlockEnd: gcalEnd, dueDate: gcalStart },
      });
      updates.push(`Rescheduled task: ${task.title}`);
    }
  }

  // Sync reviews: if GCal event moved/cancelled, update Prism
  for (const review of reviews) {
    if (!review.calendarEventId) continue;
    const gcalEvent = gcalMap.get(review.calendarEventId);

    if (gcalEvent?.status === 'cancelled') {
      await prisma.review.update({
        where: { id: review.id },
        data: { timeBlockStart: null, timeBlockEnd: null, calendarEventId: null },
      });
      updates.push(`Unscheduled review (deleted in GCal)`);
      continue;
    }

    if (!gcalEvent) {
      console.warn(`[sync] GCal event ${review.calendarEventId} for review not found in batch -- skipping`);
      continue;
    }

    const gcalStart = new Date(gcalEvent.start);
    const gcalEnd = new Date(gcalEvent.end);
    if (hasTimeDrifted(gcalStart, gcalEnd, review.timeBlockStart, review.timeBlockEnd)) {
      await prisma.review.update({
        where: { id: review.id },
        data: { timeBlockStart: gcalStart, timeBlockEnd: gcalEnd },
      });
      updates.push(`Rescheduled review`);
    }
  }

  // Sync aim instances: if GCal event moved/cancelled, update Prism
  for (const aim of aimInstances) {
    if (!aim.calendarEventId) continue;
    const gcalEvent = gcalMap.get(aim.calendarEventId);

    if (gcalEvent?.status === 'cancelled') {
      await prisma.aimInstance.update({
        where: { id: aim.id },
        data: { timeBlockStart: null, timeBlockEnd: null, calendarEventId: null },
      });
      updates.push(`Unscheduled aim (deleted in GCal): ${aim.aimCategory.name}`);
      continue;
    }

    if (!gcalEvent) {
      console.warn(`[sync] GCal event ${aim.calendarEventId} for aim "${aim.aimCategory.name}" not found in batch -- skipping`);
      continue;
    }

    const gcalStart = new Date(gcalEvent.start);
    const gcalEnd = new Date(gcalEvent.end);
    if (hasTimeDrifted(gcalStart, gcalEnd, aim.timeBlockStart, aim.timeBlockEnd)) {
      await prisma.aimInstance.update({
        where: { id: aim.id },
        data: { timeBlockStart: gcalStart, timeBlockEnd: gcalEnd },
      });
      updates.push(`Rescheduled aim: ${aim.aimCategory.name}`);
    }
  }

  // Sync powerdown sessions: if GCal event cancelled, clear calendarEventId
  for (const session of powerdownSessions) {
    if (!session.calendarEventId) continue;
    const gcalEvent = gcalMap.get(session.calendarEventId);

    if (gcalEvent?.status === 'cancelled') {
      await prisma.powerdownSession.update({
        where: { id: session.id },
        data: { calendarEventId: null },
      });
      updates.push(`Unlinked powerdown session (deleted in GCal)`);
      continue;
    }

    if (!gcalEvent) continue;

    const gcalStart = new Date(gcalEvent.start);
    const gcalEnd = new Date(gcalEvent.end);
    if (hasTimeDrifted(gcalStart, gcalEnd, session.timeBlockStart, session.timeBlockEnd)) {
      await prisma.powerdownSession.update({
        where: { id: session.id },
        data: { timeBlockStart: gcalStart, timeBlockEnd: gcalEnd },
      });
      updates.push(`Rescheduled powerdown session`);
    }
  }

  // === PHASE 2: PUSH (Prism → GCal) ===

  const baseUrl = getBaseUrl();

  // Push unsynced tasks (with completion link)
  const unsyncedTasks = await prisma.task.findMany({
    where: {
      ownerId: auth.userId,
      calendarEventId: null,
      timeBlockStart: { not: null, gte: rangeStart, lte: rangeEnd },
      timeBlockEnd: { not: null },
      status: { notIn: ['DONE', 'DROPPED'] },
    },
    select: { id: true, title: true, description: true, timeBlockStart: true, timeBlockEnd: true },
  });

  for (const task of unsyncedTasks) {
    if (!task.timeBlockStart || !task.timeBlockEnd) continue;
    try {
      const completionUrl = getCompletionUrl(task.id, auth.userId);
      const description = task.description
        ? `${task.description}\n\nMark complete in Prism: ${completionUrl}`
        : `Mark complete in Prism: ${completionUrl}`;
      const gcalEvent = await createGoogleEvent(auth.userId, {
        summary: task.title,
        description,
        start: task.timeBlockStart.toISOString(),
        end: task.timeBlockEnd.toISOString(),
      }, targetCalendarId);
      if (gcalEvent?.id) {
        await prisma.task.update({ where: { id: task.id }, data: { calendarEventId: gcalEvent.id } });
        updates.push(`Pushed task to Google: ${task.title}`);
      }
    } catch {
      // Continue with other items
    }
  }

  // Push unsynced aim instances (with completion link)
  const unsyncedAims = await prisma.aimInstance.findMany({
    where: {
      userId: auth.userId,
      calendarEventId: null,
      timeBlockStart: { not: null, gte: rangeStart, lte: rangeEnd },
      timeBlockEnd: { not: null },
      status: { not: 'SKIPPED' },
    },
    include: { aimCategory: { select: { name: true } } },
  });

  for (const aim of unsyncedAims) {
    if (!aim.timeBlockStart || !aim.timeBlockEnd) continue;
    try {
      const title = aim.selectedActivity ? `${aim.aimCategory.name}: ${aim.selectedActivity}` : aim.aimCategory.name;
      const completionUrl = getAimCompletionUrl(aim.id, auth.userId);
      const gcalEvent = await createGoogleEvent(auth.userId, {
        summary: title,
        description: `Mark complete in Prism: ${completionUrl}`,
        start: aim.timeBlockStart.toISOString(),
        end: aim.timeBlockEnd.toISOString(),
      }, targetCalendarId);
      if (gcalEvent?.id) {
        await prisma.aimInstance.update({ where: { id: aim.id }, data: { calendarEventId: gcalEvent.id } });
        updates.push(`Pushed aim to Google: ${title}`);
      }
    } catch {
      // Continue with other items
    }
  }

  // Push unsynced reviews (existing stored reviews + materialize upcoming occurrences)
  // Step 1: Materialize upcoming review occurrences as Review records
  const reviewConfigs: {
    matchFn: (d: Date) => boolean;
    time: string;
    duration: number;
    title: string;
    type: 'WEEKLY' | 'MONTHLY' | 'YEARLY';
  }[] = [];

  if (user?.weeklyReviewDayOfWeek != null && user?.weeklyReviewTime) {
    reviewConfigs.push({
      matchFn: (d) => d.getDay() === user.weeklyReviewDayOfWeek!,
      time: user.weeklyReviewTime,
      duration: user.weeklyReviewDuration ?? 60,
      title: 'Weekly Review',
      type: 'WEEKLY',
    });
  }
  if (user?.monthlyReviewRecurrenceRule && user?.monthlyReviewTime) {
    reviewConfigs.push({
      matchFn: (d) => matchesMonthlyRule(d, user.monthlyReviewRecurrenceRule!),
      time: user.monthlyReviewTime,
      duration: user.monthlyReviewDuration ?? 60,
      title: 'Monthly Review',
      type: 'MONTHLY',
    });
  }
  if (user?.yearlyReviewRecurrenceRule && user?.yearlyReviewTime) {
    reviewConfigs.push({
      matchFn: (d) => matchesYearlyRule(d, user.yearlyReviewRecurrenceRule!),
      time: user.yearlyReviewTime,
      duration: user.yearlyReviewDuration ?? 60,
      title: 'Yearly Review',
      type: 'YEARLY',
    });
  }

  // Iterate through the sync range and create Review records for upcoming dates
  const cursor = new Date(rangeStart);
  cursor.setUTCHours(0, 0, 0, 0);
  let dayCount = 0;
  while (cursor <= rangeEnd && dayCount < 366) {
    dayCount++;
    const zoned = toZonedTime(cursor, userTz);
    const dateKey = `${zoned.getFullYear()}-${pad2(zoned.getMonth() + 1)}-${pad2(zoned.getDate())}`;

    for (const config of reviewConfigs) {
      if (!config.matchFn(zoned)) continue;

      const [h, m] = config.time.split(':').map(Number);
      const evStart = fromZonedTime(`${dateKey}T${pad2(h)}:${pad2(m)}:00`, userTz);
      const evEnd = new Date(evStart.getTime() + config.duration * 60_000);
      if (evStart < rangeStart || evStart > rangeEnd) continue;

      // Upsert a Review record for this occurrence (skip if already exists with calendarEventId)
      const scheduledDate = fromZonedTime(`${dateKey}T00:00:00`, userTz);
      const existingReview = await prisma.review.findFirst({
        where: {
          userId: auth.userId,
          reviewType: config.type,
          scheduledDate: { gte: new Date(scheduledDate.getTime() - 86400000), lte: new Date(scheduledDate.getTime() + 86400000) },
        },
      });

      if (existingReview?.calendarEventId) continue; // Already synced

      try {
        const reviewLink = `${baseUrl}/reviews?action=start&type=${config.type}&date=${dateKey}`;
        const description = `Start your ${config.title} in Prism: ${reviewLink}\n\nClicking this link will open your ${config.title} in Prism where you can review progress, update goals, and plan ahead.`;

        if (existingReview && !existingReview.calendarEventId) {
          // Existing record without GCal link — push to GCal
          const gcalEvent = await createGoogleEvent(auth.userId, {
            summary: config.title,
            description,
            start: (existingReview.timeBlockStart ?? evStart).toISOString(),
            end: (existingReview.timeBlockEnd ?? evEnd).toISOString(),
          }, targetCalendarId);
          if (gcalEvent?.id) {
            await prisma.review.update({
              where: { id: existingReview.id },
              data: {
                calendarEventId: gcalEvent.id,
                timeBlockStart: existingReview.timeBlockStart ?? evStart,
                timeBlockEnd: existingReview.timeBlockEnd ?? evEnd,
              },
            });
            updates.push(`Pushed review to Google: ${config.title} (${dateKey})`);
          }
        } else if (!existingReview) {
          // No record yet — create Review + push to GCal
          const gcalEvent = await createGoogleEvent(auth.userId, {
            summary: config.title,
            description,
            start: evStart.toISOString(),
            end: evEnd.toISOString(),
          }, targetCalendarId);

          await prisma.review.create({
            data: {
              userId: auth.userId,
              reviewType: config.type,
              scheduledDate,
              timeBlockStart: evStart,
              timeBlockEnd: evEnd,
              calendarEventId: gcalEvent?.id ?? null,
            },
          });
          updates.push(`Pushed review to Google: ${config.title} (${dateKey})`);
        }
      } catch {
        // Continue with other items
      }
    }

    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  // Push remaining unsynced stored reviews (those with timeBlock but no calendarEventId)
  const unsyncedReviews = await prisma.review.findMany({
    where: {
      userId: auth.userId,
      calendarEventId: null,
      timeBlockStart: { not: null, gte: rangeStart, lte: rangeEnd },
      timeBlockEnd: { not: null },
      completedAt: null,
    },
    select: { id: true, reviewType: true, timeBlockStart: true, timeBlockEnd: true, scheduledDate: true },
  });

  for (const review of unsyncedReviews) {
    if (!review.timeBlockStart || !review.timeBlockEnd) continue;
    try {
      const title = `${review.reviewType} Review`;
      const dateKey = review.scheduledDate.toISOString().split('T')[0];
      const reviewLink = `${baseUrl}/reviews?action=start&type=${review.reviewType}&date=${dateKey}`;
      const description = `Start your ${title} in Prism: ${reviewLink}\n\nClicking this link will open your ${title} in Prism where you can review progress, update goals, and plan ahead.`;
      const gcalEvent = await createGoogleEvent(auth.userId, {
        summary: title,
        description,
        start: review.timeBlockStart.toISOString(),
        end: review.timeBlockEnd.toISOString(),
      }, targetCalendarId);
      if (gcalEvent?.id) {
        await prisma.review.update({ where: { id: review.id }, data: { calendarEventId: gcalEvent.id } });
        updates.push(`Pushed review to Google: ${title}`);
      }
    } catch {
      // Continue with other items
    }
  }

  // Push powerdown events to GCal
  if (user?.powerdownTime) {
    const [pdH, pdM] = user.powerdownTime.split(':').map(Number);
    const pdCursor = new Date(rangeStart);
    pdCursor.setUTCHours(0, 0, 0, 0);
    let pdDayCount = 0;

    while (pdCursor <= rangeEnd && pdDayCount < 366) {
      pdDayCount++;
      const zoned = toZonedTime(pdCursor, userTz);
      const dateKey = `${zoned.getFullYear()}-${pad2(zoned.getMonth() + 1)}-${pad2(zoned.getDate())}`;

      const pdStart = fromZonedTime(`${dateKey}T${pad2(pdH)}:${pad2(pdM)}:00`, userTz);
      const pdEnd = new Date(pdStart.getTime() + 30 * 60_000);

      if (pdStart >= rangeStart && pdStart <= rangeEnd) {
        // Find or create a PowerdownSession for this date
        const sessionDate = fromZonedTime(`${dateKey}T00:00:00`, userTz);
        const existingSession = await prisma.powerdownSession.findFirst({
          where: {
            userId: auth.userId,
            sessionDate: { gte: new Date(sessionDate.getTime() - 86400000), lte: new Date(sessionDate.getTime() + 86400000) },
          },
        });

        if (existingSession?.calendarEventId) {
          // Already synced
        } else {
          try {
            const description = `Start your Power Down Ritual in Prism: ${baseUrl}/powerdown\n\nClicking this link will open your end-of-day Power Down Ritual in Prism where you can review your day, capture ideas, and close out cleanly.`;

            const effectiveStart = existingSession?.timeBlockStart ?? pdStart;
            const effectiveEnd = existingSession?.timeBlockEnd ?? pdEnd;

            const gcalEvent = await createGoogleEvent(auth.userId, {
              summary: 'Power Down Ritual',
              description,
              start: effectiveStart.toISOString(),
              end: effectiveEnd.toISOString(),
            }, targetCalendarId);

            if (gcalEvent?.id) {
              if (existingSession) {
                await prisma.powerdownSession.update({
                  where: { id: existingSession.id },
                  data: { calendarEventId: gcalEvent.id, timeBlockStart: effectiveStart, timeBlockEnd: effectiveEnd },
                });
              } else {
                await prisma.powerdownSession.create({
                  data: {
                    userId: auth.userId,
                    sessionDate,
                    timeBlockStart: pdStart,
                    timeBlockEnd: pdEnd,
                    calendarEventId: gcalEvent.id,
                  },
                });
              }
              updates.push(`Pushed powerdown to Google: ${dateKey}`);
            }
          } catch {
            // Continue with other items
          }
        }
      }

      pdCursor.setUTCDate(pdCursor.getUTCDate() + 1);
    }
  }

  return Response.json({
    synced: true,
    updates,
    gcalEventsCount: gcalEvents.length,
    prismItemsChecked: tasks.length + aimInstances.length + reviews.length + powerdownSessions.length,
    prismItemsPushed: unsyncedTasks.length + unsyncedAims.length + unsyncedReviews.length,
  });
}
