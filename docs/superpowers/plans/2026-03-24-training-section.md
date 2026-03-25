# Training Section (Books & Courses) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Training section where users can add books or courses, have AI (via OpenRouter) break them into schedulable tasks, take AI-generated quizzes on uploaded book content, view courses in a goal-stack-like tree, and optionally link training items to goal stack goals.

**Architecture:** Nine layers, each with its own test-first cycle: (1) Prisma schema adds `TrainingType` enum, `TrainingItem`, `TrainingTask`, and `QuizAttempt` models + migration, (2) test fixtures for training models, (3) CRUD API routes for training items, (4) AI-powered book breakdown API, (5) AI-powered course breakdown API, (6) quiz generation and grading APIs, (7) file upload API for books/syllabi, (8) `/training` page with book list and course tree view, and (9) sidebar navigation update. Each task is isolated to 1-3 files.

**Tech Stack:** Next.js 14 / TypeScript / Prisma / PostgreSQL / Vitest / Tailwind / lucide-react / SWR / OpenRouter (via `src/lib/openrouter.ts` and `src/lib/ai-prompts.ts` from the [OpenRouter AI Integration spec](../specs/2026-03-24-openrouter-ai-integration-design.md))

**Dependency:** This plan assumes the OpenRouter AI Integration plan has been implemented first (`src/lib/openrouter.ts` singleton client and `src/lib/ai-prompts.ts` prompt templates exist). If not, implement that plan first.

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `prisma/schema.prisma` | Modify | Add `TrainingType` enum, `TrainingItem`, `TrainingTask`, `QuizAttempt` models; add reverse relations to `User`, `Goal`, `Task` |
| `prisma/migrations/YYYYMMDD_add_training_models/migration.sql` | Auto-generated | CREATE TYPE, CREATE TABLE for all three models + indexes |
| `src/test/fixtures.ts` | Modify | Add `createTrainingItem`, `createTrainingTask`, `createQuizAttempt` factories |
| `src/__tests__/training-api.test.ts` | Create | Unit tests for training CRUD routes |
| `src/app/api/training/route.ts` | Create | GET (list) + POST (create) training items |
| `src/app/api/training/[id]/route.ts` | Create | GET / PUT / DELETE single training item |
| `src/__tests__/training-books-api.test.ts` | Create | Unit tests for AI book breakdown |
| `src/app/api/training/books/route.ts` | Create | POST: AI-powered book breakdown + task generation |
| `src/__tests__/training-courses-api.test.ts` | Create | Unit tests for AI course breakdown |
| `src/app/api/training/courses/route.ts` | Create | POST: AI-powered course breakdown + task generation |
| `src/__tests__/training-quiz-api.test.ts` | Create | Unit tests for quiz generation and grading |
| `src/app/api/training/quiz/generate/route.ts` | Create | POST: generate quiz questions via OpenRouter |
| `src/app/api/training/quiz/check/route.ts` | Create | POST: grade quiz answers (deterministic for MC, LLM for short answer) |
| `src/__tests__/training-upload-api.test.ts` | Create | Unit tests for file upload |
| `src/app/api/training/[id]/upload/route.ts` | Create | POST: upload book PDF / course syllabus |
| `src/components/training/__tests__/TrainingList.test.tsx` | Create | Tests for training list rendering |
| `src/components/training/TrainingList.tsx` | Create | Main list of training items with progress |
| `src/components/training/__tests__/TrainingItemCard.test.tsx` | Create | Tests for individual training item card |
| `src/components/training/TrainingItemCard.tsx` | Create | Card showing training item with task tree |
| `src/components/training/__tests__/BookTaskTree.test.tsx` | Create | Tests for book task list rendering |
| `src/components/training/BookTaskTree.tsx` | Create | Flat task list for books (reading groups + quizzes) |
| `src/components/training/__tests__/CourseModuleTree.test.tsx` | Create | Tests for course tree view |
| `src/components/training/CourseModuleTree.tsx` | Create | Goal-stack-like collapsible tree for courses |
| `src/components/training/__tests__/QuizModal.test.tsx` | Create | Tests for quiz UI |
| `src/components/training/QuizModal.tsx` | Create | Modal for taking and submitting quizzes |
| `src/components/training/__tests__/AddTrainingModal.test.tsx` | Create | Tests for add book/course modal |
| `src/components/training/AddTrainingModal.tsx` | Create | Modal with title, description, target date, goal link, file upload |
| `src/app/(app)/training/page.tsx` | Create | `/training` page wiring TrainingList |
| `src/app/(app)/training/__tests__/TrainingPage.test.tsx` | Create | Page-level tests |
| `src/components/layout/Sidebar.tsx` | Modify | Add "Training" nav item between "Goal Stack" and "Tasks" |
| `src/components/layout/__tests__/Sidebar.test.tsx` | Modify | Add test for Training nav link presence |

---

### Task 1: Prisma Schema Migration — Add Training Models

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add the TrainingType enum**

In `prisma/schema.prisma`, add the enum after the existing `KpiType` enum (after line 123):

```prisma
enum TrainingType {
  BOOK
  COURSE
}
```

- [ ] **Step 2: Add the TrainingItem model**

After the `Kpi` model (end of file), add:

```prisma
// === TRAINING ===

model TrainingItem {
  id                   String       @id @default(cuid())
  ownerId              String
  type                 TrainingType
  title                String
  description          String?      @db.Text
  sourceUrl            String?
  uploadedFileUrl      String?
  aiMetadata           Json?
  targetCompletionDate DateTime?
  goalId               String?
  status               String       @default("ACTIVE")
  createdAt            DateTime     @default(now())
  updatedAt            DateTime     @updatedAt

  owner         User            @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  goal          Goal?           @relation(fields: [goalId], references: [id])
  trainingTasks TrainingTask[]
  quizAttempts  QuizAttempt[]

  @@index([ownerId])
}
```

- [ ] **Step 3: Add the TrainingTask model**

Below `TrainingItem`, add:

```prisma
model TrainingTask {
  id             String  @id @default(cuid())
  trainingItemId String
  taskId         String  @unique
  chapterRange   String?
  moduleIndex    Int?
  isQuizDay      Boolean @default(false)
  sortOrder      Int     @default(0)

  trainingItem TrainingItem @relation(fields: [trainingItemId], references: [id], onDelete: Cascade)
  task         Task         @relation(fields: [taskId], references: [id], onDelete: Cascade)

  @@index([trainingItemId])
}
```

- [ ] **Step 4: Add the QuizAttempt model**

Below `TrainingTask`, add:

```prisma
model QuizAttempt {
  id             String    @id @default(cuid())
  trainingItemId String
  trainingTaskId String?
  questions      Json
  userAnswers    Json?
  score          Float?
  llmFeedback    Json?
  completedAt    DateTime?
  createdAt      DateTime  @default(now())

  trainingItem TrainingItem @relation(fields: [trainingItemId], references: [id], onDelete: Cascade)

  @@index([trainingItemId])
}
```

- [ ] **Step 5: Add reverse relations to existing models**

In the `User` model (line 48-81), add after `meetings` (line 81):

```prisma
  trainingItems         TrainingItem[]
```

In the `Goal` model (line 125-152), add after `kpis` (line 147):

```prisma
  trainingItems      TrainingItem[]
```

In the `Task` model (line 190-224), add after `processExecution` (line 216):

```prisma
  trainingTask   TrainingTask?
```

- [ ] **Step 6: Generate and run the migration**

Run: `cd goal-dashboard && npx prisma migrate dev --name add_training_models`

Expected: Migration creates the `TrainingType` enum, `TrainingItem`, `TrainingTask`, and `QuizAttempt` tables with all columns, foreign keys, and indexes.

- [ ] **Step 7: Verify Prisma client is regenerated**

Run: `cd goal-dashboard && npx prisma generate`

Expected: Client regenerated with `TrainingItem`, `TrainingTask`, `QuizAttempt` types and all reverse relations.

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(schema): add TrainingItem, TrainingTask, QuizAttempt models for training section"
```

---

### Task 2: Test Fixtures — Add Training Factories

**Files:**
- Modify: `src/test/fixtures.ts`

- [ ] **Step 1: Add `createTrainingItem` fixture**

In `src/test/fixtures.ts`, add after the `createReview` function (after line 96):

```typescript
export function createTrainingItem(overrides: Record<string, any> = {}) {
  return {
    id: nextId(),
    ownerId: 'user-1',
    type: 'BOOK',
    title: 'Test Book',
    description: null,
    sourceUrl: null,
    uploadedFileUrl: null,
    aiMetadata: null,
    targetCompletionDate: null,
    goalId: null,
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    trainingTasks: [],
    quizAttempts: [],
    goal: null,
    ...overrides,
  };
}
```

- [ ] **Step 2: Add `createTrainingTask` fixture**

Below `createTrainingItem`, add:

```typescript
export function createTrainingTask(overrides: Record<string, any> = {}) {
  return {
    id: nextId(),
    trainingItemId: 'training-1',
    taskId: 'task-1',
    chapterRange: null,
    moduleIndex: null,
    isQuizDay: false,
    sortOrder: 0,
    task: createTask(),
    ...overrides,
  };
}
```

- [ ] **Step 3: Add `createQuizAttempt` fixture**

Below `createTrainingTask`, add:

```typescript
export function createQuizAttempt(overrides: Record<string, any> = {}) {
  return {
    id: nextId(),
    trainingItemId: 'training-1',
    trainingTaskId: null,
    questions: [
      { question: 'Test question?', type: 'multiple_choice', options: ['A', 'B', 'C', 'D'], correctAnswer: 'A', explanation: 'Because A.' },
    ],
    userAnswers: null,
    score: null,
    llmFeedback: null,
    completedAt: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}
```

- [ ] **Step 4: Run existing tests to verify nothing breaks**

Run: `cd goal-dashboard && npx vitest run`

Expected: All existing tests PASS (new fixtures are inert until consumed).

- [ ] **Step 5: Commit**

```bash
git add src/test/fixtures.ts
git commit -m "test: add createTrainingItem, createTrainingTask, createQuizAttempt fixtures"
```

---

### Task 3: API — Training Item CRUD (`/api/training` and `/api/training/[id]`)

**Files:**
- Create: `src/__tests__/training-api.test.ts`
- Create: `src/app/api/training/route.ts`
- Create: `src/app/api/training/[id]/route.ts`

- [ ] **Step 1: Write failing tests**

Create `src/__tests__/training-api.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindMany = vi.fn();
const mockCreate = vi.fn();
const mockFindUnique = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    trainingItem: {
      findMany: mockFindMany,
      create: mockCreate,
      findUnique: mockFindUnique,
      update: mockUpdate,
      delete: mockDelete,
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

import { GET, POST } from '@/app/api/training/route';
import { GET as GET_ONE, PUT, DELETE } from '@/app/api/training/[id]/route';

describe('GET /api/training', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns training items for the authenticated user', async () => {
    const items = [
      { id: 'ti-1', ownerId: 'user-1', type: 'BOOK', title: 'Test Book', trainingTasks: [], quizAttempts: [], goal: null },
    ];
    mockFindMany.mockResolvedValue(items);

    const request = new Request('http://localhost/api/training');
    const response = await GET(request);
    const data = await response.json();

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { ownerId: 'user-1' },
      })
    );
    expect(data).toHaveLength(1);
    expect(data[0].title).toBe('Test Book');
  });
});

