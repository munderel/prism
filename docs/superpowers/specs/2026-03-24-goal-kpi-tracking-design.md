# Goal KPI Tracking — Design Spec

**Date:** 2026-03-24
**Status:** Draft

## Problem

The Goal Dashboard tracks goals hierarchically (HHG → Strategic → Monthly → Weekly → Daily) with task-based progress, but there's no way to attach numeric KPI targets to goals. Users need to see "I want $4,000 revenue this month" and track weekly actuals ($900, $1,100, $800…) against that target — directly in the goal stack view.

## Solution Overview

Add KPI tracking to goals at the STRATEGIC, MONTHLY, and WEEKLY levels. KPIs can be **numeric** (target + actual) or **binary** (done/not done). Weekly KPIs can **link** to monthly KPIs so that weekly actuals automatically feed into monthly progress — without rigid rollup math that breaks when weeks are missed.

A new **KPI sidebar panel** opens when clicking a goal, showing all KPIs with progress bars, weekly breakdowns, and inline editing.

YAML import/export is extended to include KPIs.

## Data Model

### New Prisma Model: `Kpi`

```prisma
enum KpiType {
  NUMERIC
  BINARY
}

model Kpi {
  id          String    @id @default(cuid())
  goalId      String
  goal        Goal      @relation(fields: [goalId], references: [id])
  name        String
  type        KpiType
  unit        String?               // "$", "calls", "%", "hires", etc.
  targetValue Float?                // null for BINARY
  actualValue Float?                // null for BINARY; auto-calculated for linked monthly KPIs
  isComplete  Boolean   @default(false)  // for BINARY KPIs
  completedAt DateTime?             // when binary KPI was completed
  sortOrder   Int       @default(0)
  linkedKpiId String?               // weekly KPI → monthly KPI link
  linkedKpi   Kpi?      @relation("KpiLink", fields: [linkedKpiId], references: [id])
  linkedFrom  Kpi[]     @relation("KpiLink")
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  @@unique([goalId, name])    // prevents duplicate KPI names on same goal
  @@index([goalId])
  @@index([linkedKpiId])
}
```

### Goal Model Update

Add relation to existing Goal model:

```prisma
model Goal {
  // ... existing fields ...
  kpis  Kpi[]
}
```

### Constraints

- KPIs only on STRATEGIC, MONTHLY, WEEKLY levels (not HHG or DAILY)
- `linkedKpiId` only valid for WEEKLY-level KPIs pointing to MONTHLY-level KPIs
- A monthly KPI can have 0+ linked weekly KPIs
- A weekly KPI can link to at most 1 monthly KPI
- Linked KPIs must share the same `type` (NUMERIC→NUMERIC, BINARY→BINARY)

## KPI Linking & Calculation Logic

### Numeric KPIs (weekly → monthly)

When a weekly KPI's `actualValue` is updated:
1. Find the linked monthly KPI via `linkedKpiId`
2. Query all weekly KPIs that link to that monthly KPI
3. Set monthly KPI `actualValue` = SUM of all linked weekly `actualValue`s (treating null as 0)
4. This is a server-side cascade in the PUT `/api/kpis/[id]` endpoint

### Binary KPIs (weekly → monthly)

When a weekly binary KPI's `isComplete` is set to `true`:
1. If it has `linkedKpiId` pointing to a monthly binary KPI
2. Auto-set the monthly KPI `isComplete = true` and `completedAt` to now

When a weekly binary KPI's `isComplete` is set back to `false` (undo):
1. If linked monthly KPI exists, check all other weekly KPIs linked to the same monthly KPI
2. If none are complete → revert monthly KPI to `isComplete = false`, `completedAt = null`
3. If at least one other weekly is still complete → monthly stays complete

### Monthly-Only KPIs

KPIs on monthly goals with no linked weekly KPIs have their `actualValue` manually entered. No auto-calculation.

### Yearly/Strategic KPIs

KPIs on yearly goals stand alone — no automatic linking from monthly KPIs. Manually updated.

## UI Design

### Goal Card Changes (`GoalCard.tsx`)

