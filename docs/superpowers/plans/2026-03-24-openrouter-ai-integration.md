# OpenRouter AI Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a shared, server-side OpenRouter API client with structured JSON parsing, retry logic, and rate limiting. Define prompt templates for training (book/course breakdown, quiz generation/grading), power-down (clear goal decomposition), and task management (AI-suggested tasks). Expose stub API routes for each use case. All AI calls stay server-side — the API key is never exposed to the browser.

**Architecture:** Five layers: (1) AIError class with typed codes and user-friendly messages, (2) OpenRouter client with retry and JSON parsing, (3) prompt templates per use case, (4) AI-specific per-user rate limiters, (5) API route stub endpoints with auth, validation, and error handling.

**Tech Stack:** Next.js 14 / TypeScript / Vitest / Prisma / existing `rate-limit.ts` + `auth-guard.ts`

**Spec:** `docs/superpowers/specs/2026-03-24-openrouter-ai-integration-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/lib/ai-errors.ts` | Create | `AIError` class with typed codes and user-friendly messages |
| `src/__tests__/ai-errors.test.ts` | Create | Unit tests for AIError |
| `src/lib/openrouter.ts` | Create | OpenRouter client class: chat, chatJSON, retry, timeout, logging |
| `src/__tests__/openrouter.test.ts` | Create | Unit tests for client: retry, JSON parsing, timeout, error mapping |
| `src/lib/ai-prompts.ts` | Create | Prompt template functions for all six use cases |
| `src/__tests__/ai-prompts.test.ts` | Create | Unit tests for prompt templates: structure, role ordering, content |
| `src/lib/rate-limit.ts` | Modify | Add AI-specific per-user rate limiters |
| `src/__tests__/ai-rate-limit.test.ts` | Create | Unit tests for AI rate limiters: per-user keying, thresholds |
| `.env.example` | Modify | Add `OPENROUTER_API_KEY` and `OPENROUTER_MODEL` entries |
| `src/app/api/training/books/route.ts` | Create | POST stub: book breakdown via AI |
| `src/app/api/training/courses/route.ts` | Create | POST stub: course breakdown via AI |
| `src/app/api/training/quiz/generate/route.ts` | Create | POST stub: quiz generation via AI |
| `src/app/api/training/quiz/check/route.ts` | Create | POST stub: quiz grading via AI |
| `src/app/api/powerdown/decompose/route.ts` | Create | POST stub: clear goal decomposition via AI |
| `src/app/api/tasks/ai-suggest/route.ts` | Create | POST stub: task suggestions from weekly goals |
| `src/__tests__/ai-routes.test.ts` | Create | Integration tests for all six route stubs |
| `src/__tests__/ai-security.test.ts` | Create | Security tests: key protection, input limits, auth enforcement |

---

### Task 1: AIError Class — Typed Error Handling

**Files:**
- Create: `src/lib/ai-errors.ts`
- Create: `src/__tests__/ai-errors.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/__tests__/ai-errors.test.ts` with tests for:
- `AIError` extends `Error` and has `code`, `retryable`, and `userMessage` properties
- Each error code maps to the correct user-facing message:
  - `RATE_LIMITED` -> "Please wait a moment before trying again"
  - `MODEL_ERROR` -> "AI service temporarily unavailable. Try again in a few seconds."
  - `PARSE_ERROR` -> "AI returned an unexpected response. Trying again..."
  - `TIMEOUT` -> "Request took too long. Please try again."
  - `API_KEY_INVALID` -> "AI features are not configured. Contact your administrator."
- `RATE_LIMITED`, `MODEL_ERROR`, `PARSE_ERROR`, `TIMEOUT` are retryable; `API_KEY_INVALID` is not

- [ ] **Step 2: Run test to verify it fails**

Run: `cd goal-dashboard && npx vitest run src/__tests__/ai-errors.test.ts`
Expected: FAIL — file does not exist yet.

- [ ] **Step 3: Implement AIError class**

Create `src/lib/ai-errors.ts`:

```typescript
export type AIErrorCode = 'RATE_LIMITED' | 'MODEL_ERROR' | 'PARSE_ERROR' | 'TIMEOUT' | 'API_KEY_INVALID';

const USER_MESSAGES: Record<AIErrorCode, string> = {
  RATE_LIMITED: 'Please wait a moment before trying again',
  MODEL_ERROR: 'AI service temporarily unavailable. Try again in a few seconds.',
  PARSE_ERROR: 'AI returned an unexpected response. Trying again...',
  TIMEOUT: 'Request took too long. Please try again.',
  API_KEY_INVALID: 'AI features are not configured. Contact your administrator.',
};

const RETRYABLE: Record<AIErrorCode, boolean> = {
  RATE_LIMITED: true,
  MODEL_ERROR: true,
  PARSE_ERROR: true,
  TIMEOUT: true,
  API_KEY_INVALID: false,
};

export class AIError extends Error {
  public readonly userMessage: string;
  public readonly retryable: boolean;

  constructor(
    message: string,
    public readonly code: AIErrorCode,
  ) {
    super(message);
    this.name = 'AIError';
    this.userMessage = USER_MESSAGES[code];
    this.retryable = RETRYABLE[code];
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd goal-dashboard && npx vitest run src/__tests__/ai-errors.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai-errors.ts src/__tests__/ai-errors.test.ts
git commit -m "feat(ai): add AIError class with typed codes and user-friendly messages"
```

---

### Task 2: OpenRouter Client — Core with Retry and JSON Parsing

**Files:**
- Create: `src/lib/openrouter.ts`
- Create: `src/__tests__/openrouter.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/__tests__/openrouter.test.ts`. Mock `global.fetch` in each test. Cover:

1. **Happy path — chat():** Returns `{ content, model, usage }` from a well-formed OpenRouter response.
2. **Happy path — chatJSON\<T\>():** Parses JSON content string into typed object.
3. **Retry on 429:** First call returns 429, second returns 200 — verifies fetch called twice with exponential delay (mock `setTimeout` or use `vi.useFakeTimers`).
4. **Retry on 500:** First call returns 500, second returns 200 — verifies retry.
5. **Exhausted retries:** Three consecutive 500s — throws `AIError` with code `MODEL_ERROR`.
6. **JSON parse failure:** `chatJSON` receives non-JSON content — throws `AIError` with code `PARSE_ERROR`.
7. **Timeout:** Fetch takes longer than `timeoutMs` — throws `AIError` with code `TIMEOUT`. Use `AbortController` signal check.
8. **401 Unauthorized:** Returns 401 — throws `AIError` with code `API_KEY_INVALID`, `retryable: false`, no retry attempted.
9. **Rate limit headers:** When response includes `X-RateLimit-Remaining: 0`, client waits until `X-RateLimit-Reset` before next request.
10. **Logging:** Verify `console.log` called with model, token count, and latency after successful call.
11. **Custom model override:** Passing `model` in options overrides `defaultModel`.
12. **responseFormat json:** Sends `response_format: { type: 'json_object' }` in the request body when `responseFormat: 'json'`.
13. **Missing API key:** Constructing client with empty `apiKey` and calling `chat()` throws `AIError` with code `API_KEY_INVALID` immediately (no fetch call).

- [ ] **Step 2: Run test to verify it fails**

Run: `cd goal-dashboard && npx vitest run src/__tests__/openrouter.test.ts`
Expected: FAIL — file does not exist yet.

- [ ] **Step 3: Implement OpenRouterClient**

Create `src/lib/openrouter.ts`:

```typescript
import { AIError } from './ai-errors';

interface OpenRouterConfig {
  apiKey: string;
  baseUrl: string;
  defaultModel: string;
  maxRetries: number;
  timeoutMs: number;
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: 'json' | 'text';
}

interface OpenRouterResponse {
  content: string;
  model: string;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

class OpenRouterClient {
  private config: OpenRouterConfig;
  private rateLimitResetAt: number = 0;

  constructor(config: OpenRouterConfig) {
    this.config = config;
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<OpenRouterResponse> {
    if (!this.config.apiKey) {
      throw new AIError('OpenRouter API key is not configured', 'API_KEY_INVALID');
    }

    const model = options?.model ?? this.config.defaultModel;
    const startTime = Date.now();

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      // Respect rate limit headers from previous responses
      const now = Date.now();
      if (this.rateLimitResetAt > now) {
        await this.sleep(this.rateLimitResetAt - now);
      }

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

        const body: Record<string, unknown> = {
          model,
          messages,
          ...(options?.temperature !== undefined && { temperature: options.temperature }),
          ...(options?.maxTokens !== undefined && { max_tokens: options.maxTokens }),
          ...(options?.responseFormat === 'json' && {
            response_format: { type: 'json_object' },
          }),
        };

        const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.config.apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://upwhiten.com',
            'X-Title': 'UpWhiten Goal Dashboard',
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        // Track rate limit headers
        const remaining = response.headers.get('X-RateLimit-Remaining');
        const reset = response.headers.get('X-RateLimit-Reset');
        if (remaining === '0' && reset) {
          this.rateLimitResetAt = parseInt(reset, 10) * 1000;
        }

        // Non-retryable: 401
        if (response.status === 401) {
          throw new AIError('Invalid API key', 'API_KEY_INVALID');
        }

        // Retryable: 429 and 5xx
        if (response.status === 429 || response.status >= 500) {
          if (attempt < this.config.maxRetries) {
            const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
            await this.sleep(delay);
            continue;
          }
          throw new AIError(
            `OpenRouter returned ${response.status} after ${this.config.maxRetries + 1} attempts`,
            response.status === 429 ? 'RATE_LIMITED' : 'MODEL_ERROR',
          );
        }

        if (!response.ok) {
          throw new AIError(`OpenRouter returned ${response.status}`, 'MODEL_ERROR');
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content ?? '';
        const usage = data.usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

        const latencyMs = Date.now() - startTime;
        console.log(
          `[OpenRouter] model=${data.model ?? model} tokens=${usage.total_tokens} latency=${latencyMs}ms`,
        );

        return { content, model: data.model ?? model, usage };
      } catch (error) {
        if (error instanceof AIError) throw error;
        if ((error as Error).name === 'AbortError') {
          throw new AIError('Request timed out', 'TIMEOUT');
        }
        if (attempt >= this.config.maxRetries) {
          throw new AIError(
            `OpenRouter request failed: ${(error as Error).message}`,
            'MODEL_ERROR',
          );
        }
        const delay = Math.pow(2, attempt) * 1000;
        await this.sleep(delay);
      }
    }

    throw new AIError('Unexpected: exhausted retries', 'MODEL_ERROR');
  }

  async chatJSON<T>(messages: ChatMessage[], options?: ChatOptions): Promise<T> {
    const response = await this.chat(messages, { ...options, responseFormat: 'json' });
    try {
      return JSON.parse(response.content) as T;
    } catch {
      throw new AIError('Failed to parse AI response as JSON', 'PARSE_ERROR');
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Singleton — only constructed server-side in API routes
export const openrouter = new OpenRouterClient({
  apiKey: process.env.OPENROUTER_API_KEY ?? '',
  baseUrl: 'https://openrouter.ai/api/v1',
  defaultModel: process.env.OPENROUTER_MODEL || 'meta-llama/llama-3-70b-instruct',
  maxRetries: 3,
  timeoutMs: 30_000,
});

export {
  OpenRouterClient,
  type ChatMessage,
  type ChatOptions,
  type OpenRouterResponse,
  type OpenRouterConfig,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd goal-dashboard && npx vitest run src/__tests__/openrouter.test.ts`
Expected: All 13 tests PASS.

- [ ] **Step 5: Run full test suite**

