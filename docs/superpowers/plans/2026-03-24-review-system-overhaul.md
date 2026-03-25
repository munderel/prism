# Review System Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Overhaul the review system to support flexible scheduling (user-chosen start date and day of week), team reviews (admin-created, whole-team participation), expanded review content (wins, friction, brain dumps, goal progress), goal date ranges, and review data export (JSON/CSV).

**Architecture:** Six layers: (1) Prisma schema changes across Review, ReviewTemplate, and Goal models + migration, (2) flexible scheduling logic in `review-dates.ts` and review API routes, (3) team review access control and per-member contribution model, (4) expanded ReviewChecklist with step-type renderers for text lists, auto-tasks, auto-goals, and calendar, (5) export API endpoint with JSON/CSV formatters, (6) seed data for 8 templates (4 cadences x 2 variants).

**Tech Stack:** Next.js 14 / TypeScript / Prisma / PostgreSQL / Vitest / Tailwind / Framer Motion / SWR / date-fns / lucide-react

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `prisma/schema.prisma` | Modify | Add `startDate`, `recurrenceDayOfWeek`, `isTeamReview` to Review; add `isTeamTemplate` to ReviewTemplate (change unique constraint); add `startDate`/`endDate` to Goal |
| `prisma/seed.ts` | Modify | Expand from 4 to 8 templates (individual + team variants) with new step types |
| `src/test/fixtures.ts` | Modify | Add new fields to `createReview` and `createGoal` factories |
| `src/lib/review-dates.ts` | Modify | Accept `startDate` and `recurrenceDayOfWeek` params; compute next date anchored to user preferences |
| `src/__tests__/review-dates.test.ts` | Create | Unit tests for flexible scheduling logic |
| `src/app/api/reviews/route.ts` | Modify | Accept scheduling + team review fields in POST; filter by scope in GET; admin gate for team reviews |
| `src/app/api/reviews/[id]/route.ts` | Modify | Team review access (all authenticated users); per-member `checklistState` validation in PATCH; template lookup with `isTeamTemplate` |
| `src/__tests__/review-api.test.ts` | Create | Tests for team review access control, scheduling params, per-member contribution validation |
| `src/app/api/reviews/export/route.ts` | Create | GET endpoint returning JSON or CSV of review data with type/date/scope filters |
| `src/__tests__/review-export.test.ts` | Create | Tests for export filtering, JSON format, CSV format |
| `src/components/reviews/ReviewChecklist.tsx` | Modify | Render expanded step types (`text_list`, `auto_tasks`, `auto_goals`, `calendar`); team review layout with per-member sections |
| `src/components/reviews/__tests__/ReviewChecklist.test.tsx` | Create | Tests for step-type renderers and team review layout |
| `src/components/reviews/steps/TextListStep.tsx` | Create | Reusable text-list input (wins, friction, priorities) |
| `src/components/reviews/steps/AutoTasksStep.tsx` | Create | Auto-loaded previous-week tasks with status actions |
| `src/components/reviews/steps/AutoGoalsStep.tsx` | Create | Auto-populated goal progress from goal stack |
| `src/components/reviews/steps/CalendarStep.tsx` | Create | Inline calendar for scheduling work blocks |
| `src/components/reviews/TeamReviewLayout.tsx` | Create | Per-member contribution sections + company goal dashboard header |
| `src/components/reviews/ReviewScheduleSetup.tsx` | Create | Date picker, day-of-week selector, next-3-dates preview |
| `src/components/reviews/ExportDialog.tsx` | Create | Export UI: date range, type filter, format toggle, scope toggle |
| `src/app/(app)/reviews/page.tsx` | Modify | Add "My Reviews" / "Team Reviews" tab toggle; admin "Create Team Review" button; export button; integrate ReviewScheduleSetup |
| `src/components/goals/GoalEditor.tsx` | Modify | Add `startDate`/`endDate` date range inputs |
| `src/app/api/goals/route.ts` | Modify | Accept `startDate`/`endDate` in POST |

---

### Task 1: Prisma Schema — Add Fields to Review, ReviewTemplate, and Goal

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `src/test/fixtures.ts`

- [ ] **Step 1: Add scheduling and team fields to Review model**

In `prisma/schema.prisma`, add after `checklistState Json?`:

