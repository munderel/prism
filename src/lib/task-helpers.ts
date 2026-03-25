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
    data: { isWinTheDay: false },
  });
}
