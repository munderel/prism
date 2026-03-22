import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { listGoogleEvents, createGoogleEvent } from '@/lib/calendar';

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const { searchParams } = new URL(request.url);
  const start = searchParams.get('start');
  const end = searchParams.get('end');
  const source = searchParams.get('source'); // 'tasks' | 'google' | 'reviews' | 'all'

  if (!start || !end) {
    return Response.json({ error: 'start and end are required' }, { status: 400 });
  }

  const events: any[] = [];

  // Task time blocks
  if (!source || source === 'all' || source === 'tasks') {
    const tasks = await prisma.task.findMany({
      where: {
        ownerId: auth.userId,
        OR: [
          { timeBlockStart: { gte: new Date(start), lte: new Date(end) } },
          { dueDate: { gte: new Date(start), lte: new Date(end) } },
        ],
      },
      include: { goal: { select: { title: true } } },
    });

    for (const task of tasks) {
      events.push({
        id: `task-${task.id}`,
        title: task.title,
        start: task.timeBlockStart?.toISOString() ?? task.dueDate?.toISOString(),
        end: task.timeBlockEnd?.toISOString() ?? undefined,
        allDay: !task.timeBlockStart,
        source: 'task',
        taskId: task.id,
        status: task.status,
        taskType: task.taskType,
        color: task.taskType === 'GOAL_STACK' ? '#6366f1' : task.taskType === 'REACT' ? '#eab308' : '#06b6d4',
      });
    }
  }

  // Review dates
  if (!source || source === 'all' || source === 'reviews') {
    const reviews = await prisma.review.findMany({
      where: {
        userId: auth.userId,
        scheduledDate: { gte: new Date(start), lte: new Date(end) },
      },
    });

    for (const review of reviews) {
      events.push({
        id: `review-${review.id}`,
        title: `${review.reviewType} Review`,
        start: review.scheduledDate.toISOString(),
        allDay: true,
        source: 'review',
        reviewId: review.id,
        completed: !!review.completedAt,
        color: review.completedAt ? '#22c55e' : '#f59e0b',
      });
    }
  }

  // Google Calendar events
  if (!source || source === 'all' || source === 'google') {
    const googleEvents = await listGoogleEvents(auth.userId, start, end);
    for (const ge of googleEvents) {
      events.push({
        id: `google-${ge.id}`,
        title: ge.summary,
        start: ge.start?.dateTime ?? ge.start?.date,
        end: ge.end?.dateTime ?? ge.end?.date,
        allDay: !ge.start?.dateTime,
        source: 'google',
        meetLink: ge.hangoutLink,
        color: '#9333ea',
      });
    }
  }

  return Response.json(events);
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const body = await request.json();
  const { summary, description, start, end, addMeetLink } = body;

  if (!summary || !start || !end) {
    return Response.json({ error: 'summary, start, and end are required' }, { status: 400 });
  }

  const event = await createGoogleEvent(auth.userId, {
    summary,
    description,
    start,
    end,
    addMeetLink,
  });

  if (!event) {
    return Response.json({ error: 'Failed to create event. Google Calendar may not be connected.' }, { status: 400 });
  }

  return Response.json(event, { status: 201 });
}
