import { requireAuth, authError } from '@/lib/auth-guard';
import { hasAccess, notFoundResponse, forbiddenResponse } from '@/lib/api-helpers';
import { parseBody, generateQuizSchema } from '@/lib/schemas';
import { openrouter } from '@/lib/openrouter';
import { quizGenerationPrompt } from '@/lib/ai-prompts';
import { prisma } from '@/lib/prisma';
import { handleAIError } from '@/lib/ai-error-handler';

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const parsed = await parseBody(request, generateQuizSchema);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data;

  const { trainingItemId, chapterRange, material } = body;

  let materialText: string | null | undefined = material;

  if (trainingItemId) {
    const trainingItem = await prisma.trainingItem.findUnique({
      where: { id: trainingItemId },
    });
    if (!trainingItem) return notFoundResponse('Training item');
    if (!hasAccess(trainingItem.ownerId, auth.userId, auth.session.user.isAdmin)) return forbiddenResponse();

    if (!materialText) {
      materialText = trainingItem.title;
    }
  }

  if (!materialText) {
    return Response.json(
      { error: 'material (or trainingItemId with title) is required' },
      { status: 400 }
    );
  }

  try {
    const messages = quizGenerationPrompt(materialText, chapterRange ?? '');
    const result = await openrouter.chatJSON<any>(messages);

    const quizAttempt = await prisma.quizAttempt.create({
      data: {
        trainingItemId: trainingItemId as string,
        trainingTaskId: body.trainingTaskId ?? null,
        questions: result.questions ?? result,
      },
    });

    return Response.json({
      ...result,
      quizAttemptId: quizAttempt.id,
    });
  } catch (err) {
    return handleAIError(err, 'training/quiz/generate');
  }
}
