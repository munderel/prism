# AI Integration (OpenRouter) — Design Spec

**Date:** 2026-03-24
**Status:** Draft

## Problem

Multiple features need LLM capabilities: training (book/course breakdown, quiz generation/grading), power-down (clear goal decomposition), and task management (AI-suggested tasks from weekly goals). The app has no AI infrastructure. A shared, secure, rate-limited OpenRouter client is needed as the foundation.

## Solution Overview

Build a server-side OpenRouter API client with structured output parsing, retry logic, and rate limiting. Define prompt templates for each use case. All AI calls happen in API routes — the client key is never exposed to the browser.

## Infrastructure

### OpenRouter Client

**New file:** `src/lib/openrouter.ts`

```typescript
interface OpenRouterConfig {
  apiKey: string;
  baseUrl: string;       // https://openrouter.ai/api/v1
  defaultModel: string;  // configurable, e.g., "meta-llama/llama-3-70b-instruct"
  maxRetries: number;
  timeoutMs: number;
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OpenRouterResponse {
  content: string;
  model: string;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

class OpenRouterClient {
  constructor(config: OpenRouterConfig);

  // Core method — chat completion with retry
  async chat(messages: ChatMessage[], options?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    responseFormat?: 'json' | 'text';
  }): Promise<OpenRouterResponse>;

  // Convenience — structured JSON output
  async chatJSON<T>(messages: ChatMessage[], options?: { ... }): Promise<T>;
}

// Singleton instance
export const openrouter = new OpenRouterClient({
  apiKey: process.env.OPENROUTER_API_KEY!,
  baseUrl: 'https://openrouter.ai/api/v1',
  defaultModel: process.env.OPENROUTER_MODEL || 'meta-llama/llama-3-70b-instruct',
  maxRetries: 3,
  timeoutMs: 30000,
});
```

### Features

- **Retry with exponential backoff:** 1s, 2s, 4s delays on 429/500 errors
- **Rate limit headers:** Respect `X-RateLimit-Remaining` and `X-RateLimit-Reset`
- **Structured JSON parsing:** `chatJSON<T>()` method parses response as JSON with validation
- **Timeout:** 30s default, configurable per call
- **Error handling:** Wrap OpenRouter errors in user-friendly messages
- **Logging:** Log model used, token counts, latency for monitoring

### Environment Variables

```env
OPENROUTER_API_KEY=sk-or-...
OPENROUTER_MODEL=meta-llama/llama-3-70b-instruct  # optional, defaults to llama-3-70b
```

Added to `.env.example` with comments.

## Prompt Templates

**New file:** `src/lib/ai-prompts.ts`

### BOOK_BREAKDOWN_PROMPT

```typescript
export function bookBreakdownPrompt(title: string, description?: string): ChatMessage[] {
  return [
    {
      role: 'system',
      content: 'You are a learning coach that breaks books into structured reading plans. Always respond with valid JSON.',
    },
    {
      role: 'user',
      content: `Break down the book "${title}"${description ? ` (${description})` : ''} into a reading plan.

Provide:
- Complete chapter list with brief topic descriptions
- Reading groups of 2-3 chapters each, with estimated reading time in minutes
- Quiz checkpoints every 3-4 chapters listing key topics to test

Return JSON: {
  "chapters": [{ "number": 1, "title": "...", "topic": "..." }],
  "readingGroups": [{ "chapters": "1-2", "topic": "...", "estimatedMinutes": 45 }],
  "quizPoints": [{ "afterChapter": 4, "topics": ["...", "..."] }]
}`,
    },
  ];
}
```

### COURSE_BREAKDOWN_PROMPT

```typescript
export function courseBreakdownPrompt(title: string, syllabus?: string): ChatMessage[] {
  return [
    {
      role: 'system',
      content: 'You are a curriculum designer. Break courses into structured module plans. Always respond with valid JSON.',
    },
    {
      role: 'user',
      content: `Break down the course "${title}" into a structured curriculum.
${syllabus ? `\nSyllabus/overview:\n${syllabus}\n` : ''}
Provide modules with lessons and assignments, including estimated time per lesson.

Return JSON: {
  "modules": [{
    "title": "...",
    "description": "...",
    "lessons": [{ "title": "...", "estimatedMinutes": 30, "type": "lesson|assignment|quiz" }]
  }]
}`,
    },
  ];
}
```

### QUIZ_GENERATION_PROMPT

```typescript
export function quizGenerationPrompt(material: string, chapterRange: string): ChatMessage[] {
  return [
    {
      role: 'system',
      content: 'You are an educator creating comprehension quizzes. Mix question types. Always respond with valid JSON.',
    },
    {
      role: 'user',
      content: `Based on the following material from chapters ${chapterRange}:

${material}

Generate 5 comprehension questions. Include multiple choice, short answer, and concept application types.

