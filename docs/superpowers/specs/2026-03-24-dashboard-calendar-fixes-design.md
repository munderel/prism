# Dashboard Simplification & Calendar Fixes — Design Spec

**Date:** 2026-03-24
**Status:** Draft

## Problem

The dashboard has widgets (Weekly Sparkline, Goal Progress Summary) that add visual clutter without driving daily action. The calendar's prev/next navigation arrows render as empty boxes due to missing icon fonts. Tasks lack duration estimates, preventing smart scheduling. Users must manually drag every task into calendar slots — no auto-scheduling or smart rearranging exists.

## Solution Overview

1. Strip the dashboard to essentials: greeting/streak, 4 stat cards, today's tasks
2. Fix FullCalendar arrow icon rendering
3. Add required `estimatedMinutes` field to tasks + optional scheduling preferences
4. Build a client-side auto-scheduling engine that places unscheduled tasks into optimal time slots
5. Implement smart rearranging: moving one event causes flexible tasks to shift automatically

## 1. Dashboard Simplification

### Changes

Remove `<GoalProgressSummary />` and `<WeeklySparkline />` from the dashboard page.

**Files to modify:**
- `src/app/(app)/page.tsx` — Remove component calls and imports (lines 10-11, 67-70)

**Files to delete:**
- `src/components/dashboard/GoalProgressSummary.tsx`
- `src/components/dashboard/WeeklySparkline.tsx`

**Resulting layout:**
```
┌────────────────────────────────────────────┐
│  DashboardGreeting (name, streak, +Add)    │
├──────────┬──────────┬──────────┬───────────┤
│  Total   │ Complete │ In Prog  │  Urgent   │
│  Tasks   │          │          │           │
├──────────┴──────────┴──────────┴───────────┤
│  Today's Tasks                             │
│  ├─ GOAL_STACK tasks                       │
│  ├─ REACT tasks                            │
│  └─ MAINTENANCE tasks                      │
└────────────────────────────────────────────┘
```

## 2. Calendar Arrow Icon Fix

### Problem

FullCalendar's `prev` and `next` toolbar buttons use icon fonts that aren't loading, resulting in empty button boxes.

### Fix

Add explicit CSS within the `.fc-dark-theme` class to render chevron arrows using CSS `content` properties:

```css
.fc-dark-theme .fc-prev-button::before {
  content: '‹';
  font-size: 1.5em;
}
.fc-dark-theme .fc-next-button::before {
  content: '›';
  font-size: 1.5em;
}
```

If FullCalendar's default icon classes are overriding, also check for missing `@fullcalendar/core` CSS import or add `!important` to override.

**File:** `src/components/calendar/CalendarView.tsx` (inline styles or separate CSS file)

## 3. Task Schema — Required Duration + Scheduling Fields

### New Fields on Task Model

```prisma
model Task {
  // ... existing fields ...
  estimatedMinutes    Int                // REQUIRED — duration in minutes
  preferredTimeStart  String?            // e.g., "09:00" — preferred slot start
  preferredTimeEnd    String?            // e.g., "12:00" — preferred slot end
  isPinned            Boolean @default(false)   // if true, auto-rearranging won't move this
  isAutoScheduled     Boolean @default(false)   // placed by auto-scheduler
}
```

### Migration

Existing tasks get `estimatedMinutes = 60` as default.

### API Validation

`POST /api/tasks` — Validate `estimatedMinutes` is present and > 0.

### TaskEditor UI

Add a required duration picker with presets: 15m, 30m, 45m, 1h, 1.5h, 2h, 3h, 4h, and a custom input.

Optional preferred time range: two time inputs (start/end) for when the user prefers to do this task.

**Files to modify:**
- `prisma/schema.prisma` — Task model
- `src/components/tasks/TaskEditor.tsx` — Duration picker + time preference inputs
- `src/app/api/tasks/route.ts` — Validation on POST (`estimatedMinutes` > 0 required)
- `src/components/calendar/CalendarView.tsx` — Set `isPinned: true` on manual drag-drop
- `src/components/powerdown/PowerDownRitual.tsx` — Supply `estimatedMinutes` when creating loose-end REACT tasks (default 30m)
- `src/app/(app)/page.tsx` — Quick-add task flow must include duration
- Any other `prisma.task.create` call sites — search codebase for all task creation paths and ensure `estimatedMinutes` is supplied

**Validation:** `preferredTimeStart` and `preferredTimeEnd` must be validated as `HH:mm` format strings in the API layer when provided.

## 4. Auto-Scheduling Engine

### Architecture

