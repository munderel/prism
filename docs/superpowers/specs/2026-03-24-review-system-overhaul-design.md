# Review System Overhaul — Design Spec

**Date:** 2026-03-24
**Status:** Draft

## Problem

Reviews have rigid scheduling (hardcoded to Sundays/1st Monday), no company vs individual distinction, limited content (just a checklist), and no way to export review data for analysis. Users need flexible scheduling, team-wide reviews, richer review workflows (tracking wins, removing friction, brain dumps), and exportable review logs.

## Solution Overview

1. Flexible review scheduling with user-chosen start date and day of week
2. Team reviews (admin-created, whole team participates) alongside individual reviews
3. Expanded review content for weekly, monthly, and yearly cadences
4. Goal date ranges (startDate/endDate) for review context
5. Review data export (JSON and CSV)

## 1. Flexible Review Scheduling

### Schema Changes

```prisma
model Review {
  // ... existing fields ...
  startDate           DateTime?    // When recurring reviews begin
  recurrenceDayOfWeek Int?         // 0=Sunday ... 6=Saturday
}
```

### Scheduling Logic

**File:** `src/app/api/reviews/route.ts`

When calculating next review date:
- Use `startDate` as the anchor point
- Find the next occurrence of `recurrenceDayOfWeek` on or after `startDate`
- For monthly/quarterly/yearly: find the first `recurrenceDayOfWeek` in the target month/quarter/year

### UI Changes

**File:** `src/app/(app)/reviews/page.tsx`

When setting up a cadence:
- Date picker for start date
- Day-of-week selector (Sun–Sat dropdown)
- Preview of next 3 scheduled dates

## 2. Company vs Individual Reviews

### Schema Change

```prisma
model Review {
  // ... existing fields ...
  isTeamReview  Boolean @default(false)
}
```

### Rules

- **Admin creates** team reviews → visible to all authenticated users
- **Individual reviews** → visible to owner + admins only
- Team review creation requires `isAdmin: true`

### UI Changes

**File:** `src/app/(app)/reviews/page.tsx`

- Tab toggle: "My Reviews" | "Team Reviews"
- Team reviews tab shows all team review cadences
- Admin sees "Create Team Review" button

**File:** `src/components/reviews/ReviewChecklist.tsx`

- Team review layout: per-person sections where each team member contributes
- Company goal progress dashboard at the top

### API Changes

**File:** `src/app/api/reviews/route.ts`

- GET: Return team reviews for all users, individual reviews for owner/admin only
- POST with `isTeamReview: true`: Require admin role

## 3. Expanded Review Content

### Weekly Review — Individual

| Step | Content | Type |
|------|---------|------|
| 1. Track Wins | 3-5 key achievements | Text entries (array) |
| 2. Remove Friction | Energy-wasting tasks to eliminate | Text entries (array) |
| 3. Review Previous Week | Auto-loaded tasks from last week with status | Auto-populated + user actions |
| 4. Plan Ahead | Top 3 priorities for next week | Text entries (array) |
| 5. Schedule Next Week | Calendar embed — work blocks first, then weekly aims | Calendar interaction |

**Dependency:** Step 5's weekly aims integration depends on the [Daily & Weekly Aims spec](2026-03-24-daily-weekly-aims-design.md). If Aims not yet implemented, Step 5 shows only task scheduling without aims panel.

**Step 3 detail:** Query tasks where `dueDate` falls in the previous week. Show each with current status. User can:
- Mark as completed (if not already)
- Schedule into upcoming week (sets new `dueDate`)
- Mark as abandoned (status → DROPPED, not deleted)

**Step 5 detail:** Inline calendar view for the upcoming week. User places work blocks (task time blocks) first, then drags in weekly aims from the opted-in aims list.

### Weekly Review — Team

| Step | Content |
|------|---------|
| 1. Team Wins | Each member shares 1-3 wins |
| 2. Shared Blockers | Team identifies common friction |
| 3. Company Goal Progress | Auto-populated from company goal stack |
| 4. Team Priorities | Assign top priorities for next week |

