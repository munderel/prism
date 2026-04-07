import { prisma } from '@/lib/prisma';

/**
 * Unflag all other Win-the-Day tasks for the same user + date,
 * ensuring only one task per user per day has the flag.
 */
export async function unflagOtherWinTheDay(
  ownerId: string,
  dueDate: Date | string,
  excludeId?: string
) {
  await prisma.task.updateMany({
    where: {
      ownerId,
      dueDate: new Date(dueDate),
      isWinTheDay: true,
      ...(excludeId && { id: { not: excludeId } }),
    },
    data: { isWinTheDay: false, winTheDayRank: null },
  });
}

/**
 * Apply Win The Day flags and ranks to an ordered list of task IDs.
 * If dueDate is provided, clears competing WTD flags on that date first.
 * rankedIds[0] gets rank 1, rankedIds[1] gets rank 2, etc.
 */
export async function applyWinTheDayRanks(
  ownerId: string,
  rankedIds: string[],
  dueDate?: Date | string,
): Promise<void> {
  if (dueDate) {
    await prisma.task.updateMany({
      where: {
        ownerId,
        dueDate: new Date(dueDate),
        isWinTheDay: true,
        id: { notIn: rankedIds },
      },
      data: { isWinTheDay: false, winTheDayRank: null },
    });
  }
  await prisma.$transaction(
    rankedIds.map((id, i) =>
      prisma.task.update({
        where: { id },
        data: { isWinTheDay: true, winTheDayRank: i + 1 },
      }),
    ),
  );
}
