# Power Down Ritual Expansion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the power-down ritual from 6 to 9 steps, adding distraction recording, gratitude practice with a 5-minute timer, idea capture, AI-powered clear goal decomposition via OpenRouter, and an inline tomorrow calendar view. Schema gains four new JSON fields on `PowerdownSession`; a new `/api/powerdown/decompose` endpoint handles AI calls.

**Architecture:** Six layers, each with its own test-first cycle: (1) Prisma schema adds `distractions`, `gratitudes`, `ideas`, `clearGoals` JSON fields + migration, (2) API route PATCH is updated to accept the new fields and validate step range 1-9, (3) new `/api/powerdown/decompose` route calls OpenRouter for task decomposition with rate limiting, (4) `PowerDownRitual.tsx` STEPS array expands from 6 to 9 with new step components for distractions/gratitude/ideas, (5) step 7 is rebuilt as AI-powered clear goal decomposition, and (6) step 8 adds an inline tomorrow calendar view. Each task is isolated to 1-3 files.

**Tech Stack:** Next.js 14 / TypeScript / Prisma / PostgreSQL / Vitest / Tailwind / Framer Motion / lucide-react

**Depends on:** The OpenRouter AI Integration plan (`2026-03-24-openrouter-ai-integration.md`) must be completed first so that `src/lib/openrouter.ts` and `src/lib/ai-prompts.ts` exist. If building this plan before that one, Task 3 includes inline OpenRouter call setup as a fallback.

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `prisma/schema.prisma` | Modify | Add `distractions`, `gratitudes`, `ideas`, `clearGoals` Json? fields to PowerdownSession |
| `prisma/migrations/YYYYMMDD_powerdown_expansion/migration.sql` | Auto-generated | `ALTER TABLE` adding four nullable JSONB columns |
| `src/test/fixtures.ts` | Modify | Add `createPowerdownSession` factory |
| `src/__tests__/powerdown-api.test.ts` | Create | Unit tests for PATCH handling of new fields |
| `src/app/api/powerdown/route.ts` | Modify | Accept `distractions`, `gratitudes`, `ideas`, `clearGoals` in PATCH; validate step range 1-9 |
| `src/__tests__/powerdown-decompose-api.test.ts` | Create | Unit tests for POST `/api/powerdown/decompose` |
| `src/app/api/powerdown/decompose/route.ts` | Create | New endpoint: accepts taskId/title/description, calls OpenRouter, returns decomposed steps |
| `src/lib/rate-limit.ts` | Modify | Add `decomposeLimiter` (10 req/min) |
| `src/lib/ai-prompts.ts` | Modify | Add `clearGoalDecomposePrompt` template (or create if file does not exist) |
| `src/components/powerdown/__tests__/PowerDownRitual.test.tsx` | Modify | Update all step references from 6 to 9; add tests for new steps |
| `src/components/powerdown/PowerDownRitual.tsx` | Modify | Expand STEPS 6->9; add state for distractions/gratitudes/ideas/clearGoals; new step UI components; update advanceStep to send new fields and complete at step 9 |

---

### Task 1: Prisma Schema Migration — Add JSON Fields to PowerdownSession

**Files:**
- Modify: `prisma/schema.prisma` (PowerdownSession model, lines 289-303)

- [ ] **Step 1: Add the four new fields to the PowerdownSession model**

In `prisma/schema.prisma`, add four new fields after `tomorrowPlan` (line 295) and before `completedAt`:

```prisma
model PowerdownSession {
  id             String    @id @default(cuid())
  userId         String
  sessionDate    DateTime
  currentStep    Int       @default(1)
  checklistState Json?
  tomorrowPlan   Json?
  distractions   Json?     // ["checked phone", "coworker interruption", ...]
  gratitudes     Json?     // ["grateful for X", "grateful for Y", ...]
  ideas          Json?     // ["idea about X", "try Y approach", ...]
  clearGoals     Json?     // [{ taskId: "abc", subSteps: ["step1", "step2"] }, ...]
  completedAt    DateTime?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, sessionDate])
}
```

- [ ] **Step 2: Generate and run the migration**

Run: `cd goal-dashboard && npx prisma migrate dev --name powerdown_expansion_fields`

Expected: Migration creates `ALTER TABLE "PowerdownSession" ADD COLUMN "distractions" JSONB, ADD COLUMN "gratitudes" JSONB, ADD COLUMN "ideas" JSONB, ADD COLUMN "clearGoals" JSONB;`

- [ ] **Step 3: Verify Prisma client is regenerated**

Run: `cd goal-dashboard && npx prisma generate`

