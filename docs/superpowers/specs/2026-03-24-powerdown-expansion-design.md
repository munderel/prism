# Power Down Ritual Expansion — Design Spec

**Date:** 2026-03-24
**Status:** Draft

## Problem

The current 6-step power-down ritual covers task review, loose ends, rescheduling, tomorrow's focus, time blocks, and completion. But it's missing key FRC practices: recording distractions, daily gratitude, idea capture, AI-powered clear goal decomposition, and a tomorrow calendar view for final adjustments with weekly aims scheduling.

## Solution Overview

Expand the power-down ritual from 6 steps to 9 steps, adding distraction recording, gratitude practice with timer, idea capture, AI-assisted clear goal breakdown, and an inline tomorrow calendar view.

## Updated Steps

| # | Name | Status | Details |
|---|------|--------|---------|
| 1 | Mark task completion | Modified | Review today's tasks. Completed stay. Uncompleted → moved to "unscheduled" in calendar. |
| 2 | Record distractions | **New** | "What distracted you today?" Free-form text entries. |
| 3 | Daily gratitude | **New** | 5-minute countdown timer. Text inputs for gratitude entries. |
| 4 | Capture ideas | **New** | Free-form idea capture for later review. |
| 5 | Capture loose ends | Existing | Create REACT tasks for unfinished items. |
| 6 | Reschedule incomplete | Existing | Move incomplete tasks to another date or drop. |
| 7 | Clear goals for tomorrow | Modified | AI-powered decomposition of tomorrow's tasks into minute-detail steps. Reorder hardest→easiest. |
| 8 | Tomorrow's calendar | **New** | Inline calendar showing only tomorrow. Drag tasks + weekly aims into time slots. |
| 9 | Power down complete | Existing | Streak update, confetti, "Back to Dashboard". |

## Schema Changes

### PowerdownSession

```prisma
model PowerdownSession {
  // ... existing fields (id, userId, sessionDate, currentStep, checklistState, tomorrowPlan, completedAt) ...
  distractions  Json?   // ["checked phone", "coworker interruption", ...]
  gratitudes    Json?   // ["grateful for X", "grateful for Y", ...]
  ideas         Json?   // ["idea about X", "try Y approach", ...]
  clearGoals    Json?   // [{ taskId: "abc", subSteps: ["step1", "step2"] }, ...]
}
```

Update `currentStep` max from 6 → 9.

## Step Details

### Step 1: Mark Task Completion (Modified)

**Current:** Shows completed tasks summary.
**New:** Shows ALL today's tasks. Each task has a toggle:
- Already DONE → shown with checkmark, no action needed
- Not DONE → user marks as completed OR leaves uncompleted
- Uncompleted tasks at end of step → their `timeBlockStart`/`timeBlockEnd` cleared (but NOT `calendarEventId`), moving them to "unscheduled" in the calendar view

### Step 2: Record Distractions (New)

- Header: "What distracted you today?"
- Dynamic text input list (add more entries with "+" button)
- Each entry is a free-form string
- Stored in `PowerdownSession.distractions` as JSON array
- Optional — user can skip (empty array)
- Data available in review exports for pattern analysis

### Step 3: Daily Gratitude (New)

- Header: "5-Minute Gratitude Practice"
- Countdown timer: 5:00 → 0:00 (with start/pause/reset)
- While timer runs, text inputs for gratitude entries
- Timer is a guide, not a gate — user can proceed before or after timer ends
- Stored in `PowerdownSession.gratitudes` as JSON array
- Gentle chime or pulse animation when timer completes

### Step 4: Capture Ideas (New)

- Header: "Any ideas or insights from today?"
- Dynamic text input list
- Stored in `PowerdownSession.ideas` as JSON array
- Ideas are preserved across sessions — accessible from a future "Ideas" view
- Optional — user can skip

### Step 5: Capture Loose Ends (Existing)

No changes. Create REACT tasks for unfinished items with tomorrow's due date.

### Step 6: Reschedule Incomplete (Existing)

No changes. Move incomplete tasks to another date or mark as DROPPED.

### Step 7: Clear Goals for Tomorrow (Modified)

