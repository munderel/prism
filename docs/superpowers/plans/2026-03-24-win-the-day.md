# Win the Day Flag — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Win the Day" flag to the Task model so users can designate one task per day as their single most important win, shown prominently on the dashboard with a gold/amber glow, and a special confetti celebration when completed.

**Architecture:** Five layers, each with its own test-first cycle: (1) Prisma schema adds `isWinTheDay` boolean + migration, (2) PATCH API enforces one-per-user-per-day via auto-unflag transaction, (3) TaskCard gets a star toggle icon, DailyTaskList wires the optimistic toggle, (4) Dashboard page gets a WinTheDayCard hero component, and (5) a new WinTheDayCelebration dopamine component fires gold confetti when the flagged task is completed. Each task is isolated to 1-3 files.

**Tech Stack:** Next.js 14 / TypeScript / Prisma / PostgreSQL / Vitest / Tailwind / Framer Motion / canvas-confetti / lucide-react

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `prisma/schema.prisma` | Modify | Add `isWinTheDay Boolean @default(false)` to Task model |
| `prisma/migrations/YYYYMMDD_add_win_the_day_flag/migration.sql` | Auto-generated | `ALTER TABLE "Task" ADD COLUMN "isWinTheDay" BOOLEAN NOT NULL DEFAULT false` |
| `src/test/fixtures.ts` | Modify | Add `isWinTheDay: false` default to `createTask` factory |
| `src/__tests__/win-the-day-api.test.ts` | Create | Unit tests for PATCH auto-unflag logic |
| `src/app/api/tasks/[id]/route.ts` | Modify | Handle `isWinTheDay` in PATCH: accept field, auto-unflag existing WTD for same user+date |
| `src/app/api/tasks/route.ts` | Modify | Accept `isWinTheDay` in POST create, auto-unflag on create |
| `src/components/tasks/__tests__/TaskCard.test.tsx` | Modify | Add star icon rendering and click tests |
| `src/components/tasks/TaskCard.tsx` | Modify | Add star icon toggle button for Win the Day |
| `src/components/tasks/__tests__/DailyTaskList.test.tsx` | Modify | Add Win the Day toggle PATCH test |
| `src/components/tasks/DailyTaskList.tsx` | Modify | Add `handleWinTheDayToggle` callback, pass to TaskCard, wire celebration |
| `src/components/dashboard/__tests__/WinTheDayCard.test.tsx` | Create | Tests for hero card rendering and states |
| `src/components/dashboard/WinTheDayCard.tsx` | Create | Gold/amber highlighted card showing the Win the Day task |
| `src/components/dopamine/__tests__/WinTheDayCelebration.test.tsx` | Create | Tests for celebration animation and confetti |
| `src/components/dopamine/WinTheDayCelebration.tsx` | Create | Confetti burst + "You Won the Day!" banner |
| `src/app/(app)/__tests__/DashboardPage.test.tsx` | Modify | Add Win the Day card presence tests |
| `src/app/(app)/page.tsx` | Modify | Insert WinTheDayCard above Today's Tasks, derive `winTask` from task list |

---

### Task 1: Prisma Schema Migration — Add `isWinTheDay` to Task

**Files:**
- Modify: `prisma/schema.prisma` (Task model, line 190-224)

- [ ] **Step 1: Add the field to the Task model**

In `prisma/schema.prisma`, add `isWinTheDay` to the Task model after the `timeBlockEnd` field (line 204) and before `startedAt`:

```prisma
model Task {
  id             String       @id @default(cuid())
  ownerId        String
  goalId         String?
  taskType       TaskType
  title          String
  description    String?      @db.Text
  deliverable    String?      @db.Text
  status         TaskStatus   @default(TODO)
  priority       TaskPriority @default(MEDIUM)
  dueDate        DateTime?
  recurrenceRule String?
  calendarEventId String?
  timeBlockStart DateTime?
  timeBlockEnd   DateTime?
  isWinTheDay    Boolean      @default(false)
  startedAt      DateTime?
  completedAt    DateTime?
  failedAt       DateTime?
  rescheduledTo  DateTime?
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt

  owner    User          @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  goal     Goal?         @relation(fields: [goalId], references: [id])
  comments TaskComment[]
  publicWins PublicWin[]
  processExecution ProcessExecution?

  @@index([ownerId])
  @@index([dueDate])
  @@index([status])
  @@index([goalId])
  @@index([ownerId, dueDate])
  @@index([ownerId, status])
}
```

- [ ] **Step 2: Generate and run the migration**

Run: `cd goal-dashboard && npx prisma migrate dev --name add_win_the_day_flag`

