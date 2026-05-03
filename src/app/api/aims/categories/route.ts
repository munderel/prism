import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { parseBody, createAimCategorySchema } from '@/lib/schemas';

export async function GET() {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const categories = await prisma.aimCategory.findMany({
    where: {
      OR: [
        { isDefault: true },
        { createdByUserId: auth.userId },
      ],
    },
    orderBy: { createdAt: 'asc' },
  });

  return Response.json(categories);
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const parsed = await parseBody(request, createAimCategorySchema);
  if ('error' in parsed) return parsed.error;
  const { name, description, defaultFrequency, defaultDurationMin, isGroupable, isDaily, activities } = parsed.data;

  const category = await prisma.aimCategory.create({
    data: {
      name: name.trim(),
      description: description?.trim() || null,
      defaultFrequency,
      defaultDurationMin,
      isGroupable: isGroupable ?? false,
      isDefault: false, // user-created
      isDaily: isDaily ?? false,
      activities: activities ?? undefined,
      createdByUserId: auth.userId,
      isUserHabit: true,
    },
  });

  return Response.json(category, { status: 201 });
}