Run: `cd goal-dashboard && npx vitest run`
Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/openrouter.ts src/__tests__/openrouter.test.ts
git commit -m "feat(ai): add OpenRouter client with retry, JSON parsing, timeout, and logging"
```

---

### Task 3: Prompt Templates

**Files:**
- Create: `src/lib/ai-prompts.ts`
- Create: `src/__tests__/ai-prompts.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/__tests__/ai-prompts.test.ts` with tests for each of the six prompt functions:

1. **bookBreakdownPrompt:** Returns array of 2 `ChatMessage`s; first has role `system`, second has role `user`; user message includes the book title; optional description is included when provided and excluded when omitted.
2. **courseBreakdownPrompt:** Same structure; user message includes title; syllabus included when provided.
3. **quizGenerationPrompt:** User message includes `chapterRange` and `material` strings.
4. **quizCheckPrompt:** User message includes JSON-stringified questions and userAnswers.
5. **clearGoalsPrompt:** User message includes task title; system message references Flow Research Collective methodology.
6. **taskSuggestionPrompt:** User message includes weeklyGoal and JSON-stringified existingTasks.

For all templates:
- Verify system message contains "Always respond with valid JSON"
- Verify array length is exactly 2
- Verify no messages have empty content
- Verify roles are `['system', 'user']` in order

- [ ] **Step 2: Run test to verify it fails**

Run: `cd goal-dashboard && npx vitest run src/__tests__/ai-prompts.test.ts`
Expected: FAIL — file does not exist yet.

- [ ] **Step 3: Implement prompt templates**

Create `src/lib/ai-prompts.ts` with all six functions exactly as specified in the design spec:
- `bookBreakdownPrompt(title: string, description?: string): ChatMessage[]`
- `courseBreakdownPrompt(title: string, syllabus?: string): ChatMessage[]`
- `quizGenerationPrompt(material: string, chapterRange: string): ChatMessage[]`
- `quizCheckPrompt(questions: any[], userAnswers: any[]): ChatMessage[]`
- `clearGoalsPrompt(title: string, description?: string): ChatMessage[]`
- `taskSuggestionPrompt(weeklyGoal: string, existingTasks: string[]): ChatMessage[]`

Import `ChatMessage` type from `./openrouter`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd goal-dashboard && npx vitest run src/__tests__/ai-prompts.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai-prompts.ts src/__tests__/ai-prompts.test.ts
git commit -m "feat(ai): add prompt templates for book, course, quiz, goals, and task suggestions"
```

---

### Task 4: AI Rate Limiters — Per-User Limits

**Files:**
- Modify: `src/lib/rate-limit.ts`
- Create: `src/__tests__/ai-rate-limit.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/__tests__/ai-rate-limit.test.ts` with tests for:
1. `aiTrainingLimiter` allows 5 requests per minute, blocks the 6th (keyed by userId string, not IP).
2. `aiGeneralLimiter` allows 10 requests per minute, blocks the 11th.
3. Both limiters track user IDs independently (user-A at limit does not block user-B).
4. Verify the exported limiter instances exist and have a `.check()` method.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd goal-dashboard && npx vitest run src/__tests__/ai-rate-limit.test.ts`
Expected: FAIL — `aiTrainingLimiter` and `aiGeneralLimiter` do not exist yet.

- [ ] **Step 3: Add AI limiters to rate-limit.ts**

Append to `src/lib/rate-limit.ts` after the existing pre-configured limiters:

```typescript
// AI-specific rate limiters (keyed by userId, not IP)
// Training endpoints (book/course breakdown) — lower limit, expensive calls
export const aiTrainingLimiter = rateLimit({ interval: 60_000, limit: 5 });
// General AI endpoints (quiz, decompose, suggest) — moderate limit
export const aiGeneralLimiter = rateLimit({ interval: 60_000, limit: 10 });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd goal-dashboard && npx vitest run src/__tests__/ai-rate-limit.test.ts`
Expected: All 4 tests PASS.

- [ ] **Step 5: Run full test suite** (existing rate-limit tests still pass)

Run: `cd goal-dashboard && npx vitest run`
Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/rate-limit.ts src/__tests__/ai-rate-limit.test.ts
git commit -m "feat(ai): add per-user AI rate limiters for training and general endpoints"
```

---

### Task 5: Environment Variables

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Add OpenRouter env vars**

Append to `.env.example` after the `TOKEN_ENCRYPTION_KEY` section:

```env
# OpenRouter AI (openrouter.ai — get API key from dashboard)
OPENROUTER_API_KEY=""
OPENROUTER_MODEL="meta-llama/llama-3-70b-instruct"
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "feat(ai): add OpenRouter env vars to .env.example"
```

---

### Task 6: API Route Stubs — Training Endpoints

**Files:**
- Create: `src/app/api/training/books/route.ts`
- Create: `src/app/api/training/courses/route.ts`
- Create: `src/app/api/training/quiz/generate/route.ts`
- Create: `src/app/api/training/quiz/check/route.ts`
- Create: `src/__tests__/ai-routes.test.ts`