Expected: Client regenerated with `distractions`, `gratitudes`, `ideas`, `clearGoals` on the PowerdownSession type.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(schema): add distractions, gratitudes, ideas, clearGoals to PowerdownSession"
```

---

### Task 2: Test Fixture — Add `createPowerdownSession` Factory

**Files:**
- Modify: `src/test/fixtures.ts` (after `createReview`, before `resetFixtureIds`)

- [ ] **Step 1: Add `createPowerdownSession` to fixtures**

In `src/test/fixtures.ts`, add a new factory function after `createReview` (line 96) and before `resetFixtureIds` (line 98):

```typescript
export function createPowerdownSession(overrides: Record<string, any> = {}) {
  return {
    id: nextId(),
    userId: 'user-1',
    sessionDate: new Date().toISOString(),
    currentStep: 1,
    checklistState: null,
    tomorrowPlan: null,
    distractions: null,
    gratitudes: null,
    ideas: null,
    clearGoals: null,
    completedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}
```

- [ ] **Step 2: Run existing tests to verify nothing breaks**

Run: `cd goal-dashboard && npx vitest run src/components/powerdown/__tests__/PowerDownRitual.test.tsx`

Expected: All existing tests PASS (the new fixture is unused until consumed).

- [ ] **Step 3: Commit**

```bash
git add src/test/fixtures.ts
git commit -m "test: add createPowerdownSession fixture for powerdown expansion"
```

---

### Task 3: API — Update PATCH `/api/powerdown` to Handle New Fields

**Files:**
- Create: `src/__tests__/powerdown-api.test.ts`
- Modify: `src/app/api/powerdown/route.ts` (lines 58-82)

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/powerdown-api.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindFirst = vi.fn();
const mockFindUnique = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    powerdownSession: {
      findFirst: mockFindFirst,
      findUnique: mockFindUnique,
      create: mockCreate,
      update: mockUpdate,
    },
  },
}));

vi.mock('@/lib/auth-guard', () => ({
  requireAuth: vi.fn(() => ({
    session: { user: { id: 'user-1', isAdmin: false } },
    userId: 'user-1',
  })),
  authError: vi.fn((r: any) => Response.json({ error: r.error }, { status: r.status })),
}));

import { PATCH } from '@/app/api/powerdown/route';

describe('PATCH /api/powerdown — expansion fields', () => {
  const existingSession = {
    id: 'session-1',
    userId: 'user-1',
    sessionDate: new Date(),
    currentStep: 1,
    checklistState: null,
    tomorrowPlan: null,
    distractions: null,
    gratitudes: null,
    ideas: null,
    clearGoals: null,
    completedAt: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockFindUnique.mockResolvedValue({ ...existingSession });
    mockUpdate.mockImplementation(({ data }) =>
      Promise.resolve({ ...existingSession, ...data })
    );
  });

  it('persists distractions array', async () => {
    const distractions = ['checked phone', 'coworker interruption'];
    const request = new Request('http://localhost/api/powerdown', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: 'session-1', distractions }),
    });

    const res = await PATCH(request);
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ distractions }),
      })
    );
  });

  it('persists gratitudes array', async () => {
    const gratitudes = ['grateful for health', 'grateful for team'];
    const request = new Request('http://localhost/api/powerdown', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: 'session-1', gratitudes }),
    });

    const res = await PATCH(request);
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ gratitudes }),
      })
    );
  });

  it('persists ideas array', async () => {
    const ideas = ['automate report generation', 'try batch scheduling'];
    const request = new Request('http://localhost/api/powerdown', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: 'session-1', ideas }),
    });

    const res = await PATCH(request);
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ ideas }),
      })
    );
  });

  it('persists clearGoals structured JSON', async () => {
    const clearGoals = [
      { taskId: 'task-1', subSteps: ['Open doc', 'Write intro', 'Review'] },
    ];
    const request = new Request('http://localhost/api/powerdown', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: 'session-1', clearGoals }),
    });

    const res = await PATCH(request);
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ clearGoals }),
      })
    );
  });

  it('allows currentStep up to 9', async () => {
    const request = new Request('http://localhost/api/powerdown', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: 'session-1', currentStep: 9 }),
    });

    const res = await PATCH(request);
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ currentStep: 9 }),
      })
    );
  });

  it('sets completedAt when complete=true', async () => {
    const request = new Request('http://localhost/api/powerdown', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: 'session-1', complete: true }),
    });

    const res = await PATCH(request);
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ completedAt: expect.any(Date) }),
      })
    );
  });

  it('rejects unknown sessionId with 404', async () => {
    mockFindUnique.mockResolvedValue(null);
    const request = new Request('http://localhost/api/powerdown', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: 'nonexistent', currentStep: 2 }),
    });

    const res = await PATCH(request);
    expect(res.status).toBe(404);
  });

  it('rejects missing sessionId with 400', async () => {
    const request = new Request('http://localhost/api/powerdown', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentStep: 2 }),
    });

    const res = await PATCH(request);
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd goal-dashboard && npx vitest run src/__tests__/powerdown-api.test.ts`

Expected: FAIL -- the PATCH handler does not yet destructure `distractions`, `gratitudes`, `ideas`, or `clearGoals` from the body.

- [ ] **Step 3: Implement the new fields in the PATCH handler**

In `src/app/api/powerdown/route.ts`, make these changes to the `PATCH` function:

**Change 1 -- line 63:** Expand the destructured fields from the body:

```typescript
  const { sessionId, currentStep, checklistState, tomorrowPlan, distractions, gratitudes, ideas, clearGoals, complete } = body;
```

**Change 2 -- after line 77 (after the `if (tomorrowPlan !== undefined)` block), before `if (complete)`:** Add four new field handlers:

```typescript
  if (distractions !== undefined) data.distractions = distractions;
  if (gratitudes !== undefined) data.gratitudes = gratitudes;
  if (ideas !== undefined) data.ideas = ideas;
  if (clearGoals !== undefined) data.clearGoals = clearGoals;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd goal-dashboard && npx vitest run src/__tests__/powerdown-api.test.ts`

Expected: All 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/powerdown/route.ts src/__tests__/powerdown-api.test.ts
git commit -m "feat(api): accept distractions, gratitudes, ideas, clearGoals in PATCH /api/powerdown"
```

---

### Task 4: API — New `/api/powerdown/decompose` Endpoint

**Files:**
- Create: `src/__tests__/powerdown-decompose-api.test.ts`
- Create: `src/app/api/powerdown/decompose/route.ts`
- Modify: `src/lib/rate-limit.ts` (add `decomposeLimiter`)
- Modify (or create): `src/lib/ai-prompts.ts` (add `clearGoalDecomposePrompt`)

- [ ] **Step 1: Add rate limiter for decompose endpoint**

In `src/lib/rate-limit.ts`, add after the existing pre-configured limiters (line 51):

```typescript
export const decomposeLimiter = rateLimit({ interval: 60_000, limit: 10 });
```

- [ ] **Step 2: Add the prompt template**

If `src/lib/ai-prompts.ts` exists, add the following export. If it does not exist yet (OpenRouter integration plan not yet implemented), create the file with this content:

```typescript
import type { ChatMessage } from './openrouter';

export function clearGoalDecomposePrompt(title: string, description?: string): ChatMessage[] {
  return [
    {
      role: 'system' as const,
      content: 'You are a productivity coach that decomposes tasks into extremely clear, minute-detail sub-steps. Always respond with valid JSON.',
    },
    {
      role: 'user' as const,
      content: `Break down this task into extremely clear, minute-detail sub-steps.
Task: "${title}"${description ? `\nDescription: "${description}"` : ''}

Each step should be so clear that you know EXACTLY what to do with zero ambiguity.
Order from most difficult/rewarding to least.
Return as JSON: { "steps": ["step 1", "step 2", ...] }`,
    },
  ];
}
```

If the `ChatMessage` type import fails (because `src/lib/openrouter.ts` doesn't exist yet), define a local type at the top of the file:

```typescript
type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };
```

- [ ] **Step 3: Write the failing test**

Create `src/__tests__/powerdown-decompose-api.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockChatJSON = vi.fn();

