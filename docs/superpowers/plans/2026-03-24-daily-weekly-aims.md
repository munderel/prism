# Daily & Weekly Aims System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Daily & Weekly Aims system based on the Flow Research Collective framework. Users opt into aim categories (deep work, exercise, flow activity, etc.), customize duration/frequency, and schedule aim instances into the calendar. Group-able aims can be opened for other users to join.

**Architecture:** Seven layers, each with its own test-first cycle: (1) Prisma schema adds AimCategory, UserAim, and AimInstance models + migration, (2) seed script populates default FRC aim categories, (3) API routes for categories, user preferences, instances, and group discovery, (4) `/aims` page with daily/weekly sections, toggle cards, Active Recovery activity management, and weekly schedule preview, (5) calendar integration adds "Aims" source filter and renders teal aim blocks, (6) group aims flow lets users open instances and others join, (7) sidebar navigation adds the Aims link. Each task is isolated to 1-3 files.

**Tech Stack:** Next.js 14 / TypeScript / Prisma / PostgreSQL / Vitest / Tailwind / lucide-react / SWR

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `prisma/schema.prisma` | Modify | Add AimCategory, UserAim, AimInstance models; add relations to User |
| `prisma/migrations/YYYYMMDD_add_aims_system/migration.sql` | Auto-generated | CREATE TABLE for AimCategory, UserAim, AimInstance |
| `prisma/seed.ts` | Modify | Seed 7 default aim categories (1 daily + 6 weekly) |
| `src/test/fixtures.ts` | Modify | Add `createAimCategory`, `createUserAim`, `createAimInstance` factories |
| `src/__tests__/aims-categories-api.test.ts` | Create | Tests for GET/POST `/api/aims/categories` |
| `src/app/api/aims/categories/route.ts` | Create | GET all categories, POST custom category |
| `src/__tests__/aims-user-api.test.ts` | Create | Tests for GET/PUT `/api/aims/user` |
| `src/app/api/aims/user/route.ts` | Create | GET user aim preferences, PUT bulk update |
| `src/__tests__/aims-instances-api.test.ts` | Create | Tests for GET/POST/PATCH `/api/aims/instances` |
| `src/app/api/aims/instances/route.ts` | Create | GET instances by date range, POST new instance |
| `src/app/api/aims/instances/[id]/route.ts` | Create | PATCH instance (complete, skip, toggle group, change time) |
| `src/__tests__/aims-group-api.test.ts` | Create | Tests for GET `/api/aims/group` |
| `src/app/api/aims/group/route.ts` | Create | GET group-open instances from other users |
| `src/components/aims/__tests__/AimCategoryCard.test.tsx` | Create | Tests for toggle, duration/frequency editing, activity list |
| `src/components/aims/AimCategoryCard.tsx` | Create | Card component for a single aim category with on/off toggle |
| `src/components/aims/__tests__/ActiveRecoveryActivities.test.tsx` | Create | Tests for add/remove activities |
| `src/components/aims/ActiveRecoveryActivities.tsx` | Create | Sub-section for managing Active Recovery activities |
| `src/components/aims/__tests__/WeeklySchedulePreview.test.tsx` | Create | Tests for schedule preview rendering |
| `src/components/aims/WeeklySchedulePreview.tsx` | Create | Preview of active aims spread across the week |
| `src/app/(app)/aims/__tests__/AimsPage.test.tsx` | Create | Tests for /aims page rendering and interactions |
| `src/app/(app)/aims/page.tsx` | Create | Main /aims page with daily + weekly sections |
| `src/components/calendar/__tests__/CalendarView.test.tsx` | Modify | Add aim instance rendering tests |
| `src/components/calendar/CalendarView.tsx` | Modify | Add 'aims' source filter, render teal aim blocks |
| `src/app/api/calendar/route.ts` | Modify | Fetch and include aim instances in calendar events |
| `src/components/layout/__tests__/Sidebar.test.tsx` | Modify | Update nav item count, add Aims presence test |
| `src/components/layout/Sidebar.tsx` | Modify | Add "Aims" nav item to Rituals section |

---

### Task 1: Prisma Schema — Add AimCategory, UserAim, AimInstance Models

**Files:**
- Modify: `prisma/schema.prisma` (add after the Meetings section, before Versioning)

- [ ] **Step 1: Add the three new models and User relations**

In `prisma/schema.prisma`, add the following after the `Meeting` model (line 482) and before `// === VERSIONING ===`:

```prisma
// === AIMS (Flow Research Collective) ===

model AimCategory {
  id                String   @id @default(cuid())
  name              String
  description       String?  @db.Text
  defaultFrequency  Int      // times per week
  defaultDurationMin Int     // minutes
  isGroupable       Boolean  @default(false)
  isDefault         Boolean  @default(true)
  isDaily           Boolean  @default(false)
  activities        Json?    // for Active Recovery: ["sauna", "massage", ...]
  createdAt         DateTime @default(now())

  userAims     UserAim[]
  aimInstances AimInstance[]
}

model UserAim {
  id              String   @id @default(cuid())
  userId          String
  aimCategoryId   String
  isActive        Boolean  @default(true)
  customDuration  Int?
  customFrequency Int?
  customActivities Json?   // user's custom activity list (for Active Recovery)
  createdAt       DateTime @default(now())

  user        User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  aimCategory AimCategory @relation(fields: [aimCategoryId], references: [id], onDelete: Cascade)

  @@unique([userId, aimCategoryId])
}

model AimInstance {
  id             String    @id @default(cuid())
  userId         String
  aimCategoryId  String
  scheduledDate  DateTime
  timeBlockStart DateTime?
  timeBlockEnd   DateTime?
  isGroupOpen    Boolean   @default(false)
  status         String    @default("SCHEDULED") // SCHEDULED, COMPLETED, SKIPPED
  completedAt    DateTime?
  activityNote   String?   // what specific activity was done
  createdAt      DateTime  @default(now())

  user        User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  aimCategory AimCategory @relation(fields: [aimCategoryId], references: [id], onDelete: Cascade)

  @@index([userId, scheduledDate])
}
```

- [ ] **Step 2: Add relations to the User model**

In `prisma/schema.prisma`, add the following two lines to the `User` model (after `meetings Meeting[]`, line 81):

```prisma
  userAims              UserAim[]
  aimInstances          AimInstance[]
```

- [ ] **Step 3: Generate and run the migration**

Run: `cd goal-dashboard && npx prisma migrate dev --name add_aims_system`

Expected: Migration creates three tables (`AimCategory`, `UserAim`, `AimInstance`) with the unique constraint on `UserAim(userId, aimCategoryId)` and the composite index on `AimInstance(userId, scheduledDate)`.

- [ ] **Step 4: Verify Prisma client is regenerated**

Run: `cd goal-dashboard && npx prisma generate`

