import { requireAuth, authError } from '@/lib/auth-guard';
import { openrouter } from '@/lib/openrouter';
import { courseBreakdownPrompt } from '@/lib/ai-prompts';
import { prisma } from '@/lib/prisma';
import { handleAIError } from '@/lib/ai-error-handler';

const MAX_INPUT_LENGTH = 10000;

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

  let body: any;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { title, syllabus, targetCompletionDate, goalId } = body;

  if (!title || typeof title !== 'string' || title.length > MAX_INPUT_LENGTH) {
    return Response.json(
      { error: 'title is required and must be under 10000 characters' },
      { status: 400 }
    );
  }

  if (syllabus && (typeof syllabus !== 'string' || syllabus.length > MAX_INPUT_LENGTH)) {
    return Response.json(
      { error: 'syllabus must be under 10000 characters' },
      { status: 400 }
    );
  }

  try {
    const messages = courseBreakdownPrompt(title, syllabus);
    const breakdown = await openrouter.chatJSON<CourseBreakdown>(messages);

    const now = new Date();
    const target = targetCompletionDate ? new Date(targetCompletionDate) : null;

    // Build flat task list from modules/lessons
    const taskEntries: {
      label: string;
      moduleIndex: number;
      isQuizDay: boolean;
      estimatedMinutes: number;
    }[] = [];

    const modules = breakdown.modules ?? [];

    for (const mod of modules) {
      const lessons = mod.lessons ?? [];
      for (const lesson of lessons) {
        taskEntries.push({
          label: `Module ${mod.moduleNumber}: ${lesson.title}`,
          moduleIndex: mod.moduleNumber,
          isQuizDay: false,
          estimatedMinutes: lesson.estimatedMinutes || 45,
        });
      }

      // Insert quiz task after module if quizAfter is true
      if (mod.quizAfter) {
        taskEntries.push({
          label: `Quiz: Module ${mod.moduleNumber} - ${mod.title}`,
          moduleIndex: mod.moduleNumber,
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

    const result = await prisma.$transaction(async (tx) => {
      const trainingItem = await tx.trainingItem.create({
        data: {
          ownerId: auth.userId,
          type: 'COURSE',
          title: breakdown.title || title,
          description: syllabus ?? null,
          aiMetadata: breakdown as any,
          targetCompletionDate: target,
          goalId: goalId ?? null,
        },
      });

      for (let i = 0; i < taskEntries.length; i++) {
        const entry = taskEntries[i];
        const dueDate = getDueDate(i);

        const task = await tx.task.create({
          data: {
            ownerId: auth.userId,
            taskType: 'IMPROVE',
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
            chapterRange: null,
            moduleIndex: entry.moduleIndex,
            isQuizDay: entry.isQuizDay,
            sortOrder: i,
          },
        });
      }

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
    return handleAIError(err, 'training/courses');
  }
}
