import { requireAuth, authError } from '@/lib/auth-guard';
import { parseBody, createCourseSchema } from '@/lib/schemas';
import { openrouter } from '@/lib/openrouter';
import { courseBreakdownPrompt } from '@/lib/ai-prompts';
import { handleAIError } from '@/lib/ai-error-handler';
import { createTrainingItemWithTasks, TaskEntry } from '@/lib/training-helpers';

interface Lesson {
  lessonNumber: number;
  title: string;
  objective: string;
  estimatedMinutes: number;
}

interface Module {
  moduleNumber: number;
  title: string;
  description: string;
  lessons: Lesson[];
  quizAfter: boolean;
}

interface CourseBreakdown {
  title: string;
  totalModules: number;
  modules: Module[];
}

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const parsed = await parseBody(request, createCourseSchema);
  if ('error' in parsed) return parsed.error;
  const { title, syllabus, targetCompletionDate, goalId } = parsed.data;

  try {
    const messages = courseBreakdownPrompt(title, syllabus ?? undefined as string | undefined);
    const breakdown = await openrouter.chatJSON<CourseBreakdown>(messages);

    const target = targetCompletionDate ? new Date(targetCompletionDate) : null;

    // Build flat task list from modules/lessons
    const taskEntries: TaskEntry[] = [];

    const modules = breakdown.modules ?? [];

    for (const mod of modules) {
      const lessons = mod.lessons ?? [];
      for (const lesson of lessons) {
        taskEntries.push({
          label: `Module ${mod.moduleNumber}: ${lesson.title}`,
          chapterRange: null,
          moduleIndex: mod.moduleNumber,
          isQuizDay: false,
          estimatedMinutes: lesson.estimatedMinutes || 45,
        });
      }

      // Insert quiz task after module if quizAfter is true
      if (mod.quizAfter) {
        taskEntries.push({
          label: `Quiz: Module ${mod.moduleNumber} - ${mod.title}`,
          chapterRange: null,
          moduleIndex: mod.moduleNumber,
          isQuizDay: true,
          estimatedMinutes: 30,
        });
      }
    }

    const result = await createTrainingItemWithTasks({
      userId: auth.userId,
      type: 'COURSE',
      title,
      resolvedTitle: breakdown.title || title,
      description: syllabus ?? null,
      aiMetadata: breakdown,
      targetCompletionDate: target,
      goalId: goalId ?? null,
      taskEntries,
    });

    return Response.json(result, { status: 201 });
  } catch (err) {
    return handleAIError(err, 'training/courses');
  }
}