Expected: Migration creates `ALTER TABLE "Task" ADD COLUMN "isWinTheDay" BOOLEAN NOT NULL DEFAULT false;`

- [ ] **Step 3: Verify Prisma client is regenerated**

Run: `cd goal-dashboard && npx prisma generate`

Expected: Client regenerated with `isWinTheDay` field on the Task type.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(schema): add isWinTheDay boolean to Task model"
```

---

### Task 2: Test Fixture — Add `isWinTheDay` Default

**Files:**
- Modify: `src/test/fixtures.ts` (line 24-43)

- [ ] **Step 1: Add `isWinTheDay` to createTask fixture**

In `src/test/fixtures.ts`, add `isWinTheDay: false` to the `createTask` function default object, after `timeBlockEnd: null` (line 36) and before `goal: null`:

```typescript
export function createTask(overrides: Record<string, any> = {}) {
  return {
    id: nextId(),
    title: 'Test Task',
    description: '',
    status: 'TODO',
    priority: 'MEDIUM',
    taskType: 'GOAL_STACK',
    dueDate: null,
    goalId: null,
    deliverable: null,
    recurrenceRule: null,
    timeBlockStart: null,
    timeBlockEnd: null,
    isWinTheDay: false,
    goal: null,
    processExecution: null,
    _count: { comments: 0 },
    ...overrides,
  };
}
```

- [ ] **Step 2: Run existing tests to verify nothing breaks**

Run: `cd goal-dashboard && npx vitest run src/components/tasks/__tests__/TaskCard.test.tsx`

Expected: All existing tests PASS (the new field is inert until consumed by components).

- [ ] **Step 3: Commit**

```bash
git add src/test/fixtures.ts
git commit -m "test: add isWinTheDay default to createTask fixture"
```

---

### Task 3: API — Auto-Unflag Logic in PATCH `/api/tasks/[id]`

**Files:**
- Create: `src/__tests__/win-the-day-api.test.ts`
- Modify: `src/app/api/tasks/[id]/route.ts` (lines 58-87)

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/win-the-day-api.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock prisma before importing the module under test
const mockFindUnique = vi.fn();
const mockUpdate = vi.fn();
const mockUpdateMany = vi.fn();
const mockCreate = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    task: {
      findUnique: mockFindUnique,
      update: mockUpdate,
      updateMany: mockUpdateMany,
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

vi.mock('@/lib/progress', () => ({
  cascadeProgressUp: vi.fn(),
}));

vi.mock('@/lib/recurrence', () => ({
  parseRRule: vi.fn(),
  getNextOccurrence: vi.fn(),
}));

vi.mock('@/lib/calendar', () => ({
  createGoogleEvent: vi.fn(),
  updateGoogleEvent: vi.fn(),
  deleteGoogleEvent: vi.fn(),
  hasGoogleAccount: vi.fn(() => Promise.resolve(false)),
}));

import { PATCH } from '@/app/api/tasks/[id]/route';

describe('PATCH /api/tasks/[id] — isWinTheDay', () => {
  const dueDate = new Date('2026-03-24');

  const existingTask = {
    id: 'task-1',
    ownerId: 'user-1',
    dueDate,
    status: 'TODO',
    isWinTheDay: false,
    title: 'My Task',
    description: null,
    priority: 'MEDIUM',
    startedAt: null,
    calendarEventId: null,
    goalId: null,
    recurrenceRule: null,
    taskType: 'GOAL_STACK',
    timeBlockStart: null,
    timeBlockEnd: null,
    deliverable: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockFindUnique.mockResolvedValue({ ...existingTask });
    mockUpdate.mockImplementation(({ data }) => Promise.resolve({ ...existingTask, ...data }));
    mockUpdateMany.mockResolvedValue({ count: 0 });
  });

  it('sets isWinTheDay on the task', async () => {
    const request = new Request('http://localhost/api/tasks/task-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isWinTheDay: true }),
    });

    await PATCH(request, { params: Promise.resolve({ id: 'task-1' }) });

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'task-1' },
        data: expect.objectContaining({ isWinTheDay: true }),
      })
    );
  });

  it('unflags other Win the Day tasks for the same user and date', async () => {
    const request = new Request('http://localhost/api/tasks/task-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isWinTheDay: true }),
    });

    await PATCH(request, { params: Promise.resolve({ id: 'task-1' }) });

    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: {
        ownerId: 'user-1',
        dueDate,
        isWinTheDay: true,
        id: { not: 'task-1' },
      },
      data: { isWinTheDay: false },
    });
  });

  it('does NOT call updateMany when isWinTheDay is set to false', async () => {
    const request = new Request('http://localhost/api/tasks/task-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isWinTheDay: false }),
    });

    await PATCH(request, { params: Promise.resolve({ id: 'task-1' }) });

    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  it('does NOT unflag when isWinTheDay is not in the body', async () => {
    const request = new Request('http://localhost/api/tasks/task-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Renamed' }),
    });

    await PATCH(request, { params: Promise.resolve({ id: 'task-1' }) });

    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  it('does NOT unflag when task has no dueDate', async () => {
    mockFindUnique.mockResolvedValue({ ...existingTask, dueDate: null });

    const request = new Request('http://localhost/api/tasks/task-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isWinTheDay: true }),
    });

    await PATCH(request, { params: Promise.resolve({ id: 'task-1' }) });

    // isWinTheDay should still be set on the task itself
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isWinTheDay: true }),
      })
    );
    // But updateMany should NOT be called (no date to scope the unflag)
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd goal-dashboard && npx vitest run src/__tests__/win-the-day-api.test.ts`

