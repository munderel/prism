import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { computeIceScore } from '@/lib/scoring';
import { parsePagination } from '@/lib/api-helpers';

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const search = searchParams.get('search');
  const sort = searchParams.get('sort') ?? 'createdAt';
  const { page, limit, skip } = parsePagination(searchParams);

  const where: any = {};

  // Non-admins only see their own ideas
  if (!auth.session.user.isAdmin) {
    where.authorId = auth.userId;
  }

  if (status) {
    where.status = status;
  }

  if (search) {
    where.OR = [
      { title: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
    ];
  }

  const orderBy: any =
    sort === 'iceScore'
      ? { iceScore: 'desc' }
      : { createdAt: 'desc' };

  const [ideas, total] = await Promise.all([
    prisma.idea.findMany({
      where,
      orderBy,
      skip,
      take: limit,
      include: {
        author: { select: { id: true, name: true, image: true } },
        process: { select: { id: true, title: true } },
        _count: { select: { attachments: true } },
      },
    }),
    prisma.idea.count({ where }),
  ]);

  return Response.json({
    ideas,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const body = await request.json();
  const { title, description, processId, confidenceScore, easeScore, impactScore } = body;

  if (!title?.trim()) {
    return Response.json({ error: 'title is required' }, { status: 400 });
  }

  if (!description?.trim()) {
    return Response.json({ error: 'description is required' }, { status: 400 });
  }

  // Validate scores are integers 1-5
  for (const [name, value] of Object.entries({ confidenceScore, easeScore, impactScore })) {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 5) {
      return Response.json({ error: `${name} must be an integer between 1 and 5` }, { status: 400 });
    }
  }

  // Validate processId if provided
  if (processId) {
    const process = await prisma.process.findUnique({ where: { id: processId } });
    if (!process) {
      return Response.json({ error: 'Process not found' }, { status: 404 });
    }
  }

  const iceScore = computeIceScore(impactScore, confidenceScore, easeScore);

  const idea = await prisma.idea.create({
    data: {
      authorId: auth.userId,
      title,
      description,
      processId: processId ?? null,
      confidenceScore,
      easeScore,
      impactScore,
      iceScore,
    },
    include: {
      author: { select: { id: true, name: true, image: true } },
      process: { select: { id: true, title: true } },
    },
  });

  return Response.json(idea, { status: 201 });
}
