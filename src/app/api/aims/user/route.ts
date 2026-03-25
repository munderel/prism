import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';

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

  const body = await request.json();
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
    aims.map((aim: { aimCategoryId: string; isActive?: boolean; customDuration?: number; customFrequency?: number; customActivities?: any }) =>
      prisma.userAim.upsert({
        where: {
          userId_aimCategoryId: {
            userId: auth.userId,
            aimCategoryId: aim.aimCategoryId,
          },
        },
        update: {
          isActive: aim.isActive ?? true,
          customDuration: aim.customDuration ?? null,
          customFrequency: aim.customFrequency ?? null,
          customActivities: aim.customActivities ?? undefined,
        },
        create: {
          userId: auth.userId,
          aimCategoryId: aim.aimCategoryId,
          isActive: aim.isActive ?? true,
          customDuration: aim.customDuration ?? null,
          customFrequency: aim.customFrequency ?? null,
          customActivities: aim.customActivities ?? undefined,
        },
        include: { aimCategory: true },
      })
    )
  );

  return Response.json(results);
}
