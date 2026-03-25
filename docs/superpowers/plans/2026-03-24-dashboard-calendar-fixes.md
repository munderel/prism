# Dashboard Simplification & Calendar Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Strip the dashboard to essentials, fix FullCalendar arrow icons, add required `estimatedMinutes` to tasks, build a client-side auto-scheduling engine, implement smart rearranging, and add quick task status switching.

**Architecture:** Dashboard simplification is pure deletion. Calendar arrow fix is CSS-only. Schema changes require a Prisma migration with defaults. The scheduling engine is a pure-function client-side module with no server dependency. The batch endpoint uses a Prisma transaction. All task creation paths must supply `estimatedMinutes`.

**Tech Stack:** Next.js 14 / TypeScript / Prisma / PostgreSQL / FullCalendar 6 / Vitest / TailwindCSS

**Spec:** `docs/superpowers/specs/2026-03-24-dashboard-calendar-fixes-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/app/(app)/page.tsx` | Modify | Remove GoalProgressSummary + WeeklySparkline |
| `src/components/dashboard/GoalProgressSummary.tsx` | Delete | Unused widget |
| `src/components/dashboard/WeeklySparkline.tsx` | Delete | Unused widget |
| `src/app/globals.css` | Modify | Add calendar arrow CSS + ghost event CSS + wtd-glow |
| `prisma/schema.prisma` | Modify | Add 5 new fields to Task model |
| `src/lib/task-validation.ts` | Create | Validation for estimatedMinutes + preferred time format |
| `src/lib/scheduling-engine.ts` | Create | Pure-function auto-scheduling engine |
| `src/lib/batch-schedule-validation.ts` | Create | Batch schedule request validation |
| `src/app/api/tasks/route.ts` | Modify | Validate estimatedMinutes on POST |
| `src/app/api/tasks/[id]/route.ts` | Modify | Accept new fields on PATCH, supply on recurrence spawn |
| `src/app/api/tasks/batch-schedule/route.ts` | Create | Batch-schedule POST endpoint |
| `src/app/api/goals/import/route.ts` | Modify | Supply estimatedMinutes on YAML import |
| `src/components/tasks/TaskEditor.tsx` | Modify | Add duration picker + preferred time inputs |
| `src/components/tasks/TaskCard.tsx` | Modify | Add status chip for quick switching |
| `src/components/tasks/DailyTaskList.tsx` | Modify | Wire status chip toggle |
| `src/components/powerdown/PowerDownRitual.tsx` | Modify | Supply estimatedMinutes on loose ends |
| `src/components/calendar/CalendarView.tsx` | Modify | Auto-schedule button, ghost events, pin-on-drag |
| `src/app/(app)/calendar/page.tsx` | Modify | Pass unscheduled tasks, handle batch confirm |
| `src/test/fixtures.ts` | Modify | Add new fields to createTask factory |

---

### Task 1: Dashboard Simplification — Remove Widgets

**Files:**
- Modify: `src/app/(app)/page.tsx`
- Delete: `src/components/dashboard/GoalProgressSummary.tsx`
- Delete: `src/components/dashboard/WeeklySparkline.tsx`

- [ ] **Step 1: Delete unused component files**

```bash
rm src/components/dashboard/GoalProgressSummary.tsx
rm src/components/dashboard/WeeklySparkline.tsx
```

- [ ] **Step 2: Remove imports and JSX from dashboard**

In `src/app/(app)/page.tsx`, remove `GoalProgressSummary` and `WeeklySparkline` imports and their JSX calls.

- [ ] **Step 3: Verify build**