**Current:** "Set Tomorrow's Focus" — simple text list of 3-5 focus items.
**New:** AI-powered clear goal decomposition.

1. Show tomorrow's tasks (fetched from `/api/tasks?date=tomorrow`)
2. Each task has a **"Decompose"** button
3. Click → calls `POST /api/powerdown/decompose` with task title + description
4. Server calls OpenRouter:
   ```
   Break down this task into extremely clear, minute-detail sub-steps.
   Task: "{title}"
   Description: "{description}"

   Each step should be so clear that you know EXACTLY what to do with zero ambiguity.
   Order from most difficult/rewarding to least.
   Return as JSON: { steps: ["step 1", "step 2", ...] }
   ```
5. AI-generated steps displayed under the task
6. User can edit, add, remove, reorder steps (drag-and-drop)
7. Final list stored in `PowerdownSession.clearGoals` as JSON

### Step 8: Tomorrow's Calendar (New)

- Inline FullCalendar instance showing ONLY tomorrow (timeGridDay view)
- Pre-populated with any existing time blocks for tomorrow
- **Unscheduled tasks** panel on the left — tomorrow's tasks without time blocks
- **Weekly aims** panel on the right — opted-in aims available to schedule (Aims system defined in the [Daily & Weekly Aims spec](2026-03-24-daily-weekly-aims-design.md))
  - Aims are private by default
  - Group-able aims show a toggle: "Open for others to join"
  - When toggling group on, other users with the same aim opted-in can see it

**Dependency:** Step 8 requires the Aims system (Spec 4) and Scheduling Engine (Spec 1) to be implemented first. If building this spec before those, Step 8 should show only the task scheduling panel without the aims panel or auto-schedule button.
- User drags tasks and aims into time slots for final adjustments
- Uses the client-side `SchedulingEngine` from `src/lib/scheduling-engine.ts` (defined in the [Dashboard & Calendar Fixes spec](2026-03-24-dashboard-calendar-fixes-design.md)) — "Auto-schedule" button available
- Changes persist to task `timeBlockStart`/`timeBlockEnd` and `AimInstance` records (AimInstance model defined in the [Daily & Weekly Aims spec](2026-03-24-daily-weekly-aims-design.md))

### Step 9: Power Down Complete (Existing)

No changes to the completion screen. Streak update, confetti celebration, "Back to Dashboard" button.

## New API Endpoint

### POST /api/powerdown/decompose

**File:** `src/app/api/powerdown/decompose/route.ts`

**Request:**
```json
{ "taskId": "abc", "title": "Write chapter 5", "description": "Cover flow triggers and challenge-skills balance" }
```

**Response:**
```json
{
  "steps": [
    "Open chapter 5 outline document",
    "Research 3 specific flow trigger examples from Kotler's work",
    "Write 200-word introduction connecting flow triggers to daily practice",
    "Draft section on challenge-skills balance with personal anecdote",
    "Write transition paragraph to next section",
    "Review and edit for clarity — read aloud once"
  ]
}
```

**Security:** Rate-limited (10 req/min), authenticated, server-side OpenRouter call.

## Files to Modify

- `src/components/powerdown/PowerDownRitual.tsx` — Major expansion: add steps 2-4, modify step 7, add step 8. Update step count from 6 to 9.
- `src/app/api/powerdown/route.ts` — Handle new JSON fields (distractions, gratitudes, ideas, clearGoals). Update step validation.
- `src/app/api/powerdown/decompose/route.ts` — New endpoint for AI task decomposition.
- `prisma/schema.prisma` — Add new fields to PowerdownSession.

## Testing

1. Complete all 9 steps of the power-down ritual.
2. Record distractions — verify stored in session.
3. Gratitude timer starts/pauses/resets correctly. Entries saved.
4. Ideas captured and persisted.
5. Clear goals: "Decompose" button calls AI and returns steps. Reorder works.
6. Tomorrow's calendar: drag tasks and aims into slots. Changes persist.
7. Weekly aims in step 8: private by default, group toggle works.
8. Completion screen: streak updates, confetti plays.
9. Run `npx vitest` and `npm run build`.
