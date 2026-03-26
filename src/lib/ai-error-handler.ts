import { AIError } from '@/lib/openrouter';

export const MAX_AI_INPUT_LENGTH = 10000;

export function handleAIError(err: unknown, routeName: string): Response {
  if (err instanceof AIError) {
    const status = err.code === 'RATE_LIMITED' ? 429 : err.code === 'API_KEY_INVALID' ? 503 : 502;
    return Response.json(
      { error: 'AI service temporarily unavailable. Please try again later.' },
      { status }
    );
  }
  console.error(`[${routeName}] Unexpected error:`, err);
  return Response.json({ error: 'Internal server error' }, { status: 500 });
}
