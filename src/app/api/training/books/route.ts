import { requireAuth, authError } from '@/lib/auth-guard';
import { openrouter, AIError } from '@/lib/openrouter';
import { bookBreakdownPrompt } from '@/lib/ai-prompts';
import { prisma } from '@/lib/prisma';

const MAX_INPUT_LENGTH = 10000;

interface ReadingGroup {
  groupNumber: number;
  label: string;
  chapterStart: number;
  chapterEnd: number;
  summary: string;
  estimatedMinutes: number;
  quizAfter: boolean;
}

interface QuizPoint {
  afterGroup: number;
  focusTopics: string[];
}

interface BookBreakdown {
  title: string;
  totalChapters: number;
  readingGroups: ReadingGroup[];
  quizPoints: QuizPoint[];
}

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { title, description, targetCompletionDate, goalId } = body;

  if (!title || typeof title !== 'string' || title.length > MAX_INPUT_LENGTH) {
    return Response.json(
      { error: 'title is required and must be under 10000 characters' },
      { status: 400 }
    );
  }

  if (description && (typeof description !== 'string' || description.length > MAX_INPUT_LENGTH)) {
    return Response.json(
      { error: 'description must be under 10000 characters' },
      { status: 400 }
    );
  }

  try {
    // 1. Call OpenRouter for book breakdown
    const messages = bookBreakdownPrompt(title, description);
    const breakdown = await openrouter.chatJSON<BookBreakdown>(messages);

    // 2. Calculate due dates spread between now and targetCompletionDate
    const now = new Date();
    const target = targetCompletionDate ? new Date(targetCompletionDate) : null;

    // Count total tasks: reading groups + quiz tasks
    const readingGroups = breakdown.readingGroups ?? [];
    const quizPoints = breakdown.quizPoints ?? [];
    const quizAfterGroups = new Set(quizPoints.map((q) => q.afterGroup));

    // Build a flat list of tasks in order
    const taskEntries: {
      label: string;
      chapterRange: string | null;
      moduleIndex: number | null;
      isQuizDay: boolean;
      estimatedMinutes: number;
    }[] = [];

    for (const group of readingGroups) {
      taskEntries.push({
        label: `Read: ${group.label}${group.summary ? ' - ' + group.summary : ''}`,
        chapterRange: `${group.chapterStart}-${group.chapterEnd}`,
        moduleIndex: null,
        isQuizDay: false,
        estimatedMinutes: group.estimatedMinutes || 60,
      });

      // Insert quiz task after this group if applicable
      if (group.quizAfter || quizAfterGroups.has(group.groupNumber)) {
        const qp = quizPoints.find((q) => q.afterGroup === group.groupNumber);
        taskEntries.push({
          label: `Quiz: Chapters ${group.chapterStart}-${group.chapterEnd}${qp?.focusTopics?.length ? ' (' + qp.focusTopics.join(', ') + ')' : ''}`,
          chapterRange: `${group.chapterStart}-${group.chapterEnd}`,
          moduleIndex: null,
          isQuizDay: true,
          estimatedMinutes: 30,
        });
      }
    }

    // Calculate evenly spread due dates
    const totalEntries = taskEntries.length;
    const getDueDate = (index: number): Date | null => {
      if (!target || totalEntries <= 1) return target;
      const totalMs = target.getTime() - now.getTime();
      const stepMs = totalMs / totalEntries;
      return new Date(now.getTime() + stepMs * (index + 1));
    };

    // 3. Create TrainingItem + Tasks + TrainingTasks in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create the TrainingItem
      const trainingItem = await tx.trainingItem.create({
        data: {
          ownerId: auth.userId,
          type: 'BOOK',
          title: breakdown.title || title,
          description: description ?? null,
          aiMetadata: breakdown as any,
          targetCompletionDate: target,
          goalId: goalId ?? null,
        },
      });

      // Create Task + TrainingTask for each entry
      for (let i = 0; i < taskEntries.length; i++) {
        const entry = taskEntries[i];
        const dueDate = getDueDate(i);

        const task = await tx.task.create({
          data: {
            ownerId: auth.userId,
            taskType: 'GOAL_STACK',
            title: entry.label,
            description: `Part of training: ${title}`,
            priority: 'MEDIUM',
            dueDate,
            goalId: goalId ?? null,
            estimatedMinutes: entry.estimatedMinutes,
          },
        });

        await tx.trainingTask.create({
          data: {
            trainingItemId: trainingItem.id,
            taskId: task.id,
            chapterRange: entry.chapterRange,
            moduleIndex: entry.moduleIndex,
            isQuizDay: entry.isQuizDay,
            sortOrder: i,
          },
        });
      }

      // Re-fetch with relations
      return tx.trainingItem.findUnique({
        where: { id: trainingItem.id },
        include: {
          trainingTasks: {
            include: {
              task: { select: { id: true, title: true, status: true, dueDate: true } },
            },
            orderBy: { sortOrder: 'asc' },
          },
          goal: { select: { id: true, title: true, level: true } },
        },
      });
    });

    return Response.json(result, { status: 201 });
  } catch (err) {
    if (err instanceof AIError) {
      const status = err.code === 'RATE_LIMITED' ? 429 : err.code === 'API_KEY_INVALID' ? 503 : 502;
      return Response.json(
        { error: 'AI service temporarily unavailable. Please try again later.' },
        { status }
      );
    }
    console.error('[training/books] Unexpected error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