Expected: Client regenerated with `AimCategory`, `UserAim`, and `AimInstance` types.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(schema): add AimCategory, UserAim, AimInstance models for aims system"
```

---

### Task 2: Seed Data — Populate Default Aim Categories

**Files:**
- Modify: `prisma/seed.ts` (add after the admin user upsert, before the `console.log` at end)

- [ ] **Step 1: Add aim category seed data**

In `prisma/seed.ts`, add the following after the admin user upsert block (after line 112) and before the final `console.log`:

```typescript
  // Seed default Aim Categories (Flow Research Collective framework)
  const aimCategories = [
    {
      name: 'Deep Work',
      description: 'Uninterrupted concentration on your most important task. Apply one strength in a new way. Push the challenge-skills sweet spot.',
      defaultFrequency: 7, // daily = 7x/week
      defaultDurationMin: 90,
      isGroupable: false,
      isDefault: true,
      isDaily: true,
      activities: null,
    },
    {
      name: 'Flow Activity',
      description: 'Highest-flow activity (skiing, dancing, singing, etc.). Deploy flow triggers, be creative, take risks.',
      defaultFrequency: 2,
      defaultDurationMin: 180,
      isGroupable: true,
      isDefault: true,
      isDaily: false,
      activities: null,
    },
    {
      name: 'Exercise',
      description: 'Cognitively challenging exercise (trail running > treadmill). Cross-train grit, reset nervous system.',
      defaultFrequency: 3,
      defaultDurationMin: 60,
      isGroupable: true,
      isDefault: true,
      isDaily: false,
      activities: null,
    },
    {
      name: 'Active Recovery',
      description: 'Sauna, massage, extended mindfulness, light yoga.',
      defaultFrequency: 3,
      defaultDurationMin: 30,
      isGroupable: true,
      isDefault: true,
      isDaily: false,
      activities: JSON.stringify(['sauna', 'massage', 'extended mindfulness', 'light yoga']),
    },
    {
      name: 'Train Weakness',
      description: 'Train a weakness, practice being your best when at your worst, practice taking risks.',
      defaultFrequency: 1,
      defaultDurationMin: 45,
      isGroupable: false,
      isDefault: true,
      isDaily: false,
      activities: null,
    },
    {
      name: 'Get Feedback',
      description: 'Get feedback on work from uninterrupted concentration periods.',
      defaultFrequency: 1,
      defaultDurationMin: 45,
      isGroupable: false,
      isDefault: true,
      isDaily: false,
      activities: null,
    },
    {
      name: 'Social Support',
      description: 'Relationships and emotional intelligence practice. Especially important for introverts.',
      defaultFrequency: 1,
      defaultDurationMin: 120,
      isGroupable: true,
      isDefault: true,
      isDaily: false,
      activities: null,
    },
  ];

  for (const aim of aimCategories) {
    await prisma.aimCategory.upsert({
      where: { id: aim.name.toLowerCase().replace(/\s+/g, '-') },
      update: aim,
      create: {
        id: aim.name.toLowerCase().replace(/\s+/g, '-'),
        ...aim,
      },
    });
  }
```

- [ ] **Step 2: Update the final console.log**

Replace the existing `console.log` line at the end of `main()` with:

```typescript
  console.log(`Seed complete: 4 ReviewTemplates + CompanySettings + Admin user (${adminUser.email}) + ${aimCategories.length} AimCategories`);
