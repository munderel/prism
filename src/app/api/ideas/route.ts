import { NextRequest } from 'next/server';
import { Prisma, IdeaStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { computeIceScore } from '@/lib/scoring';
import { parsePagination, USER_SUMMARY_SELECT } from '@/lib/api-helpers';
import { parseBody, createIdeaSchema } from '@/lib/schemas';

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const search = searchParams.get('search');
  const sort = searchParams.get('sort') ?? 'createdAt';
  const { page, limit, skip } = parsePagination(searchParams);

  const where: Prisma.IdeaWhereInput = {};

  // Non-admins only see their own ideas
  if (!auth.session.user.isAdmin) {
    where.authorId = auth.userId;
  }

  if (status) {
    where.status = status as IdeaStatus;
  }

  if (search) {
    where.OR = [
      { title: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
    ];
  }

  const orderBy: Prisma.IdeaOrderByWithRelationInput =
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
        author: { select: USER_SUMMARY_SELECT },
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

  const parsed = await parseBody(request, createIdeaSchema);
  if ('error' in parsed) return parsed.error;
  const { title, description, processId, confidenceScore, easeScore, impactScore } = parsed.data;

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
      author: { select: USER_SUMMARY_SELECT },
      process: { select: { id: true, title: true } },
    },
  });

  return Response.json(idea, { status: 201 });
}
