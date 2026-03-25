import { requireAuth, authError } from '@/lib/auth-guard';
import { openrouter } from '@/lib/openrouter';
import { taskSuggestionPrompt } from '@/lib/ai-prompts';
import { handleAIError } from '@/lib/ai-error-handler';

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
    return handleAIError(err, 'tasks/ai-suggest');
  }
}
