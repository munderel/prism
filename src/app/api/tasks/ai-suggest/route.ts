import { requireAuth, authError } from '@/lib/auth-guard';
import { safeParseJson } from '@/lib/api-helpers';
import { openrouter } from '@/lib/openrouter';
import { taskSuggestionPrompt } from '@/lib/ai-prompts';
import { handleAIError, MAX_AI_INPUT_LENGTH } from '@/lib/ai-error-handler';

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const parsed = await safeParseJson(request);
  if ('error' in parsed) return parsed.error;
  const { weeklyGoal, existingTasks } = parsed.data;

  if (!weeklyGoal || typeof weeklyGoal !== 'string' || weeklyGoal.length > MAX_AI_INPUT_LENGTH) {
    return Response.json(
      { error: 'weeklyGoal is required and must be under 10000 characters' },
      { status: 400 },
    );
  }

  if (existingTasks && !Array.isArray(existingTasks)) {
    return Response.json(
      { error: 'existingTasks must be an array of strings' },
      { status: 400 },
    );
  }

  const tasks: string[] = Array.isArray(existingTasks)
    ? existingTasks.filter((t: any) => typeof t === 'string')
    : [];

  const serialized = JSON.stringify({ weeklyGoal, existingTasks: tasks });
  if (serialized.length > MAX_AI_INPUT_LENGTH) {
    return Response.json(
      { error: 'Input too large, must be under 10000 characters total' },
      { status: 400 },
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