- [ ] **Step 1: Write failing tests for training routes**

Create `src/__tests__/ai-routes.test.ts`. Mock `@/lib/openrouter` (mock `openrouter.chatJSON`), mock `@/lib/auth-guard` (mock `requireAuth`). Test for each of the four training routes:

1. Returns 401 when not authenticated (`requireAuth` returns error).
2. Returns 429 with `Retry-After: 60` header when rate limited.
3. Returns 400 when required fields are missing (e.g., no `title` for books).
4. Returns 400 when input text exceeds 10,000 character limit.
5. Returns 200 with AI-generated JSON on success (mocked `chatJSON` return).
6. Returns 500 with `userMessage` field when `AIError` is thrown by `chatJSON`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd goal-dashboard && npx vitest run src/__tests__/ai-routes.test.ts`
Expected: FAIL — routes do not exist yet.

- [ ] **Step 3: Implement books route**

Create `src/app/api/training/books/route.ts`:

```typescript
import { NextRequest } from 'next/server';
import { requireAuth, authError } from '@/lib/auth-guard';
import { aiTrainingLimiter } from '@/lib/rate-limit';
import { openrouter } from '@/lib/openrouter';
import { bookBreakdownPrompt } from '@/lib/ai-prompts';
import { AIError } from '@/lib/ai-errors';

const MAX_INPUT_LENGTH = 10_000;

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const limit = aiTrainingLimiter.check(auth.userId);
  if (!limit.success) {
    return Response.json(
      { error: 'Please wait a moment before trying again' },
      { status: 429, headers: { 'Retry-After': '60' } },
    );
  }

  try {
    const { title, description } = await request.json();

    if (!title || typeof title !== 'string') {
      return Response.json({ error: 'title is required' }, { status: 400 });
    }
    if (title.length > MAX_INPUT_LENGTH || (description && description.length > MAX_INPUT_LENGTH)) {
      return Response.json({ error: 'Input exceeds maximum length' }, { status: 400 });
    }

    const result = await openrouter.chatJSON(bookBreakdownPrompt(title, description));
    return Response.json(result);
  } catch (error) {
    if (error instanceof AIError) {
      return Response.json({ error: error.userMessage }, { status: 500 });
    }
    return Response.json({ error: 'An unexpected error occurred' }, { status: 500 });
  }
}
```

- [ ] **Step 4: Implement courses route**

Create `src/app/api/training/courses/route.ts` — same pattern as books, using `courseBreakdownPrompt(title, syllabus)` and `aiTrainingLimiter`. Validate `title` required, `syllabus` optional, both under 10,000 chars.

- [ ] **Step 5: Implement quiz generate route**

Create `src/app/api/training/quiz/generate/route.ts` — uses `quizGenerationPrompt(material, chapterRange)` and `aiGeneralLimiter`. Validate both `material` (string, required, under 10,000 chars) and `chapterRange` (string, required).

- [ ] **Step 6: Implement quiz check route**

Create `src/app/api/training/quiz/check/route.ts` — uses `quizCheckPrompt(questions, userAnswers)` and `aiGeneralLimiter`. Validate both `questions` (array, required) and `userAnswers` (array, required).

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd goal-dashboard && npx vitest run src/__tests__/ai-routes.test.ts`
Expected: All training route tests PASS.

- [ ] **Step 8: Commit**

```bash
git add src/app/api/training/ src/__tests__/ai-routes.test.ts
git commit -m "feat(ai): add training API route stubs for books, courses, and quizzes"
```

---

### Task 7: API Route Stubs — Power-Down Decompose and Task Suggest

**Files:**
- Create: `src/app/api/powerdown/decompose/route.ts`
- Create: `src/app/api/tasks/ai-suggest/route.ts`
- Modify: `src/__tests__/ai-routes.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `src/__tests__/ai-routes.test.ts` tests for both routes, same six-check pattern as Task 6:
1. Returns 401 when not authenticated.
2. Returns 429 with `Retry-After` header when rate limited.
3. Returns 400 when required fields missing (`title` for decompose; `weeklyGoal` for suggest).
4. Returns 400 when input exceeds 10,000 chars.
5. Returns 200 with AI-generated JSON on success.
6. Returns 500 with `userMessage` when `AIError` is thrown.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd goal-dashboard && npx vitest run src/__tests__/ai-routes.test.ts`
Expected: FAIL — new routes do not exist yet.

