# OpenRouter AI Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a shared OpenRouter API client with retry, structured JSON parsing, prompt templates for 6 use cases, rate limiting, and stub API routes — the AI foundation for Training, Power Down, and Task Creation features.

**Architecture:** Server-side only. A singleton `OpenRouterClient` handles chat completions with retry/backoff. Prompt templates are pure functions returning `ChatMessage[]`. Each AI feature gets its own API route that uses the client + a template. Rate limiters are per-user with lower thresholds than regular endpoints.

**Tech Stack:** Next.js 14 / TypeScript / Vitest / OpenRouter API (REST)

**Spec:** `docs/superpowers/specs/2026-03-24-openrouter-ai-integration-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/lib/openrouter.ts` | Create | OpenRouter API client with retry, JSON parsing, error handling |
| `src/lib/ai-prompts.ts` | Create | 6 prompt templates (book, course, quiz gen, quiz check, clear goals, task suggest) |
| `src/lib/rate-limit.ts` | Modify | Add per-user AI rate limiters |
| `src/app/api/training/books/route.ts` | Create | Stub: book breakdown endpoint |
| `src/app/api/training/courses/route.ts` | Create | Stub: course breakdown endpoint |
| `src/app/api/training/quiz/generate/route.ts` | Create | Stub: quiz generation endpoint |
| `src/app/api/training/quiz/check/route.ts` | Create | Stub: quiz grading endpoint |
| `src/app/api/powerdown/decompose/route.ts` | Create | Stub: clear goals decomposition endpoint |
| `src/app/api/tasks/ai-suggest/route.ts` | Create | Stub: task suggestion from weekly goals |
| `src/__tests__/openrouter.test.ts` | Create | Client tests (retry, JSON parse, errors) |
| `src/__tests__/ai-prompts.test.ts` | Create | Prompt template structure tests |
| `.env.example` | Modify | Add OPENROUTER_API_KEY and OPENROUTER_MODEL |

---

### Task 1: OpenRouter Client (TDD)

**Files:**
- Create: `src/lib/openrouter.ts`
- Create: `src/__tests__/openrouter.test.ts`

- [ ] **Step 1: Write failing tests**

Test cases:
- `chat()` sends correct request to OpenRouter API
- `chat()` retries on 429 with exponential backoff (1s, 2s, 4s)
- `chat()` retries on 500 errors
- `chat()` does NOT retry on 400 errors
- `chatJSON<T>()` parses valid JSON from response content
- `chatJSON<T>()` throws `AIError` with `code: 'PARSE_ERROR'` on invalid JSON
- `chat()` throws `AIError` with `code: 'TIMEOUT'` after timeout
- `chat()` throws `AIError` with `code: 'API_KEY_INVALID'` on 401

- [ ] **Step 2: Run tests (fail)**

Run: `npx vitest run src/__tests__/openrouter.test.ts`

- [ ] **Step 3: Implement OpenRouterClient**

```typescript
// src/lib/openrouter.ts
export class AIError extends Error {
  constructor(message: string, public code: 'RATE_LIMITED' | 'MODEL_ERROR' | 'PARSE_ERROR' | 'TIMEOUT' | 'API_KEY_INVALID', public retryable: boolean) {
    super(message);
  }
}

interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: string; }

class OpenRouterClient {
  constructor(private config: { apiKey: string; baseUrl: string; defaultModel: string; maxRetries: number; timeoutMs: number }) {}

  async chat(messages: ChatMessage[], options?: { model?: string; temperature?: number; maxTokens?: number }): Promise<{ content: string; model: string; usage: any }> {
    // POST to baseUrl/chat/completions with retry
  }

  async chatJSON<T>(messages: ChatMessage[], options?: any): Promise<T> {
    const response = await this.chat(messages, options);
    try { return JSON.parse(response.content); }
    catch { throw new AIError('Failed to parse AI response as JSON', 'PARSE_ERROR', true); }
  }
}

export const openrouter = new OpenRouterClient({
  apiKey: process.env.OPENROUTER_API_KEY!,
  baseUrl: 'https://openrouter.ai/api/v1',
  defaultModel: process.env.OPENROUTER_MODEL || 'meta-llama/llama-3-70b-instruct',
  maxRetries: 3,
  timeoutMs: 30000,
});
```

- [ ] **Step 4: Run tests (pass)**
- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add OpenRouter API client with retry and JSON parsing"
```

---

### Task 2: Prompt Templates (TDD)

**Files:**
- Create: `src/lib/ai-prompts.ts`
- Create: `src/__tests__/ai-prompts.test.ts`

- [ ] **Step 1: Write failing tests**

Test each template returns correct message array structure:
- `bookBreakdownPrompt(title)` → system + user messages, user contains title
- `courseBreakdownPrompt(title, syllabus?)` → includes syllabus when provided
- `quizGenerationPrompt(material, range)` → includes material and chapter range
- `quizCheckPrompt(questions, answers)` → includes both arrays
- `clearGoalsPrompt(title, description?)` → includes task details
- `taskSuggestionPrompt(goal, existing)` → includes existing tasks

- [ ] **Step 2: Run tests (fail)**
- [ ] **Step 3: Implement 6 prompt templates** — each returns `ChatMessage[]`
- [ ] **Step 4: Run tests (pass)**
- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add 6 AI prompt templates for training, power-down, and task creation"
```

---

### Task 3: AI Rate Limiters

**Files:**
- Modify: `src/lib/rate-limit.ts`

- [ ] **Step 1: Add per-user AI rate limiters**

```typescript
// Per-user rate limiting for AI endpoints
export const aiBookLimiter = createRateLimiter({ windowMs: 60000, maxRequests: 5 });
export const aiQuizLimiter = createRateLimiter({ windowMs: 60000, maxRequests: 10 });
export const aiDecomposeLimiter = createRateLimiter({ windowMs: 60000, maxRequests: 10 });
export const aiSuggestLimiter = createRateLimiter({ windowMs: 60000, maxRequests: 10 });
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/rate-limit.ts && git commit -m "feat: add per-user AI rate limiters"
```

---

### Task 4: Stub API Routes

**Files:**
- Create 6 route files

- [ ] **Step 1: Create stub routes**

Each route: auth check, rate limit, validate input, call `openrouter.chatJSON()` with the appropriate prompt template, return structured response.

Routes:
- `POST /api/training/books` — book breakdown
- `POST /api/training/courses` — course breakdown
- `POST /api/training/quiz/generate` — quiz generation
- `POST /api/training/quiz/check` — quiz grading
- `POST /api/powerdown/decompose` — clear goals
- `POST /api/tasks/ai-suggest` — task suggestions

Each validates input length (max 10,000 chars), uses auth guard, applies rate limiter.

- [ ] **Step 2: Run tests**
- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: add 6 AI-powered API route stubs using OpenRouter"
```

---

### Task 5: Environment + Security

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Add env vars**

```env
OPENROUTER_API_KEY=sk-or-your-key-here
OPENROUTER_MODEL=meta-llama/llama-3-70b-instruct
```

- [ ] **Step 2: Verify API key not in client bundle**

Run: `npm run build` and check `.next/static/` for any reference to `OPENROUTER`.

- [ ] **Step 3: Commit**

```bash
git add .env.example && git commit -m "docs: add OpenRouter env vars to .env.example"
```

---

### Task 6: Final Verification

- [ ] **Step 1: Run all tests** — `npx vitest run`
- [ ] **Step 2: Run build** — `npm run build`
- [ ] **Step 3: Manual test** — with valid API key, call `/api/powerdown/decompose` with a task title and verify AI response
- [ ] **Step 4: Commit any fixes**
