import { requireAuth, authError } from '@/lib/auth-guard';
import { openrouter } from '@/lib/openrouter';
import { quizGenerationPrompt } from '@/lib/ai-prompts';
import { prisma } from '@/lib/prisma';
import { handleAIError, MAX_AI_INPUT_LENGTH } from '@/lib/ai-error-handler';

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { trainingItemId, chapterRange, material } = body;

  // Validate trainingItemId if provided
  let trainingItem: any = null;
  let materialText = material;

  if (trainingItemId) {
    trainingItem = await prisma.trainingItem.findUnique({
      where: { id: trainingItemId },
    });
    if (!trainingItem) {
      return Response.json({ error: 'Training item not found' }, { status: 404 });
    }
    if (trainingItem.ownerId !== auth.userId && !auth.session.user.isAdmin) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }
    // Use the training item title as material if not explicitly provided
    if (!materialText) {
      materialText = trainingItem.title;
    }
  }

  if (!materialText || typeof materialText !== 'string' || materialText.length > MAX_AI_INPUT_LENGTH) {
    return Response.json(
      { error: 'material (or trainingItemId with title) is required and must be under 10000 characters' },
      { status: 400 }
    );
  }

  if (!chapterRange || typeof chapterRange !== 'string' || chapterRange.length > MAX_AI_INPUT_LENGTH) {
    return Response.json(
      { error: 'chapterRange is required and must be under 10000 characters' },
      { status: 400 }
    );
  }

  try {
    const messages = quizGenerationPrompt(materialText, chapterRange);
    const result = await openrouter.chatJSON<any>(messages);

    // Create QuizAttempt record with generated questions
    const quizAttempt = await prisma.quizAttempt.create({
      data: {
        trainingItemId: trainingItemId || null,
        trainingTaskId: body.trainingTaskId || null,
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
