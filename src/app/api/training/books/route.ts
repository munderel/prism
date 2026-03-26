import { requireAuth, authError } from '@/lib/auth-guard';
import { openrouter } from '@/lib/openrouter';
import { bookBreakdownPrompt } from '@/lib/ai-prompts';
import { handleAIError, MAX_AI_INPUT_LENGTH } from '@/lib/ai-error-handler';
import { createTrainingItemWithTasks, TaskEntry } from '@/lib/training-helpers';

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

  if (!title || typeof title !== 'string' || title.length > MAX_AI_INPUT_LENGTH) {
    return Response.json(
      { error: 'title is required and must be under 10000 characters' },
      { status: 400 }
    );
  }

  if (description && (typeof description !== 'string' || description.length > MAX_AI_INPUT_LENGTH)) {
    return Response.json(
      { error: 'description must be under 10000 characters' },
      { status: 400 }
    );
  }

  try {
    const messages = bookBreakdownPrompt(title, description);
    const breakdown = await openrouter.chatJSON<BookBreakdown>(messages);

    const target = targetCompletionDate ? new Date(targetCompletionDate) : null;

    // Count total tasks: reading groups + quiz tasks
    const readingGroups = breakdown.readingGroups ?? [];
    const quizPoints = breakdown.quizPoints ?? [];
    const quizAfterGroups = new Set(quizPoints.map((q) => q.afterGroup));

    // Build a flat list of tasks in order
    const taskEntries: TaskEntry[] = [];

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

    const result = await createTrainingItemWithTasks({
      userId: auth.userId,
      type: 'BOOK',
      title,
      resolvedTitle: breakdown.title || title,
      description: description ?? null,
      aiMetadata: breakdown,
      targetCompletionDate: target,
      goalId: goalId ?? null,
      taskEntries,
    });

    return Response.json(result, { status: 201 });
  } catch (err) {
    return handleAIError(err, 'training/books');
  }
}
