import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { safeParseJson } from '@/lib/api-helpers';

export async function GET() {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const categories = await prisma.aimCategory.findMany({
    orderBy: { createdAt: 'asc' },
  });

  return Response.json(categories);
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const parsed = await safeParseJson(request);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data;
  const { name, description, defaultFrequency, defaultDurationMin, isGroupable, isDaily, activities } = body;

  if (!name?.trim()) {
    return Response.json({ error: 'name is required' }, { status: 400 });
  }

  if (typeof defaultFrequency !== 'number' || defaultFrequency < 1) {
    return Response.json({ error: 'defaultFrequency must be a positive integer' }, { status: 400 });
  }

  if (typeof defaultDurationMin !== 'number' || defaultDurationMin < 1) {
    return Response.json({ error: 'defaultDurationMin must be a positive integer' }, { status: 400 });
  }

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
    },
  });

  return Response.json(category, { status: 201 });
}