```prisma
  startDate           DateTime?
  recurrenceDayOfWeek Int?
  isTeamReview        Boolean    @default(false)
```

- [ ] **Step 2: Add isTeamTemplate to ReviewTemplate and update unique constraint**

Replace the current `ReviewTemplate` model:

```prisma
model ReviewTemplate {
  id             String     @id @default(cuid())
  reviewType     ReviewType
  isTeamTemplate Boolean    @default(false)
  checklistItems Json
  processSteps   Json
  createdAt      DateTime   @default(now())
  updatedAt      DateTime   @updatedAt

  @@unique([reviewType, isTeamTemplate])
}
```

This replaces the old `@@unique` on `reviewType` alone.

- [ ] **Step 3: Add startDate and endDate to Goal model**

In the `Goal` model, add after `dueDate DateTime?`:

```prisma
  startDate   DateTime?
  endDate     DateTime?
```

- [ ] **Step 4: Run the migration**

Run: `cd goal-dashboard && npx prisma migrate dev --name review_system_overhaul`
Expected: Migration creates successfully. Existing data is preserved (all new fields are optional/have defaults).

- [ ] **Step 5: Update test fixtures**

In `src/test/fixtures.ts`, update `createReview` to include new defaults:

```typescript
export function createReview(overrides: Record<string, any> = {}) {
  return {
    id: nextId(),
    type: 'WEEKLY',
    checklistState: {},
    notes: '',
    completedAt: null,
    startDate: null,
    recurrenceDayOfWeek: null,
    isTeamReview: false,
    template: {
      checklistItems: ['Review goals', 'Plan next week', 'Update progress'],
      processSteps: [],
    },
    ...overrides,
  };
}
```

Update `createGoal` to include `startDate: null, endDate: null`.

- [ ] **Step 6: Run existing tests**

Run: `cd goal-dashboard && npx vitest run`
Expected: All existing tests PASS.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/ src/test/fixtures.ts
git commit -m "feat(schema): add scheduling, team review, and goal date range fields"
```

---

### Task 2: Flexible Scheduling Logic

**Files:**
- Modify: `src/lib/review-dates.ts`
- Create: `src/__tests__/review-dates.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/__tests__/review-dates.test.ts` with tests for:
- Weekly review with `startDate` on a Wednesday + `recurrenceDayOfWeek: 3` returns next Wednesday on or after startDate
- Weekly review with no custom params still defaults to next Sunday (backwards compat)
- Monthly review with `recurrenceDayOfWeek: 5` returns the first Friday of the next month
- Quarterly review with `recurrenceDayOfWeek: 1` returns the first Monday of the next quarter
- Yearly review with `recurrenceDayOfWeek: 2` returns the first Tuesday of the next year
- `startDate` in the future: returns the first matching day-of-week on or after `startDate`
- `startDate` in the past: behaves normally (anchors from now)

- [ ] **Step 2: Run tests to verify failure**

Run: `cd goal-dashboard && npx vitest run src/__tests__/review-dates.test.ts`
Expected: FAIL — `getNextReviewDate` does not accept new params.

- [ ] **Step 3: Implement flexible scheduling**

Refactor `src/lib/review-dates.ts` to accept optional params:

```typescript
import { addMonths, addWeeks, nextDay, startOfMonth, getDay } from 'date-fns';

interface SchedulingOptions {
  startDate?: Date | null;
  recurrenceDayOfWeek?: number | null; // 0=Sun ... 6=Sat
}

export function getNextReviewDate(
  reviewType: string,
  options: SchedulingOptions = {}
): Date {
  const now = new Date();
  const { startDate, recurrenceDayOfWeek } = options;
  const anchor = startDate && startDate > now ? startDate : now;

  // If no custom day-of-week, fall back to original logic
  if (recurrenceDayOfWeek == null) {
    // ... existing switch logic (unchanged) ...
  }

  // Custom day-of-week scheduling
  switch (reviewType) {
    case 'WEEKLY':
      return findNextDayOfWeek(anchor, recurrenceDayOfWeek);
    case 'MONTHLY': {
      const targetMonth = startOfMonth(addMonths(now, 1));
      return findFirstDayOfWeekInMonth(targetMonth, recurrenceDayOfWeek);
    }
    case 'QUARTERLY': {
      const nextQuarterStart = getNextQuarterStart(now);
      return findFirstDayOfWeekInMonth(nextQuarterStart, recurrenceDayOfWeek);
    }
    case 'YEARLY': {
      const nextYearStart = new Date(now.getFullYear() + 1, 0, 1);
      return findFirstDayOfWeekInMonth(nextYearStart, recurrenceDayOfWeek);
    }
    default:
      return addWeeks(now, 1);
  }
}
```

Add helper functions `findNextDayOfWeek`, `findFirstDayOfWeekInMonth`, and `getNextQuarterStart`.

- [ ] **Step 4: Run tests to verify pass**

Run: `cd goal-dashboard && npx vitest run src/__tests__/review-dates.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Run full test suite**