Add a small badge when a goal has KPIs:
- Format: `"3 KPIs · 65%"` (count + average progress across numeric KPIs)
- Badge visible inline on the goal card, doesn't expand the card height significantly
- Clicking the goal (or the badge) opens the KPI sidebar

### KPI Sidebar Panel (new: `KpiSidebar.tsx`)

- **Position:** Right side, 340px wide, opens alongside the goal tree
- **Layout:** Goal tree flex-shrinks to accommodate the sidebar
- **Header:** Goal level label (MONTHLY/WEEKLY/YEARLY) + goal title + close (X) button
- **Content:** Scrollable list of KPI cards

**Numeric KPI Card:**
- KPI name + percentage label (top right)
- Actual / Target display (large text, e.g., "$2,800 / $4,000")
- Progress bar (color-coded: green ≥70%, yellow 40-69%, red <40%)
- Weekly breakdown grid (if monthly KPI with linked weekly KPIs): W1: $900, W2: $1,100, W3: $800, W4: —
- Click on actual value to edit inline

**Binary KPI Card:**
- KPI name
- Status badge: "Complete" (green) or "Not Complete" (gray)
- Completion date if complete
- Toggle to mark complete

**Monthly-Only KPI Card:**
- Same as numeric card but with italic note "Monthly-only (no weekly breakdown)"
- Actual value is directly editable

**Footer:** "+ Add KPI" button opens KpiEditor modal

### KPI Editor Modal (new: `KpiEditor.tsx`)

Fields:
- **Name** (text input, required)
- **Type** (radio: Numeric / Binary)
- **Unit** (text input, shown only for Numeric — e.g., "$", "calls")
- **Target Value** (number input, shown only for Numeric)
- **Link to Monthly KPI** (dropdown, shown only for WEEKLY-level goals — lists KPIs from the parent monthly goal)

### Goal Stack Tree Layout (`GoalStackTree.tsx`)

- Wrap existing tree in a flex container
- When sidebar is open: tree takes `flex: 1`, sidebar takes `width: 340px`
- When sidebar is closed: tree takes full width
- Animate sidebar open/close with Framer Motion (slide in from right)

### YAML Import/Export Changes (`YamlImportExport.tsx`)

- Diff preview now shows KPI changes per goal: added KPIs, removed KPIs, modified KPIs (target/actual changes)
- KPI changes shown as a sub-section under each goal in the diff

## YAML Format

### Export Format

KPIs nest under each goal as a `kpis` array:

```yaml
strategic_goals:
  - title: "Scale to 12 Locations"
    kpis:
      - name: "Locations Opened"
        type: numeric
        unit: "locations"
        target: 12
        actual: 4
      - name: "Annual Revenue"
        type: numeric
        unit: "$"
        target: 8000000
        actual: 2100000
    monthly_goals:
      - title: "Grow Revenue Pipeline"
        kpis:
          - name: "Revenue"
            type: numeric
            unit: "$"
            target: 4000
          - name: "Calls Made"
            type: numeric
            unit: "calls"
            target: 60
          - name: "Launch Website"
            type: binary
          - name: "New Hires"
            type: numeric
            unit: "hires"
            target: 3
            actual: 1
        weekly_goals:
          - title: "Week of Mar 3"
            kpis:
              - name: "Revenue"
                type: numeric
                unit: "$"
                target: 1000
                actual: 900
                linked_to: "Revenue"
              - name: "Calls Made"
                type: numeric
                unit: "calls"
                target: 15
                actual: 12
                linked_to: "Calls Made"
              - name: "Launch Website"
                type: binary
                complete: true
                completed_at: "2026-03-14"
                linked_to: "Launch Website"
```

### Import Logic

1. Parse `kpis` arrays for each goal node
2. Create Kpi records after creating Goal records
3. Resolve `linked_to` references: match by KPI name on the parent monthly goal
4. If `linked_to` name doesn't match any monthly KPI → import warning (skip link, create standalone)
5. After all KPIs created, run recalculation for monthly KPIs with linked weekly KPIs

### Diff Engine Extension