**Team review data model:** One Review record is created with `isTeamReview: true` and `userId` set to the admin who created it. The `checklistState` JSON stores per-member contributions as a nested structure:

```typescript
// checklistState for team reviews:
{
  memberResponses: {
    [userId: string]: {
      wins: string[],
      blockers: string[],
    }
  },
  teamPriorities: string[],
  // ... other team-level fields
}
```

Each team member can edit their own section within the team review. The API validates that users can only modify their own `memberResponses[userId]` entry (admins can edit any).

### Monthly Review

| Field | Type |
|-------|------|
| Lessons learned | Text (long) |
| Mistakes made | Text (long) |
| Brain dump — what's on your mind | Text (long) |
| Goal progress review | Auto-populated from goal stack |
| Yearly goal progress check | Auto-populated |
| Changes needed on goals | Text entries (action items) |

### Yearly Review

| Field | Type |
|-------|------|
| Goal progress | Auto-populated |
| Monthly goals completed count | Computed |
| Company vs Individual split | Two-panel view |

Company panel: team goals linked to individual contributors with completion status.
Individual panel: personal goal stack progress summary.

### Template Storage

ReviewTemplate.checklistItems (JSON) expanded to include step types:

```typescript
type ReviewStep = {
  id: string;
  title: string;
  description?: string;
  type: 'checkbox' | 'text' | 'text_list' | 'auto_tasks' | 'calendar' | 'auto_goals';
  required: boolean;
};
```

### ReviewTemplate Schema Change

The current `ReviewTemplate` has a `@unique` constraint on `reviewType`, allowing only one template per cadence. To support individual and team variants, add an `isTeamTemplate` field and change the unique constraint:

```prisma
model ReviewTemplate {
  // ... existing fields ...
  isTeamTemplate  Boolean @default(false)

  @@unique([reviewType, isTeamTemplate])  // replaces @@unique([reviewType])
}
```

Seed 8 templates: 4 cadences x 2 variants (individual + team).

## 4. Goal Date Ranges

### Schema Change

```prisma
model Goal {
  // ... existing fields ...
  startDate  DateTime?
  endDate    DateTime?
}
```

Weekly, monthly, and yearly goals get explicit start/end dates. Used in reviews to scope "previous week's tasks" and goal progress calculations.

**Files to modify:**
- `prisma/schema.prisma` — Goal model
- `src/components/goals/GoalStackTree.tsx` — Date range inputs in goal editor
- `src/app/api/goals/route.ts` — Accept startDate/endDate

## 5. Review Data Export

### New Endpoint

**File:** `src/app/api/reviews/export/route.ts`

```
GET /api/reviews/export?type=WEEKLY&from=2026-01-01&to=2026-03-24&format=json
```

**Parameters:**
- `type` (optional): WEEKLY, MONTHLY, QUARTERLY, YEARLY
- `from` / `to` (optional): Date range filter
- `format`: `json` or `csv`
- `scope` (optional): `individual` or `team`

**Export includes per review:**
- Review type, scheduled date, completed date
- All checklist responses (wins, friction items, priorities, brain dump, lessons, mistakes)
- Notes
- Goal progress snapshot at time of review

**JSON format:** Array of review objects with all fields expanded.
**CSV format:** Flattened rows, one per review, with columns for each data point.

### UI

"Export" button on Reviews page with:
- Date range picker
- Review type filter dropdown
- Format toggle (JSON/CSV)
- Scope toggle (My Reviews/Team Reviews)

## Testing

1. Create a weekly review with custom start date (Wednesday) — verify next dates fall on Wednesdays.
2. Admin creates team review — verify all users see it.
3. Complete a weekly individual review through all 5 steps including calendar scheduling.
4. Complete a monthly review with lessons/mistakes/brain dump.
5. Export reviews as JSON and CSV — verify data completeness.
6. Goal date ranges display correctly in goal editor and are used in review task scoping.
