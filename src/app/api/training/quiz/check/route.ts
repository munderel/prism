import { requireAuth, authError } from '@/lib/auth-guard';
import { openrouter, AIError } from '@/lib/openrouter';
import { quizCheckPrompt } from '@/lib/ai-prompts';
import { prisma } from '@/lib/prisma';

const MAX_INPUT_LENGTH = 10000;

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { quizAttemptId, questions, userAnswers } = body;

  // If quizAttemptId is provided, load questions from the attempt
  let questionsToGrade = questions;
  let quizAttempt: any = null;

  if (quizAttemptId) {
    quizAttempt = await prisma.quizAttempt.findUnique({
      where: { id: quizAttemptId },
      include: {
        trainingItem: { select: { ownerId: true } },
      },
    });
    if (!quizAttempt) {
      return Response.json({ error: 'Quiz attempt not found' }, { status: 404 });
    }
    if (quizAttempt.trainingItem && quizAttempt.trainingItem.ownerId !== auth.userId && !auth.session.user.isAdmin) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }
    // Use stored questions if not explicitly provided
    if (!questionsToGrade) {
      questionsToGrade = quizAttempt.questions;
    }
  }

  if (!Array.isArray(questionsToGrade) || questionsToGrade.length === 0) {
    return Response.json(
      { error: 'questions must be a non-empty array (or provide quizAttemptId)' },
      { status: 400 }
    );
  }

  if (!Array.isArray(userAnswers) || userAnswers.length === 0) {
    return Response.json(
      { error: 'userAnswers must be a non-empty array' },
      { status: 400 }
    );
  }

  // Validate total serialized input length
  const serialized = JSON.stringify({ questions: questionsToGrade, userAnswers });
  if (serialized.length > MAX_INPUT_LENGTH) {
    return Response.json(
      { error: 'Input too large, must be under 10000 characters total' },
      { status: 400 }
    );
  }

  try {
    const messages = quizCheckPrompt(questionsToGrade, userAnswers);
    const result = await openrouter.chatJSON<any>(messages);

    // Update QuizAttempt if we have one
    if (quizAttemptId && quizAttempt) {
      await prisma.quizAttempt.update({
        where: { id: quizAttemptId },
        data: {
          userAnswers,
          score: result.score ?? null,
          llmFeedback: result,
          completedAt: new Date(),
        },
      });
    }

    return Response.json({
      ...result,
      quizAttemptId: quizAttemptId || null,
    });
  } catch (err) {
    if (err instanceof AIError) {
      const status = err.code === 'RATE_LIMITED' ? 429 : err.code === 'API_KEY_INVALID' ? 503 : 502;
      return Response.json(
        { error: 'AI service temporarily unavailable. Please try again later.' },
        { status }
      );
    }
    console.error('[training/quiz/check] Unexpected error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