Run: `cd goal-dashboard && npx vitest run`
Expected: All existing tests still PASS (signature is backwards-compatible via defaults).

- [ ] **Step 6: Commit**

```bash
git add src/lib/review-dates.ts src/__tests__/review-dates.test.ts
git commit -m "feat(scheduling): flexible review dates with startDate and recurrenceDayOfWeek"
```

---

### Task 3: Reviews API — Team Reviews + Scheduling Params

**Files:**
- Modify: `src/app/api/reviews/route.ts`
- Modify: `src/app/api/reviews/[id]/route.ts`
- Create: `src/__tests__/review-api.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/__tests__/review-api.test.ts` with tests for:
- POST with `isTeamReview: true` and non-admin user returns 403
- POST with `isTeamReview: true` and admin user creates review successfully
- POST accepts `startDate` and `recurrenceDayOfWeek`, stores them on the review
- GET with `scope=team` returns team reviews for any authenticated user
- GET with `scope=individual` (default) returns only the user's own reviews
- GET for admin returns both individual (own) and team reviews appropriately
- PATCH on team review: non-admin user can only modify their own `memberResponses[userId]` entry
- PATCH on team review: admin can modify any section
- GET `[id]` for team review: any authenticated user can access
- GET `[id]` for individual review: only owner or admin can access
- Template lookup uses `isTeamTemplate` to match the correct variant

- [ ] **Step 2: Run tests to verify failure**

Run: `cd goal-dashboard && npx vitest run src/__tests__/review-api.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement POST changes in `route.ts`**

In `src/app/api/reviews/route.ts`:

```typescript
export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const body = await request.json();
  const { reviewType, isTeamReview, startDate, recurrenceDayOfWeek } = body;

  if (!reviewType) {
    return Response.json({ error: 'reviewType is required' }, { status: 400 });
  }

  // Admin gate for team reviews
  if (isTeamReview) {
    if (!auth.session.user.isAdmin) {
      return Response.json({ error: 'Only admins can create team reviews' }, { status: 403 });
    }
  }

  // Check for existing incomplete review of this type+scope for this user
  const existing = await prisma.review.findFirst({
    where: {
      userId: auth.userId,
      reviewType,
      isTeamReview: isTeamReview ?? false,
      completedAt: null,
    },
  });

  if (existing) {
    return Response.json({ error: 'An incomplete review of this type already exists' }, { status: 409 });
  }

  const scheduledDate = getNextReviewDate(reviewType, {
    startDate: startDate ? new Date(startDate) : null,
    recurrenceDayOfWeek: recurrenceDayOfWeek ?? null,
  });

  const review = await prisma.review.create({
    data: {
      userId: auth.userId,
      reviewType,
      scheduledDate,
      isTeamReview: isTeamReview ?? false,
      startDate: startDate ? new Date(startDate) : null,
      recurrenceDayOfWeek: recurrenceDayOfWeek ?? null,
    },
  });

  return Response.json(review, { status: 201 });
}
```

- [ ] **Step 4: Implement GET changes with scope filter**

In `src/app/api/reviews/route.ts` GET handler:

```typescript
const scope = searchParams.get('scope'); // 'team' | 'individual' | null

