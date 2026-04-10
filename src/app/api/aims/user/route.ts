import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { parseBody, putUserAimsSchema } from '@/lib/schemas';

export async function GET() {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const userAims = await prisma.userAim.findMany({
    where: { userId: auth.userId },
    include: { aimCategory: true },
    orderBy: { createdAt: 'asc' },
  });

  return Response.json(userAims);
}

interface AimInput {
  aimCategoryId: string;
  isActive?: boolean;
  customDuration?: number | null;
  customFrequency?: number | null;
  customActivities?: string[];
  currentPhase?: string;
  phaseStartedAt?: string;
  completionCount?: number;
  currentStreak?: number;
}

/** Build the shared data payload for both create and update in a upsert. */
function buildAimData(aim: AimInput, userId?: string): Record<string, unknown> {
  const data: Record<string, unknown> = {
    isActive: aim.isActive ?? true,
    customDuration: aim.customDuration ?? null,
    customFrequency: aim.customFrequency ?? null,
    customActivities: aim.customActivities ?? undefined,
  };

  if (userId) {
    data.userId = userId;
    data.aimCategoryId = aim.aimCategoryId;
  }

  // Phase reset fields -- only include when explicitly provided
  if (aim.currentPhase !== undefined) data.currentPhase = aim.currentPhase;
  if (aim.phaseStartedAt !== undefined) data.phaseStartedAt = new Date(aim.phaseStartedAt);
  if (aim.completionCount !== undefined) data.completionCount = aim.completionCount;
  if (aim.currentStreak !== undefined) data.currentStreak = aim.currentStreak;

  return data;
}

export async function PUT(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const parsed = await parseBody(request, putUserAimsSchema);
  if ('error' in parsed) return parsed.error;
  const { aims } = parsed.data;

  // Validate all categories exist upfront in a single query
  const categoryIds = aims.map((a: AimInput) => a.aimCategoryId).filter(Boolean);
  if (categoryIds.length !== aims.length) {
    return Response.json({ error: 'Each aim must have aimCategoryId' }, { status: 400 });
  }

  const existingCategories = await prisma.aimCategory.findMany({
    where: { id: { in: categoryIds } },
    select: { id: true },
  });
  const existingIds = new Set(existingCategories.map((c) => c.id));
  const missingId = categoryIds.find((id: string) => !existingIds.has(id));
  if (missingId) {
    return Response.json({ error: `AimCategory ${missingId} not found` }, { status: 404 });
  }

  const results = await prisma.$transaction(
    aims.map((aim: AimInput) =>
      prisma.userAim.upsert({
        where: {
          userId_aimCategoryId: {
            userId: auth.userId,
            aimCategoryId: aim.aimCategoryId,
          },
        },
        update: buildAimData(aim),
        create: buildAimData(aim, auth.userId) as any,
        include: { aimCategory: true },
      })
    )
  );

  return Response.json(results);
}