describe('POST /api/training', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a training item with required fields', async () => {
    const newItem = { id: 'ti-2', ownerId: 'user-1', type: 'BOOK', title: 'New Book' };
    mockCreate.mockResolvedValue(newItem);

    const request = new Request('http://localhost/api/training', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'BOOK', title: 'New Book' }),
    });
    const response = await POST(request);
    const data = await response.json();

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ownerId: 'user-1',
          type: 'BOOK',
          title: 'New Book',
        }),
      })
    );
    expect(response.status).toBe(201);
  });

  it('rejects missing title with 400', async () => {
    const request = new Request('http://localhost/api/training', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'BOOK' }),
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it('rejects invalid type with 400', async () => {
    const request = new Request('http://localhost/api/training', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'PODCAST', title: 'Test' }),
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
  });
});

describe('GET /api/training/[id]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 404 when item not found', async () => {
    mockFindUnique.mockResolvedValue(null);
    const request = new Request('http://localhost/api/training/nonexistent');
    const response = await GET_ONE(request, { params: Promise.resolve({ id: 'nonexistent' }) });
    expect(response.status).toBe(404);
  });

  it('returns 403 when item belongs to another user', async () => {
    mockFindUnique.mockResolvedValue({ id: 'ti-1', ownerId: 'user-2' });
    const request = new Request('http://localhost/api/training/ti-1');
    const response = await GET_ONE(request, { params: Promise.resolve({ id: 'ti-1' }) });
    expect(response.status).toBe(403);
  });
});

describe('PUT /api/training/[id]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('updates training item fields', async () => {
    mockFindUnique.mockResolvedValue({ id: 'ti-1', ownerId: 'user-1' });
    mockUpdate.mockResolvedValue({ id: 'ti-1', title: 'Updated Title' });

    const request = new Request('http://localhost/api/training/ti-1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Updated Title' }),
    });
    const response = await PUT(request, { params: Promise.resolve({ id: 'ti-1' }) });
    expect(response.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ti-1' },
        data: expect.objectContaining({ title: 'Updated Title' }),
      })
    );
  });
});

