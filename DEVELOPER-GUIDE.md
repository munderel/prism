# Prism — Developer Guide

## Prerequisites

- **Node.js 20+** and npm
- **PostgreSQL 15+** (local install or Docker)
- **Google Cloud project** with Calendar API enabled (for calendar features)
- Optional: **OpenRouter API key** (for AI quiz generation and task suggestions)

---

## Local Development Setup

### 1. Install Dependencies

```bash
cd goal-dashboard
npm install
```

### 2. Set Up PostgreSQL

**Option A: Docker (recommended)**

```bash
docker run -d --name prism-db -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=prism -p 5432:5432 postgres:15
```

Connection string: `postgresql://postgres:postgres@localhost:5432/prism`

**Option B: Local PostgreSQL**

Create a database named `prism` and note the connection string.

### 3. Configure Environment

Create `.env` from the example:

```bash
cp .env.example .env
```

Minimum required for local development:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/prism"
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="any-random-string-for-dev"
NEXT_PUBLIC_DEV_LOGIN="true"
```

For Google Calendar sync, add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` (see [DEPLOYMENT.md](DEPLOYMENT.md) for Google Cloud setup).

### 4. Set Up Database

```bash
# Push schema to database (development — no migration files)
npx prisma db push

# Seed default data (AIM categories, review templates)
npx prisma db seed
```

### 5. Start Development Server

```bash
npm run dev
# Open http://localhost:3000
```

With `NEXT_PUBLIC_DEV_LOGIN=true`, you can log in with just an email address (no password required). The email must match an existing user — create one via the seed or Prisma Studio (`npx prisma studio`).

---

## Code Conventions

### TypeScript

- Strict mode enabled
- Path alias: `@/` maps to `src/` (configured in `tsconfig.json` and `vitest.config.ts`)
- No `any` without justification

### File Naming

- **Components:** PascalCase (`GoalStackTree.tsx`, `TaskCard.tsx`)
- **Utilities:** camelCase (`date-utils.ts`, `api-helpers.ts`)
- **Directories:** kebab-case (`goal-dashboard/`, `clear-goals/`)
- **API routes:** `route.ts` inside directory structure (`api/tasks/[id]/route.ts`)

### Styling

- **Tailwind CSS only** — no CSS modules, no styled-components
- Glass-morphism patterns: translucent backgrounds, noise overlay, backdrop blur
- Colors: always import from `src/lib/prism-colors.ts` (never hardcode hex values for task/item types)

### Import Order

1. External packages (`react`, `next`, `swr`, etc.)
2. `@/lib/*` utilities
3. `@/components/*`
4. Relative imports

---

## Adding a New Feature (Walkthrough)

Here's how to add a new entity end-to-end. We'll use "Milestones" as an example.

### Step 1: Database Model

Edit `prisma/schema.prisma`:

```prisma
model Milestone {
  id          String   @id @default(cuid())
  userId      String
  title       String
  description String?  @db.Text
  achievedAt  DateTime?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}
```

Add the relation to the `User` model:

```prisma
model User {
  // ... existing fields
  milestones Milestone[]
}
```

Push to database:

```bash
npx prisma db push
```

### Step 2: API Routes

**List/Create** — `src/app/api/milestones/route.ts`:

```typescript
import { requireAuth, authError } from '@/lib/auth-guard';
import { cacheHeaders } from '@/lib/api-helpers';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const milestones = await prisma.milestone.findMany({
    where: { userId: auth.userId },
    orderBy: { createdAt: 'desc' },
  });

  return Response.json(milestones, { headers: cacheHeaders() });
}

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const body = await request.json();
  if (!body.title || body.title.length < 3) {
    return Response.json({ error: 'Title must be at least 3 characters' }, { status: 400 });
  }

  const milestone = await prisma.milestone.create({
    data: {
      userId: auth.userId,
      title: body.title,
      description: body.description,
    },
  });

  return Response.json(milestone, { status: 201 });
}
```

**Individual CRUD** — `src/app/api/milestones/[id]/route.ts`:

