import { requireAuth, authError } from '@/lib/auth-guard';
import { openrouter, AIError } from '@/lib/openrouter';
import { clearGoalsPrompt } from '@/lib/ai-prompts';

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

  const { title, description } = body;

  if (!title || typeof title !== 'string' || title.length > MAX_INPUT_LENGTH) {
    return Response.json(
      { error: 'title is required and must be under 10000 characters' },
      { status: 400 }
    );
  }

  if (description && (typeof description !== 'string' || description.length > MAX_INPUT_LENGTH)) {
    return Response.json(
      { error: 'description must be under 10000 characters' },
      { status: 400 }
    );
  }

  try {
    const messages = clearGoalsPrompt(title, description);
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
    console.error('[powerdown/decompose] Unexpected error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