Run: `npx vitest run && npm run build`

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "chore: remove GoalProgressSummary and WeeklySparkline from dashboard"
```

---

### Task 2: Calendar Arrow Icon Fix

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Add chevron CSS rules**

```css
.fc-dark-theme .fc .fc-prev-button .fc-icon,
.fc-dark-theme .fc .fc-next-button .fc-icon {
  font-size: 0;
}
.fc-dark-theme .fc .fc-prev-button .fc-icon::after {
  content: '\2039';
  font-size: 1.5em;
  line-height: 1;
}
.fc-dark-theme .fc .fc-next-button .fc-icon::after {
  content: '\203A';
  font-size: 1.5em;
  line-height: 1;
}
```

- [ ] **Step 2: Verify visually** — navigate to `/calendar`, confirm chevrons render
- [ ] **Step 3: Commit**

```bash
git add src/app/globals.css && git commit -m "fix: render chevron arrows for FullCalendar prev/next buttons"
```

---

### Task 3: Prisma Schema — Add Scheduling Fields

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `src/test/fixtures.ts`

- [ ] **Step 1: Add fields to Task model**

```prisma
  estimatedMinutes    Int              @default(60)
  preferredTimeStart  String?
  preferredTimeEnd    String?
  isPinned            Boolean          @default(false)
  isAutoScheduled     Boolean          @default(false)
```

- [ ] **Step 2: Run migration**

Run: `npx prisma migrate dev --name add-task-scheduling-fields`

- [ ] **Step 3: Update test fixture** — add defaults to `createTask()`
- [ ] **Step 4: Run existing tests**

Run: `npx vitest run`

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add estimatedMinutes, preferredTime, isPinned, isAutoScheduled to Task"
```

---

### Task 4: API Validation — Require estimatedMinutes

**Files:**
- Create: `src/lib/task-validation.ts`
- Create: `src/__tests__/task-api-validation.test.ts`
- Modify: `src/app/api/tasks/route.ts`
- Modify: `src/app/api/tasks/[id]/route.ts`
- Modify: `src/app/api/goals/import/route.ts`

- [ ] **Step 1: Write failing validation tests**

Test: missing estimatedMinutes returns error, 0 returns error, negative returns error, positive passes, invalid HH:mm format rejected, valid HH:mm accepted.

- [ ] **Step 2: Run test (fails)**
- [ ] **Step 3: Create `src/lib/task-validation.ts`**

```typescript
const HH_MM_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

export function validateTaskCreate(body: any): { error?: string } {
  if (!body.taskType || !body.title) return { error: 'taskType and title are required' };
  if (!body.estimatedMinutes || body.estimatedMinutes <= 0) return { error: 'estimatedMinutes is required and must be > 0' };
  if (body.preferredTimeStart && !HH_MM_REGEX.test(body.preferredTimeStart)) return { error: 'preferredTimeStart must be HH:mm' };
  if (body.preferredTimeEnd && !HH_MM_REGEX.test(body.preferredTimeEnd)) return { error: 'preferredTimeEnd must be HH:mm' };
  return {};
}
```

- [ ] **Step 4: Run test (passes)**
- [ ] **Step 5: Wire validation into POST /api/tasks** — add estimatedMinutes + preferred time to body destructuring and create data
- [ ] **Step 6: Wire new fields into PATCH** — accept on update, supply on recurrence spawn
- [ ] **Step 7: Fix YAML import** — add `estimatedMinutes: 60` to import task creation
- [ ] **Step 8: Run all tests, commit**

```bash
git add -A && git commit -m "feat: require estimatedMinutes on task creation, add validation"
```

---

### Task 5: TaskEditor UI — Duration Picker + Preferred Time

**Files:**
- Modify: `src/components/tasks/TaskEditor.tsx`

- [ ] **Step 1: Add state** for estimatedMinutes, preferredTimeStart, preferredTimeEnd
- [ ] **Step 2: Add duration preset buttons** (15m, 30m, 45m, 1h, 1.5h, 2h, 3h, 4h) + custom input
- [ ] **Step 3: Add preferred time range inputs** (two `type="time"` inputs)
- [ ] **Step 4: Include in form submission body**
- [ ] **Step 5: Update disabled state** — require estimatedMinutes > 0
- [ ] **Step 6: Run tests, commit**

```bash
git add -A && git commit -m "feat: add duration picker and preferred time inputs to TaskEditor"
```

---

### Task 6: PowerDown Loose Ends — Supply estimatedMinutes

