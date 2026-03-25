# Dashboard Simplification & Calendar Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Strip the dashboard to essentials, fix calendar arrow rendering, add task duration/scheduling fields, build a client-side auto-scheduling engine, implement smart rearranging on event drag, and add quick status switching chips.

**Architecture:** The plan is ordered by dependency: schema migration first (other features depend on new fields), then dashboard simplification (no dependencies, quick win), calendar CSS fix, TaskEditor + API validation, auto-scheduling engine (pure logic, testable in isolation), CalendarView integration (wires engine to UI), smart rearranging (extends CalendarView), and finally quick status switching (standalone UI feature). Each task is isolated to 1-4 files with its own tests.

**Tech Stack:** Next.js 14 / TypeScript / Prisma / PostgreSQL / FullCalendar 6 / Vitest / SWR / Framer Motion / Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-03-24-dashboard-calendar-fixes-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `prisma/schema.prisma` | Modify | Add `estimatedMinutes`, `preferredTimeStart`, `preferredTimeEnd`, `isPinned`, `isAutoScheduled` to Task model |
| `src/test/fixtures.ts` | Modify | Add new fields to `createTask()` factory |
| `src/app/(app)/page.tsx` | Modify | Remove GoalProgressSummary and WeeklySparkline imports/usage |
| `src/components/dashboard/GoalProgressSummary.tsx` | Delete | Removed widget |
| `src/components/dashboard/WeeklySparkline.tsx` | Delete | Removed widget |
| `src/app/(app)/__tests__/DashboardPage.test.tsx` | Modify | Update assertions for simplified dashboard |
| `src/app/globals.css` | Modify | Add calendar arrow CSS + ghost event CSS + pin overlay CSS |
| `src/components/calendar/__tests__/CalendarView.test.tsx` | Modify | Add tests for arrow wrapper, auto-schedule button, ghost events |
| `src/components/tasks/TaskEditor.tsx` | Modify | Add duration picker presets + preferred time range inputs |
| `src/components/tasks/__tests__/TaskEditor.test.tsx` | Modify | Add tests for duration picker |
| `src/app/api/tasks/route.ts` | Modify | Validate `estimatedMinutes` > 0 on POST, include new fields in create data |
| `src/app/api/tasks/[id]/route.ts` | Modify | Accept new scheduling fields on PATCH; auto-pin on manual drag; carry fields to recurring spawn |
| `src/__tests__/task-api-validation.test.ts` | Create | Unit tests for validation logic |
| `src/components/powerdown/PowerDownRitual.tsx` | Modify | Supply `estimatedMinutes: 30` when creating loose-end REACT tasks |
| `src/app/api/goals/import/route.ts` | Modify | Supply `estimatedMinutes: 60` default in YAML import task creation |
| `src/lib/scheduling-engine.ts` | Create | Client-side `autoSchedule()` + `rearrangeFlexible()` functions |
| `src/__tests__/scheduling-engine.test.ts` | Create | Unit tests for auto-scheduling algorithm + rearranging |
| `src/app/api/tasks/batch-schedule/route.ts` | Create | `POST` endpoint for atomic batch task scheduling |
| `src/__tests__/batch-schedule.test.ts` | Create | Tests for batch-schedule request validation |
| `src/components/calendar/CalendarView.tsx` | Modify | Auto-schedule button, ghost events, confirm/dismiss, smart rearranging, pin context menu |
| `src/components/tasks/StatusChip.tsx` | Create | Clickable status cycling chip component |
| `src/components/tasks/__tests__/StatusChip.test.tsx` | Create | Tests for status chip cycling and right-click context menu |
| `src/components/tasks/TaskCard.tsx` | Modify | Replace inline status text with StatusChip |
| `src/components/tasks/DailyTaskList.tsx` | Modify | Wire quick status change through to TaskCard via optimistic SWR mutate |

---

### Task 1: Prisma Schema Migration — Add Scheduling Fields to Task

**Files:**
- Modify: `prisma/schema.prisma` (Task model, lines 190-220)
- Modify: `src/test/fixtures.ts`

- [ ] **Step 1: Add new fields to Task model**

In `prisma/schema.prisma`, insert 5 new lines after `timeBlockEnd DateTime?` (line 204) and before `startedAt DateTime?` (line 205):

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
  estimatedMinutes    Int              @default(60)
  preferredTimeStart  String?          // "HH:mm" format, e.g. "09:00"
  preferredTimeEnd    String?          // "HH:mm" format, e.g. "12:00"
  isPinned            Boolean          @default(false)
  isAutoScheduled     Boolean          @default(false)
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
}
```

- [ ] **Step 2: Generate and run migration**

```bash
cd goal-dashboard && npx prisma migrate dev --name add-task-scheduling-fields
```

This migration will:
- Add `estimatedMinutes Int DEFAULT 60` (all existing tasks get 60)
- Add `preferredTimeStart String?` (nullable)
- Add `preferredTimeEnd String?` (nullable)
- Add `isPinned Boolean DEFAULT false`
- Add `isAutoScheduled Boolean DEFAULT false`

- [ ] **Step 3: Update test fixtures**

In `src/test/fixtures.ts`, replace the `createTask` function:

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
    estimatedMinutes: 60,
    preferredTimeStart: null,
    preferredTimeEnd: null,
    isPinned: false,
    isAutoScheduled: false,
    goal: null,
    processExecution: null,
    _count: { comments: 0 },
    ...overrides,
  };
}
```

- [ ] **Step 4: Run existing tests to confirm nothing breaks**

```bash
cd goal-dashboard && npx vitest run
```

Expected: All tests PASS (new fields have defaults, so existing code is unaffected).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/ src/test/fixtures.ts
git commit -m "feat(schema): add estimatedMinutes, preferredTime, isPinned, isAutoScheduled to Task model"
```

---

### Task 2: Dashboard Simplification — Remove Clutter Widgets

**Files:**
- Modify: `src/app/(app)/page.tsx`
- Delete: `src/components/dashboard/GoalProgressSummary.tsx`
- Delete: `src/components/dashboard/WeeklySparkline.tsx`
- Modify: `src/app/(app)/__tests__/DashboardPage.test.tsx`

- [ ] **Step 1: Write the failing test**

Add to the `describe('DashboardPage')` block in `src/app/(app)/__tests__/DashboardPage.test.tsx`:

```typescript
  it('does NOT render GoalProgressSummary or WeeklySparkline', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Total Tasks')).toBeInTheDocument();
    });

    // These widgets should no longer exist on the dashboard
    expect(screen.queryByTestId('goal-progress-summary')).not.toBeInTheDocument();
    expect(screen.queryByTestId('weekly-sparkline')).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run test to verify baseline**

```bash
cd goal-dashboard && npx vitest run src/app/(app)/__tests__/DashboardPage.test.tsx
```

- [ ] **Step 3: Remove imports and usage from page.tsx**

In `src/app/(app)/page.tsx`, delete the two import lines (lines 10-11):

```typescript
// DELETE these two lines:
import { GoalProgressSummary } from '@/components/dashboard/GoalProgressSummary';
import { WeeklySparkline } from '@/components/dashboard/WeeklySparkline';
```

Delete the JSX calls and their comments (lines 66-70):

```tsx
      {/* Goal progress summary */}
      <GoalProgressSummary />

      {/* Weekly completion trend */}
      <WeeklySparkline />
```

The resulting `page.tsx` return block should be:

```tsx
    <div>
      {/* Greeting + streak + quick add */}
      <DashboardGreeting onQuickAdd={() => setShowEditor(true)} />

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {statCards.map((card) => (
          <PrismStatCard key={card.label} {...card} />
        ))}
      </div>

      {/* Today's tasks */}
      <div className="mb-4">
        <h2 className="font-display text-lg font-semibold text-white mb-4">Today&apos;s Tasks</h2>
        <DailyTaskList
          date={today}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onStatusChange={handleStatusChange}
        />
      </div>

      {showEditor && (
        <TaskEditor
          onSave={refresh}
          onClose={() => setShowEditor(false)}
        />
      )}

      {editingTask && (
        <TaskEditor
          task={editingTask}
          onSave={refresh}
          onClose={() => setEditingTask(null)}
        />
      )}
    </div>
```

