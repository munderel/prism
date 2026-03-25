# Process Task Enhancement — Design Spec

**Date:** 2026-03-24
**Status:** Draft

## Problem

Processes generate MAINTENANCE tasks via cron, but those tasks lack duration estimates. Without duration, they can't participate in auto-scheduling or show meaningful time blocks in the calendar. Process-generated tasks just appear as unstructured items rather than schedulable blocks with known time requirements.

## Solution Overview

Add a `defaultDurationMinutes` field to the Process model. When the cron job generates a task from a process, it copies this duration to the task's `estimatedMinutes` field. Process-generated tasks then appear in the unscheduled sidebar with their duration, ready for auto-scheduling or manual drag-drop.

## Data Model

### Process Model Change

```prisma
model Process {
  // ... existing fields ...
  defaultDurationMinutes  Int  @default(60)
}
```

## Changes

### 1. Cron Job — Process Task Creation

**File:** `src/app/api/cron/process-tasks/route.ts`

When creating a task from a due process, set `estimatedMinutes` from the process:

```typescript
const task = await prisma.task.create({
  data: {
    // ... existing fields ...
    estimatedMinutes: process.defaultDurationMinutes,
  },
});
```

### 2. Process Editor UI

**File:** `src/app/(app)/processes/page.tsx`

Add a duration picker alongside the existing cadence selector. Same preset options as TaskEditor: 15m, 30m, 45m, 1h, 1.5h, 2h, 3h, 4h + custom.

### 3. Process API

**File:** `src/app/api/processes/route.ts`

Accept `defaultDurationMinutes` in POST and PATCH. Validate > 0.

### 4. Calendar Integration

Process-generated tasks already appear as MAINTENANCE type in the unscheduled sidebar. With `estimatedMinutes` now populated, they integrate with the auto-scheduling engine from Spec 1.

## Testing

1. Create a process with cadence=DAILY and duration=30 minutes.
2. Trigger the cron job (or wait for it).
3. Verify the generated task has `estimatedMinutes: 30`.
4. Verify the task appears in the unscheduled sidebar with "30m" label.
5. Auto-schedule places it in a 30-minute slot.