```typescript
import { requireAuth, authError } from '@/lib/auth-guard';
import { pickDefined, notFoundResponse } from '@/lib/api-helpers';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const milestone = await prisma.milestone.findUnique({ where: { id: params.id } });
  if (!milestone || milestone.userId !== auth.userId) return notFoundResponse('Milestone');

  return Response.json(milestone);
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const milestone = await prisma.milestone.findUnique({ where: { id: params.id } });
  if (!milestone || milestone.userId !== auth.userId) return notFoundResponse('Milestone');

  const body = await request.json();
  const data = pickDefined(body, ['title', 'description', 'achievedAt']);

  const updated = await prisma.milestone.update({ where: { id: params.id }, data });
  return Response.json(updated);
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const milestone = await prisma.milestone.findUnique({ where: { id: params.id } });
  if (!milestone || milestone.userId !== auth.userId) return notFoundResponse('Milestone');

  await prisma.milestone.delete({ where: { id: params.id } });
  return Response.json({ success: true });
}
```

### Step 3: Page Route

Create `src/app/(app)/milestones/page.tsx`:

```typescript
import { MilestoneList } from '@/components/milestones/MilestoneList';

export default function MilestonesPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Milestones</h1>
      <MilestoneList />
    </div>
  );
}
```

### Step 4: Components

Create `src/components/milestones/MilestoneList.tsx`:

```typescript
'use client';

import useSWR from 'swr';

export function MilestoneList() {
  const { data: milestones, mutate } = useSWR('/api/milestones');

  if (!milestones) return <div>Loading...</div>;

  return (
    <div className="space-y-3">
      {milestones.map((m: any) => (
        <div key={m.id} className="rounded-xl bg-white/5 border border-white/10 p-4">
          <h3 className="font-semibold">{m.title}</h3>
          {m.description && <p className="text-sm text-gray-500">{m.description}</p>}
        </div>
      ))}
    </div>
  );
}
```

### Step 5: Sidebar Navigation

In `src/components/layout/Sidebar.tsx`, add the nav item to the appropriate section:

```typescript
{ name: 'Milestones', href: '/milestones', icon: FlagIcon, feature: 'milestones' },
```

Add `'milestones'` to the `hiddenFeatures` toggle logic in the Settings page.

### Step 6: Tests

Create `src/__tests__/milestone-validation.test.ts` for utility functions and `src/components/milestones/__tests__/MilestoneList.test.tsx` for component tests.

---

## Patterns Reference

### API Route Pattern

Every API handler follows this structure:

```
1. requireAuth() / requireAdmin()  → 401/403
2. Parse request (params, body, searchParams)
3. Validate input                   → 400
4. Check ownership/access           → 403/404
5. Prisma query
6. Return Response.json() with cacheHeaders() for GETs
```

Key helpers from `src/lib/auth-guard.ts`:
- `requireAuth()` — Returns `{ session, userId }` or `{ error, status }`
- `authError(result)` — Converts error result to `Response`
- `requireAdmin()` — Extends requireAuth with admin check
- `requireOwnership(ownerId)` — Owner or admin
- `requireTaskAccess(taskId)` — Task owner or admin

Key helpers from `src/lib/api-helpers.ts`:
- `pickDefined(body, fields)` — Build PATCH payloads
- `parsePagination(searchParams)` — Parse `?page=&limit=`
- `cacheHeaders(maxAge, staleWhileRevalidate)` — Default: `max-age=10, stale-while-revalidate=60`
- `notFoundResponse(entity)` — Standard 404
- `forbiddenResponse()` — Standard 403
- `validateEmail(raw)` — Email validation
- `validateIceScores(scores)` — ICE score validation (1-5)

### SWR Data Fetching

Global config in `src/app/(app)/swr-provider.tsx` provides a default fetcher. No need to pass `fetcher` to each `useSWR` call.

```typescript
// Fetch data
const { data, error, mutate } = useSWR('/api/tasks?date=2026-03-29');

// After mutation, revalidate cache
await fetch('/api/tasks', { method: 'POST', body: JSON.stringify(newTask) });
mutate('/api/tasks');  // or mutate() for all matching keys
```

### Date Handling

**Always use `src/lib/date-utils.ts`** instead of native Date methods:

| Instead of... | Use... |
|---------------|--------|
| `new Date().toISOString().split('T')[0]` | `getLocalDateString()` |
| `new Date(dateString)` | `parseLocalDate(dateString)` |
| Manual date formatting | `formatDisplayDate(date, { weekday: true })` |
| `new Date(isoString).toISOString().split('T')[0]` | `toLocalDateKey(isoString)` |

**Why:** `new Date('2026-03-29')` parses as UTC midnight, which can shift the date by a day depending on timezone. `parseLocalDate()` creates a Date at local midnight.

### Component Organization

Components are organized by **feature domain**, not by component type:

