import { requireAuth, authError } from '@/lib/auth-guard';
import { hasAccess } from '@/lib/api-helpers';
import { parseBody, checkQuizSchema } from '@/lib/schemas';
import { openrouter } from '@/lib/openrouter';
import { quizCheckPrompt } from '@/lib/ai-prompts';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { handleAIError, MAX_AI_INPUT_LENGTH } from '@/lib/ai-error-handler';

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const parsed = await parseBody(request, checkQuizSchema);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data;

  const { quizAttemptId, questions, userAnswers } = body;

  let questionsToGrade = questions as Record<string, unknown>[] | null | undefined;
  let quizAttemptFound = false;

  if (quizAttemptId) {
    const found = await prisma.quizAttempt.findUnique({
      where: { id: quizAttemptId },
      include: {
        trainingItem: { select: { ownerId: true } },
      },
    });
    if (!found) {
      return Response.json({ error: 'Quiz attempt not found' }, { status: 404 });
    }
    if (found.trainingItem && !hasAccess(found.trainingItem.ownerId, auth.userId, auth.session.user.isAdmin)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (!questionsToGrade) {
      questionsToGrade = found.questions as Record<string, unknown>[];
    }
    quizAttemptFound = true;
  }

  if (!Array.isArray(questionsToGrade) || questionsToGrade.length === 0) {
    return Response.json(
      { error: 'questions must be a non-empty array (or provide quizAttemptId)' },
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
    const messages = quizCheckPrompt(
      questionsToGrade as { id: number; question: string; correctAnswer: string }[],
      userAnswers as { id: number; answer: string }[],
    );
    const result = await openrouter.chatJSON<{ score?: number; [key: string]: unknown }>(messages);

    if (quizAttemptFound) {
      await prisma.quizAttempt.update({
        where: { id: quizAttemptId! },
        data: {
          userAnswers: userAnswers as Prisma.InputJsonValue,
          score: result.score ?? null,
          llmFeedback: result as unknown as Prisma.InputJsonValue,
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