describe('DELETE /api/training/[id]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('deletes training item', async () => {
    mockFindUnique.mockResolvedValue({ id: 'ti-1', ownerId: 'user-1' });
    mockDelete.mockResolvedValue({ id: 'ti-1' });

    const request = new Request('http://localhost/api/training/ti-1', { method: 'DELETE' });
    const response = await DELETE(request, { params: Promise.resolve({ id: 'ti-1' }) });
    expect(response.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd goal-dashboard && npx vitest run src/__tests__/training-api.test.ts`

Expected: FAIL — route files do not exist yet.

- [ ] **Step 3: Implement GET and POST `/api/training`**

Create `src/app/api/training/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';

export async function GET(request: Request) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const items = await prisma.trainingItem.findMany({
    where: { ownerId: auth.userId },
    include: {
      trainingTasks: {
        include: { task: true },
        orderBy: { sortOrder: 'asc' },
      },
      quizAttempts: {
        orderBy: { createdAt: 'desc' },
      },
      goal: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json(items);
}

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const body = await request.json();
  const { type, title, description, sourceUrl, targetCompletionDate, goalId } = body;

  if (!title || typeof title !== 'string') {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  }
  if (!type || !['BOOK', 'COURSE'].includes(type)) {
    return NextResponse.json({ error: 'Type must be BOOK or COURSE' }, { status: 400 });
  }

  const item = await prisma.trainingItem.create({
    data: {
      ownerId: auth.userId,
      type,
      title,
      description: description || null,
      sourceUrl: sourceUrl || null,
      targetCompletionDate: targetCompletionDate ? new Date(targetCompletionDate) : null,
      goalId: goalId || null,
    },
  });

  return NextResponse.json(item, { status: 201 });
}
```

- [ ] **Step 4: Implement GET, PUT, DELETE `/api/training/[id]`**

Create `src/app/api/training/[id]/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';

async function getAuthAndItem(id: string) {
  const auth = await requireAuth();
  if ('error' in auth) return { auth, item: null };

  const item = await prisma.trainingItem.findUnique({ where: { id } });
  return { auth, item };
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { auth, item } = await getAuthAndItem(id);
  if ('error' in auth) return authError(auth);
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (item.ownerId !== auth.userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const full = await prisma.trainingItem.findUnique({
    where: { id },
    include: {
      trainingTasks: { include: { task: true }, orderBy: { sortOrder: 'asc' } },
      quizAttempts: { orderBy: { createdAt: 'desc' } },
      goal: true,
    },
  });

  return NextResponse.json(full);
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { auth, item } = await getAuthAndItem(id);
  if ('error' in auth) return authError(auth);
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (item.ownerId !== auth.userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json();
  const data: Record<string, any> = {};
  if (body.title !== undefined) data.title = body.title;
  if (body.description !== undefined) data.description = body.description;
  if (body.sourceUrl !== undefined) data.sourceUrl = body.sourceUrl;
  if (body.targetCompletionDate !== undefined) data.targetCompletionDate = body.targetCompletionDate ? new Date(body.targetCompletionDate) : null;
  if (body.goalId !== undefined) data.goalId = body.goalId || null;
  if (body.status !== undefined) data.status = body.status;

  const updated = await prisma.trainingItem.update({ where: { id }, data });
  return NextResponse.json(updated);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { auth, item } = await getAuthAndItem(id);
  if ('error' in auth) return authError(auth);
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (item.ownerId !== auth.userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  await prisma.trainingItem.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd goal-dashboard && npx vitest run src/__tests__/training-api.test.ts`

Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/training/ src/__tests__/training-api.test.ts
git commit -m "feat(api): add training item CRUD routes (GET/POST/PUT/DELETE)"
```

---

### Task 4: API — AI-Powered Book Breakdown (`/api/training/books`)

**Files:**
- Create: `src/__tests__/training-books-api.test.ts`
- Create: `src/app/api/training/books/route.ts`

- [ ] **Step 1: Write failing tests**

Create `src/__tests__/training-books-api.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockTaskCreate = vi.fn();
const mockTrainingTaskCreate = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    trainingItem: { create: mockCreate, update: mockUpdate },
    task: { create: mockTaskCreate },
    trainingTask: { create: mockTrainingTaskCreate },
  },
}));

vi.mock('@/lib/auth-guard', () => ({
  requireAuth: vi.fn(() => ({
    session: { user: { id: 'user-1', isAdmin: false } },
    userId: 'user-1',
  })),
  authError: vi.fn((r: any) => Response.json({ error: r.error }, { status: r.status })),
}));

const mockChatJSON = vi.fn();
vi.mock('@/lib/openrouter', () => ({
  openrouter: { chatJSON: mockChatJSON },
}));

vi.mock('@/lib/ai-prompts', () => ({
  bookBreakdownPrompt: vi.fn(() => [{ role: 'user', content: 'test' }]),
}));

import { POST } from '@/app/api/training/books/route';

describe('POST /api/training/books', () => {
  const aiResponse = {
    chapters: [
      { number: 1, title: 'Intro', topic: 'Introduction' },
      { number: 2, title: 'Basics', topic: 'Fundamentals' },
      { number: 3, title: 'Advanced', topic: 'Deep dive' },
      { number: 4, title: 'Summary', topic: 'Wrap up' },
    ],
    readingGroups: [
      { chapters: '1-2', topic: 'Introduction & Fundamentals', estimatedMinutes: 45 },
      { chapters: '3-4', topic: 'Advanced & Summary', estimatedMinutes: 40 },
    ],
    quizPoints: [
      { afterChapter: 4, topics: ['Intro', 'Basics', 'Advanced'] },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockChatJSON.mockResolvedValue(aiResponse);
    mockCreate.mockResolvedValue({ id: 'ti-1', ownerId: 'user-1', type: 'BOOK', title: 'Test Book' });
    mockTaskCreate.mockImplementation(({ data }) => Promise.resolve({ id: `task-${data.title}`, ...data }));
    mockTrainingTaskCreate.mockResolvedValue({});
    mockUpdate.mockResolvedValue({});
  });

  it('creates a training item and generates tasks from AI breakdown', async () => {
    const request = new Request('http://localhost/api/training/books', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Test Book' }),
    });

    const response = await POST(request);
    expect(response.status).toBe(201);

    // Should create the training item
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ownerId: 'user-1',
          type: 'BOOK',
          title: 'Test Book',
        }),
      })
    );

    // Should call OpenRouter for breakdown
    expect(mockChatJSON).toHaveBeenCalled();

    // Should create tasks for reading groups + quiz points
    // 2 reading groups + 1 quiz = 3 tasks
    expect(mockTaskCreate).toHaveBeenCalledTimes(3);

    // Should create training tasks linking to real tasks
    expect(mockTrainingTaskCreate).toHaveBeenCalledTimes(3);
  });

  it('rejects missing title with 400', async () => {
    const request = new Request('http://localhost/api/training/books', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it('stores AI metadata on the training item', async () => {
    const request = new Request('http://localhost/api/training/books', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Test Book' }),
    });

    await POST(request);

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          aiMetadata: aiResponse,
        }),
      })
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd goal-dashboard && npx vitest run src/__tests__/training-books-api.test.ts`

Expected: FAIL — route file does not exist.

- [ ] **Step 3: Implement the book breakdown route**

Create `src/app/api/training/books/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { openrouter } from '@/lib/openrouter';
import { bookBreakdownPrompt } from '@/lib/ai-prompts';

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const body = await request.json();
  const { title, description, sourceUrl, targetCompletionDate, goalId } = body;

  if (!title || typeof title !== 'string') {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  }

  // 1. Create the training item
  const trainingItem = await prisma.trainingItem.create({
    data: {
      ownerId: auth.userId,
      type: 'BOOK',
      title,
      description: description || null,
      sourceUrl: sourceUrl || null,
      targetCompletionDate: targetCompletionDate ? new Date(targetCompletionDate) : null,
      goalId: goalId || null,
    },
  });

  // 2. Call OpenRouter for AI breakdown
  const messages = bookBreakdownPrompt(title, description);
  const aiResult = await openrouter.chatJSON<{
    chapters: { number: number; title: string; topic: string }[];
    readingGroups: { chapters: string; topic: string; estimatedMinutes: number }[];
    quizPoints: { afterChapter: number; topics: string[] }[];
  }>(messages);

  // 3. Calculate due dates spread across available time
  const startDate = new Date();
  const endDate = targetCompletionDate ? new Date(targetCompletionDate) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const totalTasks = aiResult.readingGroups.length + aiResult.quizPoints.length;
  const daysBetween = Math.max(1, Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * totalTasks)));

  let sortOrder = 0;
  let currentDate = new Date(startDate);

  // 4. Create reading group tasks
  for (const group of aiResult.readingGroups) {
    currentDate = new Date(currentDate.getTime() + daysBetween * 24 * 60 * 60 * 1000);

    const task = await prisma.task.create({
      data: {
        ownerId: auth.userId,
        taskType: 'GOAL_STACK',
        title: `Read Ch ${group.chapters}: ${group.topic}`,
        description: `Reading group for "${title}" — chapters ${group.chapters}`,
        dueDate: new Date(currentDate),
        goalId: goalId || null,
        priority: 'MEDIUM',
      },
    });

    await prisma.trainingTask.create({
      data: {
        trainingItemId: trainingItem.id,
        taskId: task.id,
        chapterRange: group.chapters,
        isQuizDay: false,
        sortOrder: sortOrder++,
      },
    });
  }

  // 5. Create quiz point tasks
  for (const quiz of aiResult.quizPoints) {
    currentDate = new Date(currentDate.getTime() + daysBetween * 24 * 60 * 60 * 1000);

    const task = await prisma.task.create({
      data: {
        ownerId: auth.userId,
        taskType: 'GOAL_STACK',
        title: `Quiz: Chapters 1-${quiz.afterChapter}`,
        description: `Comprehension quiz covering: ${quiz.topics.join(', ')}`,
        dueDate: new Date(currentDate),
        goalId: goalId || null,
        priority: 'MEDIUM',
      },
    });

    await prisma.trainingTask.create({
      data: {
        trainingItemId: trainingItem.id,
        taskId: task.id,
        chapterRange: `1-${quiz.afterChapter}`,
        isQuizDay: true,
        sortOrder: sortOrder++,
      },
    });
  }

  // 6. Store AI metadata on training item
  await prisma.trainingItem.update({
    where: { id: trainingItem.id },
    data: { aiMetadata: aiResult },
  });

  // 7. Return the full training item with tasks
  const result = await prisma.trainingItem.findUnique({
    where: { id: trainingItem.id },
    include: {
      trainingTasks: { include: { task: true }, orderBy: { sortOrder: 'asc' } },
      goal: true,
    },
  });

  return NextResponse.json(result, { status: 201 });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd goal-dashboard && npx vitest run src/__tests__/training-books-api.test.ts`

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/training/books/ src/__tests__/training-books-api.test.ts
git commit -m "feat(api): add AI-powered book breakdown route with task generation"
```

---

### Task 5: API — AI-Powered Course Breakdown (`/api/training/courses`)

**Files:**
- Create: `src/__tests__/training-courses-api.test.ts`
- Create: `src/app/api/training/courses/route.ts`

- [ ] **Step 1: Write failing tests**

Create `src/__tests__/training-courses-api.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockTaskCreate = vi.fn();
const mockTrainingTaskCreate = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    trainingItem: { create: mockCreate, update: mockUpdate, findUnique: vi.fn() },
    task: { create: mockTaskCreate },
    trainingTask: { create: mockTrainingTaskCreate },
  },
}));

vi.mock('@/lib/auth-guard', () => ({
  requireAuth: vi.fn(() => ({
    session: { user: { id: 'user-1', isAdmin: false } },
    userId: 'user-1',
  })),
  authError: vi.fn((r: any) => Response.json({ error: r.error }, { status: r.status })),
}));

const mockChatJSON = vi.fn();
vi.mock('@/lib/openrouter', () => ({
  openrouter: { chatJSON: mockChatJSON },
}));

vi.mock('@/lib/ai-prompts', () => ({
  courseBreakdownPrompt: vi.fn(() => [{ role: 'user', content: 'test' }]),
}));

import { POST } from '@/app/api/training/courses/route';

describe('POST /api/training/courses', () => {
  const aiResponse = {
    modules: [
      {
        title: 'Module 1: Linear Algebra',
        description: 'Foundations of linear algebra',
        lessons: [
          { title: 'Vectors', estimatedMinutes: 30, type: 'lesson' },
          { title: 'Matrices', estimatedMinutes: 45, type: 'lesson' },
          { title: 'Assignment 1', estimatedMinutes: 60, type: 'assignment' },
        ],
      },
      {
        title: 'Module 2: Statistics',
        description: 'Statistical foundations',
        lessons: [
          { title: 'Probability', estimatedMinutes: 40, type: 'lesson' },
        ],
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockChatJSON.mockResolvedValue(aiResponse);
    mockCreate.mockResolvedValue({ id: 'ti-1', ownerId: 'user-1', type: 'COURSE', title: 'ML Course' });
    mockTaskCreate.mockImplementation(({ data }) => Promise.resolve({ id: `task-${data.title}`, ...data }));
    mockTrainingTaskCreate.mockResolvedValue({});
    mockUpdate.mockResolvedValue({});
  });

  it('creates a course training item with module tasks from AI', async () => {
    const request = new Request('http://localhost/api/training/courses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'ML Course' }),
    });

    const response = await POST(request);
    expect(response.status).toBe(201);

    // Should create tasks for all lessons across all modules (3 + 1 = 4)
    expect(mockTaskCreate).toHaveBeenCalledTimes(4);

    // First task should include module prefix
    expect(mockTaskCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: 'Module 1: Linear Algebra — Vectors',
        }),
      })
    );
  });

  it('passes syllabus text to AI prompt when provided', async () => {
    const { courseBreakdownPrompt } = await import('@/lib/ai-prompts');

    const request = new Request('http://localhost/api/training/courses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'ML Course', syllabus: 'Week 1: Intro...' }),
    });

    await POST(request);

    expect(courseBreakdownPrompt).toHaveBeenCalledWith('ML Course', 'Week 1: Intro...');
  });

  it('assigns moduleIndex to training tasks in order', async () => {
    const request = new Request('http://localhost/api/training/courses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'ML Course' }),
    });

    await POST(request);

    // Module 1 lessons should have moduleIndex 0
    expect(mockTrainingTaskCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ moduleIndex: 0, sortOrder: 0 }),
      })
    );

    // Module 2 lesson should have moduleIndex 1
    expect(mockTrainingTaskCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ moduleIndex: 1, sortOrder: 3 }),
      })
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd goal-dashboard && npx vitest run src/__tests__/training-courses-api.test.ts`

Expected: FAIL — route file does not exist.

- [ ] **Step 3: Implement the course breakdown route**

Create `src/app/api/training/courses/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { openrouter } from '@/lib/openrouter';
import { courseBreakdownPrompt } from '@/lib/ai-prompts';

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const body = await request.json();
  const { title, description, syllabus, sourceUrl, targetCompletionDate, goalId } = body;

  if (!title || typeof title !== 'string') {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  }

  // 1. Create the training item
  const trainingItem = await prisma.trainingItem.create({
    data: {
      ownerId: auth.userId,
      type: 'COURSE',
      title,
      description: description || null,
      sourceUrl: sourceUrl || null,
      targetCompletionDate: targetCompletionDate ? new Date(targetCompletionDate) : null,
      goalId: goalId || null,
    },
  });

  // 2. Call OpenRouter for AI breakdown (pass syllabus if uploaded)
  const messages = courseBreakdownPrompt(title, syllabus);
  const aiResult = await openrouter.chatJSON<{
    modules: {
      title: string;
      description: string;
      lessons: { title: string; estimatedMinutes: number; type: string }[];
    }[];
  }>(messages);

  // 3. Calculate due dates
  const startDate = new Date();
  const endDate = targetCompletionDate ? new Date(targetCompletionDate) : new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
  const totalLessons = aiResult.modules.reduce((sum, m) => sum + m.lessons.length, 0);
  const daysBetween = Math.max(1, Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * totalLessons)));

  let sortOrder = 0;
  let currentDate = new Date(startDate);

  // 4. Create tasks for each lesson in each module
  for (let moduleIdx = 0; moduleIdx < aiResult.modules.length; moduleIdx++) {
    const module = aiResult.modules[moduleIdx];

    for (const lesson of module.lessons) {
      currentDate = new Date(currentDate.getTime() + daysBetween * 24 * 60 * 60 * 1000);

      const task = await prisma.task.create({
        data: {
          ownerId: auth.userId,
          taskType: 'GOAL_STACK',
          title: `${module.title} — ${lesson.title}`,
          description: `${lesson.type === 'assignment' ? 'Assignment' : 'Lesson'} for course "${title}"`,
          dueDate: new Date(currentDate),
          goalId: goalId || null,
          priority: 'MEDIUM',
        },
      });

      await prisma.trainingTask.create({
        data: {
          trainingItemId: trainingItem.id,
          taskId: task.id,
          moduleIndex: moduleIdx,
          isQuizDay: lesson.type === 'quiz',
          sortOrder: sortOrder++,
        },
      });
    }
  }

  // 5. Store AI metadata
  await prisma.trainingItem.update({
    where: { id: trainingItem.id },
    data: { aiMetadata: aiResult },
  });

  // 6. Return full training item
  const result = await prisma.trainingItem.findUnique({
    where: { id: trainingItem.id },
    include: {
      trainingTasks: { include: { task: true }, orderBy: { sortOrder: 'asc' } },
      goal: true,
    },
  });

  return NextResponse.json(result, { status: 201 });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd goal-dashboard && npx vitest run src/__tests__/training-courses-api.test.ts`

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/training/courses/ src/__tests__/training-courses-api.test.ts
git commit -m "feat(api): add AI-powered course breakdown route with module/lesson task generation"
```