```

- [ ] **Step 3: Run the seed**

Run: `cd goal-dashboard && npx prisma db seed`

Expected: Seed completes with 7 AimCategories created/updated.

- [ ] **Step 4: Commit**

```bash
git add prisma/seed.ts
git commit -m "feat(seed): add 7 default FRC aim categories"
```

---

### Task 3: Test Fixtures — Add Aim Factories

**Files:**
- Modify: `src/test/fixtures.ts` (add after `createReview`, before `resetFixtureIds`)

- [ ] **Step 1: Add `createAimCategory` fixture**

In `src/test/fixtures.ts`, add after the `createReview` function (after line 96) and before `resetFixtureIds`:

```typescript
export function createAimCategory(overrides: Record<string, any> = {}) {
  return {
    id: nextId(),
    name: 'Test Aim',
    description: 'Test description',
    defaultFrequency: 3,
    defaultDurationMin: 60,
    isGroupable: false,
    isDefault: true,
    isDaily: false,
    activities: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

export function createUserAim(overrides: Record<string, any> = {}) {
  return {
    id: nextId(),
    userId: 'user-1',
    aimCategoryId: 'aim-cat-1',
    isActive: true,
    customDuration: null,
    customFrequency: null,
    customActivities: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

export function createAimInstance(overrides: Record<string, any> = {}) {
  return {
    id: nextId(),
    userId: 'user-1',
    aimCategoryId: 'aim-cat-1',
    scheduledDate: new Date().toISOString(),
    timeBlockStart: null,
    timeBlockEnd: null,
    isGroupOpen: false,
    status: 'SCHEDULED',
    completedAt: null,
    activityNote: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}
```

- [ ] **Step 2: Run existing tests to verify nothing breaks**

Run: `cd goal-dashboard && npx vitest run`

Expected: All existing tests PASS.

- [ ] **Step 3: Commit**

```bash
git add src/test/fixtures.ts
git commit -m "test: add aim category, user aim, and aim instance fixtures"
```

---

### Task 4: API — GET/POST `/api/aims/categories`

**Files:**
- Create: `src/__tests__/aims-categories-api.test.ts`
- Create: `src/app/api/aims/categories/route.ts`

- [ ] **Step 1: Write failing tests**

Create `src/__tests__/aims-categories-api.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindMany = vi.fn();
const mockCreate = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    aimCategory: {
      findMany: mockFindMany,
      create: mockCreate,
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

import { GET, POST } from '@/app/api/aims/categories/route';

describe('GET /api/aims/categories', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns all aim categories', async () => {
    const categories = [
      { id: 'deep-work', name: 'Deep Work', isDaily: true, defaultFrequency: 7, defaultDurationMin: 90 },
      { id: 'exercise', name: 'Exercise', isDaily: false, defaultFrequency: 3, defaultDurationMin: 60 },
    ];
    mockFindMany.mockResolvedValue(categories);

    const request = new Request('http://localhost/api/aims/categories');
    const response = await GET(request);
    const data = await response.json();

    expect(mockFindMany).toHaveBeenCalled();
    expect(data).toHaveLength(2);
    expect(data[0].name).toBe('Deep Work');
  });
});

describe('POST /api/aims/categories', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a custom aim category', async () => {
    const newCategory = {
      name: 'Meditation',
      description: 'Daily meditation practice',
      defaultFrequency: 7,
      defaultDurationMin: 20,
      isGroupable: false,
      isDaily: true,
    };
    mockCreate.mockResolvedValue({ id: 'new-1', ...newCategory, isDefault: false });

    const request = new Request('http://localhost/api/aims/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newCategory),
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: 'Meditation',
        isDefault: false,
      }),
    });
  });

  it('rejects when name is missing', async () => {
    const request = new Request('http://localhost/api/aims/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ defaultFrequency: 1, defaultDurationMin: 30 }),
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd goal-dashboard && npx vitest run src/__tests__/aims-categories-api.test.ts`

Expected: FAIL — module `@/app/api/aims/categories/route` does not exist.

- [ ] **Step 3: Implement the route**

Create `src/app/api/aims/categories/route.ts`:

```typescript
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';

export async function GET(_request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const categories = await prisma.aimCategory.findMany({
    orderBy: [{ isDaily: 'desc' }, { name: 'asc' }],
  });

  return Response.json(categories);
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const body = await request.json();
  const { name, description, defaultFrequency, defaultDurationMin, isGroupable, isDaily, activities } = body;

  if (!name || defaultFrequency === undefined || defaultDurationMin === undefined) {
    return Response.json({ error: 'name, defaultFrequency, and defaultDurationMin are required' }, { status: 400 });
  }

  const category = await prisma.aimCategory.create({
    data: {
      name,
      description: description ?? null,
      defaultFrequency,
      defaultDurationMin,
      isGroupable: isGroupable ?? false,
      isDefault: false,
      isDaily: isDaily ?? false,
      activities: activities ?? null,
    },
  });

  return Response.json(category, { status: 201 });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd goal-dashboard && npx vitest run src/__tests__/aims-categories-api.test.ts`

Expected: All 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/aims/categories/route.ts src/__tests__/aims-categories-api.test.ts
git commit -m "feat(api): add GET/POST /api/aims/categories"
```

---

### Task 5: API — GET/PUT `/api/aims/user`

**Files:**
- Create: `src/__tests__/aims-user-api.test.ts`
- Create: `src/app/api/aims/user/route.ts`

- [ ] **Step 1: Write failing tests**

Create `src/__tests__/aims-user-api.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindMany = vi.fn();
const mockUpsert = vi.fn();
const mockTransaction = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    userAim: {
      findMany: mockFindMany,
      upsert: mockUpsert,
    },
    $transaction: mockTransaction,
  },
}));

vi.mock('@/lib/auth-guard', () => ({
  requireAuth: vi.fn(() => ({
    session: { user: { id: 'user-1', isAdmin: false } },
    userId: 'user-1',
  })),
  authError: vi.fn((r: any) => Response.json({ error: r.error }, { status: r.status })),
}));

import { GET, PUT } from '@/app/api/aims/user/route';

describe('GET /api/aims/user', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns user aim preferences with category data', async () => {
    const userAims = [
      { id: 'ua-1', userId: 'user-1', aimCategoryId: 'deep-work', isActive: true, customDuration: null, customFrequency: null, aimCategory: { name: 'Deep Work' } },
    ];
    mockFindMany.mockResolvedValue(userAims);

    const request = new Request('http://localhost/api/aims/user');
    const response = await GET(request);
    const data = await response.json();

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1' },
      })
    );
    expect(data).toHaveLength(1);
    expect(data[0].aimCategory.name).toBe('Deep Work');
  });
});

describe('PUT /api/aims/user', () => {
  beforeEach(() => vi.clearAllMocks());

  it('bulk updates aim preferences via upserts', async () => {
    const aims = [
      { aimCategoryId: 'deep-work', isActive: true, customDuration: 120, customFrequency: null },
      { aimCategoryId: 'exercise', isActive: false, customDuration: null, customFrequency: null },
    ];
    mockTransaction.mockResolvedValue([{}, {}]);

    const request = new Request('http://localhost/api/aims/user', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aims }),
    });
    const response = await PUT(request);

    expect(response.status).toBe(200);
    expect(mockTransaction).toHaveBeenCalled();
  });

  it('rejects when aims array is missing', async () => {
    const request = new Request('http://localhost/api/aims/user', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const response = await PUT(request);
    expect(response.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd goal-dashboard && npx vitest run src/__tests__/aims-user-api.test.ts`

Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the route**

Create `src/app/api/aims/user/route.ts`:

```typescript
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';

export async function GET(_request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const userAims = await prisma.userAim.findMany({
    where: { userId: auth.userId },
    include: { aimCategory: true },
    orderBy: { aimCategory: { name: 'asc' } },
  });

  return Response.json(userAims);
}

export async function PUT(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const body = await request.json();
  const { aims } = body;

  if (!Array.isArray(aims)) {
    return Response.json({ error: 'aims array is required' }, { status: 400 });
  }

  const upserts = aims.map((aim: any) =>
    prisma.userAim.upsert({
      where: {
        userId_aimCategoryId: {
          userId: auth.userId,
          aimCategoryId: aim.aimCategoryId,
        },
      },
      update: {
        isActive: aim.isActive ?? true,
        customDuration: aim.customDuration ?? null,
        customFrequency: aim.customFrequency ?? null,
        customActivities: aim.customActivities ?? undefined,
      },
      create: {
        userId: auth.userId,
        aimCategoryId: aim.aimCategoryId,
        isActive: aim.isActive ?? true,
        customDuration: aim.customDuration ?? null,
        customFrequency: aim.customFrequency ?? null,
        customActivities: aim.customActivities ?? null,
      },
    })
  );

  const results = await prisma.$transaction(upserts);

  return Response.json(results);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd goal-dashboard && npx vitest run src/__tests__/aims-user-api.test.ts`

Expected: All 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/aims/user/route.ts src/__tests__/aims-user-api.test.ts
git commit -m "feat(api): add GET/PUT /api/aims/user for aim preferences"
```

---

### Task 6: API — GET/POST `/api/aims/instances` + PATCH `/api/aims/instances/[id]`

**Files:**
- Create: `src/__tests__/aims-instances-api.test.ts`
- Create: `src/app/api/aims/instances/route.ts`
- Create: `src/app/api/aims/instances/[id]/route.ts`

- [ ] **Step 1: Write failing tests**

Create `src/__tests__/aims-instances-api.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindMany = vi.fn();
const mockCreate = vi.fn();
const mockFindUnique = vi.fn();
const mockUpdate = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    aimInstance: {
      findMany: mockFindMany,
      create: mockCreate,
      findUnique: mockFindUnique,
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

import { GET, POST } from '@/app/api/aims/instances/route';
import { PATCH } from '@/app/api/aims/instances/[id]/route';

describe('GET /api/aims/instances', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns aim instances for a date range', async () => {
    const instances = [
      { id: 'ai-1', userId: 'user-1', aimCategoryId: 'exercise', scheduledDate: '2026-03-24', status: 'SCHEDULED', aimCategory: { name: 'Exercise' } },
    ];
    mockFindMany.mockResolvedValue(instances);

    const request = new Request('http://localhost/api/aims/instances?start=2026-03-24&end=2026-03-30');
    const response = await GET(request);
    const data = await response.json();

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'user-1',
        }),
      })
    );
    expect(data).toHaveLength(1);
  });

  it('returns 400 when start or end is missing', async () => {
    const request = new Request('http://localhost/api/aims/instances');
    const response = await GET(request);
    expect(response.status).toBe(400);
  });
});

describe('POST /api/aims/instances', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a new aim instance', async () => {
    const newInstance = {
      aimCategoryId: 'exercise',
      scheduledDate: '2026-03-25',
      timeBlockStart: '2026-03-25T09:00:00.000Z',
      timeBlockEnd: '2026-03-25T10:00:00.000Z',
    };
    mockCreate.mockResolvedValue({ id: 'ai-new', userId: 'user-1', ...newInstance, status: 'SCHEDULED' });

    const request = new Request('http://localhost/api/aims/instances', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newInstance),
    });
    const response = await POST(request);

    expect(response.status).toBe(201);
    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        aimCategoryId: 'exercise',
      }),
    });
  });

  it('rejects when aimCategoryId or scheduledDate is missing', async () => {
    const request = new Request('http://localhost/api/aims/instances', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aimCategoryId: 'exercise' }),
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
  });
});