Return JSON: {
  "questions": [{
    "question": "...",
    "type": "multiple_choice|short_answer|application",
    "options": ["A", "B", "C", "D"] or null,
    "correctAnswer": "...",
    "explanation": "..."
  }]
}`,
    },
  ];
}
```

### QUIZ_CHECK_PROMPT

```typescript
export function quizCheckPrompt(questions: any[], userAnswers: any[]): ChatMessage[] {
  return [
    {
      role: 'system',
      content: 'You are a patient teacher grading quiz answers. Explain corrections clearly. Always respond with valid JSON.',
    },
    {
      role: 'user',
      content: `Grade these quiz answers:

Questions and correct answers: ${JSON.stringify(questions)}
User answers: ${JSON.stringify(userAnswers)}

For each answer, determine if correct and provide helpful feedback.

Return JSON: {
  "results": [{ "questionIndex": 0, "isCorrect": true/false, "feedback": "..." }],
  "overallScore": 0.8,
  "summary": "..."
}`,
    },
  ];
}
```

### CLEAR_GOALS_PROMPT

```typescript
export function clearGoalsPrompt(title: string, description?: string): ChatMessage[] {
  return [
    {
      role: 'system',
      content: 'You are a productivity coach specializing in the Flow Research Collective methodology. Break tasks into extremely clear, minute-detail sub-steps. Each step should eliminate all ambiguity about what to do next. Always respond with valid JSON.',
    },
    {
      role: 'user',
      content: `Break this task into clear goals (extreme, minute-detail sub-steps):

Task: "${title}"
${description ? `Description: "${description}"` : ''}

Order from most difficult/rewarding to least. Each step should be so specific that there's zero question about what to do.

Return JSON: { "steps": ["step 1", "step 2", ...] }`,
    },
  ];
}
```

### TASK_SUGGESTION_PROMPT

```typescript
export function taskSuggestionPrompt(weeklyGoal: string, existingTasks: string[]): ChatMessage[] {
  return [
    {
      role: 'system',
      content: 'You are a goal-setting coach. Suggest specific, measurable daily tasks that advance a weekly goal. Always respond with valid JSON.',
    },
    {
      role: 'user',
      content: `Weekly goal: "${weeklyGoal}"
Already planned tasks: ${JSON.stringify(existingTasks)}

Suggest 3-5 additional daily tasks to accomplish this weekly goal. Each should be specific, measurable, and completable in one sitting.

Return JSON: {
  "tasks": [{ "title": "...", "estimatedMinutes": 60, "description": "..." }]
}`,
    },
  ];
}
```

## API Routes Using OpenRouter

| Route | Method | Purpose | Rate Limit |
|-------|--------|---------|------------|
| `/api/training/books` | POST | Book breakdown | 5/min |
| `/api/training/courses` | POST | Course breakdown | 5/min |
| `/api/training/quiz/generate` | POST | Quiz generation | 10/min |
| `/api/training/quiz/check` | POST | Quiz grading | 10/min |
| `/api/powerdown/decompose` | POST | Clear goal decomposition | 10/min |
| `/api/tasks/ai-suggest` | POST | Task suggestions from goals | 10/min |

## Rate Limiting

Extend existing `src/lib/rate-limit.ts` with AI-specific limits:
- Per-user rate limiting (not per-IP) for AI endpoints
- Lower thresholds than regular endpoints
- Return 429 with `Retry-After` header

## Security

1. **Server-side only:** `OPENROUTER_API_KEY` accessed only in API routes, never in client bundle
2. **Input validation:** Max 10,000 chars for user-provided text (book descriptions, course syllabi)
3. **Output sanitization:** Parse AI JSON response, validate structure, reject malformed
4. **No prompt injection:** User input is wrapped in structured prompts, not concatenated raw
5. **Cost control:** Rate limiting prevents runaway API costs
6. **Model fallback:** If primary model fails, optionally fall back to a cheaper/faster model

## Error Handling

```typescript
class AIError extends Error {
  constructor(
    message: string,
    public code: 'RATE_LIMITED' | 'MODEL_ERROR' | 'PARSE_ERROR' | 'TIMEOUT' | 'API_KEY_INVALID',
    public retryable: boolean,
  ) {
    super(message);
  }
}
```

User-facing error messages:
- Rate limited → "Please wait a moment before trying again"
- Model error → "AI service temporarily unavailable. Try again in a few seconds."
- Parse error → "AI returned an unexpected response. Trying again..."
- Timeout → "Request took too long. Please try again."
- API key invalid → "AI features are not configured. Contact your administrator."

## Testing

1. OpenRouter client: mock API responses, verify retry logic, JSON parsing.
2. Each prompt template: verify output matches expected JSON schema.
3. Rate limiting: exceed limit → verify 429 response.
4. Error handling: simulate timeout, model error, parse error → verify user-friendly messages.
5. Security: verify API key not in client bundle (`npm run build` + inspect).
6. Run `npx vitest` and `npm run build`.
