# Win the Day Flag — Design Spec

**Date:** 2026-03-24
**Status:** Draft

## Problem

The Flow Research Collective framework emphasizes designating one task per day as the "win the day" task — the single most important task that, when completed, makes the whole day a success. The app currently has no way to flag a task as the day's key win. Users need a clear, visible designation and a special celebration when it's completed.

## Solution Overview

Add an `isWinTheDay` boolean flag to the Task model. One task per user per day can be flagged. The Win the Day task is shown prominently on the dashboard and triggers a special dopamine celebration on completion. It ties into the Daily Aims deep work block as the intended focus task.

## Data Model

### Task Model Change

```prisma
model Task {
  // ... existing fields ...
  isWinTheDay  Boolean @default(false)
}
```

## Rules

1. **One per user per day:** Only one task per user per `dueDate` can have `isWinTheDay = true`.
2. **Auto-unflag:** When flagging a new task, any existing Win the Day task for that user+date is automatically unflagged.
3. **API enforcement:** `PATCH /api/tasks/[id]` with `isWinTheDay: true` triggers unflagging of any other Win the Day task for the same user and date.

## UI Changes

### Task Cards — Flag Toggle

**File:** `src/components/tasks/DailyTaskList.tsx`

- Star icon (or flag icon) on each task card
- Filled star = Win the Day, outline star = regular task
- Click to toggle. If toggling ON, the previous Win the Day task (if any) gets unflagged automatically.
- Tooltip: "Designate as Win the Day task"

### Dashboard — Prominent Display

**File:** `src/app/(app)/page.tsx`

Above the regular "Today's Tasks" section, add a highlighted Win the Day card:

```
┌────────────────────────────────────────┐
│  ⭐ WIN THE DAY                        │
│  ┌──────────────────────────────────┐  │
│  │ [task title]           [status]  │  │
│  │ [priority] [duration]            │  │
│  └──────────────────────────────────┘  │
└────────────────────────────────────────┘
```

- Gold/amber border with subtle glow (matches Prism theme)
- Only shows if a Win the Day task exists for today
- If none designated, show a prompt: "Flag a task as your Win the Day"

### Completion Celebration

**File:** `src/components/dopamine/` (new or extend existing)

When the Win the Day task status changes to DONE:
- Special confetti burst (bigger than normal task completion)
- "You Won the Day!" banner animation
- Streak counter pulse

### Calendar Integration

When scheduling in the calendar, the Win the Day task auto-fills the Deep Work aim block (if the user has opted into Daily Aims). The scheduling engine treats it as the highest-priority task for the day.

## API Changes

**File:** `src/app/api/tasks/[id]/route.ts`

On PATCH with `isWinTheDay: true`:
```typescript
// Unflag any existing Win the Day task for this user on the same date
await prisma.task.updateMany({
  where: {
    ownerId: session.user.id,
    dueDate: task.dueDate,
    isWinTheDay: true,
    id: { not: taskId },
  },
  data: { isWinTheDay: false },
});
```

## Testing

1. Flag a task as Win the Day — verify star icon fills and task appears in dashboard Win section.
2. Flag a different task for the same day — verify the first task is auto-unflagged.
3. Complete the Win the Day task — verify special celebration animation.
4. Verify only one Win the Day per user per day at the API level.
5. Run `npx vitest` and `npm run build`.