**Files:**
- Modify: `src/components/powerdown/PowerDownRitual.tsx`

- [ ] **Step 1: Add `estimatedMinutes: 30` to addLooseEnd POST body**
- [ ] **Step 2: Run tests, commit**

```bash
git add -A && git commit -m "fix: supply estimatedMinutes=30 for PowerDownRitual loose-end tasks"
```

---

### Task 7: Auto-Scheduling Engine — Pure Functions

**Files:**
- Create: `src/lib/scheduling-engine.ts`
- Create: `src/__tests__/scheduling-engine.test.ts`

- [ ] **Step 1: Write failing tests**

Test: single task → first slot, priority sorting, avoids overlaps, respects preferred time, falls back if preferred full, null dueDate → current week, no slot → empty array.

- [ ] **Step 2: Run test (fails)**
- [ ] **Step 3: Implement scheduling engine**

Core algorithm: sort by priority DESC + dueDate ASC, for each task scan days in horizon for open slots (preferred first, then any working hours). Uses `findSlotInRange()` gap-finding.

- [ ] **Step 4: Run tests (pass)**
- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: implement client-side auto-scheduling engine"
```

---

### Task 8: Batch-Schedule API Endpoint

**Files:**
- Create: `src/lib/batch-schedule-validation.ts`
- Create: `src/app/api/tasks/batch-schedule/route.ts`
- Create: `src/__tests__/batch-schedule.test.ts`

- [ ] **Step 1: Write validation tests** — empty array, missing id, invalid date, valid passes
- [ ] **Step 2: Implement validation helper**
- [ ] **Step 3: Create route** — auth, validate, verify ownership, Prisma transaction
- [ ] **Step 4: Run tests, commit**

```bash
git add -A && git commit -m "feat: add POST /api/tasks/batch-schedule endpoint"
```

---

### Task 9: Calendar UI — Auto-Schedule + Ghost Events + Pin

**Files:**
- Modify: `src/components/calendar/CalendarView.tsx`
- Modify: `src/app/(app)/calendar/page.tsx`

- [ ] **Step 1: Expand CalendarView props** for unscheduledTasks and onBatchScheduleConfirm
- [ ] **Step 2: Add auto-schedule button** — runs scheduling engine, renders ghost events
- [ ] **Step 3: Add Confirm/Dismiss buttons** for ghost events
- [ ] **Step 4: Merge ghost events** into FullCalendar events (semi-transparent, dashed border)
- [ ] **Step 5: Update eventDrop** to set isPinned=true on manual drag
- [ ] **Step 6: Add ghost event CSS** to globals.css
- [ ] **Step 7: Update calendar page** to pass unscheduled tasks + handle batch confirm
- [ ] **Step 8: Update draggable duration** to use task.estimatedMinutes
- [ ] **Step 9: Display duration badge** on unscheduled task cards
- [ ] **Step 10: Run tests, commit**

```bash
git add -A && git commit -m "feat: add auto-schedule button, ghost events, and pin-on-drag to calendar"
```

---

### Task 10: Quick Task Status Switching

**Files:**
- Modify: `src/components/tasks/TaskCard.tsx`
- Modify: `src/components/tasks/DailyTaskList.tsx`
- Modify: `src/app/(app)/tasks/page.tsx`

- [ ] **Step 1: Add status chip component** to TaskCard

Clickable chip: TODO (gray) → IN_PROGRESS (yellow pulse) → DONE (green check) → TODO. Right-click for DROPPED.

- [ ] **Step 2: Wire optimistic status change** in DailyTaskList
- [ ] **Step 3: Add same chip** to tasks page list view
- [ ] **Step 4: Run tests, commit**

```bash
git add -A && git commit -m "feat: add quick task status switching chips to task cards"
```

---

### Task 11: Final Verification

- [ ] **Step 1: Run all tests** — `npx vitest run`
- [ ] **Step 2: Run build** — `npm run build`
- [ ] **Step 3: Manual smoke test** — dashboard minimal, calendar arrows, auto-schedule, status chips
- [ ] **Step 4: Commit any fixes**