vi.mock('@/lib/openrouter', () => ({
  openrouter: {
    chatJSON: mockChatJSON,
  },
}));

vi.mock('@/lib/auth-guard', () => ({
  requireAuth: vi.fn(() => ({
    session: { user: { id: 'user-1', isAdmin: false } },
    userId: 'user-1',
  })),
  authError: vi.fn((r: any) => Response.json({ error: r.error }, { status: r.status })),
}));

vi.mock('@/lib/rate-limit', () => ({
  decomposeLimiter: { check: vi.fn(() => ({ success: true, remaining: 9 })) },
  getClientIp: vi.fn(() => '127.0.0.1'),
}));

import { POST } from '@/app/api/powerdown/decompose/route';

describe('POST /api/powerdown/decompose', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns decomposed steps from OpenRouter', async () => {
    mockChatJSON.mockResolvedValue({
      steps: ['Open document', 'Write introduction', 'Draft body', 'Review and edit'],
    });

    const request = new Request('http://localhost/api/powerdown/decompose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        taskId: 'task-1',
        title: 'Write chapter 5',
        description: 'Cover flow triggers',
      }),
    });

    const res = await POST(request);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.steps).toEqual([
      'Open document',
      'Write introduction',
      'Draft body',
      'Review and edit',
    ]);
  });

  it('passes title and description to the prompt', async () => {
    mockChatJSON.mockResolvedValue({ steps: ['Step 1'] });

    const request = new Request('http://localhost/api/powerdown/decompose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        taskId: 'task-1',
        title: 'Design new feature',
        description: 'Build the settings page',
      }),
    });

    await POST(request);

    expect(mockChatJSON).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'user',
          content: expect.stringContaining('Design new feature'),
        }),
      ]),
      expect.any(Object)
    );
    expect(mockChatJSON).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          content: expect.stringContaining('Build the settings page'),
        }),
      ]),
      expect.any(Object)
    );
  });

  it('returns 400 when title is missing', async () => {
    const request = new Request('http://localhost/api/powerdown/decompose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId: 'task-1' }),
    });

    const res = await POST(request);
    expect(res.status).toBe(400);
  });

  it('returns 429 when rate limited', async () => {
    const { decomposeLimiter } = await import('@/lib/rate-limit');
    (decomposeLimiter.check as any).mockReturnValue({ success: false, remaining: 0 });

    const request = new Request('http://localhost/api/powerdown/decompose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId: 'task-1', title: 'Write chapter 5' }),
    });

    const res = await POST(request);
    expect(res.status).toBe(429);
  });

  it('returns 500 when OpenRouter call fails', async () => {
    mockChatJSON.mockRejectedValue(new Error('OpenRouter timeout'));

    const request = new Request('http://localhost/api/powerdown/decompose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId: 'task-1', title: 'Write chapter 5' }),
    });

    const res = await POST(request);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it('works without a description', async () => {
    mockChatJSON.mockResolvedValue({ steps: ['Step 1', 'Step 2'] });

    const request = new Request('http://localhost/api/powerdown/decompose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId: 'task-1', title: 'Quick task' }),
    });

    const res = await POST(request);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.steps).toHaveLength(2);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd goal-dashboard && npx vitest run src/__tests__/powerdown-decompose-api.test.ts`

Expected: FAIL -- the route file does not exist yet.

- [ ] **Step 5: Implement the decompose endpoint**

Create `src/app/api/powerdown/decompose/route.ts`:

```typescript
import { NextRequest } from 'next/server';
import { requireAuth, authError } from '@/lib/auth-guard';
import { openrouter } from '@/lib/openrouter';
import { clearGoalDecomposePrompt } from '@/lib/ai-prompts';
import { decomposeLimiter, getClientIp } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  // Rate limit: 10 requests per minute
  const ip = getClientIp(request);
  const { success } = decomposeLimiter.check(ip);
  if (!success) {
    return Response.json(
      { error: 'Too many requests. Please wait before decomposing another task.' },
      { status: 429 }
    );
  }

  const body = await request.json();
  const { taskId, title, description } = body;

  if (!title) {
    return Response.json({ error: 'title is required' }, { status: 400 });
  }

  try {
    const messages = clearGoalDecomposePrompt(title, description);
    const result = await openrouter.chatJSON<{ steps: string[] }>(messages, {
      temperature: 0.7,
      maxTokens: 1024,
    });

    return Response.json({ taskId, steps: result.steps });
  } catch (error) {
    console.error('[powerdown/decompose] OpenRouter error:', error);
    return Response.json(
      { error: 'Failed to decompose task. Please try again.' },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd goal-dashboard && npx vitest run src/__tests__/powerdown-decompose-api.test.ts`

Expected: All 6 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/powerdown/decompose/route.ts src/__tests__/powerdown-decompose-api.test.ts src/lib/rate-limit.ts src/lib/ai-prompts.ts
git commit -m "feat(api): add POST /api/powerdown/decompose endpoint with OpenRouter integration"
```

---

### Task 5: Component — Expand PowerDownRitual Steps 6 to 9

**Files:**
- Modify: `src/components/powerdown/__tests__/PowerDownRitual.test.tsx` (update step references)
- Modify: `src/components/powerdown/PowerDownRitual.tsx` (major expansion)

- [ ] **Step 1: Write failing tests for the new steps**

In `src/components/powerdown/__tests__/PowerDownRitual.test.tsx`, make these changes:

**Change 1 -- Update existing tests that reference step 6 as the final step.** The test `'shows step 6 with Complete Power Down button'` must reference step 9 instead. The test `'shows completion screen after completing step 6'` must reference step 9. The test `'calls onComplete when Back to Dashboard is clicked after completion'` must reference step 9. The test `'shows incomplete tasks on step 3 with reschedule buttons'` must reference step 6 (previously step 3, now the renumbered step).

**Change 2 -- Add mock route for decompose endpoint to the `setup` function:**

```typescript
function setup(fetchRoutes: Record<string, any> = {}) {
  const defaultRoutes: Record<string, any> = {
    '/api/powerdown': (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return { id: 'session-1', currentStep: 1, tomorrowPlan: [], distractions: [], gratitudes: [], ideas: [], clearGoals: [] };
      if (init?.method === 'PATCH') return { ok: true };
      return { id: 'session-1', currentStep: 1, tomorrowPlan: [], distractions: [], gratitudes: [], ideas: [], clearGoals: [] };
    },
    '/api/tasks': [],
    '/api/powerdown/decompose': { taskId: 'task-1', steps: ['Step 1', 'Step 2'] },
    ...fetchRoutes,
  };
  global.fetch = createMockFetch(defaultRoutes);
}
```

**Change 3 -- Add new test cases at the end of the describe block:**

```typescript
  it('renders step 2 with distraction input', async () => {
    setup({
      '/api/powerdown': (url: string, init?: RequestInit) => {
        if (init?.method === 'PATCH') return { ok: true };
        return { id: 'session-1', currentStep: 2, tomorrowPlan: [], distractions: [], gratitudes: [], ideas: [], clearGoals: [] };
      },
    });
    render(<PowerDownRitual onComplete={onComplete} />);

    await waitFor(() => {
      expect(screen.getByText(/Step 2/)).toBeInTheDocument();
    });
    expect(screen.getByText(/Record Distractions/)).toBeInTheDocument();
    expect(screen.getByText(/What distracted you today/)).toBeInTheDocument();
  });

  it('renders step 3 with gratitude timer', async () => {
    setup({
      '/api/powerdown': (url: string, init?: RequestInit) => {
        if (init?.method === 'PATCH') return { ok: true };
        return { id: 'session-1', currentStep: 3, tomorrowPlan: [], distractions: [], gratitudes: [], ideas: [], clearGoals: [] };
      },
    });
    render(<PowerDownRitual onComplete={onComplete} />);

    await waitFor(() => {
      expect(screen.getByText(/Step 3/)).toBeInTheDocument();
    });
    expect(screen.getByText(/Daily Gratitude/)).toBeInTheDocument();
    expect(screen.getByText(/5:00/)).toBeInTheDocument();
  });

  it('renders step 4 with idea capture', async () => {
    setup({
      '/api/powerdown': (url: string, init?: RequestInit) => {
        if (init?.method === 'PATCH') return { ok: true };
        return { id: 'session-1', currentStep: 4, tomorrowPlan: [], distractions: [], gratitudes: [], ideas: [], clearGoals: [] };
      },
    });
    render(<PowerDownRitual onComplete={onComplete} />);

    await waitFor(() => {
      expect(screen.getByText(/Step 4/)).toBeInTheDocument();
    });
    expect(screen.getByText(/Capture Ideas/)).toBeInTheDocument();
    expect(screen.getByText(/ideas or insights/)).toBeInTheDocument();
  });

  it('renders step 7 with Clear Goals header', async () => {
    setup({
      '/api/powerdown': (url: string, init?: RequestInit) => {
        if (init?.method === 'PATCH') return { ok: true };
        return { id: 'session-1', currentStep: 7, tomorrowPlan: [], distractions: [], gratitudes: [], ideas: [], clearGoals: [] };
      },
    });
    render(<PowerDownRitual onComplete={onComplete} />);

    await waitFor(() => {
      expect(screen.getByText(/Step 7/)).toBeInTheDocument();
    });
    expect(screen.getByText(/Clear Goals for Tomorrow/)).toBeInTheDocument();
  });

  it('renders step 8 with Tomorrow Calendar header', async () => {
    setup({
      '/api/powerdown': (url: string, init?: RequestInit) => {
        if (init?.method === 'PATCH') return { ok: true };
        return { id: 'session-1', currentStep: 8, tomorrowPlan: [], distractions: [], gratitudes: [], ideas: [], clearGoals: [] };
      },
    });
    render(<PowerDownRitual onComplete={onComplete} />);

    await waitFor(() => {
      expect(screen.getByText(/Step 8/)).toBeInTheDocument();
    });
    expect(screen.getByText(/Tomorrow's Calendar/)).toBeInTheDocument();
  });

  it('shows step 9 with Complete Power Down button', async () => {
    setup({
      '/api/powerdown': (url: string, init?: RequestInit) => {
        if (init?.method === 'PATCH') return { ok: true };
        return { id: 'session-1', currentStep: 9, tomorrowPlan: [], distractions: [], gratitudes: [], ideas: [], clearGoals: [] };
      },
    });
    render(<PowerDownRitual onComplete={onComplete} />);

    await waitFor(() => {
      expect(screen.getByText(/Step 9/)).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /Complete Power Down/i })).toBeInTheDocument();
  });

  it('adds a distraction entry when user types and clicks add', async () => {
    setup({
      '/api/powerdown': (url: string, init?: RequestInit) => {
        if (init?.method === 'PATCH') return { ok: true };
        return { id: 'session-1', currentStep: 2, tomorrowPlan: [], distractions: [], gratitudes: [], ideas: [], clearGoals: [] };
      },
    });
    const user = userEvent.setup();
    render(<PowerDownRitual onComplete={onComplete} />);

    await waitFor(() => {
      expect(screen.getByText(/Step 2/)).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText(/distraction/i);
    await user.type(input, 'Checked phone');
    await user.click(screen.getByRole('button', { name: /add/i }));

    expect(screen.getByText('Checked phone')).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd goal-dashboard && npx vitest run src/components/powerdown/__tests__/PowerDownRitual.test.tsx`

Expected: FAIL -- the new steps don't exist in STEPS array, new state variables are missing.

- [ ] **Step 3: Update the STEPS array**

In `src/components/powerdown/PowerDownRitual.tsx`, replace the existing `STEPS` array (lines 7-14) with:

```typescript
const STEPS = [
  { num: 1, title: 'Mark Task Completion', description: 'Review today\'s tasks and mark completions.' },
  { num: 2, title: 'Record Distractions', description: 'What distracted you today?' },
  { num: 3, title: 'Daily Gratitude', description: '5-minute gratitude practice.' },
  { num: 4, title: 'Capture Ideas', description: 'Any ideas or insights from today?' },
  { num: 5, title: 'Capture Loose Ends', description: 'Capture any unfinished items as React tasks.' },
  { num: 6, title: 'Reschedule Incomplete', description: 'Move incomplete tasks to tomorrow or close them.' },
  { num: 7, title: 'Clear Goals for Tomorrow', description: 'AI-powered decomposition of tomorrow\'s tasks into detailed steps.' },
  { num: 8, title: "Tomorrow's Calendar", description: 'Review and adjust tomorrow\'s schedule.' },
  { num: 9, title: 'Power Down Complete', description: 'Clear your mind. You\'re done for the day!' },
];
```

- [ ] **Step 4: Add new state variables**

After the existing state declarations (lines 22-27), add:

```typescript
  const [distractions, setDistractions] = useState<string[]>([]);
  const [gratitudes, setGratitudes] = useState<string[]>([]);
  const [ideas, setIdeas] = useState<string[]>([]);
  const [clearGoals, setClearGoals] = useState<{ taskId: string; subSteps: string[] }[]>([]);
  const [tomorrowTasks, setTomorrowTasks] = useState<any[]>([]);
  const [newDistraction, setNewDistraction] = useState('');
  const [newGratitude, setNewGratitude] = useState('');
  const [newIdea, setNewIdea] = useState('');
  const [gratitudeTimer, setGratitudeTimer] = useState(300); // 5 minutes in seconds
  const [timerRunning, setTimerRunning] = useState(false);
  const [decomposing, setDecomposing] = useState<string | null>(null); // taskId being decomposed
```

- [ ] **Step 5: Update initSession to hydrate new fields**

In the `initSession` function, after `setTomorrowPlan(data.tomorrowPlan ?? [])` (line 46), add:

```typescript
    setDistractions(data.distractions ?? []);
    setGratitudes(data.gratitudes ?? []);
    setIdeas(data.ideas ?? []);
    setClearGoals(data.clearGoals ?? []);
```

- [ ] **Step 6: Add tomorrow tasks fetch**

After `fetchTodayTasks`, add:

```typescript
  const fetchTomorrowTasks = async () => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const res = await fetch(`/api/tasks?date=${tomorrow}`);
    if (res.ok) setTomorrowTasks(await res.json());
  };
```

Call `fetchTomorrowTasks()` in the `useEffect` alongside `fetchTodayTasks()`.

- [ ] **Step 7: Add gratitude timer effect**

After the existing `useEffect`, add:

```typescript
  useEffect(() => {
    if (!timerRunning || gratitudeTimer <= 0) return;
    const interval = setInterval(() => {
      setGratitudeTimer((prev) => {
        if (prev <= 1) {
          setTimerRunning(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [timerRunning, gratitudeTimer]);
```

- [ ] **Step 8: Add decompose handler**

After the `rescheduleTask` function, add:

```typescript
  const decomposeTask = async (taskId: string, title: string, description?: string) => {
    setDecomposing(taskId);
    try {
      const res = await fetch('/api/powerdown/decompose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, title, description }),
      });
      if (res.ok) {
        const data = await res.json();
        setClearGoals((prev) => {
          const existing = prev.filter((g) => g.taskId !== taskId);
          return [...existing, { taskId, subSteps: data.steps }];
        });
      }
    } finally {
      setDecomposing(null);
    }
  };
```

- [ ] **Step 9: Update advanceStep for 9 steps**

Replace the `advanceStep` function body. Change `next > 6` to `next > 9`. Update the PATCH body to include all new fields:

```typescript
  const advanceStep = async () => {
    if (!session) return;
    const next = currentStep + 1;

    if (next > 9) {
      // Complete
      await fetch('/api/powerdown', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: session.id,
          currentStep: 9,
          tomorrowPlan,
          distractions,
          gratitudes,
          ideas,
          clearGoals,
          complete: true,
        }),
      });
      setCompleted(true);
      return;
    }

    await fetch('/api/powerdown', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: session.id,
        currentStep: next,
        tomorrowPlan,
        distractions,
        gratitudes,
        ideas,
        clearGoals,
      }),
    });
    setCurrentStep(next);
  };
```

- [ ] **Step 10: Add list-entry helper functions**

Before the `return` statement, add helper functions:

```typescript
  const addDistraction = () => {
    if (!newDistraction.trim()) return;
    setDistractions([...distractions, newDistraction.trim()]);
    setNewDistraction('');
  };

  const addGratitude = () => {
    if (!newGratitude.trim()) return;
    setGratitudes([...gratitudes, newGratitude.trim()]);
    setNewGratitude('');
  };

  const addIdea = () => {
    if (!newIdea.trim()) return;
    setIdeas([...ideas, newIdea.trim()]);
    setNewIdea('');
  };

  const formatTimer = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };
```

- [ ] **Step 11: Remap step content in the JSX**

Replace the step content block inside `<div className="glass-panel p-6">`. The old mapping was `currentStep === 1` through `currentStep === 6`. The new mapping is:

**Step 1 (Mark Task Completion):** Keep existing step 1 content, but show ALL today's tasks (not just completed). Each task shows a checkmark if DONE, or a toggle button to mark as completed.

**Step 2 (Record Distractions):**

```tsx
{currentStep === 2 && (
  <div className="space-y-3">
    <p className="text-sm text-gray-400">What distracted you today?</p>
    {distractions.map((d, i) => (
      <div key={i} className="flex items-center gap-2 text-sm text-white">
        <span className="text-orange-400">{i + 1}.</span> {d}
      </div>
    ))}
    <div className="flex gap-2">
      <input
        type="text"
        value={newDistraction}
        onChange={(e) => setNewDistraction(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && addDistraction()}
        placeholder="What distracted you..."
        className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
      />
      <button onClick={addDistraction} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-500">
        Add
      </button>
    </div>
    <p className="text-xs text-gray-600">Optional — skip if none today.</p>
  </div>
)}
```

**Step 3 (Daily Gratitude):**

```tsx
{currentStep === 3 && (
  <div className="space-y-3">
    <p className="text-sm text-gray-400">5-Minute Gratitude Practice</p>
    <div className="flex items-center gap-4 mb-4">
      <span className={`text-2xl font-mono font-bold ${gratitudeTimer === 0 ? 'text-green-400' : 'text-white'}`}>
        {formatTimer(gratitudeTimer)}
      </span>
      <button
        onClick={() => setTimerRunning(!timerRunning)}
        className="rounded-lg bg-gray-700 px-3 py-1 text-xs text-white hover:bg-gray-600"
      >
        {timerRunning ? 'Pause' : 'Start'}
      </button>
      <button
        onClick={() => { setTimerRunning(false); setGratitudeTimer(300); }}
        className="rounded-lg bg-gray-700 px-3 py-1 text-xs text-white hover:bg-gray-600"
      >
        Reset
      </button>
    </div>
    {gratitudes.map((g, i) => (
      <div key={i} className="flex items-center gap-2 text-sm text-white">
        <span className="text-yellow-400">{i + 1}.</span> {g}
      </div>
    ))}
    <div className="flex gap-2">
      <input
        type="text"
        value={newGratitude}
        onChange={(e) => setNewGratitude(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && addGratitude()}
        placeholder="I'm grateful for..."
        className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
      />
      <button onClick={addGratitude} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-500">
        Add
      </button>
    </div>
  </div>
)}
```

**Step 4 (Capture Ideas):**

```tsx
{currentStep === 4 && (
  <div className="space-y-3">
    <p className="text-sm text-gray-400">Any ideas or insights from today?</p>
    {ideas.map((idea, i) => (
      <div key={i} className="flex items-center gap-2 text-sm text-white">
        <span className="text-purple-400">{i + 1}.</span> {idea}
      </div>
    ))}
    <div className="flex gap-2">
      <input
        type="text"
        value={newIdea}
        onChange={(e) => setNewIdea(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && addIdea()}
        placeholder="An idea or insight..."
        className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
      />
      <button onClick={addIdea} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-500">
        Add
      </button>
    </div>
    <p className="text-xs text-gray-600">Optional — skip if nothing comes to mind.</p>
  </div>
)}
```

**Step 5 (Capture Loose Ends):** Move old step 2 content here. Use the same `newTaskTitle`, `addLooseEnd` logic.

**Step 6 (Reschedule Incomplete):** Move old step 3 content here. Same `incompleteTasks`, `rescheduleTask` logic.

**Step 7 (Clear Goals for Tomorrow):**

```tsx
{currentStep === 7 && (
  <div className="space-y-4">
    <p className="text-sm text-gray-400">
      Decompose tomorrow&apos;s tasks into clear, detailed sub-steps.
    </p>
    {tomorrowTasks.length === 0 && (
      <p className="text-sm text-gray-500">No tasks scheduled for tomorrow yet.</p>
    )}
    {tomorrowTasks.map((task) => {
      const goalEntry = clearGoals.find((g) => g.taskId === task.id);
      return (
        <div key={task.id} className="rounded-lg bg-gray-800/50 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-white">{task.title}</span>
            <button
              onClick={() => decomposeTask(task.id, task.title, task.description)}
              disabled={decomposing === task.id}
              className="rounded-lg bg-indigo-600 px-3 py-1 text-xs text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {decomposing === task.id ? 'Decomposing...' : 'Decompose'}
            </button>
          </div>
          {goalEntry && (
            <div className="ml-4 space-y-1">
              {goalEntry.subSteps.map((step, i) => (
                <div key={i} className="text-xs text-gray-300">
                  {i + 1}. {step}
                </div>
              ))}
            </div>
          )}
        </div>
      );
    })}
  </div>
)}
```

**Step 8 (Tomorrow's Calendar):**

```tsx
{currentStep === 8 && (
  <div className="space-y-3">
    <p className="text-sm text-gray-400">
      Review tomorrow&apos;s schedule. Drag tasks into time slots.
    </p>
    <p className="text-xs text-gray-600">
      Full calendar integration coming soon. For now, review your scheduled time blocks in the Calendar page.
    </p>
    {tomorrowTasks.filter((t) => t.timeBlockStart).map((t) => (
      <div key={t.id} className="flex items-center justify-between rounded-lg bg-gray-800/50 px-3 py-2">
        <span className="text-sm text-white">{t.title}</span>
        <span className="text-xs text-gray-400">
          {new Date(t.timeBlockStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    ))}
    {tomorrowTasks.filter((t) => !t.timeBlockStart).length > 0 && (
      <div className="mt-2">
        <p className="text-xs text-orange-400 mb-1">Unscheduled:</p>
        {tomorrowTasks.filter((t) => !t.timeBlockStart).map((t) => (
          <div key={t.id} className="text-sm text-gray-400 ml-2">- {t.title}</div>
        ))}
      </div>
    )}
  </div>
)}
```

**Step 9 (Power Down Complete):** Move old step 6 content (Moon icon, "Clear your mind" message) here.

- [ ] **Step 12: Update the Next/Complete button logic**

Change the button text condition from `currentStep === 6` to `currentStep === 9`:

```tsx
{currentStep === 9 ? 'Complete Power Down' : 'Next Step'}
```

- [ ] **Step 13: Add new imports**

Add to the lucide-react imports (line 4):

```typescript
import { CheckCircle2, ChevronRight, Moon, PartyPopper, Plus, Timer, Lightbulb, Brain, Calendar } from 'lucide-react';
```

- [ ] **Step 14: Run tests to verify they pass**

Run: `cd goal-dashboard && npx vitest run src/components/powerdown/__tests__/PowerDownRitual.test.tsx`

Expected: All tests PASS -- existing tests updated for new step numbers, new tests pass for steps 2-4, 7-9.

- [ ] **Step 15: Commit**

```bash
git add src/components/powerdown/PowerDownRitual.tsx src/components/powerdown/__tests__/PowerDownRitual.test.tsx
git commit -m "feat(powerdown): expand ritual from 6 to 9 steps with distractions, gratitude, ideas, AI decompose, tomorrow calendar"
```

---

### Task 6: Integration Verification

**Files:** None modified -- verification only.

- [ ] **Step 1: Run the full test suite**

Run: `cd goal-dashboard && npx vitest run`

Expected: All tests PASS, including the updated powerdown tests and new API tests.

- [ ] **Step 2: Run the build**

Run: `cd goal-dashboard && npm run build`

Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 3: Manual verification checklist**

Start the dev server (`npm run dev`) and walk through the 9-step ritual:

1. Step 1 (Mark Task Completion): Shows all today's tasks with completion status.
2. Step 2 (Record Distractions): Text input with "+" add button. Entries appear numbered.
3. Step 3 (Daily Gratitude): Timer shows 5:00, starts/pauses/resets. Text entries save.
4. Step 4 (Capture Ideas): Text input for ideas. Optional, can skip.
5. Step 5 (Capture Loose Ends): Create REACT tasks for unfinished items.
6. Step 6 (Reschedule Incomplete): Shows incomplete tasks with reschedule buttons.
7. Step 7 (Clear Goals): Tomorrow's tasks listed. "Decompose" button calls AI and shows sub-steps.
8. Step 8 (Tomorrow's Calendar): Shows scheduled/unscheduled tasks for tomorrow.
9. Step 9 (Power Down Complete): Moon icon, completion message, "Complete Power Down" button.
10. After completion: confetti, streak update, "Back to Dashboard" button works.
11. Verify PATCH saves all new fields (distractions, gratitudes, ideas, clearGoals) to the database.
12. Verify decompose endpoint returns structured steps and handles errors gracefully.
13. Verify rate limiting on decompose (11th request within 1 minute returns 429).

- [ ] **Step 4: Commit any fixes from manual testing**

```bash
git add -A
git commit -m "fix(powerdown): address issues found during manual testing of expanded ritual"
```