if (scope === 'team') {
  where.isTeamReview = true;
  delete where.userId; // team reviews visible to all authenticated users
} else {
  where.isTeamReview = false;
  // userId already set — individual reviews for owner only
}
```

Admin users also see individual reviews for all users if an `adminView` param is passed (future consideration).

- [ ] **Step 5: Implement [id] route changes**

In `src/app/api/reviews/[id]/route.ts`:

**GET:** Allow any authenticated user to access team reviews. For individual reviews, restrict to owner + admin.

```typescript
if (!review.isTeamReview && review.userId !== auth.userId && !auth.session.user.isAdmin) {
  return Response.json({ error: 'Not found' }, { status: 404 });
}

// Template lookup now uses isTeamTemplate
const template = await prisma.reviewTemplate.findFirst({
  where: {
    reviewType: review.reviewType,
    isTeamTemplate: review.isTeamReview,
  },
});
```

**PATCH:** For team reviews, validate per-member contribution edits:

```typescript
if (review.isTeamReview && checklistState?.memberResponses) {
  const isAdmin = auth.session.user.isAdmin;
  const submittedUserIds = Object.keys(checklistState.memberResponses);
  if (!isAdmin && (submittedUserIds.length !== 1 || submittedUserIds[0] !== auth.userId)) {
    return Response.json({ error: 'You can only edit your own responses' }, { status: 403 });
  }
  // Merge member responses into existing state
  const existing = (review.checklistState as any) ?? {};
  data.checklistState = {
    ...existing,
    memberResponses: {
      ...(existing.memberResponses ?? {}),
      ...checklistState.memberResponses,
    },
    ...(checklistState.teamPriorities ? { teamPriorities: checklistState.teamPriorities } : {}),
  };
}
```

**PATCH complete:** When auto-scheduling the next review, pass `startDate` and `recurrenceDayOfWeek` from the current review:

```typescript
const nextDate = getNextReviewDate(review.reviewType, {
  startDate: review.startDate,
  recurrenceDayOfWeek: review.recurrenceDayOfWeek,
});
await prisma.review.create({
  data: {
    userId: auth.userId,
    reviewType: review.reviewType,
    scheduledDate: nextDate,
    isTeamReview: review.isTeamReview,
    startDate: review.startDate,
    recurrenceDayOfWeek: review.recurrenceDayOfWeek,
  },
});
```

- [ ] **Step 6: Run tests to verify pass**

Run: `cd goal-dashboard && npx vitest run src/__tests__/review-api.test.ts`
Expected: All tests PASS.

- [ ] **Step 7: Run full test suite**

Run: `cd goal-dashboard && npx vitest run`
Expected: All tests PASS.

- [ ] **Step 8: Commit**

```bash
git add src/app/api/reviews/route.ts src/app/api/reviews/[id]/route.ts src/__tests__/review-api.test.ts
git commit -m "feat(api): team reviews with admin gating, flexible scheduling, per-member contributions"
```

---

### Task 4: Goal Date Ranges — Schema Already Done, Wire Up API + Editor

**Files:**
- Modify: `src/app/api/goals/route.ts`
- Modify: `src/components/goals/GoalEditor.tsx`

- [ ] **Step 1: Accept startDate/endDate in goals POST**

In `src/app/api/goals/route.ts`, extract `startDate` and `endDate` from body and include in `prisma.goal.create`:

```typescript
const { stackId, parentId, level, title, description, dueDate, startDate, endDate } = body;
// ...
const goal = await prisma.goal.create({
  data: {
    // ... existing fields ...
    startDate: startDate ? new Date(startDate) : null,
    endDate: endDate ? new Date(endDate) : null,
  },
});
```

- [ ] **Step 2: Add date range inputs to GoalEditor**

In `src/components/goals/GoalEditor.tsx`, add two date input fields for `startDate` and `endDate` near the existing `dueDate` field. Show them for WEEKLY, MONTHLY, and YEARLY level goals. Display as a "Date Range" section with start and end date pickers.

- [ ] **Step 3: Run full test suite**

Run: `cd goal-dashboard && npx vitest run`
Expected: All tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/goals/route.ts src/components/goals/GoalEditor.tsx
git commit -m "feat(goals): accept startDate/endDate for goal date ranges"
```

---

### Task 5: Expanded Review Step Components

**Files:**
- Create: `src/components/reviews/steps/TextListStep.tsx`
- Create: `src/components/reviews/steps/AutoTasksStep.tsx`
- Create: `src/components/reviews/steps/AutoGoalsStep.tsx`
- Create: `src/components/reviews/steps/CalendarStep.tsx`
- Create: `src/components/reviews/__tests__/ReviewChecklist.test.tsx`