Client-side class in `src/lib/scheduling-engine.ts`. No server round-trips for schedule computation — fast, instant feedback, works with existing FullCalendar.

### Algorithm

```
function autoSchedule(
  unscheduledTasks: Task[],
  existingEvents: CalendarEvent[],
  workingHours: { start: string, end: string }  // "06:00" - "22:00"
): ProposedSlot[]

1. Sort unscheduledTasks by:
   - Priority DESC: URGENT > HIGH > MEDIUM > LOW
   - Due date ASC: soonest first

2. For each task:
   a. Determine scheduling horizon:
      - If dueDate is set: scan from today to dueDate
      - If dueDate is null: scan from today through end of current week (Sunday)
   b. If task has preferredTimeStart/End:
      - Scan days in horizon for open slots within preferred range
      - Slot must fit estimatedMinutes with no overlap
   c. If no preferred time or no slot found in preferred range:
      - Scan all open slots within working hours
   d. Mark slot as occupied for subsequent tasks

3. Return ProposedSlot[] = { taskId, start: Date, end: Date }
```

### UX

- **"Auto-schedule" button** in calendar toolbar, next to filter toggles
- Click → ghost events appear (semi-transparent, dashed border) at proposed slots
- User can drag ghost events to adjust
- **"Confirm All"** button persists all proposed slots via batch PATCH
- **"Dismiss"** clears ghost events
- Individual **"Schedule" icon** per unscheduled task in sidebar for one-at-a-time scheduling

### Batch Persist

**New endpoint:** `POST /api/tasks/batch-schedule`

```typescript
// Request body:
{
  updates: [
    { id: string, timeBlockStart: string, timeBlockEnd: string, isAutoScheduled: boolean, isPinned: boolean }
  ]
}

// Response: { updated: number }
```

Uses a Prisma transaction to update all tasks atomically. Validates ownership of all tasks. Returns 400 if any task ID is invalid or not owned by the user. The existing `PATCH /api/tasks/[id]` remains unchanged for single-task updates.

## 5. Smart Rearranging

### Trigger

When a user drags an event to a new time slot (`eventDrop` callback in FullCalendar).

### Logic

```
1. After event drop, detect if new position overlaps any existing event
2. If overlap:
   a. Collect all flexible events (isPinned === false, excluding the moved event)
   b. Treat all pinned events + the moved event as fixed
   c. Re-run autoSchedule() for flexible events only
   d. Animate transitions (FullCalendar handles this natively)
   e. Persist all changes in single batch PATCH
3. If no overlap: just persist the moved event as normal
```

### Pin Toggle

- Right-click context menu on calendar events: "Pin to this time" / "Unpin"
- Small pin icon overlay on pinned events
- Manually dragged events auto-set `isPinned: true`
- Auto-scheduled events default to `isPinned: false`

## 6. Quick Task Status Switching

### Problem

Switching a task between statuses (TODO → IN_PROGRESS → DONE) currently requires clicking into the task or using a multi-step flow. Users need a faster way to toggle status directly from the task list.

### Solution

Add a clickable status chip/badge on each task card in both the **Dashboard** (DailyTaskList) and **Tasks page**. Single-click cycles: TODO → IN_PROGRESS → DONE. Long-press or right-click shows all 4 options (including DROPPED).

**Files to modify:**
- `src/components/tasks/DailyTaskList.tsx` — Add status chip to each task row
- `src/components/tasks/TaskCard.tsx` — Add status chip component
- `src/app/(app)/tasks/page.tsx` — Same status chip in task list view

**Status chip design:**
- TODO: Gray outline chip, click → IN_PROGRESS
- IN_PROGRESS: Yellow filled chip with pulse animation, click → DONE
- DONE: Green filled chip with checkmark, click → TODO (to undo)
- DROPPED: Red chip (only accessible via right-click context menu)

Each click sends `PATCH /api/tasks/{id}` with the new status. Uses optimistic updates via SWR mutate for instant feedback.

## Testing

1. **Dashboard:** Verify GoalProgressSummary and WeeklySparkline no longer render. Stat cards and task list still work.
2. **Calendar arrows:** Prev/next buttons show chevron icons and navigate weeks.
3. **Task duration:** Cannot create a task without `estimatedMinutes`. Duration shows in task cards.
4. **Auto-schedule:** Button places unscheduled tasks into open slots respecting priority, due date, and preferred time. Ghost events appear before confirmation.
5. **Rearranging:** Moving a pinned event causes unpinned events to shift. Pinned events stay fixed.
6. **Status switching:** Click status chip to cycle TODO→IN_PROGRESS→DONE. Right-click shows all options including DROPPED.
7. Run `npx vitest` and `npm run build`.
