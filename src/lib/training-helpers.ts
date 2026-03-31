import { prisma } from '@/lib/prisma';

export interface TaskEntry {
  label: string;
  chapterRange: string | null;
  moduleIndex: number | null;
  isQuizDay: boolean;
  estimatedMinutes: number;
}

interface CreateTrainingItemParams {
  userId: string;
  type: 'BOOK' | 'COURSE';
  title: string;
  resolvedTitle: string;
  description: string | null;
  aiMetadata: unknown;
  targetCompletionDate: Date | null;
  goalId: string | null;
  taskEntries: TaskEntry[];
}

/**
 * Shared transaction logic for creating a TrainingItem with its associated
 * Tasks and TrainingTasks.  Both the books and courses routes build their
 * task-entry list differently (chapter ranges vs module indices) but
 * everything from due-date spreading through the Prisma transaction is
 * identical — that shared slice lives here.
 */
export async function createTrainingItemWithTasks(params: CreateTrainingItemParams) {
  const {
    userId,
    type,
    title,
    resolvedTitle,
    description,
    aiMetadata,
    targetCompletionDate,
    goalId,
    taskEntries,
  } = params;

  const now = new Date();

  function getDueDate(index: number): Date | null {
    if (!targetCompletionDate || taskEntries.length <= 1) return targetCompletionDate;
    const totalMs = targetCompletionDate.getTime() - now.getTime();
    const stepMs = totalMs / taskEntries.length;
    return new Date(now.getTime() + stepMs * (index + 1));
  }

  return prisma.$transaction(async (tx) => {
    const trainingItem = await tx.trainingItem.create({
      data: {
        ownerId: userId,
        type,
        title: resolvedTitle,
        description,
        aiMetadata: aiMetadata as any,
        targetCompletionDate,
        goalId,
      },
    });

    for (let i = 0; i < taskEntries.length; i++) {
      const entry = taskEntries[i];
      const dueDate = getDueDate(i);

      const task = await tx.task.create({
        data: {
          ownerId: userId,
          taskType: 'IMPROVE',
          title: entry.label,
          description: `Part of training: ${title}`,
          priority: 'MEDIUM',
          dueDate,
          goalId,
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
}