Expected: FAIL — the PATCH handler does not yet read `isWinTheDay` from the body or call `updateMany`.

- [ ] **Step 3: Implement the unflag logic in the PATCH handler**

In `src/app/api/tasks/[id]/route.ts`, make three changes:

**Change 1 — line 59:** Add `isWinTheDay` to the destructured fields:

```typescript
  const { title, description, status, priority, dueDate, timeBlockStart, timeBlockEnd, deliverable, isWinTheDay } = body;
```

**Change 2 — after line 68** (after the `if (deliverable !== undefined)` line): Add:

```typescript
  if (isWinTheDay !== undefined) data.isWinTheDay = isWinTheDay;
```

**Change 3 — after the data object is fully built, before `const updated = await prisma.task.update(...)` (before line 87):** Add the auto-unflag logic:

```typescript
  // Win the Day: auto-unflag any other WTD task for this user on the same date
  if (isWinTheDay === true && task.dueDate) {
    await prisma.task.updateMany({
      where: {
        ownerId: task.ownerId,
        dueDate: task.dueDate,
        isWinTheDay: true,
        id: { not: id },
      },
      data: { isWinTheDay: false },
    });
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd goal-dashboard && npx vitest run src/__tests__/win-the-day-api.test.ts`

Expected: All 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/tasks/[id]/route.ts src/__tests__/win-the-day-api.test.ts
git commit -m "feat(api): add isWinTheDay to PATCH /api/tasks/[id] with auto-unflag logic"
```

---

### Task 4: API — Accept `isWinTheDay` in POST `/api/tasks`

**Files:**
- Modify: `src/app/api/tasks/route.ts` (lines 87-133)

- [ ] **Step 1: Add `isWinTheDay` to the POST handler**

In `src/app/api/tasks/route.ts`:

**Change 1 — line 87:** Add `isWinTheDay` to the destructured body fields:

```typescript
  const { taskType, title, description, priority, dueDate, goalId, recurrenceRule, timeBlockStart, timeBlockEnd, deliverable, isWinTheDay } = body;
```

**Change 2 — before the `prisma.task.create` call (before line 120):** Add auto-unflag if flagging:

```typescript
  // Win the Day: auto-unflag any existing WTD task for this user on the same date
  if (isWinTheDay === true && dueDate) {
    const dueDateObj = new Date(dueDate);
    await prisma.task.updateMany({
      where: {
        ownerId: auth.userId,
        dueDate: dueDateObj,
        isWinTheDay: true,
      },
      data: { isWinTheDay: false },
    });
  }
```

**Change 3 — in the `data` object of `prisma.task.create` (around line 132):** Add:

```typescript
      isWinTheDay: isWinTheDay ?? false,
```

- [ ] **Step 2: Run full test suite**

Run: `cd goal-dashboard && npx vitest run`

Expected: All tests PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/tasks/route.ts
git commit -m "feat(api): accept isWinTheDay flag in task creation with auto-unflag"
```

---

### Task 5: TaskCard — Star Icon Toggle

**Files:**
- Modify: `src/components/tasks/__tests__/TaskCard.test.tsx` (add tests at end of describe block)
- Modify: `src/components/tasks/TaskCard.tsx` (lines 5-6, 8-14, 16, 60)

- [ ] **Step 1: Write failing tests for the star icon**

Add the following tests at the end of the `describe('TaskCard', ...)` block in `src/components/tasks/__tests__/TaskCard.test.tsx`:

