import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { safeParseJson } from '@/lib/api-helpers';

/**
 * GET /api/settings/feedback
 * Admin-only: get all feedback from users.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const feedback = await prisma.feedback.findMany({
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json(feedback);
}

/**
 * POST /api/settings/feedback
 * Submit feedback from any authenticated user.
 */
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const parsed = await safeParseJson(request);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data;
  const { content } = body;
  if (!content?.trim()) {
    return NextResponse.json({ error: 'Feedback content is required' }, { status: 400 });
  }

  const feedback = await prisma.feedback.create({
    data: {
      userId: session.user.id as string,
      content: content.trim(),
    },
  });

  return NextResponse.json(feedback);
}