- [ ] **Step 1: Write failing tests for step renderers**

Create `src/components/reviews/__tests__/ReviewChecklist.test.tsx` with tests for:
- `TextListStep`: renders input, adds items on Enter, removes items on X click, calls onChange with updated array
- `AutoTasksStep`: renders previous-week tasks fetched from API, allows marking complete/reschedule/abandon
- `AutoGoalsStep`: renders goal progress from API data, shows progress bars
- `CalendarStep`: renders placeholder with correct week range (full calendar integration is out of scope for v1)

- [ ] **Step 2: Implement TextListStep**

Create `src/components/reviews/steps/TextListStep.tsx`:

```typescript
interface TextListStepProps {
  title: string;
  description?: string;
  items: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
  minItems?: number;
  maxItems?: number;
}
```

Renders an array of text inputs with add/remove buttons. Used for "Track Wins" (3-5 items), "Remove Friction", "Plan Ahead" (top 3), team wins, shared blockers, and team priorities.

- [ ] **Step 3: Implement AutoTasksStep**

Create `src/components/reviews/steps/AutoTasksStep.tsx`:

Fetches tasks from `/api/tasks?from={weekStart}&to={weekEnd}` where dates are the previous week. Renders each task with current status and action buttons:
- "Complete" (PATCH status to DONE)
- "Reschedule" (PATCH with new dueDate in upcoming week)
- "Abandon" (PATCH status to DROPPED)

- [ ] **Step 4: Implement AutoGoalsStep**

Create `src/components/reviews/steps/AutoGoalsStep.tsx`:

Fetches goal stacks from `/api/goal-stacks` and renders goal progress. For monthly reviews, shows monthly goal progress. For yearly reviews, shows full stack summary with completion counts.

- [ ] **Step 5: Implement CalendarStep**

Create `src/components/reviews/steps/CalendarStep.tsx`:

For v1, renders a week view with time slots. Users can drag tasks into time blocks. If the daily/weekly aims feature is not yet implemented, shows only task scheduling without the aims panel (as noted in the spec dependency).

- [ ] **Step 6: Run tests**

Run: `cd goal-dashboard && npx vitest run src/components/reviews/__tests__/ReviewChecklist.test.tsx`
Expected: All tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/reviews/steps/ src/components/reviews/__tests__/ReviewChecklist.test.tsx
git commit -m "feat(reviews): add TextListStep, AutoTasksStep, AutoGoalsStep, CalendarStep renderers"
```

---

### Task 6: ReviewChecklist — Integrate Step Types + Team Layout

**Files:**
- Modify: `src/components/reviews/ReviewChecklist.tsx`
- Create: `src/components/reviews/TeamReviewLayout.tsx`

- [ ] **Step 1: Refactor ReviewChecklist to support step types**

The current ReviewChecklist only handles `checkbox` items. Refactor to read the `type` field from each template step and render the correct component:

```typescript
type ReviewStep = {
  id: string;
  title: string;
  description?: string;
  type: 'checkbox' | 'text' | 'text_list' | 'auto_tasks' | 'calendar' | 'auto_goals';
  required: boolean;
};
```

Add a `renderStep` function that dispatches to the appropriate component:

```typescript
function renderStep(step: ReviewStep, state: any, onChange: (val: any) => void) {
  switch (step.type) {
    case 'checkbox': return <CheckboxStep ... />;
    case 'text': return <textarea ... />;
    case 'text_list': return <TextListStep ... />;
    case 'auto_tasks': return <AutoTasksStep ... />;
    case 'auto_goals': return <AutoGoalsStep ... />;
    case 'calendar': return <CalendarStep ... />;
  }
}
```

Maintain backwards compatibility: if a template step has no `type` field, treat it as `checkbox` (for existing templates until seed is updated).

- [ ] **Step 2: Create TeamReviewLayout**

Create `src/components/reviews/TeamReviewLayout.tsx`:

For team reviews (`isTeamReview: true`), render:
1. Company goal progress dashboard at the top (auto-populated from company goal stack)
2. Per-member sections where each member contributes their wins and blockers
3. Team priorities section (admin-editable)

Each member sees their section as editable and other sections as read-only. Admins see all sections as editable.

```typescript
interface TeamReviewLayoutProps {
  reviewId: string;
  checklistState: any;
  currentUserId: string;
  isAdmin: boolean;
  teamMembers: { id: string; name: string }[];
  onUpdate: (state: any) => void;
}
```

- [ ] **Step 3: Wire team layout into ReviewChecklist**

In `ReviewChecklist.tsx`, detect `review.isTeamReview` and render `TeamReviewLayout` instead of the standard step-by-step flow. Fetch team members from `/api/users` (or `/api/team`) for the member list.

- [ ] **Step 4: Run tests**

Run: `cd goal-dashboard && npx vitest run`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/reviews/ReviewChecklist.tsx src/components/reviews/TeamReviewLayout.tsx
git commit -m "feat(reviews): integrate step-type renderers and team review layout"
```

