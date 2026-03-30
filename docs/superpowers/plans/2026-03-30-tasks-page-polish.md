# Tasks Page Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three UX issues on the Tasks page — differentiate Review/React colors, surface AIM instances, and unify task creation to use QuickAddMenu only.

**Architecture:** Three isolated changes touching 2 core files (`prism-colors.ts`, `tasks/page.tsx`) and 2 files with hardcoded color overrides (`DailyTaskList.tsx`, `InlineCalendar.tsx`). All changes are independent and can be committed separately.

**Tech Stack:** Next.js 14 (App Router), React, SWR, Tailwind CSS, Prisma

---

### Task 1: Change REVIEW color from amber to rose in prism-colors.ts

**Files:**
- Modify: `goal-dashboard/src/lib/prism-colors.ts:82-91`

- [ ] **Step 1: Update the REVIEW entry**

In `goal-dashboard/src/lib/prism-colors.ts`, replace the REVIEW block (lines 82-91):

```ts
// OLD
  REVIEW: {
    color: '#f59e0b',
    emoji: '📋',
    bg: 'rgba(245,158,11,0.15)',
    border: '#f59e0b',
    textClass: 'text-amber-400',
    bgClass: 'bg-amber-500/15',
    borderClass: 'border-amber-500/40',
    label: 'Review',
  },

// NEW
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

- [ ] **Step 2: Commit**

```bash
git add goal-dashboard/src/lib/prism-colors.ts
git commit -m "style: change REVIEW color from amber to rose for visual distinction from REACT"
```

---

### Task 2: Fix hardcoded REVIEW amber references

Two files use hardcoded amber classes for REVIEW instead of reading from `PRISM_COLORS`. Update both to rose.

**Files:**
- Modify: `goal-dashboard/src/components/tasks/DailyTaskList.tsx:13`
- Modify: `goal-dashboard/src/components/calendar/InlineCalendar.tsx:204`

- [ ] **Step 1: Update DailyTaskList.tsx**

In `goal-dashboard/src/components/tasks/DailyTaskList.tsx`, line 13, change:

```ts
// OLD
  { key: 'REVIEW', label: 'Review', color: 'text-amber-400' },

// NEW
  { key: 'REVIEW', label: 'Review', color: 'text-rose-400' },
```

- [ ] **Step 2: Update InlineCalendar.tsx**

In `goal-dashboard/src/components/calendar/InlineCalendar.tsx`, line 204, change:

```ts
// OLD
    review: 'bg-amber-500',

// NEW
    review: 'bg-rose-500',
```

- [ ] **Step 3: Verify visually**

Run: `npm run dev` (if not already running)
Open: `http://localhost:3000/tasks`
Check: REVIEW sections/badges show rose/pink, clearly distinct from REACT's yellow.

- [ ] **Step 4: Commit**

```bash
git add goal-dashboard/src/components/tasks/DailyTaskList.tsx goal-dashboard/src/components/calendar/InlineCalendar.tsx
git commit -m "style: update hardcoded REVIEW amber refs to rose in DailyTaskList and InlineCalendar"
```

---

### Task 3: Fix AIM instances timezone query on Tasks page

**Files:**
- Modify: `goal-dashboard/src/app/(app)/tasks/page.tsx:66-78`

The current SWR key sends bare local datetime strings (e.g., `2026-03-30T00:00:00`) as query params. The API parses them with `new Date()`, which treats strings without a timezone offset as local time on the server. But AIM instances are often stored with UTC-midnight `scheduledDate` (created from date-only strings). This mismatch causes instances to fall outside the query range for users in US timezones.

Fix: convert local start/end to UTC ISO strings using `.toISOString()`.

- [ ] **Step 1: Update the aimRangeKey useMemo**

In `goal-dashboard/src/app/(app)/tasks/page.tsx`, replace the `aimRangeKey` useMemo (lines 66-78):

