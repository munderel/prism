import { prisma } from '@/lib/prisma';
import { requireAuth, requireAdmin, authError } from '@/lib/auth-guard';
import { parseBody, createFeedbackSchema } from '@/lib/schemas';

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

  const parsed = await parseBody(request, createFeedbackSchema);
  if ('error' in parsed) return parsed.error;
  const { content } = parsed.data;

  const feedback = await prisma.feedback.create({
    data: {
      userId: auth.userId,
      content: content.trim(),
    },
  });

  return Response.json(feedback);
}
