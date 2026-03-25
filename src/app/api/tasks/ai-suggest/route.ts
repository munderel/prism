import { requireAuth, authError } from '@/lib/auth-guard';
import { openrouter, AIError } from '@/lib/openrouter';
import { taskSuggestionPrompt } from '@/lib/ai-prompts';

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

  const { weeklyGoal, existingTasks } = body;

  if (!weeklyGoal || typeof weeklyGoal !== 'string' || weeklyGoal.length > MAX_INPUT_LENGTH) {
    return Response.json(
      { error: 'weeklyGoal is required and must be under 10000 characters' },
      { status: 400 }
    );
  }

  if (existingTasks && !Array.isArray(existingTasks)) {
    return Response.json(
      { error: 'existingTasks must be an array of strings' },
      { status: 400 }
    );
  }

  const tasks: string[] = Array.isArray(existingTasks)
    ? existingTasks.filter((t: any) => typeof t === 'string')
    : [];

  // Validate total serialized input length
  const serialized = JSON.stringify({ weeklyGoal, existingTasks: tasks });
  if (serialized.length > MAX_INPUT_LENGTH) {
    return Response.json(
      { error: 'Input too large, must be under 10000 characters total' },
      { status: 400 }
    );
  }

  try {
    const messages = taskSuggestionPrompt(weeklyGoal, tasks);
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
    console.error('[tasks/ai-suggest] Unexpected error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