describe('PATCH /api/aims/instances/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindUnique.mockResolvedValue({ id: 'ai-1', userId: 'user-1', status: 'SCHEDULED', aimCategoryId: 'exercise' });
  });

  it('marks an instance as COMPLETED', async () => {
    mockUpdate.mockResolvedValue({ id: 'ai-1', status: 'COMPLETED', completedAt: new Date() });

    const request = new Request('http://localhost/api/aims/instances/ai-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'COMPLETED' }),
    });
    const response = await PATCH(request, { params: Promise.resolve({ id: 'ai-1' }) });
    const data = await response.json();

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ai-1' },
        data: expect.objectContaining({ status: 'COMPLETED' }),
      })
    );
  });

  it('toggles isGroupOpen', async () => {
    mockFindUnique.mockResolvedValue({ id: 'ai-1', userId: 'user-1', status: 'SCHEDULED', isGroupOpen: false, aimCategoryId: 'exercise' });
    mockUpdate.mockResolvedValue({ id: 'ai-1', isGroupOpen: true });

    const request = new Request('http://localhost/api/aims/instances/ai-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isGroupOpen: true }),
    });
    const response = await PATCH(request, { params: Promise.resolve({ id: 'ai-1' }) });

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isGroupOpen: true }),
      })
    );
  });

  it('returns 404 when instance does not exist', async () => {
    mockFindUnique.mockResolvedValue(null);

    const request = new Request('http://localhost/api/aims/instances/missing', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'COMPLETED' }),
    });
    const response = await PATCH(request, { params: Promise.resolve({ id: 'missing' }) });
    expect(response.status).toBe(404);
  });

  it('returns 403 when user does not own the instance', async () => {
    mockFindUnique.mockResolvedValue({ id: 'ai-1', userId: 'other-user', status: 'SCHEDULED' });

    const request = new Request('http://localhost/api/aims/instances/ai-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'COMPLETED' }),
    });
    const response = await PATCH(request, { params: Promise.resolve({ id: 'ai-1' }) });
    expect(response.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd goal-dashboard && npx vitest run src/__tests__/aims-instances-api.test.ts`

Expected: FAIL — modules do not exist.

- [ ] **Step 3: Implement the instances list/create route**

Create `src/app/api/aims/instances/route.ts`:

```typescript
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const { searchParams } = new URL(request.url);
  const start = searchParams.get('start');
  const end = searchParams.get('end');

  if (!start || !end) {
    return Response.json({ error: 'start and end query params are required' }, { status: 400 });
  }

  const instances = await prisma.aimInstance.findMany({
    where: {
      userId: auth.userId,
      scheduledDate: {
        gte: new Date(start),
        lte: new Date(end),
      },
    },
    include: { aimCategory: true },
    orderBy: { scheduledDate: 'asc' },
  });

  return Response.json(instances);
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const body = await request.json();
  const { aimCategoryId, scheduledDate, timeBlockStart, timeBlockEnd, activityNote } = body;

  if (!aimCategoryId || !scheduledDate) {
    return Response.json({ error: 'aimCategoryId and scheduledDate are required' }, { status: 400 });
  }

  const instance = await prisma.aimInstance.create({
    data: {
      userId: auth.userId,
      aimCategoryId,
      scheduledDate: new Date(scheduledDate),
      timeBlockStart: timeBlockStart ? new Date(timeBlockStart) : null,
      timeBlockEnd: timeBlockEnd ? new Date(timeBlockEnd) : null,
      activityNote: activityNote ?? null,
    },
  });

  return Response.json(instance, { status: 201 });
}
```

- [ ] **Step 4: Implement the instance PATCH route**

Create `src/app/api/aims/instances/[id]/route.ts`:

```typescript
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const instance = await prisma.aimInstance.findUnique({ where: { id } });
  if (!instance) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  if (instance.userId !== auth.userId && !auth.session.user.isAdmin) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const { status, timeBlockStart, timeBlockEnd, isGroupOpen, activityNote } = body;

  const data: any = {};
  if (status !== undefined) {
    data.status = status;
    if (status === 'COMPLETED') {
      data.completedAt = new Date();
    }
  }
  if (timeBlockStart !== undefined) data.timeBlockStart = timeBlockStart ? new Date(timeBlockStart) : null;
  if (timeBlockEnd !== undefined) data.timeBlockEnd = timeBlockEnd ? new Date(timeBlockEnd) : null;
  if (isGroupOpen !== undefined) data.isGroupOpen = isGroupOpen;
  if (activityNote !== undefined) data.activityNote = activityNote;

  const updated = await prisma.aimInstance.update({ where: { id }, data });

  return Response.json(updated);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd goal-dashboard && npx vitest run src/__tests__/aims-instances-api.test.ts`

Expected: All 7 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/aims/instances/ src/__tests__/aims-instances-api.test.ts
git commit -m "feat(api): add GET/POST /api/aims/instances and PATCH /api/aims/instances/[id]"
```

---

### Task 7: API — GET `/api/aims/group`

**Files:**
- Create: `src/__tests__/aims-group-api.test.ts`
- Create: `src/app/api/aims/group/route.ts`

- [ ] **Step 1: Write failing tests**

Create `src/__tests__/aims-group-api.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindMany = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    aimInstance: {
      findMany: mockFindMany,
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

import { GET } from '@/app/api/aims/group/route';

describe('GET /api/aims/group', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns group-open instances from other users for a date', async () => {
    const instances = [
      {
        id: 'ai-other',
        userId: 'user-2',
        aimCategoryId: 'exercise',
        isGroupOpen: true,
        scheduledDate: '2026-03-25',
        aimCategory: { name: 'Exercise', isGroupable: true },
        user: { id: 'user-2', name: 'Other User' },
      },
    ];
    mockFindMany.mockResolvedValue(instances);

    const request = new Request('http://localhost/api/aims/group?date=2026-03-25');
    const response = await GET(request);
    const data = await response.json();

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isGroupOpen: true,
          userId: { not: 'user-1' },
        }),
      })
    );
    expect(data).toHaveLength(1);
    expect(data[0].user.name).toBe('Other User');
  });

  it('returns 400 when date is missing', async () => {
    const request = new Request('http://localhost/api/aims/group');
    const response = await GET(request);
    expect(response.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd goal-dashboard && npx vitest run src/__tests__/aims-group-api.test.ts`

Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the route**

Create `src/app/api/aims/group/route.ts`:

```typescript
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date');

  if (!date) {
    return Response.json({ error: 'date query param is required' }, { status: 400 });
  }

  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setHours(23, 59, 59, 999);

  const instances = await prisma.aimInstance.findMany({
    where: {
      isGroupOpen: true,
      userId: { not: auth.userId },
      scheduledDate: { gte: dayStart, lte: dayEnd },
      status: 'SCHEDULED',
    },
    include: {
      aimCategory: true,
      user: { select: { id: true, name: true, image: true } },
    },
    orderBy: { timeBlockStart: 'asc' },
  });

  return Response.json(instances);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd goal-dashboard && npx vitest run src/__tests__/aims-group-api.test.ts`

Expected: All 2 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/aims/group/route.ts src/__tests__/aims-group-api.test.ts
git commit -m "feat(api): add GET /api/aims/group for discovering group-open aim instances"
```

---

### Task 8: AimCategoryCard Component

**Files:**
- Create: `src/components/aims/__tests__/AimCategoryCard.test.tsx`
- Create: `src/components/aims/AimCategoryCard.tsx`

- [ ] **Step 1: Write failing tests**

Create `src/components/aims/__tests__/AimCategoryCard.test.tsx`:

```typescript
import '@/test/mocks';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { createAimCategory } from '@/test/fixtures';
import { AimCategoryCard } from '../AimCategoryCard';

describe('AimCategoryCard', () => {
  const defaultProps = {
    onToggle: vi.fn(),
    onUpdateDuration: vi.fn(),
    onUpdateFrequency: vi.fn(),
  };

  it('renders the aim name and description', () => {
    const category = createAimCategory({ name: 'Exercise', description: 'Cognitively challenging exercise' });
    render(<AimCategoryCard category={category} isActive={true} {...defaultProps} />);
    expect(screen.getByText('Exercise')).toBeInTheDocument();
    expect(screen.getByText('Cognitively challenging exercise')).toBeInTheDocument();
  });

  it('shows ON state when active', () => {
    const category = createAimCategory({ name: 'Exercise' });
    render(<AimCategoryCard category={category} isActive={true} {...defaultProps} />);
    const toggle = screen.getByRole('switch');
    expect(toggle).toBeChecked();
  });

  it('shows OFF state when inactive', () => {
    const category = createAimCategory({ name: 'Exercise' });
    render(<AimCategoryCard category={category} isActive={false} {...defaultProps} />);
    const toggle = screen.getByRole('switch');
    expect(toggle).not.toBeChecked();
  });

  it('calls onToggle when switch is clicked', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const category = createAimCategory({ id: 'ex-1', name: 'Exercise' });
    render(<AimCategoryCard category={category} isActive={false} onToggle={onToggle} onUpdateDuration={vi.fn()} onUpdateFrequency={vi.fn()} />);
    await user.click(screen.getByRole('switch'));
    expect(onToggle).toHaveBeenCalledWith('ex-1', true);
  });

  it('displays duration and frequency', () => {
    const category = createAimCategory({ name: 'Exercise', defaultDurationMin: 60, defaultFrequency: 3 });
    render(<AimCategoryCard category={category} isActive={true} customDuration={null} customFrequency={null} {...defaultProps} />);
    expect(screen.getByText(/60\s*min/)).toBeInTheDocument();
    expect(screen.getByText(/3x\/wk/)).toBeInTheDocument();
  });

  it('displays custom duration when set', () => {
    const category = createAimCategory({ name: 'Exercise', defaultDurationMin: 60, defaultFrequency: 3 });
    render(<AimCategoryCard category={category} isActive={true} customDuration={45} customFrequency={null} {...defaultProps} />);
    expect(screen.getByText(/45\s*min/)).toBeInTheDocument();
  });

  it('shows groupable badge when isGroupable is true', () => {
    const category = createAimCategory({ name: 'Exercise', isGroupable: true });
    render(<AimCategoryCard category={category} isActive={true} {...defaultProps} />);
    expect(screen.getByText('Group')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd goal-dashboard && npx vitest run src/components/aims/__tests__/AimCategoryCard.test.tsx`

Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the component**

Create `src/components/aims/AimCategoryCard.tsx`:

```typescript
'use client';

import React from 'react';
import { Users } from 'lucide-react';

interface AimCategoryCardProps {
  category: any;
  isActive: boolean;
  customDuration?: number | null;
  customFrequency?: number | null;
  onToggle: (categoryId: string, active: boolean) => void;
  onUpdateDuration: (categoryId: string, duration: number) => void;
  onUpdateFrequency: (categoryId: string, frequency: number) => void;
  children?: React.ReactNode; // for Active Recovery sub-section
}

export function AimCategoryCard({
  category,
  isActive,
  customDuration,
  customFrequency,
  onToggle,
  onUpdateDuration,
  onUpdateFrequency,
  children,
}: AimCategoryCardProps) {
  const duration = customDuration ?? category.defaultDurationMin;
  const frequency = customFrequency ?? category.defaultFrequency;
  const frequencyLabel = category.isDaily ? `${frequency}x/day` : `${frequency}x/wk`;

  return (
    <div className={`rounded-lg border p-4 transition-colors ${
      isActive
        ? 'border-teal-500/30 bg-teal-500/5'
        : 'border-[var(--border-color)] bg-[var(--surface)] opacity-60'
    }`}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-[var(--text-primary)]">{category.name}</h3>
            {category.isGroupable && (
              <span className="inline-flex items-center gap-1 rounded-full bg-teal-500/10 px-2 py-0.5 text-xs text-teal-400">
                <Users className="h-3 w-3" />
                Group
              </span>
            )}
          </div>
          {category.description && (
            <p className="mt-1 text-sm text-[var(--text-muted)] line-clamp-2">{category.description}</p>
          )}
          <div className="mt-2 flex items-center gap-3 text-sm text-[var(--text-secondary)]">
            <span>{duration} min</span>
            <span className="text-[var(--text-muted)]">|</span>
            <span>{frequencyLabel}</span>
          </div>
        </div>
        <button
          role="switch"
          aria-checked={isActive}
          onClick={() => onToggle(category.id, !isActive)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            isActive ? 'bg-teal-500' : 'bg-gray-600'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              isActive ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>
      {isActive && children && (
        <div className="mt-3 border-t border-[var(--border-color)] pt-3">
          {children}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd goal-dashboard && npx vitest run src/components/aims/__tests__/AimCategoryCard.test.tsx`

Expected: All 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/aims/AimCategoryCard.tsx src/components/aims/__tests__/AimCategoryCard.test.tsx
git commit -m "feat(ui): add AimCategoryCard component with toggle, duration, frequency display"
```

---

### Task 9: ActiveRecoveryActivities Component

**Files:**
- Create: `src/components/aims/__tests__/ActiveRecoveryActivities.test.tsx`
- Create: `src/components/aims/ActiveRecoveryActivities.tsx`

- [ ] **Step 1: Write failing tests**

Create `src/components/aims/__tests__/ActiveRecoveryActivities.test.tsx`:

```typescript
import '@/test/mocks';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { ActiveRecoveryActivities } from '../ActiveRecoveryActivities';

describe('ActiveRecoveryActivities', () => {
  const defaultActivities = ['sauna', 'massage', 'extended mindfulness', 'light yoga'];

  it('renders all activities', () => {
    render(<ActiveRecoveryActivities activities={defaultActivities} onChange={vi.fn()} />);
    expect(screen.getByText('sauna')).toBeInTheDocument();
    expect(screen.getByText('massage')).toBeInTheDocument();
    expect(screen.getByText('extended mindfulness')).toBeInTheDocument();
    expect(screen.getByText('light yoga')).toBeInTheDocument();
  });

  it('removes an activity when remove button is clicked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ActiveRecoveryActivities activities={defaultActivities} onChange={onChange} />);

    const removeButtons = screen.getAllByTitle(/Remove/);
    await user.click(removeButtons[0]); // remove 'sauna'

    expect(onChange).toHaveBeenCalledWith(['massage', 'extended mindfulness', 'light yoga']);
  });

  it('adds a custom activity', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ActiveRecoveryActivities activities={defaultActivities} onChange={onChange} />);

    const input = screen.getByPlaceholderText('Add custom activity');
    await user.type(input, 'cold plunge');
    await user.click(screen.getByTitle('Add activity'));

    expect(onChange).toHaveBeenCalledWith([...defaultActivities, 'cold plunge']);
  });

  it('does not add an empty activity', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ActiveRecoveryActivities activities={defaultActivities} onChange={onChange} />);

    await user.click(screen.getByTitle('Add activity'));

    expect(onChange).not.toHaveBeenCalled();
  });

  it('does not add a duplicate activity', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ActiveRecoveryActivities activities={defaultActivities} onChange={onChange} />);

    const input = screen.getByPlaceholderText('Add custom activity');
    await user.type(input, 'sauna');
    await user.click(screen.getByTitle('Add activity'));

    expect(onChange).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd goal-dashboard && npx vitest run src/components/aims/__tests__/ActiveRecoveryActivities.test.tsx`

Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the component**

Create `src/components/aims/ActiveRecoveryActivities.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { X, Plus } from 'lucide-react';

interface ActiveRecoveryActivitiesProps {
  activities: string[];
  onChange: (activities: string[]) => void;
}

export function ActiveRecoveryActivities({ activities, onChange }: ActiveRecoveryActivitiesProps) {
  const [newActivity, setNewActivity] = useState('');

  const handleRemove = (index: number) => {
    const updated = activities.filter((_, i) => i !== index);
    onChange(updated);
  };

  const handleAdd = () => {
    const trimmed = newActivity.trim();
    if (!trimmed) return;
    if (activities.includes(trimmed)) return;
    onChange([...activities, trimmed]);
    setNewActivity('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
  };

  return (
    <div>
      <p className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide mb-2">Activities</p>
      <div className="flex flex-wrap gap-2 mb-3">
        {activities.map((activity, index) => (
          <span
            key={activity}
            className="inline-flex items-center gap-1 rounded-full bg-teal-500/10 px-3 py-1 text-sm text-teal-300"
          >
            {activity}
            <button
              onClick={() => handleRemove(index)}
              title={`Remove ${activity}`}
              className="ml-0.5 rounded-full p-0.5 hover:bg-teal-500/20 transition-colors"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={newActivity}
          onChange={(e) => setNewActivity(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Add custom activity"
          className="flex-1 rounded-lg border border-[var(--border-color)] bg-[var(--surface)] px-3 py-1.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)]"
        />
        <button
          onClick={handleAdd}
          title="Add activity"
          className="rounded-lg border border-teal-500/30 bg-teal-500/10 px-3 py-1.5 text-sm text-teal-400 hover:bg-teal-500/20 transition-colors"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd goal-dashboard && npx vitest run src/components/aims/__tests__/ActiveRecoveryActivities.test.tsx`

Expected: All 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/aims/ActiveRecoveryActivities.tsx src/components/aims/__tests__/ActiveRecoveryActivities.test.tsx
git commit -m "feat(ui): add ActiveRecoveryActivities component for managing recovery activities"
```

---

### Task 10: WeeklySchedulePreview Component

**Files:**
- Create: `src/components/aims/__tests__/WeeklySchedulePreview.test.tsx`
- Create: `src/components/aims/WeeklySchedulePreview.tsx`

- [ ] **Step 1: Write failing tests**

Create `src/components/aims/__tests__/WeeklySchedulePreview.test.tsx`:

```typescript
import '@/test/mocks';
import { render, screen } from '@testing-library/react';
import { createAimCategory } from '@/test/fixtures';
import { WeeklySchedulePreview } from '../WeeklySchedulePreview';

describe('WeeklySchedulePreview', () => {
  it('renders day labels Mon through Sun', () => {
    render(<WeeklySchedulePreview activeAims={[]} />);
    expect(screen.getByText('Mon')).toBeInTheDocument();
    expect(screen.getByText('Tue')).toBeInTheDocument();
    expect(screen.getByText('Wed')).toBeInTheDocument();
    expect(screen.getByText('Thu')).toBeInTheDocument();
    expect(screen.getByText('Fri')).toBeInTheDocument();
    expect(screen.getByText('Sat')).toBeInTheDocument();
    expect(screen.getByText('Sun')).toBeInTheDocument();
  });

  it('distributes aims across the week based on frequency', () => {
    const aims = [
      { category: createAimCategory({ name: 'Exercise', defaultFrequency: 3 }), customFrequency: null, customDuration: null },
    ];
    render(<WeeklySchedulePreview activeAims={aims} />);
    // Exercise 3x/week should appear in 3 day cells
    const exerciseChips = screen.getAllByText('Exercise');
    expect(exerciseChips).toHaveLength(3);
  });

  it('shows duration next to aim name', () => {
    const aims = [
      { category: createAimCategory({ name: 'Exercise', defaultFrequency: 1, defaultDurationMin: 60 }), customFrequency: null, customDuration: null },
    ];
    render(<WeeklySchedulePreview activeAims={aims} />);
    expect(screen.getByText(/60m/)).toBeInTheDocument();
  });

  it('renders empty state when no aims are active', () => {
    render(<WeeklySchedulePreview activeAims={[]} />);
    expect(screen.getByText(/No active aims/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd goal-dashboard && npx vitest run src/components/aims/__tests__/WeeklySchedulePreview.test.tsx`

Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the component**

Create `src/components/aims/WeeklySchedulePreview.tsx`:

```typescript
'use client';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface ActiveAim {
  category: any;
  customFrequency: number | null;
  customDuration: number | null;
}

interface WeeklySchedulePreviewProps {
  activeAims: ActiveAim[];
}

/**
 * Distributes aims across the week. Spreads each aim evenly across days
 * based on its frequency, balancing the total load across the week.
 */
function distributeAims(aims: ActiveAim[]): Map<number, { name: string; duration: number }[]> {
  const schedule = new Map<number, { name: string; duration: number }[]>();
  for (let i = 0; i < 7; i++) schedule.set(i, []);

  for (const aim of aims) {
    const freq = aim.customFrequency ?? aim.category.defaultFrequency;
    const dur = aim.customDuration ?? aim.category.defaultDurationMin;
    const effectiveFreq = Math.min(freq, 7);
    const step = 7 / effectiveFreq;

    for (let i = 0; i < effectiveFreq; i++) {
      const dayIndex = Math.floor(i * step) % 7;
      schedule.get(dayIndex)!.push({ name: aim.category.name, duration: dur });
    }
  }

  return schedule;
}

export function WeeklySchedulePreview({ activeAims }: WeeklySchedulePreviewProps) {
  if (activeAims.length === 0) {
    return (
      <div className="rounded-lg border border-[var(--border-color)] p-4 text-center text-sm text-[var(--text-muted)]">
        No active aims to preview.
      </div>
    );
  }

  const schedule = distributeAims(activeAims);

  return (
    <div className="rounded-lg border border-[var(--border-color)] overflow-hidden">
      <div className="grid grid-cols-7 divide-x divide-[var(--border-color)]">
        {DAYS.map((day, index) => {
          const dayAims = schedule.get(index) ?? [];
          return (
            <div key={day} className="min-h-[80px]">
              <div className="border-b border-[var(--border-color)] bg-[var(--surface)] px-2 py-1.5 text-center text-xs font-medium text-[var(--text-secondary)]">
                {day}
              </div>
              <div className="p-1 space-y-1">
                {dayAims.map((aim, i) => (
                  <div
                    key={`${aim.name}-${i}`}
                    className="rounded bg-teal-500/10 px-1.5 py-1 text-xs text-teal-300"
                  >
                    <div className="font-medium truncate">{aim.name}</div>
                    <div className="text-teal-400/60">{aim.duration}m</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd goal-dashboard && npx vitest run src/components/aims/__tests__/WeeklySchedulePreview.test.tsx`

Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/aims/WeeklySchedulePreview.tsx src/components/aims/__tests__/WeeklySchedulePreview.test.tsx
git commit -m "feat(ui): add WeeklySchedulePreview component with aim distribution"
```

---

### Task 11: /aims Page

**Files:**
- Create: `src/app/(app)/aims/__tests__/AimsPage.test.tsx`
- Create: `src/app/(app)/aims/page.tsx`

- [ ] **Step 1: Write failing tests**

Create `src/app/(app)/aims/__tests__/AimsPage.test.tsx`:

```typescript
import '@/test/mocks';
import { render, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/utils';
import AimsPage from '../page';

describe('AimsPage', () => {
  it('renders Daily Aims section heading', async () => {
    renderWithProviders(<AimsPage />, {
      swrData: {
        '/api/aims/categories': [
          { id: 'deep-work', name: 'Deep Work', isDaily: true, defaultFrequency: 7, defaultDurationMin: 90, isGroupable: false, isDefault: true, activities: null, description: 'Focus work.' },
        ],
        '/api/aims/user': [],
      },
    });

    await waitFor(() => {
      expect(screen.getByText('Daily Aims')).toBeInTheDocument();
    });
  });

  it('renders Weekly Aims section heading', async () => {
    renderWithProviders(<AimsPage />, {
      swrData: {
        '/api/aims/categories': [
          { id: 'exercise', name: 'Exercise', isDaily: false, defaultFrequency: 3, defaultDurationMin: 60, isGroupable: true, isDefault: true, activities: null, description: 'Exercise.' },
        ],
        '/api/aims/user': [],
      },
    });

    await waitFor(() => {
      expect(screen.getByText('Weekly Aims')).toBeInTheDocument();
    });
  });

  it('renders aim category cards for each category', async () => {
    renderWithProviders(<AimsPage />, {
      swrData: {
        '/api/aims/categories': [
          { id: 'deep-work', name: 'Deep Work', isDaily: true, defaultFrequency: 7, defaultDurationMin: 90, isGroupable: false, isDefault: true, activities: null, description: null },
          { id: 'exercise', name: 'Exercise', isDaily: false, defaultFrequency: 3, defaultDurationMin: 60, isGroupable: true, isDefault: true, activities: null, description: null },
        ],
        '/api/aims/user': [],
      },
    });

    await waitFor(() => {
      expect(screen.getByText('Deep Work')).toBeInTheDocument();
      expect(screen.getByText('Exercise')).toBeInTheDocument();
    });
  });

  it('renders the Weekly Schedule Preview section', async () => {
    renderWithProviders(<AimsPage />, {
      swrData: {
        '/api/aims/categories': [],
        '/api/aims/user': [],
      },
    });

    await waitFor(() => {
      expect(screen.getByText('Weekly Schedule Preview')).toBeInTheDocument();
    });
  });

  it('shows Active Recovery activities sub-section for Active Recovery category', async () => {
    renderWithProviders(<AimsPage />, {
      swrData: {
        '/api/aims/categories': [
          { id: 'active-recovery', name: 'Active Recovery', isDaily: false, defaultFrequency: 3, defaultDurationMin: 30, isGroupable: true, isDefault: true, activities: '["sauna","massage","extended mindfulness","light yoga"]', description: 'Recovery activities.' },
        ],
        '/api/aims/user': [
          { id: 'ua-1', userId: 'user-1', aimCategoryId: 'active-recovery', isActive: true, customDuration: null, customFrequency: null, customActivities: null, aimCategory: { id: 'active-recovery', name: 'Active Recovery' } },
        ],
      },
    });

    await waitFor(() => {
      expect(screen.getByText('sauna')).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd goal-dashboard && npx vitest run src/app/(app)/aims/__tests__/AimsPage.test.tsx`

Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the page**

Create `src/app/(app)/aims/page.tsx`:

```typescript
'use client';

import { useCallback, useMemo } from 'react';
import useSWR from 'swr';
import { Flame } from 'lucide-react';
import { AimCategoryCard } from '@/components/aims/AimCategoryCard';
import { ActiveRecoveryActivities } from '@/components/aims/ActiveRecoveryActivities';
import { WeeklySchedulePreview } from '@/components/aims/WeeklySchedulePreview';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function AimsPage() {
  const { data: categories = [] } = useSWR('/api/aims/categories', fetcher);
  const { data: userAims = [], mutate: mutateUserAims } = useSWR('/api/aims/user', fetcher);

  // Build lookup: aimCategoryId -> UserAim record
  const userAimMap = useMemo(() => {
    const map = new Map<string, any>();
    for (const ua of userAims) {
      map.set(ua.aimCategoryId, ua);
    }
    return map;
  }, [userAims]);

  const dailyCategories = useMemo(() => categories.filter((c: any) => c.isDaily), [categories]);
  const weeklyCategories = useMemo(() => categories.filter((c: any) => !c.isDaily), [categories]);

  const activeAims = useMemo(() => {
    return categories
      .filter((c: any) => {
        const ua = userAimMap.get(c.id);
        // If no UserAim record exists, aim is active by default (isDefault categories)
        return ua ? ua.isActive : c.isDefault;
      })
      .map((c: any) => {
        const ua = userAimMap.get(c.id);
        return {
          category: c,
          customFrequency: ua?.customFrequency ?? null,
          customDuration: ua?.customDuration ?? null,
        };
      });
  }, [categories, userAimMap]);

  const handleToggle = useCallback(async (categoryId: string, active: boolean) => {
    await fetch('/api/aims/user', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        aims: [{ aimCategoryId: categoryId, isActive: active }],
      }),
    });
    mutateUserAims();
  }, [mutateUserAims]);

  const handleUpdateDuration = useCallback(async (categoryId: string, duration: number) => {
    await fetch('/api/aims/user', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        aims: [{ aimCategoryId: categoryId, customDuration: duration }],
      }),
    });
    mutateUserAims();
  }, [mutateUserAims]);

  const handleUpdateFrequency = useCallback(async (categoryId: string, frequency: number) => {
    await fetch('/api/aims/user', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        aims: [{ aimCategoryId: categoryId, customFrequency: frequency }],
      }),
    });
    mutateUserAims();
  }, [mutateUserAims]);

  const handleActivitiesChange = useCallback(async (categoryId: string, activities: string[]) => {
    await fetch('/api/aims/user', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        aims: [{ aimCategoryId: categoryId, customActivities: activities }],
      }),
    });
    mutateUserAims();
  }, [mutateUserAims]);

  const isActive = (categoryId: string) => {
    const ua = userAimMap.get(categoryId);
    if (!ua) {
      const cat = categories.find((c: any) => c.id === categoryId);
      return cat?.isDefault ?? false;
    }
    return ua.isActive;
  };

  const getActivities = (category: any) => {
    const ua = userAimMap.get(category.id);
    if (ua?.customActivities) {
      return typeof ua.customActivities === 'string'
        ? JSON.parse(ua.customActivities)
        : ua.customActivities;
    }
    if (category.activities) {
      return typeof category.activities === 'string'
        ? JSON.parse(category.activities)
        : category.activities;
    }
    return [];
  };

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-6">
      <div className="flex items-center gap-3">
        <Flame className="h-6 w-6 text-teal-400" />
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Aims</h1>
      </div>

      {/* Daily Aims */}
      <section>
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Daily Aims</h2>
        <div className="space-y-3">
          {dailyCategories.map((category: any) => {
            const ua = userAimMap.get(category.id);
            return (
              <AimCategoryCard
                key={category.id}
                category={category}
                isActive={isActive(category.id)}
                customDuration={ua?.customDuration}
                customFrequency={ua?.customFrequency}
                onToggle={handleToggle}
                onUpdateDuration={handleUpdateDuration}
                onUpdateFrequency={handleUpdateFrequency}
              />
            );
          })}
        </div>
      </section>

      {/* Weekly Aims */}
      <section>
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Weekly Aims</h2>
        <div className="space-y-3">
          {weeklyCategories.map((category: any) => {
            const ua = userAimMap.get(category.id);
            const isActiveRecovery = category.name === 'Active Recovery';
            return (
              <AimCategoryCard
                key={category.id}
                category={category}
                isActive={isActive(category.id)}
                customDuration={ua?.customDuration}
                customFrequency={ua?.customFrequency}
                onToggle={handleToggle}
                onUpdateDuration={handleUpdateDuration}
                onUpdateFrequency={handleUpdateFrequency}
              >
                {isActiveRecovery && isActive(category.id) && (
                  <ActiveRecoveryActivities
                    activities={getActivities(category)}
                    onChange={(activities) => handleActivitiesChange(category.id, activities)}
                  />
                )}
              </AimCategoryCard>
            );
          })}
        </div>
      </section>

      {/* Weekly Schedule Preview */}
      <section>
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Weekly Schedule Preview</h2>
        <WeeklySchedulePreview activeAims={activeAims} />
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd goal-dashboard && npx vitest run src/app/(app)/aims/__tests__/AimsPage.test.tsx`

Expected: All 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/(app)/aims/page.tsx src/app/(app)/aims/__tests__/AimsPage.test.tsx
git commit -m "feat(page): add /aims page with daily/weekly sections and schedule preview"
```

---

### Task 12: Calendar Integration — Aims as Teal Blocks

**Files:**
- Modify: `src/components/calendar/CalendarView.tsx` (lines 15-20)
- Modify: `src/app/api/calendar/route.ts` (lines 104-133, 149+)
- Modify: `src/components/calendar/__tests__/CalendarView.test.tsx` (add test at end)

- [ ] **Step 1: Write a failing test for the Aims filter**

Add to the end of `src/components/calendar/__tests__/CalendarView.test.tsx`:

```typescript
  it('includes Aims in the source filters', () => {
    render(<CalendarView />);
    expect(screen.getByText('Aims')).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd goal-dashboard && npx vitest run src/components/calendar/__tests__/CalendarView.test.tsx`

Expected: FAIL — no element with text "Aims" found.

- [ ] **Step 3: Add the Aims source filter to CalendarView**

In `src/components/calendar/CalendarView.tsx`, add to the `SOURCE_FILTERS` array (line 19, after the `google` entry):

```typescript
  { key: 'aims', label: 'Aims', color: 'bg-teal-500' },
```

Also update the `activeFilters` default state (line 25) to include `'aims'`:

```typescript
const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set(['tasks', 'reviews', 'meetings', 'google', 'aims']));
```

- [ ] **Step 4: Add aim instances to the calendar API**

In `src/app/api/calendar/route.ts`, make the following changes:

**Change 1 — in the parallel query array** (around line 104-133), add a 5th query for aim instances:

```typescript
    // Add after the googleEvents query in the Promise.all array:
    (fetchAll || source === 'aims')
      ? prisma.aimInstance.findMany({
          where: {
            userId: auth.userId,
            scheduledDate: { gte: new Date(start), lte: new Date(end) },
          },
          include: { aimCategory: { select: { name: true } } },
        })
      : Promise.resolve([]),
```

Update the destructure to include the new result:

```typescript
  const [tasks, reviews, meetings, googleEvents, aimInstances] = await Promise.all([
```

**Change 2 — after the Google Calendar processing block** (after line 203), add aim instance processing:

```typescript
  // Process aim instances
  for (const aim of aimInstances) {
    const label = aim.activityNote
      ? `${aim.aimCategory.name}: ${aim.activityNote}`
      : aim.aimCategory.name;
    events.push({
      id: `aim-${aim.id}`,
      title: label,
      start: aim.timeBlockStart?.toISOString() ?? aim.scheduledDate.toISOString(),
      end: aim.timeBlockEnd?.toISOString() ?? undefined,
      allDay: !aim.timeBlockStart,
      source: 'aim',
      aimInstanceId: aim.id,
      status: aim.status,
      isGroupOpen: aim.isGroupOpen,
      color: '#14b8a6', // teal-500
    });
  }
```

**Change 3 — in the availability section** (around line 26-43), add aim instances to busy slots:

```typescript
    // After the meetings busy slots block, add:
    // 3b. Aim instance time blocks
    const aimInstances = await prisma.aimInstance.findMany({
      where: {
        userId: auth.userId,
        timeBlockStart: { gte: new Date(start), lte: new Date(end) },
        timeBlockEnd: { not: null },
        status: 'SCHEDULED',
      },
      include: { aimCategory: { select: { name: true } } },
    });
    for (const aim of aimInstances) {
      if (aim.timeBlockStart && aim.timeBlockEnd) {
        busySlots.push({
          start: aim.timeBlockStart.toISOString(),
          end: aim.timeBlockEnd.toISOString(),
          title: aim.aimCategory.name,
        });
      }
    }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd goal-dashboard && npx vitest run src/components/calendar/__tests__/CalendarView.test.tsx`

Expected: All tests PASS (existing + new).

- [ ] **Step 6: Commit**

```bash
git add src/components/calendar/CalendarView.tsx src/app/api/calendar/route.ts src/components/calendar/__tests__/CalendarView.test.tsx
git commit -m "feat(calendar): integrate aims as teal event blocks with source filter"
```

---

### Task 13: Sidebar Navigation — Add Aims Link

**Files:**
- Modify: `src/components/layout/Sidebar.tsx` (lines 7-18, 33-37)
- Modify: `src/components/layout/__tests__/Sidebar.test.tsx` (line 15-25)

- [ ] **Step 1: Write failing test for Aims nav item**

In `src/components/layout/__tests__/Sidebar.test.tsx`, update the nav item count test (line 15):

Change `'renders all 10 nav items'` to `'renders all 11 nav items'`, and add `'Aims'` to the `labels` array (insert after `'Calendar'`):

```typescript
  it('renders all 11 nav items', () => {
    setMockPathname('/');
    render(<Sidebar />);
    const labels = [
      'Dashboard', 'Goal Stack', 'Tasks', 'Calendar', 'Aims', 'Reviews',
      'Power Down', 'Leaderboard', 'Reports', 'Processes', 'Settings',
    ];
    for (const label of labels) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd goal-dashboard && npx vitest run src/components/layout/__tests__/Sidebar.test.tsx`

Expected: FAIL — no element with text "Aims" found.

- [ ] **Step 3: Add Aims to the sidebar**

In `src/components/layout/Sidebar.tsx`:

**Change 1 — line 7:** Add `Flame` to the lucide-react import:

```typescript
import {
  LayoutDashboard,
  Target,
  CheckSquare,
  Calendar,
  Flame,
  ClipboardCheck,
  Moon,
  Trophy,
  BarChart3,
  ListChecks,
  Settings,
} from 'lucide-react';
```

**Change 2 — line 34:** Add the Aims nav item to the Rituals section, between Calendar and Reviews:

```typescript
  {
    label: 'Rituals',
    items: [
      { href: '/calendar', label: 'Calendar', icon: Calendar },
      { href: '/aims', label: 'Aims', icon: Flame },
      { href: '/reviews', label: 'Reviews', icon: ClipboardCheck },
      { href: '/powerdown', label: 'Power Down', icon: Moon },
    ],
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd goal-dashboard && npx vitest run src/components/layout/__tests__/Sidebar.test.tsx`

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/Sidebar.tsx src/components/layout/__tests__/Sidebar.test.tsx
git commit -m "feat(nav): add Aims link to sidebar Rituals section"
```

---

### Task 14: Full Suite Verification

- [ ] **Step 1: Run the complete test suite**

Run: `cd goal-dashboard && npx vitest run`

Expected: All tests PASS, including new aims tests and all existing tests.

- [ ] **Step 2: Run the production build**

Run: `cd goal-dashboard && npm run build`

Expected: Build succeeds with no type errors.

- [ ] **Step 3: Run the seed to verify aim categories load**

Run: `cd goal-dashboard && npx prisma db seed`

Expected: Seed completes with 7 AimCategories.

- [ ] **Step 4: Final commit (if any lint/type fixes were needed)**

```bash
git add -A
git commit -m "chore: fix lint/type issues from aims system integration"
```
