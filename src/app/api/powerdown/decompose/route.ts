import { requireAuth, authError } from '@/lib/auth-guard';
import { openrouter } from '@/lib/openrouter';
import { clearGoalsPrompt } from '@/lib/ai-prompts';
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

  const { title, description } = body;

  if (!title || typeof title !== 'string' || title.length > MAX_AI_INPUT_LENGTH) {
    return Response.json(
      { error: 'title is required and must be under 10000 characters' },
      { status: 400 }
    );
  }

  if (description && (typeof description !== 'string' || description.length > MAX_AI_INPUT_LENGTH)) {
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
    return handleAIError(err, 'powerdown/decompose');
  }
}