```typescript
  it('shows outline star when isWinTheDay is false', () => {
    const task = createTask({ isWinTheDay: false });
    renderWithProviders(
      <TaskCard task={task} {...defaultProps()} onWinTheDayToggle={vi.fn()} />
    );
    const starBtn = screen.getByTitle('Designate as Win the Day task');
    expect(starBtn).toBeInTheDocument();
    // Outline star should NOT have fill class
    expect(starBtn.querySelector('svg')).not.toHaveClass('fill-amber-400');
  });

  it('shows filled star when isWinTheDay is true', () => {
    const task = createTask({ isWinTheDay: true });
    renderWithProviders(
      <TaskCard task={task} {...defaultProps()} onWinTheDayToggle={vi.fn()} />
    );
    const starBtn = screen.getByTitle('Win the Day task');
    expect(starBtn).toBeInTheDocument();
    expect(starBtn.querySelector('svg')).toHaveClass('fill-amber-400');
  });

  it('star click calls onWinTheDayToggle with the task', async () => {
    const user = userEvent.setup();
    const onWinTheDayToggle = vi.fn();
    const task = createTask({ isWinTheDay: false });
    renderWithProviders(
      <TaskCard task={task} {...defaultProps()} onWinTheDayToggle={onWinTheDayToggle} />
    );
    await user.click(screen.getByTitle('Designate as Win the Day task'));
    expect(onWinTheDayToggle).toHaveBeenCalledWith(task);
  });

  it('star click does NOT call onClick (stopPropagation)', async () => {
    const user = userEvent.setup();
    const props = defaultProps();
    const task = createTask({ isWinTheDay: false });
    renderWithProviders(
      <TaskCard task={task} {...props} onWinTheDayToggle={vi.fn()} />
    );
    await user.click(screen.getByTitle('Designate as Win the Day task'));
    expect(props.onClick).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd goal-dashboard && npx vitest run src/components/tasks/__tests__/TaskCard.test.tsx`

Expected: FAIL — no element with title "Designate as Win the Day task" found.

- [ ] **Step 3: Implement the star icon in TaskCard**

In `src/components/tasks/TaskCard.tsx`:

**Change 1 — line 5:** Add `Star` to the lucide-react import:

```typescript
import { Pencil, Trash2, MessageSquare, RefreshCw, Target, Star } from 'lucide-react';
```

**Change 2 — lines 8-14:** Add `onWinTheDayToggle` to the props interface:

```typescript
interface TaskCardProps {
  task: any;
  onToggle: (task: any) => void;
  onEdit: (task: any) => void;
  onDelete: (taskId: string) => void;
  onClick?: (task: any) => void;
  onWinTheDayToggle?: (task: any) => void;
}
```

**Change 3 — line 16:** Update the component signature:

```typescript
export const TaskCard = React.memo(function TaskCard({ task, onToggle, onEdit, onDelete, onClick, onWinTheDayToggle }: TaskCardProps) {
```

**Change 4 — after line 60** (after the `{/* Priority dot */}` span, before the `{/* Title and meta */}` div): Insert the star button:

```typescript
        {/* Win the Day star */}
        {onWinTheDayToggle && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onWinTheDayToggle(task);
            }}
            className="flex-shrink-0"
            title={task.isWinTheDay ? 'Win the Day task' : 'Designate as Win the Day task'}
          >
            <Star
              className={`h-4 w-4 transition-colors ${
                task.isWinTheDay
                  ? 'fill-amber-400 text-amber-400'
                  : 'text-gray-600 hover:text-amber-400'
              }`}
            />
          </button>
        )}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd goal-dashboard && npx vitest run src/components/tasks/__tests__/TaskCard.test.tsx`

Expected: All tests PASS (existing tests + 4 new star tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/tasks/TaskCard.tsx src/components/tasks/__tests__/TaskCard.test.tsx
git commit -m "feat(ui): add star icon toggle for Win the Day on TaskCard"
```

---

### Task 6: DailyTaskList — Wire Up Win the Day Toggle + Celebration

**Files:**
- Modify: `src/components/tasks/__tests__/DailyTaskList.test.tsx` (add test at end)
- Modify: `src/components/tasks/DailyTaskList.tsx` (lines 1-8, 29, 35-60, 101-109)

- [ ] **Step 1: Write failing test for Win the Day toggle in DailyTaskList**

Add to the end of the `describe` block in `src/components/tasks/__tests__/DailyTaskList.test.tsx`:

```typescript
  it('calls PATCH with isWinTheDay when star is clicked', async () => {
    const user = userEvent.setup();
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });
    global.fetch = mockFetch;

    const tasks = [
      createTask({ id: 'wtd-1', title: 'Important Task', taskType: 'GOAL_STACK', isWinTheDay: false }),
    ];
    renderWithProviders(
      <DailyTaskList date={date} onEdit={onEdit} onDelete={onDelete} />,
      { swrData: { '/api/tasks': tasks } },
    );

    await waitFor(() => {
      expect(screen.getByText('Important Task')).toBeInTheDocument();
    });

    await user.click(screen.getByTitle('Designate as Win the Day task'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/tasks/wtd-1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ isWinTheDay: true }),
        })
      );
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd goal-dashboard && npx vitest run src/components/tasks/__tests__/DailyTaskList.test.tsx`

Expected: FAIL — star button exists (from TaskCard changes) but clicking it does not trigger a PATCH call because `onWinTheDayToggle` is not wired up yet in DailyTaskList.

- [ ] **Step 3: Implement the handler in DailyTaskList**

In `src/components/tasks/DailyTaskList.tsx`:

**Change 1 — line 3:** Update the import to include `useRef`:

```typescript
import { useState, useCallback, useMemo, useRef } from 'react';
```

**Change 2 — line 8:** Add the celebration import:

```typescript
import { WinTheDayCelebration } from '@/components/dopamine/WinTheDayCelebration';
```

**Change 3 — after line 29** (after the `collapsed` state): Add celebration state:

```typescript
  const [showWinCelebration, setShowWinCelebration] = useState(false);