---

### Task 6: API — Quiz Generation and Grading

**Files:**
- Create: `src/__tests__/training-quiz-api.test.ts`
- Create: `src/app/api/training/quiz/generate/route.ts`
- Create: `src/app/api/training/quiz/check/route.ts`

- [ ] **Step 1: Write failing tests**

Create `src/__tests__/training-quiz-api.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindUnique = vi.fn();
const mockQuizCreate = vi.fn();
const mockQuizUpdate = vi.fn();
const mockQuizFindUnique = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    trainingItem: { findUnique: mockFindUnique },
    quizAttempt: { create: mockQuizCreate, update: mockQuizUpdate, findUnique: mockQuizFindUnique },
  },
}));

vi.mock('@/lib/auth-guard', () => ({
  requireAuth: vi.fn(() => ({
    session: { user: { id: 'user-1', isAdmin: false } },
    userId: 'user-1',
  })),
  authError: vi.fn((r: any) => Response.json({ error: r.error }, { status: r.status })),
}));

const mockChatJSON = vi.fn();
vi.mock('@/lib/openrouter', () => ({
  openrouter: { chatJSON: mockChatJSON },
}));

vi.mock('@/lib/ai-prompts', () => ({
  quizGenerationPrompt: vi.fn(() => [{ role: 'user', content: 'test' }]),
  quizCheckPrompt: vi.fn(() => [{ role: 'user', content: 'test' }]),
}));

import { POST as generateQuiz } from '@/app/api/training/quiz/generate/route';
import { POST as checkQuiz } from '@/app/api/training/quiz/check/route';

describe('POST /api/training/quiz/generate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindUnique.mockResolvedValue({
      id: 'ti-1',
      ownerId: 'user-1',
      title: 'Test Book',
      aiMetadata: {
        chapters: [{ number: 1, title: 'Ch1', topic: 'Intro' }],
      },
    });
  });

  it('generates quiz questions and creates a QuizAttempt', async () => {
    const questions = {
      questions: [
        { question: 'What is X?', type: 'multiple_choice', options: ['A', 'B', 'C', 'D'], correctAnswer: 'A', explanation: 'Because A' },
        { question: 'Explain Y', type: 'short_answer', options: null, correctAnswer: 'Y is...', explanation: 'Y explained' },
      ],
    };
    mockChatJSON.mockResolvedValue(questions);
    mockQuizCreate.mockResolvedValue({ id: 'qa-1', questions: questions.questions });

    const request = new Request('http://localhost/api/training/quiz/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trainingItemId: 'ti-1', chapterRange: '1-4' }),
    });

    const response = await generateQuiz(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(mockQuizCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          trainingItemId: 'ti-1',
          questions: questions.questions,
        }),
      })
    );
  });

  it('returns 404 if training item not found', async () => {
    mockFindUnique.mockResolvedValue(null);

    const request = new Request('http://localhost/api/training/quiz/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trainingItemId: 'nonexistent', chapterRange: '1-4' }),
    });

    const response = await generateQuiz(request);
    expect(response.status).toBe(404);
  });
});

describe('POST /api/training/quiz/check', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('grades multiple-choice questions deterministically', async () => {
    const quiz = {
      id: 'qa-1',
      trainingItemId: 'ti-1',
      questions: [
        { question: 'What is X?', type: 'multiple_choice', options: ['A', 'B', 'C', 'D'], correctAnswer: 'A', explanation: 'Because A' },
      ],
      trainingItem: { ownerId: 'user-1' },
    };
    mockQuizFindUnique.mockResolvedValue(quiz);
    mockQuizUpdate.mockResolvedValue({ ...quiz, score: 1.0 });

    const request = new Request('http://localhost/api/training/quiz/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quizAttemptId: 'qa-1', answers: ['A'] }),
    });

    const response = await checkQuiz(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    // MC should NOT call LLM (deterministic grading)
    expect(mockChatJSON).not.toHaveBeenCalled();
    expect(mockQuizUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          score: 1.0,
          userAnswers: ['A'],
        }),
      })
    );
  });

  it('uses LLM grading for short answer questions', async () => {
    const quiz = {
      id: 'qa-2',
      trainingItemId: 'ti-1',
      questions: [
        { question: 'Explain Y', type: 'short_answer', options: null, correctAnswer: 'Y is a concept', explanation: 'Y explained' },
      ],
      trainingItem: { ownerId: 'user-1' },
    };
    mockQuizFindUnique.mockResolvedValue(quiz);
    mockChatJSON.mockResolvedValue({
      results: [{ questionIndex: 0, isCorrect: true, feedback: 'Good answer!' }],
      overallScore: 1.0,
      summary: 'Perfect!',
    });
    mockQuizUpdate.mockResolvedValue({ ...quiz, score: 1.0 });

    const request = new Request('http://localhost/api/training/quiz/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quizAttemptId: 'qa-2', answers: ['Y is a core concept that...'] }),
    });

    const response = await checkQuiz(request);
    expect(response.status).toBe(200);
    expect(mockChatJSON).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd goal-dashboard && npx vitest run src/__tests__/training-quiz-api.test.ts`

Expected: FAIL — route files do not exist.

- [ ] **Step 3: Implement quiz generation route**

Create `src/app/api/training/quiz/generate/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { openrouter } from '@/lib/openrouter';
import { quizGenerationPrompt } from '@/lib/ai-prompts';

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const body = await request.json();
  const { trainingItemId, chapterRange, trainingTaskId } = body;

  if (!trainingItemId || !chapterRange) {
    return NextResponse.json({ error: 'trainingItemId and chapterRange are required' }, { status: 400 });
  }

  // Verify training item exists and belongs to user
  const trainingItem = await prisma.trainingItem.findUnique({
    where: { id: trainingItemId },
  });

  if (!trainingItem) {
    return NextResponse.json({ error: 'Training item not found' }, { status: 404 });
  }
  if (trainingItem.ownerId !== auth.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Build material context from AI metadata and uploaded content
  const metadata = trainingItem.aiMetadata as any;
  const material = metadata
    ? JSON.stringify(metadata.chapters || metadata.modules || {})
    : `Book: ${trainingItem.title}`;

  // Generate quiz via OpenRouter
  const messages = quizGenerationPrompt(material, chapterRange);
  const aiResult = await openrouter.chatJSON<{
    questions: {
      question: string;
      type: string;
      options: string[] | null;
      correctAnswer: string;
      explanation: string;
    }[];
  }>(messages);

  // Create quiz attempt
  const quizAttempt = await prisma.quizAttempt.create({
    data: {
      trainingItemId,
      trainingTaskId: trainingTaskId || null,
      questions: aiResult.questions,
    },
  });

  return NextResponse.json(quizAttempt, { status: 201 });
}
```

- [ ] **Step 4: Implement quiz grading route**

Create `src/app/api/training/quiz/check/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { openrouter } from '@/lib/openrouter';
import { quizCheckPrompt } from '@/lib/ai-prompts';

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const body = await request.json();
  const { quizAttemptId, answers } = body;

  if (!quizAttemptId || !answers || !Array.isArray(answers)) {
    return NextResponse.json({ error: 'quizAttemptId and answers array are required' }, { status: 400 });
  }

  const quizAttempt = await prisma.quizAttempt.findUnique({
    where: { id: quizAttemptId },
    include: { trainingItem: true },
  });

  if (!quizAttempt) {
    return NextResponse.json({ error: 'Quiz attempt not found' }, { status: 404 });
  }
  if (quizAttempt.trainingItem.ownerId !== auth.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const questions = quizAttempt.questions as any[];

  // Separate MC (deterministic) vs short answer/application (LLM-graded)
  const mcQuestions: { index: number; question: any; answer: string }[] = [];
  const llmQuestions: { index: number; question: any; answer: string }[] = [];

  questions.forEach((q, i) => {
    const entry = { index: i, question: q, answer: answers[i] || '' };
    if (q.type === 'multiple_choice') {
      mcQuestions.push(entry);
    } else {
      llmQuestions.push(entry);
    }
  });

  // Grade MC deterministically
  const results: { questionIndex: number; isCorrect: boolean; feedback: string }[] = [];

  for (const mc of mcQuestions) {
    const isCorrect = mc.answer.trim().toLowerCase() === mc.question.correctAnswer.trim().toLowerCase();
    results.push({
      questionIndex: mc.index,
      isCorrect,
      feedback: isCorrect ? 'Correct!' : `Incorrect. The correct answer is: ${mc.question.correctAnswer}. ${mc.question.explanation}`,
    });
  }

  // Grade short answer / application via LLM
  let llmFeedback = null;
  if (llmQuestions.length > 0) {
    const llmQs = llmQuestions.map((q) => q.question);
    const llmAs = llmQuestions.map((q) => q.answer);
    const messages = quizCheckPrompt(llmQs, llmAs);
    const aiResult = await openrouter.chatJSON<{
      results: { questionIndex: number; isCorrect: boolean; feedback: string }[];
      overallScore: number;
      summary: string;
    }>(messages);

    llmFeedback = aiResult;

    for (const llmResult of aiResult.results) {
      const originalIndex = llmQuestions[llmResult.questionIndex].index;
      results.push({
        questionIndex: originalIndex,
        isCorrect: llmResult.isCorrect,
        feedback: llmResult.feedback,
      });
    }
  }

  // Calculate overall score
  results.sort((a, b) => a.questionIndex - b.questionIndex);
  const correctCount = results.filter((r) => r.isCorrect).length;
  const overallScore = questions.length > 0 ? correctCount / questions.length : 0;

  // Update quiz attempt
  const updated = await prisma.quizAttempt.update({
    where: { id: quizAttemptId },
    data: {
      userAnswers: answers,
      score: overallScore,
      llmFeedback: { results, summary: llmFeedback?.summary || `Score: ${Math.round(overallScore * 100)}%` },
      completedAt: new Date(),
    },
  });

  return NextResponse.json(updated);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd goal-dashboard && npx vitest run src/__tests__/training-quiz-api.test.ts`

Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/training/quiz/ src/__tests__/training-quiz-api.test.ts
git commit -m "feat(api): add quiz generation and grading routes with deterministic MC + LLM short answer"
```

---

### Task 7: API — File Upload for Books/Syllabi

**Files:**
- Create: `src/__tests__/training-upload-api.test.ts`
- Create: `src/app/api/training/[id]/upload/route.ts`

- [ ] **Step 1: Write failing tests**

Create `src/__tests__/training-upload-api.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindUnique = vi.fn();
const mockUpdate = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    trainingItem: { findUnique: mockFindUnique, update: mockUpdate },
  },
}));

