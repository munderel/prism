import { AIError } from '@/lib/openrouter';

export const MAX_AI_INPUT_LENGTH = 10000;

const AI_ERROR_STATUS: Record<string, number> = {
  RATE_LIMITED: 429,
  API_KEY_INVALID: 503,
};

export function handleAIError(err: unknown, routeName: string): Response {
  if (err instanceof AIError) {
    const status = AI_ERROR_STATUS[err.code] ?? 502;
    return Response.json(
      { error: 'AI service temporarily unavailable. Please try again later.' },
      { status }
    );
  }
  console.error(`[${routeName}] Unexpected error:`, err);
  return Response.json({ error: 'Internal server error' }, { status: 500 });
}