```

**Change 4 — replace the existing `handleToggle` callback** (lines 35-60) with a version that detects Win the Day completion:

```typescript
  const handleToggle = useCallback(async (task: any) => {
    const newStatus = task.status === 'DONE' ? 'TODO' : 'DONE';
    const isWinTheDayCompletion = task.isWinTheDay && newStatus === 'DONE';

    mutate(
      async (currentData: any) => {
        await fetch(`/api/tasks/${task.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus }),
        });
        const current = Array.isArray(currentData) ? currentData : [];
        return current.map((t: any) =>
          t.id === task.id ? { ...t, status: newStatus } : t
        );
      },
      {
        optimisticData: (currentData: any) => {
          const current = Array.isArray(currentData) ? currentData : [];
          return current.map((t: any) =>
            t.id === task.id ? { ...t, status: newStatus } : t
          );
        },
        rollbackOnError: true,
      }
    );

    if (isWinTheDayCompletion) {
      setShowWinCelebration(true);
    }

    onStatusChange?.();
  }, [mutate, onStatusChange]);
```

**Change 5 — after `handleToggle`, add the Win the Day toggle handler:**

```typescript
  const handleWinTheDayToggle = useCallback(async (task: any) => {
    const newValue = !task.isWinTheDay;
    mutate(
      async (currentData: any) => {
        await fetch(`/api/tasks/${task.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isWinTheDay: newValue }),
        });
        const current = Array.isArray(currentData) ? currentData : [];
        return current.map((t: any) => {
          if (t.id === task.id) return { ...t, isWinTheDay: newValue };
          if (newValue && t.isWinTheDay) return { ...t, isWinTheDay: false };
          return t;
        });
      },
      {
        optimisticData: (currentData: any) => {
          const current = Array.isArray(currentData) ? currentData : [];
          return current.map((t: any) => {
            if (t.id === task.id) return { ...t, isWinTheDay: newValue };
            if (newValue && t.isWinTheDay) return { ...t, isWinTheDay: false };
            return t;
          });
        },
        rollbackOnError: true,
      }
    );
    onStatusChange?.();
  }, [mutate, onStatusChange]);
```

**Change 6 — in the JSX where `<TaskCard>` is rendered** (around line 101-109): Add the `onWinTheDayToggle` prop:

```typescript
                  sectionTasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      onToggle={handleToggle}
                      onEdit={onEdit}
                      onDelete={onDelete}
                      onClick={onClick}
                      onWinTheDayToggle={handleWinTheDayToggle}
                    />
                  ))
```

**Change 7 — at the end of the JSX return**, right before the closing `</div>` (before line 118): Add the celebration:

```typescript
      <WinTheDayCelebration
        show={showWinCelebration}
        onComplete={() => setShowWinCelebration(false)}
      />
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd goal-dashboard && npx vitest run src/components/tasks/__tests__/DailyTaskList.test.tsx`

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/tasks/DailyTaskList.tsx src/components/tasks/__tests__/DailyTaskList.test.tsx
git commit -m "feat(ui): wire up Win the Day toggle and celebration in DailyTaskList"
```

---

### Task 7: WinTheDayCard — Dashboard Hero Component

**Files:**
- Create: `src/components/dashboard/__tests__/WinTheDayCard.test.tsx`
- Create: `src/components/dashboard/WinTheDayCard.tsx`

- [ ] **Step 1: Write failing test for WinTheDayCard**

Create `src/components/dashboard/__tests__/WinTheDayCard.test.tsx`:

