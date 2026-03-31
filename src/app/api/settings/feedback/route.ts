import { prisma } from '@/lib/prisma';
import { requireAuth, requireAdmin, authError } from '@/lib/auth-guard';
import { safeParseJson } from '@/lib/api-helpers';

export async function GET() {
  const auth = await requireAdmin();
  if ('error' in auth) return authError(auth);

  const feedback = await prisma.feedback.findMany({
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: 'desc' },
  });

  return Response.json(feedback);
}

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const parsed = await safeParseJson(request);
  if ('error' in parsed) return parsed.error;
  const { content } = parsed.data;

  if (!content?.trim()) {
    return Response.json({ error: 'Feedback content is required' }, { status: 400 });
  }

  const feedback = await prisma.feedback.create({
    data: {
      userId: auth.userId,
      content: content.trim(),
    },
  });

  return Response.json(feedback);
}