- [ ] **Step 4: Delete the component files**

```bash
cd goal-dashboard && rm src/components/dashboard/GoalProgressSummary.tsx src/components/dashboard/WeeklySparkline.tsx
```

- [ ] **Step 5: Run tests**

```bash
cd goal-dashboard && npx vitest run src/app/(app)/__tests__/DashboardPage.test.tsx
```

Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/(app)/page.tsx src/app/(app)/__tests__/DashboardPage.test.tsx
git rm src/components/dashboard/GoalProgressSummary.tsx src/components/dashboard/WeeklySparkline.tsx
git commit -m "feat(dashboard): remove GoalProgressSummary and WeeklySparkline widgets"
```

---

### Task 3: Calendar Arrow Icon Fix

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/components/calendar/__tests__/CalendarView.test.tsx`

- [ ] **Step 1: Write the failing test**

Add to `src/components/calendar/__tests__/CalendarView.test.tsx`:

```typescript
  it('calendar is wrapped in fc-dark-theme class for CSS arrow rules', () => {
    render(<CalendarView />);
    const wrapper = screen.getByTestId('fullcalendar').closest('.fc-dark-theme');
    expect(wrapper).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run test to verify baseline**

```bash
cd goal-dashboard && npx vitest run src/components/calendar/__tests__/CalendarView.test.tsx
```

- [ ] **Step 3: Add CSS rules for arrow buttons**

In `src/app/globals.css`, add the following rules after the existing `.fc-dark-theme .fc .fc-timegrid-slot` block (after line 113):

```css
/* Fix broken icon font in FullCalendar prev/next buttons */
.fc-dark-theme .fc-prev-button .fc-icon,
.fc-dark-theme .fc-next-button .fc-icon {
  font-size: 0;
}

.fc-dark-theme .fc-prev-button .fc-icon::after {
  content: '\2039';
  font-size: 1.5rem;
  line-height: 1;
}

.fc-dark-theme .fc-next-button .fc-icon::after {
  content: '\203A';
  font-size: 1.5rem;
  line-height: 1;
}
```

- [ ] **Step 4: Run tests**

```bash
cd goal-dashboard && npx vitest run src/components/calendar/__tests__/CalendarView.test.tsx
```

Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/globals.css src/components/calendar/__tests__/CalendarView.test.tsx
git commit -m "fix(calendar): render chevron arrows via CSS content for prev/next buttons"
```

---

### Task 4: Task API Validation — Require estimatedMinutes on Create + Accept New Fields on Update

**Files:**
- Create: `src/__tests__/task-api-validation.test.ts`
- Modify: `src/app/api/tasks/route.ts`
- Modify: `src/app/api/tasks/[id]/route.ts`
- Modify: `src/components/powerdown/PowerDownRitual.tsx`
- Modify: `src/app/api/goals/import/route.ts`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/task-api-validation.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';