```typescript
import '@/test/mocks';
import { vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/utils';
import { createTask } from '@/test/fixtures';
import { WinTheDayCard } from '../WinTheDayCard';

describe('WinTheDayCard', () => {
  it('renders the Win the Day header and task title when a task is flagged', () => {
    const task = createTask({
      title: 'Ship the feature',
      isWinTheDay: true,
      status: 'TODO',
      priority: 'HIGH',
    });
    renderWithProviders(<WinTheDayCard task={task} />);
    expect(screen.getByText('WIN THE DAY')).toBeInTheDocument();
    expect(screen.getByText('Ship the feature')).toBeInTheDocument();
  });

  it('renders the task status badge', () => {
    const task = createTask({
      title: 'Ship the feature',
      isWinTheDay: true,
      status: 'IN_PROGRESS',
      priority: 'HIGH',
    });
    renderWithProviders(<WinTheDayCard task={task} />);
    expect(screen.getByText('IN PROGRESS')).toBeInTheDocument();
  });

  it('renders the task priority', () => {
    const task = createTask({
      title: 'Ship the feature',
      isWinTheDay: true,
      status: 'TODO',
      priority: 'HIGH',
    });
    renderWithProviders(<WinTheDayCard task={task} />);
    expect(screen.getByText('HIGH')).toBeInTheDocument();
  });

  it('shows prompt when no task is provided', () => {
    renderWithProviders(<WinTheDayCard task={null} />);
    expect(screen.getByText('WIN THE DAY')).toBeInTheDocument();
    expect(screen.getByText('Flag a task as your Win the Day')).toBeInTheDocument();
  });

  it('shows "You Won the Day!" when task is DONE', () => {
    const task = createTask({
      title: 'Done task',
      isWinTheDay: true,
      status: 'DONE',
      priority: 'MEDIUM',
    });
    renderWithProviders(<WinTheDayCard task={task} />);
    expect(screen.getByText('You Won the Day!')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd goal-dashboard && npx vitest run src/components/dashboard/__tests__/WinTheDayCard.test.tsx`

Expected: FAIL — module `../WinTheDayCard` not found.

- [ ] **Step 3: Implement WinTheDayCard component**

Create `src/components/dashboard/WinTheDayCard.tsx`:

```typescript
'use client';

import { m } from 'framer-motion';
import { Star, Trophy } from 'lucide-react';
import { TASK_STATUS_COLORS } from '@/lib/goal-constants';

interface WinTheDayCardProps {
  task: any | null;
}

export function WinTheDayCard({ task }: WinTheDayCardProps) {
  const isWon = task?.status === 'DONE';

  return (
    <m.div
      className={`relative mb-6 rounded-xl border-2 p-4 overflow-hidden ${
        isWon
          ? 'border-green-500/50 bg-green-500/5'
          : 'border-amber-500/30 bg-amber-500/5'
      }`}
      style={
        !isWon
          ? { boxShadow: '0 0 20px rgba(245, 158, 11, 0.15), 0 0 40px rgba(245, 158, 11, 0.05)' }
          : { boxShadow: '0 0 20px rgba(34, 197, 94, 0.15), 0 0 40px rgba(34, 197, 94, 0.05)' }
      }
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', damping: 20 }}
    >
      {/* Subtle glow background */}
      <div
        className={`absolute inset-0 opacity-10 blur-2xl ${
          isWon ? 'bg-green-400' : 'bg-amber-400'
        }`}
      />

      <div className="relative z-10">
        {/* Header */}
        <div className="flex items-center gap-2 mb-3">
          {isWon ? (
            <Trophy className="h-5 w-5 text-green-400" />
          ) : (
            <Star className="h-5 w-5 fill-amber-400 text-amber-400" />
          )}
          <span
            className={`text-xs font-bold tracking-widest ${
              isWon ? 'text-green-400' : 'text-amber-400'
            }`}
          >
            WIN THE DAY
          </span>
        </div>

        {/* Content */}
        {task ? (
          <div className="glass-panel px-4 py-3">
            <div className="flex items-center justify-between">
              <span
                className={`text-sm font-medium ${
                  isWon ? 'text-green-300' : 'text-white'
                }`}
              >
                {task.title}
              </span>
              <span className={`text-xs ${TASK_STATUS_COLORS[task.status] ?? ''}`}>
                {task.status.replace('_', ' ')}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-1">
              <span
                className={`text-xs font-medium ${
                  task.priority === 'URGENT'
                    ? 'text-red-400'
                    : task.priority === 'HIGH'
                    ? 'text-orange-400'
                    : task.priority === 'MEDIUM'
                    ? 'text-yellow-400'
                    : 'text-gray-400'
                }`}
              >
                {task.priority}
              </span>
            </div>
            {isWon && (
              <m.p
                className="text-sm font-semibold text-green-400 mt-2"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
              >
                You Won the Day!
              </m.p>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-500">Flag a task as your Win the Day</p>
        )}
      </div>
    </m.div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd goal-dashboard && npx vitest run src/components/dashboard/__tests__/WinTheDayCard.test.tsx`

