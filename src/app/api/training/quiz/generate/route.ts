import { requireAuth, authError } from '@/lib/auth-guard';
import { openrouter, AIError } from '@/lib/openrouter';
import { quizGenerationPrompt } from '@/lib/ai-prompts';

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

  const { material, chapterRange } = body;

  if (!material || typeof material !== 'string' || material.length > MAX_INPUT_LENGTH) {
    return Response.json(
      { error: 'material is required and must be under 10000 characters' },
      { status: 400 }
    );
  }

  if (!chapterRange || typeof chapterRange !== 'string' || chapterRange.length > MAX_INPUT_LENGTH) {
    return Response.json(
      { error: 'chapterRange is required and must be under 10000 characters' },
      { status: 400 }
    );
  }

  try {
    const messages = quizGenerationPrompt(material, chapterRange);
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
    console.error('[training/quiz/generate] Unexpected error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
