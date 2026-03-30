# Reactive Tasks List Page

**Date:** 2026-03-30
**Status:** Approved

## Problem

The `/reactive-tasks/new` page allows creating reactive tasks, but there is no dedicated place to view and manage active reactive tasks. They only appear mixed into the general `/tasks` page. Users need a purpose-built page to see, filter, and act on their reactive tasks.

## Approach

Standalone list page at `/reactive-tasks` (Approach A). Clean separation from the date-centric `/tasks` page. Reuses the existing `TaskEditor` modal and `GET /api/tasks` endpoint.

---

## 1. Page Structure & Routing

**New route:** `/reactive-tasks` → `src/app/(app)/reactive-tasks/page.tsx`

**Layout:**
- Header: "Reactive Tasks" title with Zap icon + "Create New" button linking to `/reactive-tasks/new`
- Filter/sort toolbar below header
- Task list below toolbar
- Empty state when no active reactive tasks exist

**Sidebar change:** Update nav link from `/reactive-tasks/new` to `/reactive-tasks` in `src/components/layout/Sidebar.tsx`.

**Post-creation redirect:** In `/reactive-tasks/new/page.tsx`, change `router.push('/tasks')` to `router.push('/reactive-tasks')`.

## 2. Data Fetching & Filtering

**API:** Existing `GET /api/tasks?taskType=REACT` — no date filter, fetches all reactive tasks regardless of due date.

**Client-side filtering and sorting** (dataset is manageable size):
- **Search:** Text input filtering by title
- **Priority:** Dropdown — All / Urgent / High / Medium / Low
- **Status:** Dropdown — Active (TODO + IN_PROGRESS, default) / All / TODO / IN_PROGRESS / Done / Dropped
- **Sort:** Dropdown — Priority (default) / Due Date / Newest First

**Data layer:** `useSWR` for caching and revalidation, consistent with the rest of the app.

## 3. Task List & Actions

**Task card layout (each row):**
- Left: Color-coded priority badge (red=Urgent, orange=High, blue=Medium, green=Low)
- Title (clickable to expand details)
- Owner name (small text)
- Due date with relative time (e.g. "Mar 31 — tomorrow")
- Right side: Quick action buttons

**Expandable detail panel (inline, on title click):**
- Full CARS description
- Attachments (if any)
- Comment count

**Actions per task:**
- **Quick complete:** Checkmark button → `PATCH /api/tasks/[id]` with `{ status: 'DONE' }`
- **Status toggle:** Click status badge to cycle TODO ↔ IN_PROGRESS
- **Edit:** Opens existing `TaskEditor` modal (reused from `/tasks` page)
- **Drop:** Sets status to DROPPED, with confirmation prompt

**Empty state:** "No active reactive tasks" message with CTA button to create one.

## 4. Files to Change

| File | Change |
|------|--------|
| `src/app/(app)/reactive-tasks/page.tsx` | **New file** — list page |
| `src/components/layout/Sidebar.tsx` | Update nav href from `/reactive-tasks/new` to `/reactive-tasks` |
| `src/app/(app)/reactive-tasks/new/page.tsx` | Change post-creation redirect to `/reactive-tasks` |

## 5. Non-Goals

- No new API endpoints — existing `GET /api/tasks` and `PATCH /api/tasks/[id]` are sufficient
- No changes to the data model
- No changes to the general `/tasks` page
- No server-side filtering (client-side is sufficient for reactive task volume)