`diffGoals()` extended to include:
```typescript
interface GoalDiff {
  added: GoalNode[];
  deleted: { id, title }[];
  modified: { id, title, changes: Record<field, {from, to}> }[];
  kpiChanges: {
    goalTitle: string;
    added: { name, type }[];
    removed: { name, type }[];
    modified: { name, changes: Record<field, {from, to}> }[];
  }[];
}
```

## API Endpoints

### `GET /api/goals/[id]/kpis`

Returns all KPIs for a goal. For monthly goals, includes `linkedWeeklyActuals` — the actual values from all linked weekly KPIs.

Response:
```json
{
  "kpis": [
    {
      "id": "...",
      "name": "Revenue",
      "type": "NUMERIC",
      "unit": "$",
      "targetValue": 4000,
      "actualValue": 2800,
      "linkedWeeklyActuals": [
        // weekLabel = "W" + ordinal position (sorted by linked weekly goal's dueDate or sortOrder)
        { "weekLabel": "W1", "actual": 900, "goalTitle": "Week of Mar 3" },
        { "weekLabel": "W2", "actual": 1100, "goalTitle": "Week of Mar 10" },
        { "weekLabel": "W3", "actual": 800, "goalTitle": "Week of Mar 17" },
        { "weekLabel": "W4", "actual": null, "goalTitle": "Week of Mar 24" }
      ]
    }
  ]
}
```

### `POST /api/goals/[id]/kpis`

Create a new KPI. Validates:
- Goal level is STRATEGIC, MONTHLY, or WEEKLY
- If `linkedKpiId` provided: goal must be WEEKLY and linked KPI must be on a MONTHLY goal that is the parent
- Type consistency between linked KPIs

### `PUT /api/kpis/[id]`

Update KPI fields. If `actualValue` or `isComplete` changes and KPI has `linkedKpiId`:
- Trigger recalculation cascade on linked monthly KPI
- Return updated monthly KPI in response for client-side cache update

### `DELETE /api/kpis/[id]`

Remove KPI. If it was linked, trigger recalculation on the former linked monthly KPI.

## Files to Modify

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add `Kpi` model, `KpiType` enum, relation on `Goal` |
| `src/lib/yaml-handler.ts` | Export/parse KPIs in YAML, extend diff engine |
| `src/lib/kpi-progress.ts` | New: recalculation logic for linked KPIs |
| `src/lib/goal-validation.ts` | Add KPI-level validation (STRATEGIC/MONTHLY/WEEKLY only) |
| `src/app/api/goals/[id]/kpis/route.ts` | New: GET/POST endpoints |
| `src/app/api/kpis/[id]/route.ts` | New: PUT/DELETE endpoints |
| `src/app/api/goals/import/route.ts` | Extend import to handle KPIs |
| `src/components/goals/GoalCard.tsx` | Add KPI badge chip |
| `src/components/goals/GoalStackTree.tsx` | Flex layout for sidebar |
| `src/components/goals/KpiSidebar.tsx` | New: sidebar panel component |
| `src/components/goals/KpiEditor.tsx` | New: KPI create/edit modal |
| `src/components/goals/KpiCard.tsx` | New: individual KPI display card |
| `src/components/goals/YamlImportExport.tsx` | Show KPI changes in diff preview |
| `src/types/index.ts` | Add KPI TypeScript types |

## Verification

1. **Database:** Run `npx prisma migrate dev` — verify Kpi table created with all fields and indexes
2. **YAML Export:** Export a stack with KPIs → verify YAML includes `kpis` arrays at correct nesting levels
3. **YAML Import:** Import YAML with KPIs → verify KPIs created, `linked_to` resolved correctly
4. **Sidebar UI:** Click a goal with KPIs → sidebar opens showing correct KPI cards
5. **Inline Edit:** Update a weekly KPI actual → verify monthly KPI recalculates
6. **Binary KPI:** Mark weekly binary KPI complete → verify linked monthly binary auto-completes
7. **Diff Preview:** Import YAML with KPI changes → verify diff shows added/removed/modified KPIs
8. **Edge Cases:** Goal with no KPIs → no badge, no sidebar KPI section; monthly KPI with no linked weeklies → shows as monthly-only
