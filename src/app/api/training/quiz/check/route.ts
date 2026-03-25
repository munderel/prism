import { requireAuth, authError } from '@/lib/auth-guard';
import { openrouter, AIError } from '@/lib/openrouter';
import { quizCheckPrompt } from '@/lib/ai-prompts';

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

  const { questions, userAnswers } = body;

  if (!Array.isArray(questions) || questions.length === 0) {
    return Response.json(
      { error: 'questions must be a non-empty array' },
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
  const serialized = JSON.stringify({ questions, userAnswers });
  if (serialized.length > MAX_INPUT_LENGTH) {
    return Response.json(
      { error: 'Input too large, must be under 10000 characters total' },
      { status: 400 }
    );
  }

  try {
    const messages = quizCheckPrompt(questions, userAnswers);
    const result = await openrouter.chatJSON(messages);
    return Response.json(result);
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