```
src/components/
├── goals/       # GoalStackTree, GoalCard, GoalEditor, KpiCard, ...
├── tasks/       # TaskCard, TaskList, TaskEditor, ...
├── calendar/    # CalendarView, CalendarSplitView, MeetingsManager, ...
├── reviews/     # WeeklyReviewWizard, MonthlyReviewWizard, ...
├── aims/        # AimCard, StreakHeatmap, AimProgressChart, ...
├── dashboard/   # DashboardGreeting, WinTheDayCard, FocusView, ...
├── dopamine/    # CompletionAnimation, ProgressRing, StreakCounter, ...
├── powerdown/   # PowerDown wizard step components
├── layout/      # MainLayout, Sidebar, TopBar, FloatingIdeaButton
├── ui/          # Toast, ConfirmDialog (shared primitives)
└── onboarding/  # OnboardingTour
```

### Color System

```typescript
import { PRISM_COLORS, getTaskTypeColor, taskTypeToColorKey } from '@/lib/prism-colors';

// Get color for a task type
const color = getTaskTypeColor('IMPROVE'); // { color: '#818cf8', textClass: 'text-indigo-400', ... }

// Use in JSX
<div className={color.bgClass}>
  <span className={color.textClass}>{color.label}</span>
</div>
```

---

## Common Tasks

### Adding a Sidebar Navigation Item

1. Open `src/components/layout/Sidebar.tsx`
2. Add entry to the appropriate section (WORK, RITUALS, INSIGHTS, SYSTEM)
3. Add `feature: 'feature-name'` for visibility toggle support
4. In the Settings page (`src/app/(app)/settings/page.tsx`), add the feature to the visibility toggles

### Modifying the Prisma Schema

1. Edit `prisma/schema.prisma`
2. Run `npx prisma db push` (development)
3. Run `npx prisma generate` if types aren't updating
4. For production: create migration with `npx prisma migrate dev --name description`

### Adding a Cron Job

1. Create route handler at `src/app/api/cron/your-job/route.ts`
2. Start with `requireCronSecret(request)` check
3. Add to `vercel.json` cron configuration:
   ```json
   { "path": "/api/cron/your-job", "schedule": "0 */6 * * *" }
   ```
4. Add the path to middleware exclusions in `src/middleware.ts`

### Adding a Review Wizard Step

1. Create step component in `src/components/reviews/weekly-steps/` (or monthly/yearly)
2. Register the step in the wizard component (e.g., `WeeklyReviewWizard.tsx`)
3. Define a `stepKey` for saving answers via `POST /api/reviews/[id]/answers`
4. Add validation logic for the step's advancement requirements

### Working with Google Calendar Sync

Calendar sync is handled in `src/lib/calendar.ts`. When a task gets a time block:

1. The task API route calls calendar sync functions
2. A Google Calendar event is created/updated with task details
3. The `calendarEventId` is stored on the Task model
4. On task completion/deletion, the event is removed

All calendar operations are wrapped in try/catch — if Google API is unavailable, the operation succeeds without sync.

---

## Troubleshooting

### Dev login not working

- Verify `NEXT_PUBLIC_DEV_LOGIN=true` is in `.env`
- Verify `NODE_ENV` is not `"production"`
- Verify the email you're using exists in the database
- Try: `npx prisma studio` to check the User table

### Calendar sync not working

- Verify `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set
- Verify `TOKEN_ENCRYPTION_KEY` is set (64-char hex string)
- Check if the user has a `googleRefreshToken` in the database
- The Google OAuth consent screen must include `https://www.googleapis.com/auth/calendar` scope

### Prisma connection errors

- Verify `DATABASE_URL` is correct and PostgreSQL is running
- For Docker: `docker ps` to verify the container is up
- For connection pool issues: restart the dev server (Prisma creates a new client)

### Build errors after schema changes

```bash
npx prisma generate  # Regenerate Prisma client
npm run build         # Retry build
```

### SWR not updating after mutation

- Verify you're calling `mutate('/api/endpoint')` after the fetch
- Check the SWR key matches exactly (including query params)
- For cross-component updates, use `mutate()` without arguments to revalidate all keys

---

## See Also

- [ARCHITECTURE.md](ARCHITECTURE.md) — System design and layer responsibilities
- [DATABASE.md](DATABASE.md) — Schema documentation and model details
- [API-REFERENCE.md](API-REFERENCE.md) — All API endpoints
- [TESTING.md](TESTING.md) — Test strategy and patterns
- [DESIGN-DECISIONS.md](DESIGN-DECISIONS.md) — Why things are built this way
