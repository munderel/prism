import { requireAuth, authError } from '@/lib/auth-guard';
import { safeParseJson, hasAccess } from '@/lib/api-helpers';
import { openrouter } from '@/lib/openrouter';
import { quizCheckPrompt } from '@/lib/ai-prompts';
import { prisma } from '@/lib/prisma';
import { handleAIError, MAX_AI_INPUT_LENGTH } from '@/lib/ai-error-handler';

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const parsed = await safeParseJson(request);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data;

  const { quizAttemptId, questions, userAnswers } = body;

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
    if (quizAttempt.trainingItem && !hasAccess(quizAttempt.trainingItem.ownerId, auth.userId, auth.session.user.isAdmin)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }
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

  const serialized = JSON.stringify({ questions: questionsToGrade, userAnswers });
  if (serialized.length > MAX_AI_INPUT_LENGTH) {
    return Response.json(
      { error: 'Input too large, must be under 10000 characters total' },
      { status: 400 }
    );
  }

  try {
    const messages = quizCheckPrompt(questionsToGrade, userAnswers);
    const result = await openrouter.chatJSON<any>(messages);

    if (quizAttempt) {
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
      quizAttemptId: quizAttemptId ?? null,
    });
  } catch (err) {
    return handleAIError(err, 'training/quiz/check');
  }
}
