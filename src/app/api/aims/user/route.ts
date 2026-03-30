import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { safeParseJson } from '@/lib/api-helpers';

export async function GET() {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const userAims = await prisma.userAim.findMany({
    where: { userId: auth.userId },
    include: {
      aimCategory: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  return Response.json(userAims);
}

export async function PUT(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const parsed = await safeParseJson(request);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data;
  const { aims } = body;

  if (!Array.isArray(aims)) {
    return Response.json({ error: 'aims must be an array' }, { status: 400 });
  }

  // Validate each aim entry
  for (const aim of aims) {
    if (!aim.aimCategoryId) {
      return Response.json({ error: 'Each aim must have aimCategoryId' }, { status: 400 });
    }

    // Verify the category exists
    const cat = await prisma.aimCategory.findUnique({ where: { id: aim.aimCategoryId } });
    if (!cat) {
      return Response.json({ error: `AimCategory ${aim.aimCategoryId} not found` }, { status: 404 });
    }
  }

  // Upsert each aim preference in a transaction
  const results = await prisma.$transaction(
    aims.map((aim: {
      aimCategoryId: string;
      isActive?: boolean;
      customDuration?: number;
      customFrequency?: number;
      customActivities?: any;
      currentPhase?: string;
      phaseStartedAt?: string;
      completionCount?: number;
      currentStreak?: number;
    }) => {
      // Build update payload — only include reset fields when explicitly provided
      const updateData: Record<string, any> = {
        isActive: aim.isActive ?? true,
        customDuration: aim.customDuration ?? null,
        customFrequency: aim.customFrequency ?? null,
        customActivities: aim.customActivities ?? undefined,
      };
      const createData: Record<string, any> = {
        userId: auth.userId,
        aimCategoryId: aim.aimCategoryId,
        isActive: aim.isActive ?? true,
        customDuration: aim.customDuration ?? null,
        customFrequency: aim.customFrequency ?? null,
        customActivities: aim.customActivities ?? undefined,
      };

      // Support phase reset fields (C2: Reset to Seed)
      if (aim.currentPhase !== undefined) {
        updateData.currentPhase = aim.currentPhase;
        createData.currentPhase = aim.currentPhase;
      }
      if (aim.phaseStartedAt !== undefined) {
        updateData.phaseStartedAt = new Date(aim.phaseStartedAt);
        createData.phaseStartedAt = new Date(aim.phaseStartedAt);
      }
      if (aim.completionCount !== undefined) {
        updateData.completionCount = aim.completionCount;
        createData.completionCount = aim.completionCount;
      }
      if (aim.currentStreak !== undefined) {
        updateData.currentStreak = aim.currentStreak;
        createData.currentStreak = aim.currentStreak;
      }

      return prisma.userAim.upsert({
        where: {
          userId_aimCategoryId: {
            userId: auth.userId,
            aimCategoryId: aim.aimCategoryId,
          },
        },
        update: updateData,
        create: createData as any,
        include: { aimCategory: true },
      });
    })
  );

  return Response.json(results);
}