describe('Task API validation rules', () => {
  it('estimatedMinutes must be a positive integer', () => {
    const validate = (val: any): boolean => {
      return typeof val === 'number' && Number.isInteger(val) && val > 0;
    };

    expect(validate(60)).toBe(true);
    expect(validate(15)).toBe(true);
    expect(validate(0)).toBe(false);
    expect(validate(-10)).toBe(false);
    expect(validate(null)).toBe(false);
    expect(validate(undefined)).toBe(false);
    expect(validate('60')).toBe(false);
  });

  it('preferredTimeStart/End must match HH:mm format when provided', () => {
    const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;
    const isValidTime = (val: any): boolean => {
      if (val === null || val === undefined) return true;
      if (typeof val !== 'string') return false;
      return timeRegex.test(val);
    };

    expect(isValidTime('09:00')).toBe(true);
    expect(isValidTime('23:59')).toBe(true);
    expect(isValidTime('00:00')).toBe(true);
    expect(isValidTime(null)).toBe(true);
    expect(isValidTime(undefined)).toBe(true);
    expect(isValidTime('25:00')).toBe(false);
    expect(isValidTime('9:00')).toBe(false);
    expect(isValidTime('noon')).toBe(false);
    expect(isValidTime('')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test**

```bash
cd goal-dashboard && npx vitest run src/__tests__/task-api-validation.test.ts
```

Expected: PASS (pure logic).

- [ ] **Step 3: Update POST /api/tasks — add validation and new fields**

In `src/app/api/tasks/route.ts`, update the destructuring on line 87 to include new fields:

```typescript
  const { taskType, title, description, priority, dueDate, goalId, recurrenceRule, timeBlockStart, timeBlockEnd, deliverable, estimatedMinutes, preferredTimeStart, preferredTimeEnd } = body;
```

Add validation after the existing `if (!taskType || !title)` check (after line 91):

```typescript
  // Validate estimatedMinutes: required, positive integer
  if (typeof estimatedMinutes !== 'number' || !Number.isInteger(estimatedMinutes) || estimatedMinutes <= 0) {
    return Response.json({ error: 'estimatedMinutes is required and must be a positive integer' }, { status: 400 });
  }

  // Validate preferredTimeStart/End format when provided
  const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (preferredTimeStart && !timeRegex.test(preferredTimeStart)) {
    return Response.json({ error: 'preferredTimeStart must be in HH:mm format' }, { status: 400 });
  }
  if (preferredTimeEnd && !timeRegex.test(preferredTimeEnd)) {
    return Response.json({ error: 'preferredTimeEnd must be in HH:mm format' }, { status: 400 });
  }
```

Update the `prisma.task.create` data block (lines 120-133) to include the new fields:

```typescript
  const task = await prisma.task.create({
    data: {
      ownerId: auth.userId,
      taskType,
      title,
      description: description ?? null,
      priority: priority ?? 'MEDIUM',
      dueDate: dueDate ? new Date(dueDate) : null,
      goalId: goalId ?? null,
      recurrenceRule: recurrenceRule ?? null,
      timeBlockStart: timeBlockStart ? new Date(timeBlockStart) : null,
      timeBlockEnd: timeBlockEnd ? new Date(timeBlockEnd) : null,
      deliverable: deliverable ?? null,
      estimatedMinutes,
      preferredTimeStart: preferredTimeStart ?? null,
      preferredTimeEnd: preferredTimeEnd ?? null,
    },
    include: {
      goal: { select: { id: true, title: true, level: true } },
    },
  });
```

- [ ] **Step 4: Update PATCH /api/tasks/[id] to accept new fields**

In `src/app/api/tasks/[id]/route.ts`, update the destructuring on line 59:

```typescript
  const { title, description, status, priority, dueDate, timeBlockStart, timeBlockEnd, deliverable, estimatedMinutes, preferredTimeStart, preferredTimeEnd, isPinned, isAutoScheduled } = body;
```

Add new field handling after the existing `if (deliverable !== undefined)` line (after line 68):

```typescript
  if (estimatedMinutes !== undefined) {
    if (typeof estimatedMinutes !== 'number' || !Number.isInteger(estimatedMinutes) || estimatedMinutes <= 0) {
      return Response.json({ error: 'estimatedMinutes must be a positive integer' }, { status: 400 });
    }
    data.estimatedMinutes = estimatedMinutes;
  }
  if (preferredTimeStart !== undefined) data.preferredTimeStart = preferredTimeStart;
  if (preferredTimeEnd !== undefined) data.preferredTimeEnd = preferredTimeEnd;
  if (isPinned !== undefined) data.isPinned = isPinned;
  if (isAutoScheduled !== undefined) data.isAutoScheduled = isAutoScheduled;

  // Manual time-block assignment implies pinning (unless caller explicitly sets isPinned)
  if ((timeBlockStart !== undefined || timeBlockEnd !== undefined) && isPinned === undefined) {
    data.isPinned = true;
  }
```

Update the recurring task `prisma.task.create` call (lines 139-150) to carry forward scheduling fields:

```typescript
        await prisma.task.create({
          data: {
            ownerId: task.ownerId,
            taskType: task.taskType,
            title: task.title,
            description: task.description,
            priority: task.priority,
            dueDate: nextDate,
            goalId: task.goalId,
            recurrenceRule: task.recurrenceRule,
            estimatedMinutes: task.estimatedMinutes,
            preferredTimeStart: task.preferredTimeStart,
            preferredTimeEnd: task.preferredTimeEnd,
          },
        });
```

- [ ] **Step 5: Update PowerDownRitual loose-end task creation**

In `src/components/powerdown/PowerDownRitual.tsx`, update the `addLooseEnd` function (lines 80-91) to include `estimatedMinutes: 30`:

```typescript
  const addLooseEnd = async () => {
    if (!newTaskTitle.trim()) return;
    await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        taskType: 'REACT',
        title: newTaskTitle,
        dueDate: new Date(Date.now() + 86400000).toISOString().split('T')[0],
        estimatedMinutes: 30,
      }),
    });
    setNewTaskTitle('');
    fetchTodayTasks();
  };
```

- [ ] **Step 6: Update YAML import task creation**

In `src/app/api/goals/import/route.ts`, update the `prisma.task.create` call (lines 226-238) to include `estimatedMinutes`:

```typescript
          await prisma.task.create({
            data: {
              ownerId,
              goalId: created.id,
              taskType: 'GOAL_STACK',
              title: task.title,
              description: task.description ?? null,
              status: (task.status as any) ?? 'TODO',
              priority: (task.priority as any) ?? 'MEDIUM',
              dueDate: task.dueDate ? new Date(task.dueDate) : null,
              completedAt: task.status === 'DONE' ? new Date() : null,
              estimatedMinutes: task.estimatedMinutes ?? 60,
            },
          });
```

- [ ] **Step 7: Run all tests**

```bash
cd goal-dashboard && npx vitest run
```

Expected: All PASS.

- [ ] **Step 8: Commit**

```bash
git add src/app/api/tasks/route.ts src/app/api/tasks/[id]/route.ts src/components/powerdown/PowerDownRitual.tsx src/app/api/goals/import/route.ts src/__tests__/task-api-validation.test.ts
git commit -m "feat(tasks): require estimatedMinutes on create, validate scheduling fields, update all task creation paths"
```

---

### Task 5: TaskEditor UI — Duration Picker + Preferred Time Inputs

**Files:**
- Modify: `src/components/tasks/TaskEditor.tsx`
- Modify: `src/components/tasks/__tests__/TaskEditor.test.tsx`

- [ ] **Step 1: Write the failing test**

Add to `src/components/tasks/__tests__/TaskEditor.test.tsx`:

```typescript
import { renderWithProviders, userEvent } from '@/test/utils';

describe('TaskEditor — duration picker', () => {
  it('renders duration preset buttons', () => {
    renderWithProviders(<TaskEditor onSave={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText('15m')).toBeInTheDocument();
    expect(screen.getByText('30m')).toBeInTheDocument();
    expect(screen.getByText('1h')).toBeInTheDocument();
    expect(screen.getByText('2h')).toBeInTheDocument();
  });

  it('defaults to 60 minutes (1h selected)', () => {
    renderWithProviders(<TaskEditor onSave={vi.fn()} onClose={vi.fn()} />);
    const oneHourBtn = screen.getByText('1h');
    expect(oneHourBtn.className).toContain('bg-indigo-600');
  });

  it('shows preferred time range inputs', () => {
    renderWithProviders(<TaskEditor onSave={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByLabelText(/preferred start/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/preferred end/i)).toBeInTheDocument();
  });

  it('clicking a duration preset updates the selected value', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TaskEditor onSave={vi.fn()} onClose={vi.fn()} />);

    await user.click(screen.getByText('30m'));
    expect(screen.getByText('30m').className).toContain('bg-indigo-600');
    expect(screen.getByText('1h').className).not.toContain('bg-indigo-600');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd goal-dashboard && npx vitest run src/components/tasks/__tests__/TaskEditor.test.tsx
```

Expected: FAIL — no duration preset buttons found.

- [ ] **Step 3: Implement duration picker and time preference UI**

In `src/components/tasks/TaskEditor.tsx`, add state after the existing state declarations (after line 31, the `deliverable` state):

```typescript
  const [estimatedMinutes, setEstimatedMinutes] = useState(task?.estimatedMinutes ?? 60);
  const [preferredTimeStart, setPreferredTimeStart] = useState(task?.preferredTimeStart ?? '');
  const [preferredTimeEnd, setPreferredTimeEnd] = useState(task?.preferredTimeEnd ?? '');
```

Add the duration presets constant after the state declarations:

```typescript
  const DURATION_PRESETS = [
    { label: '15m', value: 15 },
    { label: '30m', value: 30 },
    { label: '45m', value: 45 },
    { label: '1h', value: 60 },
    { label: '1.5h', value: 90 },
    { label: '2h', value: 120 },
    { label: '3h', value: 180 },
    { label: '4h', value: 240 },
  ];
```

In `handleSubmit`, after `const body: any = { title, description, priority, deliverable };` (line 64), add:

```typescript
      body.estimatedMinutes = estimatedMinutes;
      if (preferredTimeStart) body.preferredTimeStart = preferredTimeStart;
      if (preferredTimeEnd) body.preferredTimeEnd = preferredTimeEnd;
```

Add the UI in the JSX. Insert after the Priority/Due Date grid closing `</div>` (line 213):

```tsx
            {/* Duration picker */}
            <div>
              <label className="block text-sm text-gray-400 mb-1">Estimated Duration *</label>
              <div className="flex flex-wrap gap-2">
                {DURATION_PRESETS.map(({ label, value }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setEstimatedMinutes(value)}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                      estimatedMinutes === value
                        ? 'bg-indigo-600 text-white'
                        : 'text-gray-400 border border-gray-700 hover:border-gray-600'
                    }`}
                  >
                    {label}
                  </button>
                ))}
                <input
                  type="number"
                  min="1"
                  value={DURATION_PRESETS.some(p => p.value === estimatedMinutes) ? '' : estimatedMinutes}
                  onChange={(e) => setEstimatedMinutes(parseInt(e.target.value) || 60)}
                  placeholder="Custom min"
                  className="w-24 rounded-lg border border-gray-700 bg-gray-800 px-2 py-1.5 text-sm text-white focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Preferred time range (optional) */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="preferredTimeStart" className="block text-sm text-gray-400 mb-1">Preferred Start</label>
                <input
                  id="preferredTimeStart"
                  type="time"
                  value={preferredTimeStart}
                  onChange={(e) => setPreferredTimeStart(e.target.value)}
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="preferredTimeEnd" className="block text-sm text-gray-400 mb-1">Preferred End</label>
                <input
                  id="preferredTimeEnd"
                  type="time"
                  value={preferredTimeEnd}
                  onChange={(e) => setPreferredTimeEnd(e.target.value)}
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>
```

- [ ] **Step 4: Run tests**

```bash
cd goal-dashboard && npx vitest run src/components/tasks/__tests__/TaskEditor.test.tsx
```

Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/tasks/TaskEditor.tsx src/components/tasks/__tests__/TaskEditor.test.tsx
git commit -m "feat(tasks): add duration picker with presets and preferred time range to TaskEditor"
```

---

### Task 6: Auto-Scheduling Engine — Pure Logic

**Files:**
- Create: `src/lib/scheduling-engine.ts`
- Create: `src/__tests__/scheduling-engine.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/scheduling-engine.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { autoSchedule, type SchedulableTask, type CalendarEvent, type ProposedSlot } from '@/lib/scheduling-engine';

function makeTask(overrides: Partial<SchedulableTask> = {}): SchedulableTask {
  return {
    id: 'task-1',
    title: 'Test Task',
    priority: 'MEDIUM',
    estimatedMinutes: 60,
    dueDate: null,
    preferredTimeStart: null,
    preferredTimeEnd: null,
    ...overrides,
  };
}

function makeEvent(start: string, end: string): CalendarEvent {
  return { start: new Date(start), end: new Date(end) };
}

const workingHours = { start: '09:00', end: '17:00' };

describe('autoSchedule', () => {
  it('returns empty array when no tasks', () => {
    const result = autoSchedule([], [], workingHours);
    expect(result).toEqual([]);
  });

  it('schedules a single task into the first available slot', () => {
    const tasks = [makeTask({ id: 'task-1', estimatedMinutes: 60 })];
    const result = autoSchedule(tasks, [], workingHours);

    expect(result).toHaveLength(1);
    expect(result[0].taskId).toBe('task-1');
    expect(result[0].start.getHours()).toBe(9);
    expect(result[0].start.getMinutes()).toBe(0);
    expect(result[0].end.getHours()).toBe(10);
    expect(result[0].end.getMinutes()).toBe(0);
  });

  it('skips time occupied by existing events', () => {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const existingEvents = [
      makeEvent(`${todayStr}T09:00:00`, `${todayStr}T10:00:00`),
    ];
    const tasks = [makeTask({ id: 'task-1', estimatedMinutes: 60 })];
    const result = autoSchedule(tasks, existingEvents, workingHours);

    expect(result).toHaveLength(1);
    expect(result[0].start.getHours()).toBe(10);
  });

  it('sorts by priority DESC then dueDate ASC', () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);

    const tasks = [
      makeTask({ id: 'low-later', priority: 'LOW', dueDate: nextWeek }),
      makeTask({ id: 'urgent-soon', priority: 'URGENT', dueDate: tomorrow }),
      makeTask({ id: 'high-soon', priority: 'HIGH', dueDate: tomorrow }),
    ];

    const result = autoSchedule(tasks, [], workingHours);
    expect(result.map(s => s.taskId)).toEqual(['urgent-soon', 'high-soon', 'low-later']);
  });

  it('respects preferred time range', () => {
    const tasks = [makeTask({
      id: 'afternoon-task',
      estimatedMinutes: 60,
      preferredTimeStart: '14:00',
      preferredTimeEnd: '16:00',
    })];

    const result = autoSchedule(tasks, [], workingHours);
    expect(result).toHaveLength(1);
    expect(result[0].start.getHours()).toBe(14);
  });

  it('falls back to working hours when preferred range has no space', () => {
    const today = new Date().toISOString().split('T')[0];
    const events = [
      makeEvent(`${today}T14:00:00`, `${today}T16:00:00`),
    ];
    const tasks = [makeTask({
      id: 'task-1',
      estimatedMinutes: 60,
      preferredTimeStart: '14:00',
      preferredTimeEnd: '16:00',
    })];

    const result = autoSchedule(tasks, events, workingHours);
    expect(result).toHaveLength(1);
    expect(result[0].start.getHours()).toBe(9);
  });

  it('schedules multiple tasks sequentially without overlap', () => {
    const tasks = [
      makeTask({ id: 'task-1', estimatedMinutes: 120 }),
      makeTask({ id: 'task-2', estimatedMinutes: 60 }),
    ];

    const result = autoSchedule(tasks, [], workingHours);
    expect(result).toHaveLength(2);
    expect(result[1].start.getTime()).toBeGreaterThanOrEqual(result[0].end.getTime());
  });

  it('returns nothing for tasks that cannot fit in any day of horizon', () => {
    const today = new Date().toISOString().split('T')[0];
    const events = [
      makeEvent(`${today}T09:00:00`, `${today}T17:00:00`),
    ];
    const todayDate = new Date();
    todayDate.setHours(23, 59, 59, 999);
    const tasks = [makeTask({
      id: 'no-fit',
      estimatedMinutes: 60,
      dueDate: todayDate,
    })];

    const result = autoSchedule(tasks, events, workingHours);
    expect(result).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd goal-dashboard && npx vitest run src/__tests__/scheduling-engine.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the scheduling engine**

Create `src/lib/scheduling-engine.ts`:

```typescript
export interface SchedulableTask {
  id: string;
  title: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  estimatedMinutes: number;
  dueDate: Date | null;
  preferredTimeStart: string | null; // "HH:mm"
  preferredTimeEnd: string | null;   // "HH:mm"
}

export interface CalendarEvent {
  start: Date;
  end: Date;
}

export interface ProposedSlot {
  taskId: string;
  start: Date;
  end: Date;
}

interface WorkingHours {
  start: string; // "HH:mm"
  end: string;   // "HH:mm"
}

const PRIORITY_ORDER: Record<string, number> = {
  URGENT: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

function parseTime(time: string): { hours: number; minutes: number } {
  const [h, m] = time.split(':').map(Number);
  return { hours: h, minutes: m };
}

function setTime(date: Date, hours: number, minutes: number): Date {
  const d = new Date(date);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

function getEndOfWeek(from: Date): Date {
  const d = new Date(from);
  const day = d.getDay(); // 0 = Sunday
  const daysUntilSunday = day === 0 ? 0 : 7 - day;
  d.setDate(d.getDate() + daysUntilSunday);
  d.setHours(23, 59, 59, 999);
  return d;
}

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && aEnd > bStart;
}

/**
 * Find the first available slot on a given day within a time range.
 * Returns null if no slot fits the required duration.
 */
function findSlotOnDay(
  day: Date,
  durationMs: number,
  occupiedSlots: CalendarEvent[],
  rangeStart: { hours: number; minutes: number },
  rangeEnd: { hours: number; minutes: number },
): { start: Date; end: Date } | null {
  const dayStart = setTime(day, rangeStart.hours, rangeStart.minutes);
  const dayEnd = setTime(day, rangeEnd.hours, rangeEnd.minutes);

  const dayOccupied = occupiedSlots
    .filter((e) => overlaps(dayStart, dayEnd, e.start, e.end))
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  let cursor = dayStart.getTime();

  for (const event of dayOccupied) {
    const eventStart = event.start.getTime();
    const eventEnd = event.end.getTime();

    if (cursor + durationMs <= eventStart && cursor + durationMs <= dayEnd.getTime()) {
      return { start: new Date(cursor), end: new Date(cursor + durationMs) };
    }

    if (eventEnd > cursor) {
      cursor = eventEnd;
    }
  }

  if (cursor + durationMs <= dayEnd.getTime()) {
    return { start: new Date(cursor), end: new Date(cursor + durationMs) };
  }

  return null;
}

/**
 * Auto-schedule unscheduled tasks into optimal time slots.
 *
 * Algorithm:
 * 1. Sort tasks: priority DESC, dueDate ASC (nulls last)
 * 2. For each task, scan days in its horizon for an open slot
 * 3. Preferred time range is tried first, then full working hours
 * 4. Each placed task becomes an occupied slot for subsequent tasks
 */
export function autoSchedule(
  unscheduledTasks: SchedulableTask[],
  existingEvents: CalendarEvent[],
  workingHours: WorkingHours,
): ProposedSlot[] {
  if (unscheduledTasks.length === 0) return [];

  const whStart = parseTime(workingHours.start);
  const whEnd = parseTime(workingHours.end);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const sorted = [...unscheduledTasks].sort((a, b) => {
    const prioA = PRIORITY_ORDER[a.priority] ?? 2;
    const prioB = PRIORITY_ORDER[b.priority] ?? 2;
    if (prioA !== prioB) return prioB - prioA;

    if (a.dueDate && b.dueDate) return a.dueDate.getTime() - b.dueDate.getTime();
    if (a.dueDate && !b.dueDate) return -1;
    if (!a.dueDate && b.dueDate) return 1;
    return 0;
  });

  const occupied: CalendarEvent[] = [...existingEvents];
  const proposals: ProposedSlot[] = [];

  for (const task of sorted) {
    const durationMs = task.estimatedMinutes * 60 * 1000;

    let horizonEnd: Date;
    if (task.dueDate) {
      horizonEnd = new Date(task.dueDate);
      horizonEnd.setHours(23, 59, 59, 999);
    } else {
      horizonEnd = getEndOfWeek(today);
    }

    let placed = false;
    const cursor = new Date(today);

    while (cursor <= horizonEnd && !placed) {
      // Try preferred time range first
      if (task.preferredTimeStart && task.preferredTimeEnd) {
        const prefStart = parseTime(task.preferredTimeStart);
        const prefEnd = parseTime(task.preferredTimeEnd);
        const slot = findSlotOnDay(cursor, durationMs, occupied, prefStart, prefEnd);
        if (slot) {
          proposals.push({ taskId: task.id, start: slot.start, end: slot.end });
          occupied.push({ start: slot.start, end: slot.end });
          placed = true;
          break;
        }
      }

      // Fall back to full working hours
      const slot = findSlotOnDay(cursor, durationMs, occupied, whStart, whEnd);
      if (slot) {
        proposals.push({ taskId: task.id, start: slot.start, end: slot.end });
        occupied.push({ start: slot.start, end: slot.end });
        placed = true;
        break;
      }

      cursor.setDate(cursor.getDate() + 1);
    }
  }

  return proposals;
}

/**
 * Re-schedule flexible (unpinned) tasks around fixed events.
 * Used after a manual event drag to resolve overlaps.
 */
export function rearrangeFlexible(
  fixedEvents: CalendarEvent[],
  flexibleTasks: SchedulableTask[],
  _currentSlots: ProposedSlot[],
  workingHours: WorkingHours,
): ProposedSlot[] {
  return autoSchedule(flexibleTasks, fixedEvents, workingHours);
}
```

- [ ] **Step 4: Run tests**

```bash
cd goal-dashboard && npx vitest run src/__tests__/scheduling-engine.test.ts
```

Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/scheduling-engine.ts src/__tests__/scheduling-engine.test.ts
git commit -m "feat(scheduling): add client-side auto-scheduling engine with priority/time-preference logic"
```

---

### Task 7: Batch Schedule API Endpoint

**Files:**
- Create: `src/app/api/tasks/batch-schedule/route.ts`
- Create: `src/__tests__/batch-schedule.test.ts`

- [ ] **Step 1: Write the test**

Create `src/__tests__/batch-schedule.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';

describe('batch-schedule request validation', () => {
  it('rejects empty updates array', () => {
    const body = { updates: [] };
    expect(body.updates.length).toBe(0);
  });

  it('validates each update has required fields', () => {
    const isValid = (update: any): boolean => {
      return (
        typeof update.id === 'string' &&
        typeof update.timeBlockStart === 'string' &&
        typeof update.timeBlockEnd === 'string' &&
        typeof update.isAutoScheduled === 'boolean'
      );
    };

    expect(isValid({
      id: 'task-1',
      timeBlockStart: '2026-03-24T09:00:00Z',
      timeBlockEnd: '2026-03-24T10:00:00Z',
      isAutoScheduled: true,
    })).toBe(true);

    expect(isValid({ id: 'task-1' })).toBe(false);
    expect(isValid({ id: 123, timeBlockStart: 'x', timeBlockEnd: 'y', isAutoScheduled: true })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test**

```bash
cd goal-dashboard && npx vitest run src/__tests__/batch-schedule.test.ts
```

Expected: PASS (pure validation logic).

- [ ] **Step 3: Implement the batch schedule endpoint**

Create `src/app/api/tasks/batch-schedule/route.ts`:

```typescript
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';

interface BatchUpdate {
  id: string;
  timeBlockStart: string;
  timeBlockEnd: string;
  isAutoScheduled: boolean;
  isPinned?: boolean;
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const body = await request.json();
  const { updates } = body;

  if (!Array.isArray(updates) || updates.length === 0) {
    return Response.json(
      { error: 'updates array is required and must not be empty' },
      { status: 400 }
    );
  }

  // Validate each update
  for (const update of updates as BatchUpdate[]) {
    if (
      typeof update.id !== 'string' ||
      typeof update.timeBlockStart !== 'string' ||
      typeof update.timeBlockEnd !== 'string' ||
      typeof update.isAutoScheduled !== 'boolean'
    ) {
      return Response.json(
        { error: `Invalid update for task ${update.id}: id, timeBlockStart, timeBlockEnd, and isAutoScheduled are required` },
        { status: 400 }
      );
    }
  }

  const taskIds = (updates as BatchUpdate[]).map((u) => u.id);

  // Verify ownership of all tasks in a single query
  const tasks = await prisma.task.findMany({
    where: { id: { in: taskIds } },
    select: { id: true, ownerId: true },
  });

  if (tasks.length !== taskIds.length) {
    const foundIds = new Set(tasks.map((t) => t.id));
    const missing = taskIds.filter((id) => !foundIds.has(id));
    return Response.json(
      { error: `Tasks not found: ${missing.join(', ')}` },
      { status: 400 }
    );
  }

  if (!auth.session.user.isAdmin) {
    const unauthorized = tasks.filter((t) => t.ownerId !== auth.userId);
    if (unauthorized.length > 0) {
      return Response.json(
        { error: 'Forbidden: you do not own all specified tasks' },
        { status: 403 }
      );
    }
  }

  // Atomic batch update via transaction
  const result = await prisma.$transaction(
    (updates as BatchUpdate[]).map((update) =>
      prisma.task.update({
        where: { id: update.id },
        data: {
          timeBlockStart: new Date(update.timeBlockStart),
          timeBlockEnd: new Date(update.timeBlockEnd),
          isAutoScheduled: update.isAutoScheduled,
          isPinned: update.isPinned ?? false,
        },
      })
    )
  );

  return Response.json({ updated: result.length });
}
```

- [ ] **Step 4: Run all tests**

```bash
cd goal-dashboard && npx vitest run
```

Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/tasks/batch-schedule/route.ts src/__tests__/batch-schedule.test.ts
git commit -m "feat(api): add POST /api/tasks/batch-schedule for atomic batch scheduling"
```

---

### Task 8: CalendarView — Auto-Schedule Button + Ghost Events

**Files:**
- Modify: `src/components/calendar/CalendarView.tsx`
- Modify: `src/components/calendar/__tests__/CalendarView.test.tsx`
- Modify: `src/app/globals.css`

- [ ] **Step 1: Write the failing test**

Add to `src/components/calendar/__tests__/CalendarView.test.tsx`:

```typescript
  it('renders auto-schedule button', () => {
    render(<CalendarView />);
    expect(screen.getByText('Auto-schedule')).toBeInTheDocument();
  });

  it('shows confirm and dismiss buttons after auto-schedule click', async () => {
    const user = userEvent.setup();
    render(<CalendarView />);

    await user.click(screen.getByText('Auto-schedule'));

    expect(screen.getByText('Confirm All')).toBeInTheDocument();
    expect(screen.getByText('Dismiss')).toBeInTheDocument();
  });

  it('dismiss button hides confirm/dismiss and restores auto-schedule button', async () => {
    const user = userEvent.setup();
    render(<CalendarView />);

    await user.click(screen.getByText('Auto-schedule'));
    await user.click(screen.getByText('Dismiss'));

    expect(screen.queryByText('Confirm All')).not.toBeInTheDocument();
    expect(screen.getByText('Auto-schedule')).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd goal-dashboard && npx vitest run src/components/calendar/__tests__/CalendarView.test.tsx
```

Expected: FAIL — no "Auto-schedule" button found.

- [ ] **Step 3: Implement auto-schedule UI in CalendarView**

In `src/components/calendar/CalendarView.tsx`, add imports at the top:

```typescript
import { autoSchedule, rearrangeFlexible, type ProposedSlot, type SchedulableTask, type CalendarEvent as ScheduleEvent } from '@/lib/scheduling-engine';
import useSWR from 'swr';
```

Add state for ghost events after existing state (after line 25):

```typescript
  const [ghostSlots, setGhostSlots] = useState<ProposedSlot[]>([]);
  const [showGhosts, setShowGhosts] = useState(false);
```

Add SWR hook for unscheduled tasks:

```typescript
  const { data: unscheduledData } = useSWR<any[]>(
    '/api/tasks?includeUnscheduled=true&status=TODO'
  );
  const unscheduledTasks: SchedulableTask[] = (unscheduledData ?? [])
    .filter((t: any) => !t.timeBlockStart)
    .map((t: any) => ({
      id: t.id,
      title: t.title,
      priority: t.priority,
      estimatedMinutes: t.estimatedMinutes ?? 60,
      dueDate: t.dueDate ? new Date(t.dueDate) : null,
      preferredTimeStart: t.preferredTimeStart ?? null,
      preferredTimeEnd: t.preferredTimeEnd ?? null,
    }));
```

Add handlers:

```typescript
  const handleAutoSchedule = () => {
    const existingSlots: ScheduleEvent[] = events
      .filter((e: any) => e.start && e.end)
      .map((e: any) => ({ start: new Date(e.start), end: new Date(e.end) }));

    const proposals = autoSchedule(
      unscheduledTasks,
      existingSlots,
      { start: '06:00', end: '22:00' }
    );

    setGhostSlots(proposals);
    setShowGhosts(true);
  };

  const handleConfirmAll = async () => {
    if (ghostSlots.length === 0) return;

    await fetch('/api/tasks/batch-schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        updates: ghostSlots.map((slot) => ({
          id: slot.taskId,
          timeBlockStart: slot.start.toISOString(),
          timeBlockEnd: slot.end.toISOString(),
          isAutoScheduled: true,
          isPinned: false,
        })),
      }),
    });

    setGhostSlots([]);
    setShowGhosts(false);

    if (calendarRef.current) {
      const api = calendarRef.current.getApi();
      const { activeStart, activeEnd } = api.view;
      fetchEvents(activeStart.toISOString(), activeEnd.toISOString());
    }
  };

  const handleDismissGhosts = () => {
    setGhostSlots([]);
    setShowGhosts(false);
  };
```

Build merged events list with ghost events:

```typescript
  const ghostEvents = showGhosts
    ? ghostSlots.map((slot) => {
        const matchingTask = (unscheduledData ?? []).find((t: any) => t.id === slot.taskId);
        return {
          id: `ghost-${slot.taskId}`,
          title: matchingTask?.title ?? 'Scheduled Task',
          start: slot.start.toISOString(),
          end: slot.end.toISOString(),
          source: 'tasks',
          backgroundColor: 'rgba(99, 102, 241, 0.3)',
          borderColor: '#6366f1',
          classNames: ['ghost-event'],
          extendedProps: { isGhost: true, taskId: slot.taskId },
        };
      })
    : [];
```

Update the `filteredEvents` computed value (replace line 94):

```typescript
  const filteredEvents = [
    ...events.filter((e: any) => activeFilters.has(e.source)),
    ...ghostEvents,
  ];
```

Add auto-schedule controls to the JSX. In the filter toggles bar, after the `SOURCE_FILTERS.map` closing `</div>` (inside the flex container), add:

```tsx
        {/* Auto-schedule controls */}
        <div className="ml-auto flex items-center gap-2">
          {showGhosts ? (
            <>
              <button
                onClick={handleConfirmAll}
                className="rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-500 transition-colors"
              >
                Confirm All
              </button>
              <button
                onClick={handleDismissGhosts}
                className="rounded-lg border border-gray-700 px-3 py-1.5 text-sm font-medium text-gray-400 hover:text-white hover:border-gray-600 transition-colors"
              >
                Dismiss
              </button>
            </>
          ) : (
            <button
              onClick={handleAutoSchedule}
              disabled={unscheduledTasks.length === 0}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
            >
              Auto-schedule
            </button>
          )}
        </div>
```

Add ghost event CSS to `src/app/globals.css` (after the calendar arrow rules):

```css
/* Ghost events for auto-schedule preview */
.fc-dark-theme .ghost-event {
  border-style: dashed !important;
  opacity: 0.7;
}
```

- [ ] **Step 4: Run tests**

```bash
cd goal-dashboard && npx vitest run src/components/calendar/__tests__/CalendarView.test.tsx
```

Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/calendar/CalendarView.tsx src/components/calendar/__tests__/CalendarView.test.tsx src/app/globals.css
git commit -m "feat(calendar): add auto-schedule button with ghost event preview and batch confirm"
```

---

### Task 9: Smart Rearranging on Event Drop

**Files:**
- Modify: `src/components/calendar/CalendarView.tsx`
- Modify: `src/__tests__/scheduling-engine.test.ts`

- [ ] **Step 1: Write the failing test for rearrangeFlexible**

Add to `src/__tests__/scheduling-engine.test.ts`:

```typescript
import { rearrangeFlexible } from '@/lib/scheduling-engine';

describe('rearrangeFlexible', () => {
  it('reschedules flexible tasks that overlap with fixed events', () => {
    const fixedEvents = [
      makeEvent('2026-03-24T10:00:00', '2026-03-24T11:00:00'),
    ];
    const flexibleTasks = [
      makeTask({ id: 'flex-1', estimatedMinutes: 60 }),
    ];
    const currentSlots = [
      { taskId: 'flex-1', start: new Date('2026-03-24T10:00:00'), end: new Date('2026-03-24T11:00:00') },
    ];

    const result = rearrangeFlexible(fixedEvents, flexibleTasks, currentSlots, { start: '09:00', end: '17:00' });
    expect(result).toHaveLength(1);
    expect(result[0].taskId).toBe('flex-1');
    // Should NOT overlap with the fixed event at 10:00-11:00
    expect(result[0].start.getHours()).toBe(9); // placed before the fixed event
  });

  it('handles multiple flexible tasks around fixed events', () => {
    const fixedEvents = [
      makeEvent('2026-03-24T09:00:00', '2026-03-24T10:00:00'),
      makeEvent('2026-03-24T12:00:00', '2026-03-24T13:00:00'),
    ];
    const flexibleTasks = [
      makeTask({ id: 'flex-1', estimatedMinutes: 60, priority: 'HIGH' }),
      makeTask({ id: 'flex-2', estimatedMinutes: 60, priority: 'MEDIUM' }),
    ];

    const result = rearrangeFlexible(fixedEvents, flexibleTasks, [], { start: '09:00', end: '17:00' });
    expect(result).toHaveLength(2);
    // Both should be scheduled without overlapping fixed events
    for (const slot of result) {
      expect(
        (slot.start.getHours() >= 10 && slot.end.getHours() <= 12) ||
        (slot.start.getHours() >= 13)
      ).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it passes (rearrangeFlexible delegates to autoSchedule)**

```bash
cd goal-dashboard && npx vitest run src/__tests__/scheduling-engine.test.ts
```

Expected: PASS (rearrangeFlexible was already implemented in Task 6).

- [ ] **Step 3: Update handleEventDrop in CalendarView for smart rearranging**

In `src/components/calendar/CalendarView.tsx`, replace the existing `handleEventDrop` function (lines 75-92):

```typescript
  const handleEventDrop = async (info: any) => {
    const eventId = info.event.id;
    if (!eventId.startsWith('task-')) return;

    const taskId = eventId.replace('task-', '');
    const newStart = info.event.start;
    const newEnd = info.event.end || new Date(newStart.getTime() + 60 * 60 * 1000);

    // Persist the moved event with isPinned: true
    await fetch(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        timeBlockStart: newStart.toISOString(),
        timeBlockEnd: newEnd.toISOString(),
        dueDate: newStart.toISOString(),
        isPinned: true,
      }),
    });

    // Smart rearranging: check for overlaps with other events
    const otherEvents = events.filter(
      (e: any) => e.id !== eventId && e.start && e.end
    );

    const hasOverlap = otherEvents.some((e: any) => {
      const eStart = new Date(e.start);
      const eEnd = new Date(e.end);
      return newStart < eEnd && newEnd > eStart;
    });

    if (hasOverlap) {
      // Fixed events = pinned events + the just-moved event
      const fixedSlots: ScheduleEvent[] = events
        .filter((e: any) => {
          if (e.id === eventId) return true;
          return e.extendedProps?.isPinned === true;
        })
        .map((e: any) => ({
          start: e.id === eventId ? newStart : new Date(e.start),
          end: e.id === eventId ? newEnd : new Date(e.end),
        }));

      // Flexible tasks = unpinned, scheduled tasks (not the moved one)
      const flexTasks: SchedulableTask[] = (unscheduledData ?? [])
        .filter((t: any) => t.timeBlockStart && !t.isPinned && t.id !== taskId)
        .map((t: any) => ({
          id: t.id,
          title: t.title,
          priority: t.priority as SchedulableTask['priority'],
          estimatedMinutes: t.estimatedMinutes ?? 60,
          dueDate: t.dueDate ? new Date(t.dueDate) : null,
          preferredTimeStart: t.preferredTimeStart ?? null,
          preferredTimeEnd: t.preferredTimeEnd ?? null,
        }));

      if (flexTasks.length > 0) {
        const newSlots = rearrangeFlexible(fixedSlots, flexTasks, [], { start: '06:00', end: '22:00' });

        if (newSlots.length > 0) {
          await fetch('/api/tasks/batch-schedule', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              updates: newSlots.map((slot) => ({
                id: slot.taskId,
                timeBlockStart: slot.start.toISOString(),
                timeBlockEnd: slot.end.toISOString(),
                isAutoScheduled: true,
                isPinned: false,
              })),
            }),
          });
        }
      }
    }

    // Refresh calendar
    if (calendarRef.current) {
      const api = calendarRef.current.getApi();
      const { activeStart, activeEnd } = api.view;
      fetchEvents(activeStart.toISOString(), activeEnd.toISOString());
    }
  };
```

- [ ] **Step 4: Run all tests**

```bash
cd goal-dashboard && npx vitest run
```

Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/calendar/CalendarView.tsx src/__tests__/scheduling-engine.test.ts
git commit -m "feat(calendar): smart rearranging — flexible tasks auto-shift when events overlap after drag"
```

---

### Task 10: Pin Toggle Context Menu on Calendar Events

**Files:**
- Modify: `src/components/calendar/CalendarView.tsx`
- Modify: `src/app/globals.css`

- [ ] **Step 1: Add context menu state and handlers**

In `src/components/calendar/CalendarView.tsx`, add state:

```typescript
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    taskId: string;
    isPinned: boolean;
  } | null>(null);
```

Add handlers:

```typescript
  const handleTogglePin = async () => {
    if (!contextMenu) return;

    await fetch(`/api/tasks/${contextMenu.taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isPinned: !contextMenu.isPinned }),
    });

    setContextMenu(null);

    if (calendarRef.current) {
      const api = calendarRef.current.getApi();
      const { activeStart, activeEnd } = api.view;
      fetchEvents(activeStart.toISOString(), activeEnd.toISOString());
    }
  };

  const handleEventDidMount = (info: any) => {
    // Right-click context menu for pin toggle
    info.el.addEventListener('contextmenu', (e: MouseEvent) => {
      e.preventDefault();
      const eventId = info.event.id;
      if (!eventId.startsWith('task-')) return;

      const taskId = eventId.replace('task-', '');
      const task = (unscheduledData ?? []).find((t: any) => t.id === taskId);

      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        taskId,
        isPinned: task?.isPinned ?? false,
      });
    });

    // Pin icon overlay for pinned events
    if (info.event.extendedProps?.isPinned) {
      const pinIcon = document.createElement('span');
      pinIcon.className = 'pin-overlay';
      pinIcon.setAttribute('aria-label', 'Pinned');
      pinIcon.textContent = '\u{1F4CC}';
      info.el.style.position = 'relative';
      info.el.appendChild(pinIcon);
    }
  };
```

Add `eventDidMount={handleEventDidMount}` to the FullCalendar component props.

Add context menu JSX before the closing `</div>` of the component:

```tsx
      {/* Pin context menu */}
      {contextMenu && (
        <>
          <div
            className="fixed inset-0 z-50"
            onClick={() => setContextMenu(null)}
          />
          <div
            className="fixed z-50 rounded-lg border border-gray-700 bg-gray-900 shadow-xl py-1"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              onClick={handleTogglePin}
              className="w-full px-4 py-2 text-left text-sm text-gray-300 hover:bg-gray-800 hover:text-white"
            >
              {contextMenu.isPinned ? 'Unpin from this time' : 'Pin to this time'}
            </button>
          </div>
        </>
      )}
```

- [ ] **Step 2: Add pin overlay CSS**

In `src/app/globals.css`, add after the ghost event CSS:

```css
/* Pin icon overlay on pinned calendar events */
.pin-overlay {
  position: absolute;
  top: 2px;
  right: 4px;
  font-size: 0.65rem;
  line-height: 1;
  pointer-events: none;
}
```

- [ ] **Step 3: Run tests**

```bash
cd goal-dashboard && npx vitest run
```

Expected: All PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/calendar/CalendarView.tsx src/app/globals.css
git commit -m "feat(calendar): add right-click pin toggle and pin icon overlay on calendar events"
```

---

### Task 11: Quick Task Status Switching — StatusChip Component

**Files:**
- Create: `src/components/tasks/StatusChip.tsx`
- Create: `src/components/tasks/__tests__/StatusChip.test.tsx`
- Modify: `src/components/tasks/TaskCard.tsx`
- Modify: `src/components/tasks/DailyTaskList.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/tasks/__tests__/StatusChip.test.tsx`:

```typescript
import { vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders, userEvent } from '@/test/utils';
import { StatusChip } from '../StatusChip';

describe('StatusChip', () => {
  it('renders TODO status with gray styling', () => {
    renderWithProviders(
      <StatusChip status="TODO" onStatusChange={vi.fn()} />
    );
    const chip = screen.getByRole('button', { name: /todo/i });
    expect(chip).toBeInTheDocument();
    expect(chip.className).toContain('border-gray-600');
  });

  it('renders IN_PROGRESS status with yellow styling', () => {
    renderWithProviders(
      <StatusChip status="IN_PROGRESS" onStatusChange={vi.fn()} />
    );
    const chip = screen.getByRole('button', { name: /in progress/i });
    expect(chip.className).toContain('yellow');
  });

  it('renders DONE status with green styling', () => {
    renderWithProviders(
      <StatusChip status="DONE" onStatusChange={vi.fn()} />
    );
    const chip = screen.getByRole('button', { name: /done/i });
    expect(chip.className).toContain('green');
  });

  it('clicking TODO cycles to IN_PROGRESS', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithProviders(
      <StatusChip status="TODO" onStatusChange={onChange} />
    );

    await user.click(screen.getByRole('button', { name: /todo/i }));
    expect(onChange).toHaveBeenCalledWith('IN_PROGRESS');
  });

  it('clicking IN_PROGRESS cycles to DONE', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithProviders(
      <StatusChip status="IN_PROGRESS" onStatusChange={onChange} />
    );

    await user.click(screen.getByRole('button', { name: /in progress/i }));
    expect(onChange).toHaveBeenCalledWith('DONE');
  });

  it('clicking DONE cycles back to TODO', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithProviders(
      <StatusChip status="DONE" onStatusChange={onChange} />
    );

    await user.click(screen.getByRole('button', { name: /done/i }));
    expect(onChange).toHaveBeenCalledWith('TODO');
  });

  it('right-click shows all status options including DROPPED', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithProviders(
      <StatusChip status="TODO" onStatusChange={onChange} />
    );

    const chip = screen.getByRole('button', { name: /todo/i });
    await user.pointer({ keys: '[MouseRight]', target: chip });

    expect(screen.getByText('To Do')).toBeInTheDocument();
    expect(screen.getByText('In Progress')).toBeInTheDocument();
    expect(screen.getByText('Done')).toBeInTheDocument();
    expect(screen.getByText('Dropped')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd goal-dashboard && npx vitest run src/components/tasks/__tests__/StatusChip.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement StatusChip**

Create `src/components/tasks/StatusChip.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { Check } from 'lucide-react';

type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE' | 'DROPPED';

interface StatusChipProps {
  status: TaskStatus;
  onStatusChange: (newStatus: TaskStatus) => void;
}

const CYCLE_MAP: Record<TaskStatus, TaskStatus> = {
  TODO: 'IN_PROGRESS',
  IN_PROGRESS: 'DONE',
  DONE: 'TODO',
  DROPPED: 'TODO',
};

const STATUS_CONFIG: Record<TaskStatus, {
  label: string;
  chipClass: string;
  menuLabel: string;
}> = {
  TODO: {
    label: 'TODO',
    chipClass: 'border border-gray-600 text-gray-400 hover:border-gray-500',
    menuLabel: 'To Do',
  },
  IN_PROGRESS: {
    label: 'IN PROGRESS',
    chipClass: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 animate-pulse',
    menuLabel: 'In Progress',
  },
  DONE: {
    label: 'DONE',
    chipClass: 'bg-green-500/20 text-green-400 border border-green-500/30',
    menuLabel: 'Done',
  },
  DROPPED: {
    label: 'DROPPED',
    chipClass: 'bg-red-500/20 text-red-400 border border-red-500/30',
    menuLabel: 'Dropped',
  },
};

const ALL_STATUSES: TaskStatus[] = ['TODO', 'IN_PROGRESS', 'DONE', 'DROPPED'];

export function StatusChip({ status, onStatusChange }: StatusChipProps) {
  const [showMenu, setShowMenu] = useState(false);
  const config = STATUS_CONFIG[status];

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onStatusChange(CYCLE_MAP[status]);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowMenu(true);
  };

  const handleMenuSelect = (newStatus: TaskStatus) => {
    setShowMenu(false);
    onStatusChange(newStatus);
  };

  return (
    <div className="relative">
      <button
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        aria-label={config.label.toLowerCase()}
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium transition-colors ${config.chipClass}`}
      >
        {status === 'DONE' && <Check className="h-3 w-3" />}
        {config.label}
      </button>

      {showMenu && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={(e) => { e.stopPropagation(); setShowMenu(false); }}
          />
          <div className="absolute top-full left-0 z-50 mt-1 min-w-[120px] rounded-lg border border-gray-700 bg-gray-900 shadow-xl py-1">
            {ALL_STATUSES.map((s) => (
              <button
                key={s}
                onClick={(e) => { e.stopPropagation(); handleMenuSelect(s); }}
                className={`w-full px-3 py-1.5 text-left text-xs transition-colors hover:bg-gray-800 ${
                  s === status ? 'text-indigo-400 font-medium' : 'text-gray-300'
                }`}
              >
                {STATUS_CONFIG[s].menuLabel}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run StatusChip tests**

```bash
cd goal-dashboard && npx vitest run src/components/tasks/__tests__/StatusChip.test.tsx
```

Expected: All PASS.

- [ ] **Step 5: Integrate StatusChip into TaskCard**

In `src/components/tasks/TaskCard.tsx`, add the import:

```typescript
import { StatusChip } from './StatusChip';
```

Update the `TaskCardProps` interface to add `onStatusChange`:

```typescript
interface TaskCardProps {
  task: any;
  onToggle: (task: any) => void;
  onEdit: (task: any) => void;
  onDelete: (taskId: string) => void;
  onClick?: (task: any) => void;
  onStatusChange?: (taskId: string, newStatus: string) => void;
}
```

Update the component destructuring:

```typescript
export const TaskCard = React.memo(function TaskCard({ task, onToggle, onEdit, onDelete, onClick, onStatusChange }: TaskCardProps) {
```

Replace the inline status text span (lines 68-69):

```tsx
            <span className={`text-xs ${TASK_STATUS_COLORS[task.status] ?? ''}`}>
              {task.status.replace('_', ' ')}
            </span>
```

with:

```tsx
            <StatusChip
              status={task.status}
              onStatusChange={(newStatus) => onStatusChange?.(task.id, newStatus)}
            />
```

Note: The `TASK_STATUS_COLORS` import can be kept for now (used elsewhere potentially) or removed if it was only used here. Check if any other usage exists; if not, remove the import to keep things clean.

- [ ] **Step 6: Wire quick status change in DailyTaskList**

In `src/components/tasks/DailyTaskList.tsx`, add a `handleQuickStatusChange` callback after the existing `handleToggle` callback (after line 60):

```typescript
  const handleQuickStatusChange = useCallback(async (taskId: string, newStatus: string) => {
    mutate(
      async (currentData: any) => {
        await fetch(`/api/tasks/${taskId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus }),
        });
        const current = Array.isArray(currentData) ? currentData : [];
        return current.map((t: any) =>
          t.id === taskId ? { ...t, status: newStatus } : t
        );
      },
      {
        optimisticData: (currentData: any) => {
          const current = Array.isArray(currentData) ? currentData : [];
          return current.map((t: any) =>
            t.id === taskId ? { ...t, status: newStatus } : t
          );
        },
        rollbackOnError: true,
      }
    );
    onStatusChange?.();
  }, [mutate, onStatusChange]);
```

Pass `onStatusChange` to each `TaskCard`. Update the `TaskCard` render (lines 101-109):

```tsx
                  sectionTasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      onToggle={handleToggle}
                      onEdit={onEdit}
                      onDelete={onDelete}
                      onClick={onClick}
                      onStatusChange={handleQuickStatusChange}
                    />
                  ))
```

- [ ] **Step 7: Run all tests**

```bash
cd goal-dashboard && npx vitest run
```

Expected: All PASS. Note: The existing `TaskCard.test.tsx` tests check for `screen.getByText('IN PROGRESS')` which still matches the StatusChip label text, so those tests should still pass.

- [ ] **Step 8: Commit**

```bash
git add src/components/tasks/StatusChip.tsx src/components/tasks/__tests__/StatusChip.test.tsx src/components/tasks/TaskCard.tsx src/components/tasks/DailyTaskList.tsx
git commit -m "feat(tasks): add quick status switching chip — click to cycle, right-click for all options"
```

---

### Task 12: Final Verification

- [ ] **Step 1: Run full test suite**

```bash
cd goal-dashboard && npx vitest run
```

Expected: All tests PASS.

- [ ] **Step 2: Run build**

```bash
cd goal-dashboard && npm run build
```

Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 3: Run linter**

```bash
cd goal-dashboard && npx next lint
```

Expected: No new errors.

- [ ] **Step 4: Manual smoke test checklist**

1. **Dashboard:** Confirm GoalProgressSummary and WeeklySparkline are gone. Greeting, 4 stat cards, and today's task list remain.
2. **Calendar arrows:** Prev/Next buttons show chevron characters (`<` and `>`). Clicking navigates weeks.
3. **Task creation:** Cannot create a task without `estimatedMinutes`. Duration picker shows 8 presets (15m through 4h) plus custom input. Preferred time range inputs appear.
4. **Auto-schedule:** Button appears in calendar toolbar next to filter toggles. Click computes ghost events (semi-transparent, dashed border). "Confirm All" persists via batch PATCH. "Dismiss" clears ghosts.
5. **Smart rearranging:** Drag a pinned event onto an unpinned event's slot. Unpinned events shift automatically. Pin icon visible on pinned events. Right-click shows "Pin to this time" / "Unpin" menu.
6. **Status chip:** Click cycles TODO > IN_PROGRESS > DONE > TODO. Right-click shows all 4 options including DROPPED. Optimistic update with instant visual feedback.

- [ ] **Step 5: Final commit (if any lint/type fixes needed)**

```bash
git add -A
git commit -m "chore: fix lint/type issues from dashboard-calendar-fixes implementation"
```
