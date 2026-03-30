# Tasks Page Polish — Design Spec
**Date:** 2026-03-30
**Status:** Approved

## Context

Three UX issues reported from `/tasks`:

1. **Review and React task types use near-identical colors** (amber vs yellow) — visually confusing in QuickAddMenu borders, task type badges, and section headers.
2. **AIM instances don't appear** on the tasks page despite being scheduled — caused by a timezone mismatch in the date range query and the AIMs section rendering below the fold.
3. **Two competing "create task" entry points** — the QuickAddMenu (dashboard-style navigation menu) and a separate "New Task" modal button coexist, creating inconsistency. User wants only the QuickAddMenu.

---

## Change 1: Review Color — Amber → Rose

**File:** `goal-dashboard/src/lib/prism-colors.ts`

Replace the REVIEW color entry with rose to make it visually distinct from REACT (yellow):

```ts
REVIEW: {
  color: '#fb7185',
  emoji: '📋',
  bg: 'rgba(251,113,133,0.15)',
  border: '#fb7185',
  textClass: 'text-rose-400',
  bgClass: 'bg-rose-500/15',
  borderClass: 'border-rose-500/40',
  label: 'Review',
},
```

**Why rose:** Completely distinct from yellow (React), unused by any other type, and semantically appropriate for reflection/review. The change propagates automatically to all color consumers (QuickAddMenu, DailyTaskList headers, TaskCard badges, AgendaView) since all go through `PRISM_COLORS`.

---

## Change 2: AIM Instances Visibility

**File:** `goal-dashboard/src/app/(app)/tasks/page.tsx`

### 2a — Timezone-safe date range query

Current SWR key builds URL with bare local datetime strings (e.g., `2026-03-29T00:00:00`) which Node.js parses as server-local time. If instances were created using UTC-midnight (from a date-only string like `new Date("2026-03-29")`), the range comparison may fail.

Fix: convert local midnight / end-of-day to UTC ISO strings:

```ts
// In aimRangeKey useMemo, day view branch:
const localStart = new Date(date + 'T00:00:00');
const localEnd = new Date(date + 'T23:59:59.999');
return `/api/aims/instances?start=${localStart.toISOString()}&end=${localEnd.toISOString()}`;
```

Apply the same UTC conversion for week and month view branches.

### 2b — Move AIMs section inside the main task column

Currently the AIMs section renders after the 3-column grid (`</div>`) — below the fold on most screens. Move it inside the `lg:col-span-2` task column, directly below the task list content, so it's always visible without scrolling.

---

## Change 3: Remove "New Task" Button

**File:** `goal-dashboard/src/app/(app)/tasks/page.tsx`

Remove the indigo "New Task" button from the page header (lines ~205–212). The `<QuickAddMenu />` directly above it is already the same component used on the dashboard and provides the correct navigation-menu creation experience.

**Preserve:** Keep `showEditor`, `editingTask`, `handleEdit`, and the `<TaskEditor>` modal — these are still needed for editing existing tasks (triggered via TaskCard's edit button). Only the "create new" trigger from the header button is removed.

---

## Verification

1. **Color:** Open `/tasks` and QuickAddMenu — REVIEW should show pink/rose, clearly distinct from REACT yellow.
2. **AIMs:** Navigate to a date with scheduled AIM instances — the AIMs section should appear within the main task column, not below the fold. Checkbox toggles should update status immediately.
3. **Create button:** Header should show only "Quick Add" button — clicking it opens the navigation menu (same as dashboard). No "New Task" button visible.