```ts
// OLD
  const aimRangeKey = useMemo(() => {
    const d = new Date(date + 'T00:00:00');
    if (viewMode === 'day') {
      return `/api/aims/instances?start=${date}T00:00:00&end=${date}T23:59:59`;
    }
    if (viewMode === 'week') {
      return `/api/aims/instances?start=${toDateStr(getWeekStart(d))}T00:00:00&end=${toDateStr(getWeekEnd(d))}T23:59:59`;
    }
    if (viewMode === 'month') {
      return `/api/aims/instances?start=${toDateStr(getFirstOfMonth(d))}T00:00:00&end=${toDateStr(getLastOfMonth(d))}T23:59:59`;
    }
    return `/api/aims/instances?start=${date}T00:00:00&end=${date}T23:59:59`;
  }, [date, viewMode]);

// NEW
  const aimRangeKey = useMemo(() => {
    const d = new Date(date + 'T00:00:00');
    let rangeStart: Date;
    let rangeEnd: Date;
    if (viewMode === 'week') {
      rangeStart = new Date(toDateStr(getWeekStart(d)) + 'T00:00:00');
      rangeEnd = new Date(toDateStr(getWeekEnd(d)) + 'T23:59:59.999');
    } else if (viewMode === 'month') {
      rangeStart = new Date(toDateStr(getFirstOfMonth(d)) + 'T00:00:00');
      rangeEnd = new Date(toDateStr(getLastOfMonth(d)) + 'T23:59:59.999');
    } else {
      // day + agenda fallback
      rangeStart = new Date(date + 'T00:00:00');
      rangeEnd = new Date(date + 'T23:59:59.999');
    }
    return `/api/aims/instances?start=${rangeStart.toISOString()}&end=${rangeEnd.toISOString()}`;
  }, [date, viewMode]);
```

- [ ] **Step 2: Verify the API returns data**

Open browser devtools Network tab, navigate to `/tasks` on a day with AIM instances scheduled. Confirm the `/api/aims/instances?start=...&end=...` request returns a non-empty JSON array. The timestamps in the URL should now end with `Z` (UTC).

- [ ] **Step 3: Commit**

```bash
git add goal-dashboard/src/app/(app)/tasks/page.tsx
git commit -m "fix: use UTC ISO strings for AIM instances date range query to fix timezone mismatch"
```

---

### Task 4: Move AIMs section inside the main task column

**Files:**
- Modify: `goal-dashboard/src/app/(app)/tasks/page.tsx:358-400`

The AIMs section currently renders after the 3-column grid, below the fold. Move it inside the `lg:col-span-2` task column so it appears directly below the task list.

- [ ] **Step 1: Cut the AIMs section from its current location**

In `goal-dashboard/src/app/(app)/tasks/page.tsx`, remove the entire block from line 358 (`{/* AIMs Section */}`) through line 400 (closing `</div>` and `)}` of the conditional).

- [ ] **Step 2: Paste it inside the lg:col-span-2 div, after the task list content**

Insert the AIMs section just before the closing `</div>` of the `lg:col-span-2` div (currently line 331). The result should look like:

```tsx
        {/* Task list area */}
        <div className="lg:col-span-2">
          {viewMode === 'agenda' ? (
            <AgendaView
              onEdit={handleEdit}
              onDelete={handleDelete}
              onClick={handleTaskClick}
              onStatusChange={() => mutateRange()}
            />
          ) : viewMode === 'day' ? (
            /* Day view: single DailyTaskList */
            <DailyTaskList
              date={date}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onClick={handleTaskClick}
              onStatusChange={() => mutateRange()}
            />
          ) : rangeLoading ? (
            <div className="text-[var(--text-muted)] text-sm py-4">Loading tasks...</div>
          ) : (
            /* Week / Month view: grouped by date */
            <div className="space-y-6">
              {dateKeys.length === 0 ? (
                <div className="glass-panel p-8 text-center">
                  <p className="text-[var(--text-muted)] text-sm">No tasks in this {viewMode}</p>
                </div>
              ) : (
                dateKeys.map((dateKey) => {
                  const dayTasks = groupedByDate[dateKey] || [];
                  const isToday = dateKey === today;
                  return (
                    <div key={dateKey}>
                      <div className={`mb-2 flex items-center gap-2 text-sm font-semibold ${
                        isToday ? 'text-indigo-400' : 'text-[var(--text-secondary)]'
                      }`}>
                        <span>{formatDateLabel(dateKey)}</span>
                        {isToday && (
                          <span className="rounded bg-indigo-600/20 px-2 py-0.5 text-xs text-indigo-400 border border-indigo-600/30">
                            Today
                          </span>
                        )}
                        <span className="text-xs text-[var(--text-muted)]">({dayTasks.length})</span>
                      </div>
                      <DailyTaskList
                        date={dateKey}
                        prefetchedTasks={dayTasks}
                        onEdit={handleEdit}
                        onDelete={handleDelete}
                        onClick={handleTaskClick}
                        onStatusChange={() => mutateRange()}
                      />
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* AIMs Section */}
          {aimInstances.length > 0 && (
            <div className="mt-6">
              <h2 className={`text-sm font-semibold mb-3 flex items-center gap-1.5 ${PRISM_COLORS.AIM.textClass}`}>
                <span>{PRISM_COLORS.AIM.emoji}</span> AIMs
                <span className="text-xs text-[var(--text-muted)] font-normal">({aimInstances.length})</span>
              </h2>
              <div className="space-y-2">
                {aimInstances.map((aim: any) => (
                  <div
                    key={aim.id}
                    className="glass-panel p-3 flex items-center gap-3"
                  >
                    <input
                      type="checkbox"
                      checked={aim.status === 'COMPLETED'}
                      onChange={async () => {
                        await fetch(`/api/aims/instances/${aim.id}`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ status: aim.status === 'COMPLETED' ? 'SCHEDULED' : 'COMPLETED' }),
                        });
                        mutateAims();
                      }}
                      className="h-5 w-5 rounded border-[var(--border-color)] bg-[var(--input-bg)] text-teal-600 focus:ring-teal-500"
                    />
                    <div className="flex-1">
                      <span className={`text-sm font-medium ${aim.status === 'COMPLETED' ? 'text-gray-500 line-through' : 'text-[var(--text-primary)]'}`}>
                        {aim.aimCategory?.name ?? 'AIM'}
                        {aim.selectedActivity && ` — ${aim.selectedActivity}`}
                      </span>
                    </div>
                    {aim.timeBlockStart && aim.timeBlockEnd && (
                      <span className={`text-xs rounded px-2 py-0.5 ${PRISM_COLORS.AIM.bgClass} ${PRISM_COLORS.AIM.textClass}`}>
                        {new Date(aim.timeBlockStart).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}–
                        {new Date(aim.timeBlockEnd).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
```

- [ ] **Step 3: Verify visually**

Open `/tasks` — AIMs section should now appear inside the main column, directly below task sections, not below the detail panel.

- [ ] **Step 4: Commit**

```bash
git add goal-dashboard/src/app/(app)/tasks/page.tsx
git commit -m "fix: move AIMs section inside main task column for better visibility"
```

---

### Task 5: Remove "New Task" button from Tasks page header

**Files:**
- Modify: `goal-dashboard/src/app/(app)/tasks/page.tsx:205-211`

- [ ] **Step 1: Remove the "New Task" button**

In `goal-dashboard/src/app/(app)/tasks/page.tsx`, remove the button element (lines 205-211):

```tsx
// REMOVE THIS:
          <button
            onClick={() => { setEditingTask(null); setShowEditor(true); }}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 transition-colors"
          >
            <Plus className="h-4 w-4" />
            New Task
          </button>
```

- [ ] **Step 2: Remove unused Plus import**

In the import line (line 5), remove `Plus` from the lucide-react import since no other element uses it:

```ts
// OLD
import { ListTodo, Plus, ChevronLeft, ChevronRight, CalendarRange } from 'lucide-react';

// NEW
import { ListTodo, ChevronLeft, ChevronRight, CalendarRange } from 'lucide-react';
```

- [ ] **Step 3: Verify**

Open `/tasks` — header should show only the "Tasks" title and the QuickAddMenu button (with the + icon). No "New Task" button should be visible. Clicking QuickAddMenu opens the same navigation menu as the dashboard.

Verify editing still works: click a task's edit icon — the TaskEditor modal should still open correctly.

- [ ] **Step 4: Commit**

```bash
git add goal-dashboard/src/app/(app)/tasks/page.tsx
git commit -m "fix: remove New Task button, keep only QuickAddMenu for task creation consistency"
```
