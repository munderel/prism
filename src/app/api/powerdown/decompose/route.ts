import { requireAuth, authError } from '@/lib/auth-guard';
import { parseBody, decomposeGoalSchema } from '@/lib/schemas';
import { openrouter } from '@/lib/openrouter';
import { clearGoalsPrompt } from '@/lib/ai-prompts';
import { handleAIError } from '@/lib/ai-error-handler';

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const parsed = await parseBody(request, decomposeGoalSchema);
  if ('error' in parsed) return parsed.error;
  const { title, description } = parsed.data;

  try {
    const messages = clearGoalsPrompt(title, description ?? undefined);
    const result = await openrouter.chatJSON(messages);
    return Response.json(result);
  } catch (err) {
    return handleAIError(err, 'powerdown/decompose');
  }
}