vi.mock('@/lib/auth-guard', () => ({
  requireAuth: vi.fn(() => ({
    session: { user: { id: 'user-1', isAdmin: false } },
    userId: 'user-1',
  })),
  authError: vi.fn((r: any) => Response.json({ error: r.error }, { status: r.status })),
}));

// Mock Vercel Blob (or S3 equivalent)
const mockPut = vi.fn();
vi.mock('@vercel/blob', () => ({
  put: mockPut,
}));

import { POST } from '@/app/api/training/[id]/upload/route';

describe('POST /api/training/[id]/upload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindUnique.mockResolvedValue({ id: 'ti-1', ownerId: 'user-1' });
    mockPut.mockResolvedValue({ url: 'https://blob.vercel.com/training/file.pdf' });
    mockUpdate.mockResolvedValue({ id: 'ti-1', uploadedFileUrl: 'https://blob.vercel.com/training/file.pdf' });
  });

  it('uploads a file and stores the URL on the training item', async () => {
    const file = new File(['pdf content'], 'book.pdf', { type: 'application/pdf' });
    const formData = new FormData();
    formData.append('file', file);

    const request = new Request('http://localhost/api/training/ti-1/upload', {
      method: 'POST',
      body: formData,
    });

    const response = await POST(request, { params: Promise.resolve({ id: 'ti-1' }) });
    expect(response.status).toBe(200);

    expect(mockPut).toHaveBeenCalledWith(
      expect.stringContaining('training/'),
      expect.any(File),
      expect.objectContaining({ access: 'public' })
    );
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ti-1' },
        data: expect.objectContaining({
          uploadedFileUrl: 'https://blob.vercel.com/training/file.pdf',
        }),
      })
    );
  });

  it('returns 404 if training item not found', async () => {
    mockFindUnique.mockResolvedValue(null);

    const file = new File(['content'], 'book.pdf', { type: 'application/pdf' });
    const formData = new FormData();
    formData.append('file', file);

    const request = new Request('http://localhost/api/training/nonexistent/upload', {
      method: 'POST',
      body: formData,
    });

    const response = await POST(request, { params: Promise.resolve({ id: 'nonexistent' }) });
    expect(response.status).toBe(404);
  });

  it('returns 400 if no file is provided', async () => {
    const formData = new FormData();
    const request = new Request('http://localhost/api/training/ti-1/upload', {
      method: 'POST',
      body: formData,
    });

    const response = await POST(request, { params: Promise.resolve({ id: 'ti-1' }) });
    expect(response.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd goal-dashboard && npx vitest run src/__tests__/training-upload-api.test.ts`

Expected: FAIL — route file does not exist.

- [ ] **Step 3: Implement the upload route**

Create `src/app/api/training/[id]/upload/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { put } from '@vercel/blob';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const ALLOWED_TYPES = ['application/pdf', 'application/epub+zip', 'text/plain'];

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const { id } = await params;

  const item = await prisma.trainingItem.findUnique({ where: { id } });
  if (!item) {
    return NextResponse.json({ error: 'Training item not found' }, { status: 404 });
  }
  if (item.ownerId !== auth.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get('file') as File | null;

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'File too large (max 50MB)' }, { status: 400 });
  }

  // Upload to Vercel Blob
  const blob = await put(`training/${id}/${file.name}`, file, { access: 'public' });

  // Update training item with file URL
  const updated = await prisma.trainingItem.update({
    where: { id },
    data: { uploadedFileUrl: blob.url },
  });

  return NextResponse.json({ uploadedFileUrl: blob.url });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd goal-dashboard && npx vitest run src/__tests__/training-upload-api.test.ts`

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/training/[id]/upload/ src/__tests__/training-upload-api.test.ts
git commit -m "feat(api): add file upload route for training books and course syllabi"
```

---

### Task 8: UI — Training Page and Components

**Files:**
- Create: `src/components/training/__tests__/TrainingList.test.tsx`
- Create: `src/components/training/TrainingList.tsx`
- Create: `src/components/training/__tests__/TrainingItemCard.test.tsx`
- Create: `src/components/training/TrainingItemCard.tsx`
- Create: `src/components/training/__tests__/BookTaskTree.test.tsx`
- Create: `src/components/training/BookTaskTree.tsx`
- Create: `src/components/training/__tests__/CourseModuleTree.test.tsx`
- Create: `src/components/training/CourseModuleTree.tsx`
- Create: `src/components/training/__tests__/QuizModal.test.tsx`
- Create: `src/components/training/QuizModal.tsx`
- Create: `src/components/training/__tests__/AddTrainingModal.test.tsx`
- Create: `src/components/training/AddTrainingModal.tsx`
- Create: `src/app/(app)/training/page.tsx`

This task is split into sub-steps for each component, following test-first order.

#### 8a: AddTrainingModal

- [ ] **Step 1: Write failing test for AddTrainingModal**

Create `src/components/training/__tests__/AddTrainingModal.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AddTrainingModal } from '../AddTrainingModal';

describe('AddTrainingModal', () => {
  it('renders with book type by default', () => {
    render(<AddTrainingModal isOpen={true} onClose={vi.fn()} onSubmit={vi.fn()} type="BOOK" />);
    expect(screen.getByText(/add book/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
  });

  it('renders with course type when specified', () => {
    render(<AddTrainingModal isOpen={true} onClose={vi.fn()} onSubmit={vi.fn()} type="COURSE" />);
    expect(screen.getByText(/add course/i)).toBeInTheDocument();
  });

  it('calls onSubmit with title and type on form submit', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<AddTrainingModal isOpen={true} onClose={vi.fn()} onSubmit={onSubmit} type="BOOK" />);

    await user.type(screen.getByLabelText(/title/i), 'The Art of Impossible');
    await user.click(screen.getByRole('button', { name: /add/i }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'The Art of Impossible',
        type: 'BOOK',
      })
    );
  });

  it('does not render when isOpen is false', () => {
    render(<AddTrainingModal isOpen={false} onClose={vi.fn()} onSubmit={vi.fn()} type="BOOK" />);
    expect(screen.queryByText(/add book/i)).not.toBeInTheDocument();
  });

  it('shows target completion date and goal link fields', () => {
    render(<AddTrainingModal isOpen={true} onClose={vi.fn()} onSubmit={vi.fn()} type="BOOK" />);
    expect(screen.getByLabelText(/target.*date/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/link.*goal/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Implement AddTrainingModal**

Create `src/components/training/AddTrainingModal.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { X } from 'lucide-react';

interface AddTrainingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
    title: string;
    type: 'BOOK' | 'COURSE';
    description?: string;
    targetCompletionDate?: string;
    goalId?: string;
    syllabus?: string;
  }) => void;
  type: 'BOOK' | 'COURSE';
  goals?: { id: string; title: string }[];
}

export function AddTrainingModal({ isOpen, onClose, onSubmit, type, goals = [] }: AddTrainingModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [goalId, setGoalId] = useState('');
  const [syllabus, setSyllabus] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      title,
      type,
      description: description || undefined,
      targetCompletionDate: targetDate || undefined,
      goalId: goalId || undefined,
      syllabus: type === 'COURSE' && syllabus ? syllabus : undefined,
    });
    setTitle('');
    setDescription('');
    setTargetDate('');
    setGoalId('');
    setSyllabus('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg bg-[var(--surface)] p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">
            Add {type === 'BOOK' ? 'Book' : 'Course'}
          </h2>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="training-title" className="block text-sm font-medium mb-1">Title</label>
            <input
              id="training-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--background)] px-3 py-2 text-sm"
              placeholder={type === 'BOOK' ? 'e.g., The Art of Impossible' : 'e.g., Machine Learning Fundamentals'}
            />
          </div>
          <div>
            <label htmlFor="training-description" className="block text-sm font-medium mb-1">Description (optional)</label>
            <textarea
              id="training-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--background)] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="training-target-date" className="block text-sm font-medium mb-1">Target Completion Date</label>
            <input
              id="training-target-date"
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--background)] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="training-goal-link" className="block text-sm font-medium mb-1">Link to Goal</label>
            <select
              id="training-goal-link"
              value={goalId}
              onChange={(e) => setGoalId(e.target.value)}
              className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--background)] px-3 py-2 text-sm"
            >
              <option value="">None</option>
              {goals.map((g) => (
                <option key={g.id} value={g.id}>{g.title}</option>
              ))}
            </select>
          </div>
          {type === 'COURSE' && (
            <div>
              <label htmlFor="training-syllabus" className="block text-sm font-medium mb-1">Syllabus (optional, paste text)</label>
              <textarea
                id="training-syllabus"
                value={syllabus}
                onChange={(e) => setSyllabus(e.target.value)}
                rows={4}
                className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--background)] px-3 py-2 text-sm"
                placeholder="Paste course syllabus or outline here..."
              />
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--hover-bg)]">
              Cancel
            </button>
            <button type="submit" className="rounded-lg bg-prism-indigo px-4 py-2 text-sm text-white hover:opacity-90">
              Add {type === 'BOOK' ? 'Book' : 'Course'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Run test to verify it passes**

Run: `cd goal-dashboard && npx vitest run src/components/training/__tests__/AddTrainingModal.test.tsx`

Expected: All tests PASS.

#### 8b: BookTaskTree

- [ ] **Step 4: Write failing test for BookTaskTree**

Create `src/components/training/__tests__/BookTaskTree.test.tsx`:

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BookTaskTree } from '../BookTaskTree';
import { createTrainingTask, createTask } from '@/test/fixtures';