---

### Task 7: Review Schedule Setup UI

**Files:**
- Create: `src/components/reviews/ReviewScheduleSetup.tsx`

- [ ] **Step 1: Implement ReviewScheduleSetup**

Create `src/components/reviews/ReviewScheduleSetup.tsx`:

```typescript
interface ReviewScheduleSetupProps {
  reviewType: string;
  onSchedule: (options: {
    startDate: string;
    recurrenceDayOfWeek: number;
  }) => void;
}
```

Renders:
1. Date picker for start date (defaults to today)
2. Day-of-week dropdown selector (Sun-Sat, defaults to Sunday for weekly, Monday for others)
3. Preview of next 3 scheduled dates (computed client-side using the same logic as `review-dates.ts`)

Uses the existing glass-panel styling consistent with the reviews page.

- [ ] **Step 2: Commit**

```bash
git add src/components/reviews/ReviewScheduleSetup.tsx
git commit -m "feat(ui): add ReviewScheduleSetup with date picker, day selector, and preview"
```

---

### Task 8: Reviews Page — Tabs, Team Reviews, Schedule Setup

**Files:**
- Modify: `src/app/(app)/reviews/page.tsx`

- [ ] **Step 1: Add tab toggle for My Reviews / Team Reviews**

Add a tab component at the top of the page. Default to "My Reviews". "Team Reviews" tab fetches with `scope=team`. State variable `activeTab` controls which SWR endpoint to use:

```typescript
const [activeTab, setActiveTab] = useState<'individual' | 'team'>('individual');
const { data: reviewsData, mutate: mutateReviews } = useSWR(
  `/api/reviews?scope=${activeTab}`
);
```

- [ ] **Step 2: Add "Create Team Review" button for admins**

Fetch current user session to check `isAdmin`. When admin is on the "Team Reviews" tab, show a "Create Team Review" button that opens `ReviewScheduleSetup` and passes `isTeamReview: true` to the POST.

- [ ] **Step 3: Integrate ReviewScheduleSetup into cadence setup**

Replace the simple "Set Up Cadences" button with a flow that shows `ReviewScheduleSetup` for each cadence type, allowing users to pick start date and day-of-week before creating the review.

- [ ] **Step 4: Replace client-side `getNextScheduledDate` with server-anchored previews**

The current `getNextScheduledDate` function in the page duplicates logic. Keep it for preview purposes but update it to accept `startDate` and `recurrenceDayOfWeek` params matching the server logic.

- [ ] **Step 5: Run full test suite**