- [ ] **Step 3: Implement decompose route**

Create `src/app/api/powerdown/decompose/route.ts`:

```typescript
import { NextRequest } from 'next/server';
import { requireAuth, authError } from '@/lib/auth-guard';
import { aiGeneralLimiter } from '@/lib/rate-limit';
import { openrouter } from '@/lib/openrouter';
import { clearGoalsPrompt } from '@/lib/ai-prompts';
import { AIError } from '@/lib/ai-errors';

const MAX_INPUT_LENGTH = 10_000;

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const limit = aiGeneralLimiter.check(auth.userId);
  if (!limit.success) {
    return Response.json(
      { error: 'Please wait a moment before trying again' },
      { status: 429, headers: { 'Retry-After': '60' } },
    );
  }

  try {
    const { title, description } = await request.json();

    if (!title || typeof title !== 'string') {
      return Response.json({ error: 'title is required' }, { status: 400 });
    }
    if (title.length > MAX_INPUT_LENGTH || (description && description.length > MAX_INPUT_LENGTH)) {
      return Response.json({ error: 'Input exceeds maximum length' }, { status: 400 });
    }

    const result = await openrouter.chatJSON(clearGoalsPrompt(title, description));
    return Response.json(result);
  } catch (error) {
    if (error instanceof AIError) {
      return Response.json({ error: error.userMessage }, { status: 500 });
    }
    return Response.json({ error: 'An unexpected error occurred' }, { status: 500 });
  }
}
```

- [ ] **Step 4: Implement task suggest route**

Create `src/app/api/tasks/ai-suggest/route.ts` — uses `taskSuggestionPrompt(weeklyGoal, existingTasks)` and `aiGeneralLimiter`. Validate `weeklyGoal` (string, required, under 10,000 chars), `existingTasks` (array, defaults to `[]` when omitted).

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd goal-dashboard && npx vitest run src/__tests__/ai-routes.test.ts`
Expected: All route tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/powerdown/decompose/ src/app/api/tasks/ai-suggest/ src/__tests__/ai-routes.test.ts
git commit -m "feat(ai): add decompose and task suggestion API route stubs"
```

---

### Task 8: Security Verification

**Files:**
- Create: `src/__tests__/ai-security.test.ts`

- [ ] **Step 1: Write security tests**

Create `src/__tests__/ai-security.test.ts` with tests for:

1. **API key not in client bundle:** Import `openrouter.ts` and verify it reads from `process.env.OPENROUTER_API_KEY` (not hardcoded). Check the singleton is created with `process.env` reference.
2. **Input length enforcement:** For each of the six routes, send a body with a 10,001-character string — verify 400 response.
3. **Auth enforcement:** For each of the six routes, call without a session — verify 401 response.
4. **Missing API key guard:** Construct `OpenRouterClient` with empty `apiKey` — verify `AIError` with code `API_KEY_INVALID` is thrown immediately (before any fetch).
5. **Prompt structure integrity:** For each prompt template, verify user input is always in the `user` role message, never concatenated into the `system` role message (prevents prompt injection into system instructions).

- [ ] **Step 2: Run tests**

Run: `cd goal-dashboard && npx vitest run src/__tests__/ai-security.test.ts`
Expected: All tests PASS.

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/ai-security.test.ts
git commit -m "test(ai): add security tests for API key protection, input validation, and auth"
```

---

### Task 9: Final Verification

- [ ] **Step 1: Run full test suite**

Run: `cd goal-dashboard && npx vitest run`
Expected: All tests PASS (existing + new).

- [ ] **Step 2: Run build**

Run: `cd goal-dashboard && npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 3: Verify API key not in client bundle**

Run: `cd goal-dashboard && grep -r "OPENROUTER_API_KEY" .next/static/ || echo "PASS: API key not in client bundle"`
Expected: "PASS: API key not in client bundle"

- [ ] **Step 4: Commit any fixes**

If any tests or build issues were found and fixed, commit the fixes.