describe('BookTaskTree', () => {
  it('renders reading tasks with chapter ranges', () => {
    const tasks = [
      createTrainingTask({
        id: 'tt-1',
        chapterRange: '1-2',
        isQuizDay: false,
        sortOrder: 0,
        task: createTask({ id: 't-1', title: 'Read Ch 1-2: Motivation', status: 'DONE' }),
      }),
      createTrainingTask({
        id: 'tt-2',
        chapterRange: '3-4',
        isQuizDay: false,
        sortOrder: 1,
        task: createTask({ id: 't-2', title: 'Read Ch 3-4: Learning', status: 'TODO' }),
      }),
    ];

    render(<BookTaskTree trainingTasks={tasks} onQuizStart={() => {}} />);

    expect(screen.getByText('Read Ch 1-2: Motivation')).toBeInTheDocument();
    expect(screen.getByText('Read Ch 3-4: Learning')).toBeInTheDocument();
  });

  it('renders quiz tasks with a Start Quiz button', () => {
    const tasks = [
      createTrainingTask({
        id: 'tt-3',
        chapterRange: '1-4',
        isQuizDay: true,
        sortOrder: 2,
        task: createTask({ id: 't-3', title: 'Quiz: Chapters 1-4', status: 'TODO' }),
      }),
    ];

    render(<BookTaskTree trainingTasks={tasks} onQuizStart={() => {}} />);

    expect(screen.getByText('Quiz: Chapters 1-4')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start quiz/i })).toBeInTheDocument();
  });

  it('shows completion checkmarks for done tasks', () => {
    const tasks = [
      createTrainingTask({
        id: 'tt-1',
        task: createTask({ id: 't-1', title: 'Done Task', status: 'DONE' }),
      }),
    ];

    render(<BookTaskTree trainingTasks={tasks} onQuizStart={() => {}} />);

    const item = screen.getByText('Done Task').closest('[data-task]');
    expect(item).toHaveAttribute('data-status', 'DONE');
  });
});
```

- [ ] **Step 5: Implement BookTaskTree**

Create `src/components/training/BookTaskTree.tsx`:

```typescript
'use client';

import { CheckCircle2, Circle, BookOpen } from 'lucide-react';

interface TrainingTaskWithTask {
  id: string;
  chapterRange: string | null;
  isQuizDay: boolean;
  sortOrder: number;
  task: {
    id: string;
    title: string;
    status: string;
    dueDate?: string | null;
  };
}

interface BookTaskTreeProps {
  trainingTasks: TrainingTaskWithTask[];
  onQuizStart: (trainingTaskId: string, chapterRange: string) => void;
}