Run: `cd goal-dashboard && npx vitest run`
Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/\(app\)/reviews/page.tsx
git commit -m "feat(ui): add My Reviews/Team Reviews tabs, admin team review creation, schedule setup"
```

---

### Task 9: Export API Endpoint

**Files:**
- Create: `src/app/api/reviews/export/route.ts`
- Create: `src/__tests__/review-export.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/__tests__/review-export.test.ts` with tests for:
- GET with `format=json` returns JSON array of expanded review objects
- GET with `format=csv` returns CSV string with correct headers and flattened rows
- `type=WEEKLY` filters to only weekly reviews
- `from` and `to` params filter by `scheduledDate` range
- `scope=team` returns only team reviews; `scope=individual` returns only individual reviews
- Unauthenticated request returns 401
- Export includes: reviewType, scheduledDate, completedAt, all checklistState fields (wins, friction, priorities, brain dump, lessons, mistakes), notes, goal progress snapshot
- Empty result returns empty array/empty CSV with headers

- [ ] **Step 2: Run tests to verify failure**

Run: `cd goal-dashboard && npx vitest run src/__tests__/review-export.test.ts`
Expected: FAIL — route does not exist.

- [ ] **Step 3: Implement export endpoint**

Create `src/app/api/reviews/export/route.ts`:

```typescript
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');       // WEEKLY, MONTHLY, etc.
  const from = searchParams.get('from');       // ISO date string
  const to = searchParams.get('to');           // ISO date string
  const format = searchParams.get('format') ?? 'json'; // 'json' | 'csv'
  const scope = searchParams.get('scope');     // 'individual' | 'team'

  const where: any = {};

  if (scope === 'team') {
    where.isTeamReview = true;
  } else {
    where.userId = auth.userId;
    where.isTeamReview = false;
  }

  if (type) where.reviewType = type;
  if (from) where.scheduledDate = { ...(where.scheduledDate ?? {}), gte: new Date(from) };
  if (to) where.scheduledDate = { ...(where.scheduledDate ?? {}), lte: new Date(to) };

  const reviews = await prisma.review.findMany({
    where,
    orderBy: { scheduledDate: 'asc' },
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  if (format === 'csv') {
    const csv = convertToCSV(reviews);
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="reviews-export.csv"`,
      },
    });
  }

  return Response.json(reviews);
}

function convertToCSV(reviews: any[]): string {
  const headers = [
    'id', 'reviewType', 'scheduledDate', 'completedAt', 'isTeamReview',
    'notes', 'wins', 'friction', 'priorities', 'lessons', 'mistakes', 'brainDump',
    'userName', 'userEmail',
  ];
  const rows = reviews.map((r) => {
    const state = (r.checklistState as any) ?? {};
    return [
      r.id,
      r.reviewType,
      r.scheduledDate?.toISOString() ?? '',
      r.completedAt?.toISOString() ?? '',
      r.isTeamReview,
      csvEscape(r.notes ?? ''),
      csvEscape((state.wins ?? []).join('; ')),
      csvEscape((state.friction ?? []).join('; ')),
      csvEscape((state.priorities ?? []).join('; ')),
      csvEscape(state.lessons ?? ''),
      csvEscape(state.mistakes ?? ''),
      csvEscape(state.brainDump ?? ''),
      csvEscape(r.user?.name ?? ''),
      csvEscape(r.user?.email ?? ''),
    ].join(',');
  });
  return [headers.join(','), ...rows].join('\n');
}

function csvEscape(val: string): string {
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `cd goal-dashboard && npx vitest run src/__tests__/review-export.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Run full test suite**

Run: `cd goal-dashboard && npx vitest run`
Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/reviews/export/route.ts src/__tests__/review-export.test.ts
git commit -m "feat(api): review data export endpoint with JSON and CSV formats"
```

---

### Task 10: Export UI Dialog

**Files:**
- Create: `src/components/reviews/ExportDialog.tsx`
- Modify: `src/app/(app)/reviews/page.tsx`

- [ ] **Step 1: Implement ExportDialog**

Create `src/components/reviews/ExportDialog.tsx`:

```typescript
interface ExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
}
```

Renders a modal dialog with:
1. Date range picker (from/to)
2. Review type filter dropdown (All, Weekly, Monthly, Quarterly, Yearly)
3. Format toggle (JSON / CSV)
4. Scope toggle (My Reviews / Team Reviews)
5. "Export" button that triggers download via `window.open('/api/reviews/export?...')`

- [ ] **Step 2: Add Export button to reviews page**

In `src/app/(app)/reviews/page.tsx`, add a `Download` icon button next to the page title that opens `ExportDialog`.

- [ ] **Step 3: Commit**

```bash
git add src/components/reviews/ExportDialog.tsx src/app/\(app\)/reviews/page.tsx
git commit -m "feat(ui): add export dialog with date range, type filter, format and scope toggles"
```

---

### Task 11: Seed Templates — 8 Templates (Individual + Team)

**Files:**
- Modify: `prisma/seed.ts`

- [ ] **Step 1: Update seed to use new unique constraint**

Change `upsert` to use the composite key `{ reviewType_isTeamTemplate: { reviewType, isTeamTemplate } }` instead of `{ reviewType }`.

- [ ] **Step 2: Add 4 individual templates with expanded step types**

Update the existing 4 templates to use the new `ReviewStep` format with `type` fields:

**Weekly Individual:**
```typescript
{
  reviewType: 'WEEKLY',
  isTeamTemplate: false,
  checklistItems: [
    { id: 'wins', title: 'Track Wins', description: '3-5 key achievements this week', type: 'text_list', required: true },
    { id: 'friction', title: 'Remove Friction', description: 'Energy-wasting tasks to eliminate', type: 'text_list', required: true },
    { id: 'review_tasks', title: 'Review Previous Week', description: 'Review tasks from last week', type: 'auto_tasks', required: true },
    { id: 'plan', title: 'Plan Ahead', description: 'Top 3 priorities for next week', type: 'text_list', required: true },
    { id: 'schedule', title: 'Schedule Next Week', description: 'Block time for priorities', type: 'calendar', required: false },
  ],
  processSteps: [ /* updated process guide */ ],
}
```

**Monthly Individual:**
```typescript
{
  reviewType: 'MONTHLY',
  isTeamTemplate: false,
  checklistItems: [
    { id: 'lessons', title: 'Lessons Learned', type: 'text', required: true },
    { id: 'mistakes', title: 'Mistakes Made', type: 'text', required: true },
    { id: 'brain_dump', title: 'Brain Dump', description: "What's on your mind", type: 'text', required: true },
    { id: 'goal_progress', title: 'Goal Progress Review', type: 'auto_goals', required: true },
    { id: 'yearly_check', title: 'Yearly Goal Progress Check', type: 'auto_goals', required: true },
    { id: 'changes', title: 'Changes Needed on Goals', type: 'text_list', required: false },
  ],
  processSteps: [ /* ... */ ],
}
```

**Quarterly and Yearly Individual:** Similar patterns using the step types from the spec.

- [ ] **Step 3: Add 4 team templates**

**Weekly Team:**
```typescript
{
  reviewType: 'WEEKLY',
  isTeamTemplate: true,
  checklistItems: [
    { id: 'team_wins', title: 'Team Wins', description: 'Each member shares 1-3 wins', type: 'text_list', required: true },
    { id: 'blockers', title: 'Shared Blockers', description: 'Team identifies common friction', type: 'text_list', required: true },
    { id: 'company_goals', title: 'Company Goal Progress', type: 'auto_goals', required: true },
    { id: 'team_priorities', title: 'Team Priorities', description: 'Top priorities for next week', type: 'text_list', required: true },
  ],
  processSteps: [ /* ... */ ],
}
```

Monthly, Quarterly, and Yearly team templates follow the same pattern with team-oriented content.

- [ ] **Step 4: Run seed**

Run: `cd goal-dashboard && npx prisma db seed`
Expected: "Seed complete: 8 ReviewTemplates + CompanySettings + Admin user"

- [ ] **Step 5: Commit**

```bash
git add prisma/seed.ts
git commit -m "feat(seed): expand to 8 review templates — individual + team variants with step types"
```

---

### Task 12: Final Verification

- [ ] **Step 1: Run full test suite**

Run: `cd goal-dashboard && npx vitest run`
Expected: All tests PASS.

- [ ] **Step 2: Run build**

Run: `cd goal-dashboard && npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Manual smoke tests**

1. Create a weekly review with custom start date (Wednesday) and `recurrenceDayOfWeek: 3` — verify next dates fall on Wednesdays
2. Admin creates a team review — verify all users see it in the Team Reviews tab
3. Non-admin user tries to create team review — verify 403 rejection
4. Complete a weekly individual review through all 5 steps: track wins, remove friction, review previous week tasks, plan ahead, schedule
5. Complete a monthly review with lessons/mistakes/brain dump
6. Team member contributes to team review — verify they can only edit their own section
7. Export reviews as JSON — verify data completeness (all checklistState fields present)
8. Export reviews as CSV — verify headers and flattened row format
9. Goal date ranges display correctly in goal editor
10. Goal date ranges are used in AutoTasksStep to scope "previous week's tasks"

- [ ] **Step 4: Commit any fixes**