Expected: All 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/WinTheDayCard.tsx src/components/dashboard/__tests__/WinTheDayCard.test.tsx
git commit -m "feat(ui): create WinTheDayCard dashboard hero component"
```

---

### Task 8: WinTheDayCelebration — Confetti + Banner Animation

**Files:**
- Create: `src/components/dopamine/__tests__/WinTheDayCelebration.test.tsx`
- Create: `src/components/dopamine/WinTheDayCelebration.tsx`

- [ ] **Step 1: Write failing test for WinTheDayCelebration**

Create `src/components/dopamine/__tests__/WinTheDayCelebration.test.tsx`:

```typescript
import '@/test/mocks';
import { vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { LazyMotion, domAnimation } from 'framer-motion';
import { WinTheDayCelebration } from '../WinTheDayCelebration';
import confetti from 'canvas-confetti';

vi.mocked(confetti);

function renderWithMotion(ui: React.ReactElement) {
  return render(
    <LazyMotion features={domAnimation} strict>
      {ui}
    </LazyMotion>
  );
}

describe('WinTheDayCelebration', () => {
  it('renders the banner text when show is true', () => {
    renderWithMotion(<WinTheDayCelebration show={true} />);
    expect(screen.getByText('You Won the Day!')).toBeInTheDocument();
  });

  it('does not render when show is false', () => {
    renderWithMotion(<WinTheDayCelebration show={false} />);
    expect(screen.queryByText('You Won the Day!')).not.toBeInTheDocument();
  });

  it('fires confetti when show becomes true', () => {
    renderWithMotion(<WinTheDayCelebration show={true} />);
    expect(confetti).toHaveBeenCalled();
  });

  it('calls onComplete callback after animation duration', async () => {
    const onComplete = vi.fn();
    renderWithMotion(<WinTheDayCelebration show={true} onComplete={onComplete} />);
    await waitFor(() => {
      expect(onComplete).toHaveBeenCalled();
    }, { timeout: 5000 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd goal-dashboard && npx vitest run src/components/dopamine/__tests__/WinTheDayCelebration.test.tsx`

Expected: FAIL — module `../WinTheDayCelebration` not found.

- [ ] **Step 3: Implement WinTheDayCelebration component**

Create `src/components/dopamine/WinTheDayCelebration.tsx`:

```typescript
'use client';

import { useEffect } from 'react';
import { m, AnimatePresence } from 'framer-motion';
import { Trophy } from 'lucide-react';
import confetti from 'canvas-confetti';

interface WinTheDayCelebrationProps {
  show: boolean;
  onComplete?: () => void;
}

export function WinTheDayCelebration({ show, onComplete }: WinTheDayCelebrationProps) {
  useEffect(() => {
    if (!show) return;

    // Fire a large gold-themed confetti burst (bigger than normal task completion)
    const duration = 2000;
    const end = Date.now() + duration;
    const colors = ['#f59e0b', '#fbbf24', '#fcd34d', '#22c55e', '#4ade80'];

    function frame() {
      confetti({
        particleCount: 4,
        angle: 60,
        spread: 55,
        origin: { x: 0, y: 0.7 },
        colors,
      });
      confetti({
        particleCount: 4,
        angle: 120,
        spread: 55,
        origin: { x: 1, y: 0.7 },
        colors,
      });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    }

    frame();

    // Auto-dismiss after animation completes
    const timer = setTimeout(() => {
      onComplete?.();
    }, 3000);

    return () => clearTimeout(timer);
  }, [show, onComplete]);

  return (
    <AnimatePresence>
      {show && (
        <m.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.5, opacity: 0 }}
          transition={{ type: 'spring', damping: 12 }}
          className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
        >
          <m.div
            initial={{ scale: 0 }}
            animate={{ scale: [0, 1.3, 1] }}
            transition={{ duration: 0.6, times: [0, 0.6, 1] }}
            className="flex flex-col items-center gap-3"
          >
            <m.div
              className="h-28 w-28 rounded-full bg-gradient-to-br from-amber-500/20 via-yellow-400/20 to-green-500/20 flex items-center justify-center"
              animate={{ rotate: [0, 10, -10, 0] }}
              transition={{ duration: 1, repeat: 2 }}
            >
              <Trophy className="h-14 w-14 text-amber-400" strokeWidth={2} />
            </m.div>
            <m.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="text-2xl font-bold text-amber-400 font-display"
            >
              You Won the Day!
            </m.p>
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd goal-dashboard && npx vitest run src/components/dopamine/__tests__/WinTheDayCelebration.test.tsx`

Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/dopamine/WinTheDayCelebration.tsx src/components/dopamine/__tests__/WinTheDayCelebration.test.tsx
git commit -m "feat(dopamine): add Win the Day confetti celebration with trophy banner"
```

---

### Task 9: Dashboard Page — Integrate WinTheDayCard

**Files:**
- Modify: `src/app/(app)/page.tsx` (lines 2-12, 19-26, 54-98)
- Modify: `src/app/(app)/__tests__/DashboardPage.test.tsx`

- [ ] **Step 1: Update the DashboardPage test to verify the card**

In `src/app/(app)/__tests__/DashboardPage.test.tsx`:

**Change 1 — add the WinTheDayCard mock** alongside the other `vi.mock` calls at the top (after line 18):

```typescript
vi.mock('@/components/dashboard/WinTheDayCard', () => ({
  WinTheDayCard: (props: any) => (
    <div data-testid="win-the-day-card">
      {props.task ? props.task.title : 'No WTD'}
    </div>
  ),
}));
```

**Change 2 — add tests** inside the `describe` block:

```typescript
  it('renders WinTheDayCard with the flagged task', async () => {
    const wtdTasks = [
      ...tasks,
      createTask({ id: 'wtd-1', title: 'Win Task', status: 'TODO', priority: 'HIGH', isWinTheDay: true }),
    ];
    renderPage(wtdTasks);

    await waitFor(() => {
      const card = screen.getByTestId('win-the-day-card');
      expect(card).toBeInTheDocument();
      expect(card).toHaveTextContent('Win Task');
    });
  });

  it('renders WinTheDayCard with no task when none flagged', async () => {
    renderPage();

    await waitFor(() => {
      const card = screen.getByTestId('win-the-day-card');
      expect(card).toHaveTextContent('No WTD');
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd goal-dashboard && npx vitest run src/app/(app)/__tests__/DashboardPage.test.tsx`

Expected: FAIL — no element with testId `win-the-day-card` found.

- [ ] **Step 3: Wire WinTheDayCard into the Dashboard page**

In `src/app/(app)/page.tsx`:

**Change 1 — add the import** after the existing imports (after line 11):

```typescript
import { WinTheDayCard } from '@/components/dashboard/WinTheDayCard';
```

**Change 2 — add `winTask` memo** after the existing `stats` useMemo (after line 26):

```typescript
  const winTask = useMemo(
    () => list.find((t: any) => t.isWinTheDay) ?? null,
    [list]
  );
```

**Change 3 — insert the `<WinTheDayCard>` in the JSX**, right before the `{/* Today's tasks */}` comment (before line 72):

```typescript
      {/* Win the Day */}
      <WinTheDayCard task={winTask} />
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd goal-dashboard && npx vitest run src/app/(app)/__tests__/DashboardPage.test.tsx`

Expected: All tests PASS (existing + 2 new).

- [ ] **Step 5: Commit**

```bash
git add src/app/(app)/page.tsx src/app/(app)/__tests__/DashboardPage.test.tsx
git commit -m "feat(dashboard): integrate Win the Day hero card above today's tasks"
```

---

### Task 10: Final Verification

- [ ] **Step 1: Run full test suite**

Run: `cd goal-dashboard && npx vitest run`

Expected: All tests PASS.

- [ ] **Step 2: Run build**

Run: `cd goal-dashboard && npm run build`

Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 3: Run linter**

Run: `cd goal-dashboard && npx next lint`

Expected: No new errors.

- [ ] **Step 4: Manual smoke test**

1. Start the dev server: `cd goal-dashboard && npm run dev`
2. Open the dashboard. Verify the "Win the Day" card appears with the prompt "Flag a task as your Win the Day".
3. Click the star icon on a task. Verify the star fills amber and the dashboard Win card updates to show the flagged task.
4. Click the star icon on a different task for the same day. Verify the first task's star unfills and the new task appears in the Win card.
5. Complete the Win the Day task (click checkbox). Verify the gold confetti celebration fires with the "You Won the Day!" banner.
6. After celebration dismisses, verify the Win card shows "You Won the Day!" in green.
7. Refresh the page. Verify the Win the Day state persists from the database.

- [ ] **Step 5: Final commit (if any lint/type fixes needed)**

```bash
git add -A
git commit -m "chore: fix lint/type issues from Win the Day feature"
```