export function BookTaskTree({ trainingTasks, onQuizStart }: BookTaskTreeProps) {
  const sorted = [...trainingTasks].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="space-y-1 pl-4">
      {sorted.map((tt) => {
        const isDone = tt.task.status === 'DONE';
        return (
          <div
            key={tt.id}
            data-task={tt.id}
            data-status={tt.task.status}
            className="flex items-center gap-2 py-1.5 text-sm"
          >
            <span className="flex-shrink-0">
              {isDone ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              ) : (
                <Circle className="h-4 w-4 text-[var(--text-muted)]" />
              )}
            </span>
            <span className={`flex-1 ${isDone ? 'line-through text-[var(--text-muted)]' : ''}`}>
              {tt.task.title}
            </span>
            {tt.isQuizDay && !isDone && (
              <button
                onClick={() => onQuizStart(tt.id, tt.chapterRange || '')}
                className="rounded bg-prism-indigo px-2 py-0.5 text-xs text-white hover:opacity-90"
              >
                Start Quiz
              </button>
            )}
            {tt.isQuizDay && isDone && (
              <span className="text-xs text-emerald-500 font-medium">
                <BookOpen className="h-3 w-3 inline mr-0.5" />
                Quizzed
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd goal-dashboard && npx vitest run src/components/training/__tests__/BookTaskTree.test.tsx`

Expected: All tests PASS.

#### 8c: CourseModuleTree

- [ ] **Step 7: Write failing test for CourseModuleTree**

Create `src/components/training/__tests__/CourseModuleTree.test.tsx`:

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CourseModuleTree } from '../CourseModuleTree';
import { createTrainingTask, createTask } from '@/test/fixtures';

describe('CourseModuleTree', () => {
  const modules = [
    { title: 'Module 1: Linear Algebra', description: 'Foundations' },
    { title: 'Module 2: Statistics', description: 'Stats basics' },
  ];

  const tasks = [
    createTrainingTask({ id: 'tt-1', moduleIndex: 0, sortOrder: 0, task: createTask({ title: 'Module 1: Linear Algebra — Vectors', status: 'DONE' }) }),
    createTrainingTask({ id: 'tt-2', moduleIndex: 0, sortOrder: 1, task: createTask({ title: 'Module 1: Linear Algebra — Matrices', status: 'DONE' }) }),
    createTrainingTask({ id: 'tt-3', moduleIndex: 0, sortOrder: 2, task: createTask({ title: 'Module 1: Linear Algebra — Assignment 1', status: 'TODO' }) }),
    createTrainingTask({ id: 'tt-4', moduleIndex: 1, sortOrder: 3, task: createTask({ title: 'Module 2: Statistics — Probability', status: 'TODO' }) }),
  ];

  it('renders module headers with completion counts', () => {
    render(<CourseModuleTree modules={modules} trainingTasks={tasks} />);

    expect(screen.getByText('Module 1: Linear Algebra')).toBeInTheDocument();
    expect(screen.getByText('Module 2: Statistics')).toBeInTheDocument();
    expect(screen.getByText('2/3')).toBeInTheDocument(); // Module 1: 2 done / 3 total
    expect(screen.getByText('0/1')).toBeInTheDocument(); // Module 2: 0 done / 1 total
  });

  it('collapses and expands modules on click', async () => {
    const user = userEvent.setup();
    render(<CourseModuleTree modules={modules} trainingTasks={tasks} />);

    // Lessons should be visible by default
    expect(screen.getByText(/Vectors/)).toBeInTheDocument();

    // Click module header to collapse
    await user.click(screen.getByText('Module 1: Linear Algebra'));

    // Lessons should be hidden
    expect(screen.queryByText(/Vectors/)).not.toBeInTheDocument();
  });

  it('renders tasks nested under their module', () => {
    render(<CourseModuleTree modules={modules} trainingTasks={tasks} />);

    expect(screen.getByText(/Vectors/)).toBeInTheDocument();
    expect(screen.getByText(/Matrices/)).toBeInTheDocument();
    expect(screen.getByText(/Probability/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 8: Implement CourseModuleTree**

Create `src/components/training/CourseModuleTree.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, CheckCircle2, Circle } from 'lucide-react';

interface Module {
  title: string;
  description: string;
}

interface TrainingTaskWithTask {
  id: string;
  moduleIndex: number | null;
  sortOrder: number;
  task: {
    id: string;
    title: string;
    status: string;
  };
}

interface CourseModuleTreeProps {
  modules: Module[];
  trainingTasks: TrainingTaskWithTask[];
}

export function CourseModuleTree({ modules, trainingTasks }: CourseModuleTreeProps) {
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({});

  const toggleModule = (index: number) => {
    setCollapsed((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  return (
    <div className="space-y-2">
      {modules.map((module, idx) => {
        const moduleTasks = trainingTasks
          .filter((t) => t.moduleIndex === idx)
          .sort((a, b) => a.sortOrder - b.sortOrder);
        const doneCount = moduleTasks.filter((t) => t.task.status === 'DONE').length;
        const totalCount = moduleTasks.length;
        const isCollapsed = collapsed[idx];
        const allDone = totalCount > 0 && doneCount === totalCount;

        return (
          <div key={idx}>
            <button
              onClick={() => toggleModule(idx)}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium hover:bg-[var(--hover-bg)] transition-colors"
            >
              {isCollapsed ? (
                <ChevronRight className="h-4 w-4 text-[var(--text-muted)]" />
              ) : (
                <ChevronDown className="h-4 w-4 text-[var(--text-muted)]" />
              )}
              <span className={allDone ? 'text-emerald-500' : ''}>
                {module.title}
              </span>
              <span className={`ml-auto text-xs font-normal ${allDone ? 'text-emerald-500' : 'text-[var(--text-muted)]'}`}>
                {doneCount}/{totalCount}
              </span>
            </button>
            {!isCollapsed && (
              <div className="ml-6 space-y-1 border-l border-[var(--border-color)] pl-3">
                {moduleTasks.map((tt) => {
                  const isDone = tt.task.status === 'DONE';
                  // Strip module prefix from display title
                  const displayTitle = tt.task.title.replace(`${module.title} — `, '');
                  return (
                    <div key={tt.id} className="flex items-center gap-2 py-1 text-sm">
                      {isDone ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
                      ) : (
                        <Circle className="h-3.5 w-3.5 text-[var(--text-muted)] flex-shrink-0" />
                      )}
                      <span className={isDone ? 'text-[var(--text-muted)] line-through' : ''}>
                        {displayTitle}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 9: Run test to verify it passes**

Run: `cd goal-dashboard && npx vitest run src/components/training/__tests__/CourseModuleTree.test.tsx`

Expected: All tests PASS.

#### 8d: QuizModal

- [ ] **Step 10: Write failing test for QuizModal**

Create `src/components/training/__tests__/QuizModal.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QuizModal } from '../QuizModal';

describe('QuizModal', () => {
  const questions = [
    { question: 'What is X?', type: 'multiple_choice', options: ['A', 'B', 'C', 'D'], correctAnswer: 'A', explanation: '' },
    { question: 'Explain Y', type: 'short_answer', options: null, correctAnswer: '', explanation: '' },
  ];

  it('renders quiz questions', () => {
    render(<QuizModal isOpen={true} questions={questions} onSubmit={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText('What is X?')).toBeInTheDocument();
    expect(screen.getByText('Explain Y')).toBeInTheDocument();
  });

  it('renders multiple choice options as radio buttons', () => {
    render(<QuizModal isOpen={true} questions={questions} onSubmit={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByLabelText('A')).toBeInTheDocument();
    expect(screen.getByLabelText('B')).toBeInTheDocument();
  });

  it('renders textarea for short answer questions', () => {
    render(<QuizModal isOpen={true} questions={questions} onSubmit={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByPlaceholderText(/your answer/i)).toBeInTheDocument();
  });

  it('calls onSubmit with answers on submit', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<QuizModal isOpen={true} questions={questions} onSubmit={onSubmit} onClose={vi.fn()} />);

    await user.click(screen.getByLabelText('A'));
    await user.type(screen.getByPlaceholderText(/your answer/i), 'Y is important');
    await user.click(screen.getByRole('button', { name: /submit/i }));

    expect(onSubmit).toHaveBeenCalledWith(['A', 'Y is important']);
  });

  it('shows results when results prop is provided', () => {
    const results = {
      results: [
        { questionIndex: 0, isCorrect: true, feedback: 'Correct!' },
        { questionIndex: 1, isCorrect: false, feedback: 'Not quite.' },
      ],
      summary: 'Score: 50%',
    };

    render(
      <QuizModal isOpen={true} questions={questions} onSubmit={vi.fn()} onClose={vi.fn()} results={results} />
    );

    expect(screen.getByText('Score: 50%')).toBeInTheDocument();
    expect(screen.getByText('Correct!')).toBeInTheDocument();
    expect(screen.getByText('Not quite.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 11: Implement QuizModal**

Create `src/components/training/QuizModal.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { X, CheckCircle2, XCircle } from 'lucide-react';

interface Question {
  question: string;
  type: string;
  options: string[] | null;
  correctAnswer: string;
  explanation: string;
}

interface QuizResult {
  results: { questionIndex: number; isCorrect: boolean; feedback: string }[];
  summary: string;
}

interface QuizModalProps {
  isOpen: boolean;
  questions: Question[];
  onSubmit: (answers: string[]) => void;
  onClose: () => void;
  results?: QuizResult | null;
  isLoading?: boolean;
}

export function QuizModal({ isOpen, questions, onSubmit, onClose, results, isLoading }: QuizModalProps) {
  const [answers, setAnswers] = useState<string[]>(Array(questions.length).fill(''));

  if (!isOpen) return null;

  const updateAnswer = (index: number, value: string) => {
    setAnswers((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(answers);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 overflow-y-auto py-8">
      <div className="w-full max-w-2xl rounded-lg bg-[var(--surface)] p-6 shadow-xl mx-4">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold">
            {results ? 'Quiz Results' : 'Quiz'}
          </h2>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
            <X className="h-5 w-5" />
          </button>
        </div>

        {results && (
          <div className="mb-6 rounded-lg bg-[var(--hover-bg)] p-4 text-center">
            <p className="text-lg font-semibold">{results.summary}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {questions.map((q, idx) => {
            const result = results?.results.find((r) => r.questionIndex === idx);
            return (
              <div key={idx} className="space-y-2">
                <div className="flex items-start gap-2">
                  <span className="font-medium text-sm">{idx + 1}.</span>
                  <p className="text-sm font-medium">{q.question}</p>
                  {result && (
                    result.isCorrect
                      ? <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                      : <XCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
                  )}
                </div>

                {q.type === 'multiple_choice' && q.options ? (
                  <div className="ml-5 space-y-1">
                    {q.options.map((option) => (
                      <label key={option} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="radio"
                          name={`q-${idx}`}
                          value={option}
                          checked={answers[idx] === option}
                          onChange={() => updateAnswer(idx, option)}
                          disabled={!!results}
                          className="accent-prism-indigo"
                        />
                        {option}
                      </label>
                    ))}
                  </div>
                ) : (
                  <div className="ml-5">
                    <textarea
                      value={answers[idx]}
                      onChange={(e) => updateAnswer(idx, e.target.value)}
                      disabled={!!results}
                      placeholder="Type your answer..."
                      rows={3}
                      className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--background)] px-3 py-2 text-sm"
                    />
                  </div>
                )}

                {result && (
                  <p className={`ml-5 text-xs ${result.isCorrect ? 'text-emerald-600' : 'text-red-600'}`}>
                    {result.feedback}
                  </p>
                )}
              </div>
            );
          })}

          {!results && (
            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={isLoading}
                className="rounded-lg bg-prism-indigo px-4 py-2 text-sm text-white hover:opacity-90 disabled:opacity-50"
              >
                {isLoading ? 'Grading...' : 'Submit Quiz'}
              </button>
            </div>
          )}

          {results && (
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg bg-prism-indigo px-4 py-2 text-sm text-white hover:opacity-90"
              >
                Close
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 12: Run test to verify it passes**

Run: `cd goal-dashboard && npx vitest run src/components/training/__tests__/QuizModal.test.tsx`

Expected: All tests PASS.

#### 8e: TrainingItemCard

- [ ] **Step 13: Write failing test for TrainingItemCard**

Create `src/components/training/__tests__/TrainingItemCard.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TrainingItemCard } from '../TrainingItemCard';
import { createTrainingItem, createTrainingTask, createTask } from '@/test/fixtures';

describe('TrainingItemCard', () => {
  it('renders book title and type badge', () => {
    const item = createTrainingItem({ title: 'The Art of Impossible', type: 'BOOK' });
    render(<TrainingItemCard item={item} onQuizStart={vi.fn()} onUpload={vi.fn()} />);

    expect(screen.getByText('The Art of Impossible')).toBeInTheDocument();
    expect(screen.getByText('Book')).toBeInTheDocument();
  });

  it('renders course title and type badge', () => {
    const item = createTrainingItem({ title: 'ML Fundamentals', type: 'COURSE' });
    render(<TrainingItemCard item={item} onQuizStart={vi.fn()} onUpload={vi.fn()} />);

    expect(screen.getByText('ML Fundamentals')).toBeInTheDocument();
    expect(screen.getByText('Course')).toBeInTheDocument();
  });

  it('shows progress based on completed tasks', () => {
    const item = createTrainingItem({
      title: 'Test Book',
      trainingTasks: [
        createTrainingTask({ id: 'tt-1', task: createTask({ status: 'DONE' }) }),
        createTrainingTask({ id: 'tt-2', task: createTask({ status: 'TODO' }) }),
        createTrainingTask({ id: 'tt-3', task: createTask({ status: 'TODO' }) }),
      ],
    });

    render(<TrainingItemCard item={item} onQuizStart={vi.fn()} onUpload={vi.fn()} />);
    expect(screen.getByText('1/3 tasks done')).toBeInTheDocument();
  });

  it('shows linked goal name when goalId is set', () => {
    const item = createTrainingItem({
      goal: { id: 'g-1', title: 'Complete ML certification' },
    });

    render(<TrainingItemCard item={item} onQuizStart={vi.fn()} onUpload={vi.fn()} />);
    expect(screen.getByText(/Complete ML certification/)).toBeInTheDocument();
  });

  it('shows upload button for books without uploaded content', () => {
    const item = createTrainingItem({ type: 'BOOK', uploadedFileUrl: null });
    render(<TrainingItemCard item={item} onQuizStart={vi.fn()} onUpload={vi.fn()} />);
    expect(screen.getByRole('button', { name: /upload/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 14: Implement TrainingItemCard**

Create `src/components/training/TrainingItemCard.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { BookOpen, GraduationCap, Upload, Target, ChevronDown, ChevronRight } from 'lucide-react';
import { BookTaskTree } from './BookTaskTree';
import { CourseModuleTree } from './CourseModuleTree';

interface TrainingItemCardProps {
  item: any;
  onQuizStart: (trainingTaskId: string, chapterRange: string, trainingItemId: string) => void;
  onUpload: (trainingItemId: string) => void;
}

export function TrainingItemCard({ item, onQuizStart, onUpload }: TrainingItemCardProps) {
  const [expanded, setExpanded] = useState(true);

  const doneTasks = item.trainingTasks?.filter((tt: any) => tt.task.status === 'DONE').length || 0;
  const totalTasks = item.trainingTasks?.length || 0;

  const isBook = item.type === 'BOOK';
  const Icon = isBook ? BookOpen : GraduationCap;
  const typeBadge = isBook ? 'Book' : 'Course';

  const modules = item.aiMetadata?.modules || [];

  return (
    <div className="rounded-lg border border-[var(--border-color)] bg-[var(--surface)] p-4">
      <div className="flex items-start gap-3">
        <button onClick={() => setExpanded(!expanded)} className="mt-1 flex-shrink-0">
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-[var(--text-muted)]" />
          ) : (
            <ChevronRight className="h-4 w-4 text-[var(--text-muted)]" />
          )}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Icon className="h-4 w-4 text-prism-indigo flex-shrink-0" />
            <h3 className="text-sm font-semibold truncate">{item.title}</h3>
            <span className="rounded-full bg-[var(--hover-bg)] px-2 py-0.5 text-xs text-[var(--text-muted)] flex-shrink-0">
              {typeBadge}
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-[var(--text-muted)]">
            <span>{doneTasks}/{totalTasks} tasks done</span>
            {item.targetCompletionDate && (
              <span>Due: {new Date(item.targetCompletionDate).toLocaleDateString()}</span>
            )}
            {item.goal && (
              <span className="flex items-center gap-1">
                <Target className="h-3 w-3" />
                {item.goal.title}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {isBook && !item.uploadedFileUrl && (
            <button
              onClick={() => onUpload(item.id)}
              className="rounded p-1.5 text-[var(--text-muted)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]"
              aria-label="Upload book file"
            >
              <Upload className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {expanded && item.trainingTasks?.length > 0 && (
        <div className="mt-3">
          {isBook ? (
            <BookTaskTree
              trainingTasks={item.trainingTasks}
              onQuizStart={(ttId, range) => onQuizStart(ttId, range, item.id)}
            />
          ) : (
            <CourseModuleTree
              modules={modules}
              trainingTasks={item.trainingTasks}
            />
          )}
        </div>
      )}

      {/* Progress bar */}
      {totalTasks > 0 && (
        <div className="mt-3 h-1.5 rounded-full bg-[var(--hover-bg)]">
          <div
            className="h-full rounded-full bg-prism-indigo transition-all"
            style={{ width: `${(doneTasks / totalTasks) * 100}%` }}
          />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 15: Run test to verify it passes**

Run: `cd goal-dashboard && npx vitest run src/components/training/__tests__/TrainingItemCard.test.tsx`

Expected: All tests PASS.

#### 8f: TrainingList and Training Page

- [ ] **Step 16: Write failing test for TrainingList**

Create `src/components/training/__tests__/TrainingList.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TrainingList } from '../TrainingList';
import { createTrainingItem } from '@/test/fixtures';

// Mock SWR
vi.mock('swr', () => ({
  default: vi.fn(() => ({
    data: [
      createTrainingItem({ id: 'ti-1', title: 'The Art of Impossible', type: 'BOOK' }),
      createTrainingItem({ id: 'ti-2', title: 'ML Fundamentals', type: 'COURSE' }),
    ],
    error: null,
    isLoading: false,
    mutate: vi.fn(),
  })),
}));

describe('TrainingList', () => {
  it('renders the page heading and add buttons', () => {
    render(<TrainingList />);
    expect(screen.getByText('Training')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /book/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /course/i })).toBeInTheDocument();
  });

  it('renders training items from SWR data', () => {
    render(<TrainingList />);
    expect(screen.getByText('The Art of Impossible')).toBeInTheDocument();
    expect(screen.getByText('ML Fundamentals')).toBeInTheDocument();
  });

  it('opens add book modal when + Book is clicked', async () => {
    const user = userEvent.setup();
    render(<TrainingList />);
    await user.click(screen.getByRole('button', { name: /book/i }));
    expect(screen.getByText(/add book/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 17: Implement TrainingList**

Create `src/components/training/TrainingList.tsx`:

```typescript
'use client';

import { useState, useCallback } from 'react';
import useSWR from 'swr';
import { BookOpen, GraduationCap, Plus } from 'lucide-react';
import { TrainingItemCard } from './TrainingItemCard';
import { AddTrainingModal } from './AddTrainingModal';
import { QuizModal } from './QuizModal';

export function TrainingList() {
  const { data: items, mutate, isLoading } = useSWR('/api/training');
  const [addType, setAddType] = useState<'BOOK' | 'COURSE' | null>(null);
  const [quizState, setQuizState] = useState<{
    trainingItemId: string;
    trainingTaskId: string;
    chapterRange: string;
    quizAttemptId?: string;
    questions?: any[];
    results?: any;
  } | null>(null);
  const [quizLoading, setQuizLoading] = useState(false);

  const handleAddSubmit = useCallback(async (data: any) => {
    const endpoint = data.type === 'BOOK' ? '/api/training/books' : '/api/training/courses';
    await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    mutate();
  }, [mutate]);

  const handleQuizStart = useCallback(async (trainingTaskId: string, chapterRange: string, trainingItemId: string) => {
    setQuizLoading(true);
    try {
      const res = await fetch('/api/training/quiz/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trainingItemId, chapterRange, trainingTaskId }),
      });
      const quiz = await res.json();
      setQuizState({
        trainingItemId,
        trainingTaskId,
        chapterRange,
        quizAttemptId: quiz.id,
        questions: quiz.questions,
      });
    } finally {
      setQuizLoading(false);
    }
  }, []);

  const handleQuizSubmit = useCallback(async (answers: string[]) => {
    if (!quizState?.quizAttemptId) return;
    setQuizLoading(true);
    try {
      const res = await fetch('/api/training/quiz/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quizAttemptId: quizState.quizAttemptId, answers }),
      });
      const result = await res.json();
      setQuizState((prev) => prev ? { ...prev, results: result.llmFeedback } : null);
      mutate();
    } finally {
      setQuizLoading(false);
    }
  }, [quizState, mutate]);

  const handleUpload = useCallback(async (trainingItemId: string) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,.epub,.txt';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const formData = new FormData();
      formData.append('file', file);
      await fetch(`/api/training/${trainingItemId}/upload`, {
        method: 'POST',
        body: formData,
      });
      mutate();
    };
    input.click();
  }, [mutate]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold font-display">Training</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setAddType('BOOK')}
            className="flex items-center gap-1.5 rounded-lg bg-prism-indigo px-3 py-2 text-sm text-white hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            <BookOpen className="h-4 w-4" />
            Book
          </button>
          <button
            onClick={() => setAddType('COURSE')}
            className="flex items-center gap-1.5 rounded-lg bg-prism-indigo px-3 py-2 text-sm text-white hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            <GraduationCap className="h-4 w-4" />
            Course
          </button>
        </div>
      </div>

      {isLoading && (
        <div className="text-center text-[var(--text-muted)] py-12">Loading training items...</div>
      )}

      {!isLoading && (!items || items.length === 0) && (
        <div className="text-center text-[var(--text-muted)] py-12">
          <BookOpen className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>No training items yet.</p>
          <p className="text-sm mt-1">Add a book or course to get started.</p>
        </div>
      )}

      <div className="space-y-4">
        {items?.map((item: any) => (
          <TrainingItemCard
            key={item.id}
            item={item}
            onQuizStart={handleQuizStart}
            onUpload={handleUpload}
          />
        ))}
      </div>

      <AddTrainingModal
        isOpen={addType !== null}
        onClose={() => setAddType(null)}
        onSubmit={handleAddSubmit}
        type={addType || 'BOOK'}
      />

      {quizState?.questions && (
        <QuizModal
          isOpen={true}
          questions={quizState.questions}
          onSubmit={handleQuizSubmit}
          onClose={() => setQuizState(null)}
          results={quizState.results}
          isLoading={quizLoading}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 18: Create the Training page**

Create `src/app/(app)/training/page.tsx`:

```typescript
import { TrainingList } from '@/components/training/TrainingList';

export const metadata = { title: 'Training — Prism' };

export default function TrainingPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <TrainingList />
    </div>
  );
}
```

- [ ] **Step 19: Run all component tests**

Run: `cd goal-dashboard && npx vitest run src/components/training/`

Expected: All tests PASS.

- [ ] **Step 20: Commit**

```bash
git add src/components/training/ src/app/\(app\)/training/
git commit -m "feat(ui): add training page with book/course views, quiz modal, and add modal"
```

---

### Task 9: Sidebar Navigation — Add "Training" Link

**Files:**
- Modify: `src/components/layout/Sidebar.tsx` (lines 7-18, 22-30)
- Modify: `src/components/layout/__tests__/Sidebar.test.tsx`

- [ ] **Step 1: Write failing test for Training nav link**

In `src/components/layout/__tests__/Sidebar.test.tsx`, add a test (at the end of the describe block):

```typescript
  it('renders Training nav link between Goal Stack and Tasks', () => {
    render(<Sidebar />);
    const links = screen.getAllByRole('link');
    const labels = links.map((l) => l.textContent);
    const goalIdx = labels.indexOf('Goal Stack');
    const trainingIdx = labels.indexOf('Training');
    const tasksIdx = labels.indexOf('Tasks');
    expect(trainingIdx).toBeGreaterThan(goalIdx);
    expect(trainingIdx).toBeLessThan(tasksIdx);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd goal-dashboard && npx vitest run src/components/layout/__tests__/Sidebar.test.tsx`

Expected: FAIL — no "Training" link exists.

- [ ] **Step 3: Add Training to sidebar navigation**

In `src/components/layout/Sidebar.tsx`:

**Change 1 — line 7:** Add `BookOpen` to the lucide-react import:

```typescript
import {
  LayoutDashboard,
  Target,
  BookOpen,
  CheckSquare,
  Calendar,
  ClipboardCheck,
  Moon,
  Trophy,
  BarChart3,
  ListChecks,
  Settings,
} from 'lucide-react';
```

**Change 2 — line 28:** Add the Training item between Goal Stack and Tasks in the Work section:

```typescript
const navSections = [
  {
    label: 'Work',
    items: [
      { href: '/', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/goals', label: 'Goal Stack', icon: Target },
      { href: '/training', label: 'Training', icon: BookOpen },
      { href: '/tasks', label: 'Tasks', icon: CheckSquare },
    ],
  },
  // ... rest unchanged
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd goal-dashboard && npx vitest run src/components/layout/__tests__/Sidebar.test.tsx`

Expected: All tests PASS.

- [ ] **Step 5: Run full test suite and build**

Run: `cd goal-dashboard && npx vitest run && npm run build`

Expected: All tests PASS, build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/components/layout/Sidebar.tsx src/components/layout/__tests__/Sidebar.test.tsx
git commit -m "feat(nav): add Training link to sidebar between Goal Stack and Tasks"
```

---

## Verification Checklist

After all tasks are complete, verify end-to-end:

1. `npx prisma migrate dev` — all migrations applied cleanly
2. `npx vitest run` — all tests pass
3. `npm run build` — production build succeeds with no errors
4. Navigate to `/training` — page renders with empty state
5. Click "+ Book" — modal opens with title, description, target date, goal link fields
6. Submit book title — AI breakdown fires, tasks appear in book task tree
7. Click "Start Quiz" on quiz day task — quiz modal opens with questions
8. Submit quiz answers — grading returns with score and feedback
9. Click "+ Course" — modal opens with syllabus paste field
10. Submit course — module/lesson tree renders with collapsible hierarchy
11. Upload a book PDF — file stored, URL linked to training item
12. Sidebar shows "Training" between "Goal Stack" and "Tasks"
