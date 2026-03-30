# Reactive Tasks List Page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dedicated list page at `/reactive-tasks` to view, filter, and act on all reactive tasks, with inline status changes, expandable CARS details, and edit via the existing TaskEditor modal.

**Architecture:** Single new page component fetches from existing `GET /api/tasks?taskType=REACT`. Client-side filtering/sorting. Reuses `TaskEditor` modal for editing. Two small touch-ups to existing files (sidebar link, post-creation redirect).

**Tech Stack:** Next.js App Router, React, SWR, Tailwind CSS, lucide-react icons, framer-motion (via existing TaskEditor)

---

## File Structure

| File | Role |
|------|------|
| `src/app/(app)/reactive-tasks/page.tsx` | **Create** — List page with data fetching, filters, task cards, inline actions |
| `src/components/layout/Sidebar.tsx` | **Modify** line 35 — Change href from `/reactive-tasks/new` to `/reactive-tasks` |
| `src/app/(app)/reactive-tasks/new/page.tsx` | **Modify** line 125 — Change redirect from `/tasks` to `/reactive-tasks` |

---

### Task 1: Update Sidebar Navigation Link

**Files:**
- Modify: `src/components/layout/Sidebar.tsx:35`

- [ ] **Step 1: Change the sidebar href**

In `src/components/layout/Sidebar.tsx`, line 35, change:

```tsx
{ href: '/reactive-tasks/new', label: 'Reactive Tasks', icon: Zap },
```

to:

```tsx
{ href: '/reactive-tasks', label: 'Reactive Tasks', icon: Zap },
```

- [ ] **Step 2: Verify the sidebar renders**

Run the dev server and confirm "Reactive Tasks" in the sidebar now links to `/reactive-tasks`. Since the page doesn't exist yet, expect a 404 — that's fine.

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/Sidebar.tsx
git commit -m "feat: update sidebar reactive tasks link to list page"
```

---

### Task 2: Update Post-Creation Redirect

**Files:**
- Modify: `src/app/(app)/reactive-tasks/new/page.tsx:125`

- [ ] **Step 1: Change the redirect target**

In `src/app/(app)/reactive-tasks/new/page.tsx`, line 125, change:

```tsx
router.push('/tasks');
```

to:

```tsx
router.push('/reactive-tasks');
```

- [ ] **Step 2: Commit**

```bash
git add src/app/(app)/reactive-tasks/new/page.tsx
git commit -m "feat: redirect to reactive tasks list after creation"
```

---

### Task 3: Create the Reactive Tasks List Page

**Files:**
- Create: `src/app/(app)/reactive-tasks/page.tsx`

- [ ] **Step 1: Create the page file with full implementation**

Create `src/app/(app)/reactive-tasks/page.tsx` with the following content:

```tsx
'use client';

import { useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { Zap, Plus, Check, Search, ChevronDown, ChevronRight, X, Pencil, MessageSquare } from 'lucide-react';
import { TaskEditor } from '@/components/tasks/TaskEditor';
import { getLocalDateString } from '@/lib/date-utils';

type Task = {
  id: string;
  title: string;
  description: string | null;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  status: 'TODO' | 'IN_PROGRESS' | 'DONE' | 'DROPPED';
  dueDate: string | null;
  ownerId: string;
  assigneeId: string | null;
  createdAt: string;
  taskType: string;
  goal: { id: string; title: string; level: string } | null;
  processExecution: { process: { title: string } } | null;
  _count: { comments: number };
};

type FilterPriority = 'ALL' | 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW';
type FilterStatus = 'ACTIVE' | 'ALL' | 'TODO' | 'IN_PROGRESS' | 'DONE' | 'DROPPED';
type SortOption = 'PRIORITY' | 'DUE_DATE' | 'NEWEST';

const PRIORITY_ORDER: Record<string, number> = { URGENT: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };

const PRIORITY_BADGE: Record<string, { classes: string; label: string }> = {
  URGENT: { classes: 'bg-red-600/15 text-red-400 border-red-600/30', label: 'Urgent' },
  HIGH: { classes: 'bg-orange-600/15 text-orange-400 border-orange-600/30', label: 'High' },
  MEDIUM: { classes: 'bg-blue-600/15 text-blue-400 border-blue-600/30', label: 'Medium' },
  LOW: { classes: 'bg-green-600/15 text-green-400 border-green-600/30', label: 'Low' },
};

const STATUS_BADGE: Record<string, { classes: string; label: string }> = {
  TODO: { classes: 'bg-gray-600/15 text-gray-400 border-gray-600/30', label: 'To Do' },
  IN_PROGRESS: { classes: 'bg-blue-600/15 text-blue-400 border-blue-600/30', label: 'In Progress' },
  DONE: { classes: 'bg-green-600/15 text-green-400 border-green-600/30', label: 'Done' },
  DROPPED: { classes: 'bg-red-600/15 text-red-400 border-red-600/30', label: 'Dropped' },
};

function formatRelativeDate(dateStr: string): string {
  const today = getLocalDateString();
  const tomorrow = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return getLocalDateString(d);
  })();
  const taskDate = dateStr.split('T')[0];
  const display = new Date(taskDate + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });

  if (taskDate === today) return `${display} — today`;
  if (taskDate === tomorrow) return `${display} — tomorrow`;

  const now = new Date();
  const due = new Date(taskDate + 'T23:59:59');
  if (due < now) {
    const daysAgo = Math.ceil((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
    return `${display} — ${daysAgo}d overdue`;
  }
  const daysLeft = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return `${display} — ${daysLeft}d left`;
}

export default function ReactiveTasksPage() {
  const { data: tasks, mutate } = useSWR<Task[]>('/api/tasks?taskType=REACT');
  const [search, setSearch] = useState('');
  const [filterPriority, setFilterPriority] = useState<FilterPriority>('ALL');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('ACTIVE');
  const [sortBy, setSortBy] = useState<SortOption>('PRIORITY');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!tasks) return [];
    return tasks
      .filter((t) => {
        if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
        if (filterPriority !== 'ALL' && t.priority !== filterPriority) return false;
        if (filterStatus === 'ACTIVE' && (t.status === 'DONE' || t.status === 'DROPPED')) return false;
        if (filterStatus !== 'ALL' && filterStatus !== 'ACTIVE' && t.status !== filterStatus) return false;
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'PRIORITY') return (PRIORITY_ORDER[b.priority] ?? 0) - (PRIORITY_ORDER[a.priority] ?? 0);
        if (sortBy === 'DUE_DATE') {
          if (!a.dueDate && !b.dueDate) return 0;
          if (!a.dueDate) return 1;
          if (!b.dueDate) return -1;
          return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
        }
        // NEWEST
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [tasks, search, filterPriority, filterStatus, sortBy]);

  const updateTask = useCallback(async (id: string, data: Record<string, unknown>) => {
    setUpdatingId(id);
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) mutate();
    } finally {
      setUpdatingId(null);
    }
  }, [mutate]);

  const handleStatusToggle = useCallback((task: Task) => {
    const nextStatus = task.status === 'TODO' ? 'IN_PROGRESS' : 'TODO';
    updateTask(task.id, { status: nextStatus });
  }, [updateTask]);

  const handleComplete = useCallback((task: Task) => {
    updateTask(task.id, { status: 'DONE' });
  }, [updateTask]);

  const handleDrop = useCallback((task: Task) => {
    if (confirm('Drop this task? This marks it as abandoned.')) {
      updateTask(task.id, { status: 'DROPPED' });
    }
  }, [updateTask]);

  const selectClass = 'rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-2 py-1.5 text-xs text-[var(--text-primary)] focus:border-indigo-500 focus:outline-none';

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-[var(--text-primary)] flex items-center gap-2">
            <Zap className="h-6 w-6 text-yellow-400" />
            Reactive Tasks
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Respond to incoming requests
          </p>
        </div>
        <Link
          href="/reactive-tasks/new"
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition-all hover:brightness-110"
          style={{ background: 'var(--prism-gradient)' }}
        >
          <Plus className="h-4 w-4" />
          Create New
        </Link>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-muted)]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tasks..."
            className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] pl-9 pr-3 py-1.5 text-sm text-[var(--text-primary)] focus:border-indigo-500 focus:outline-none"
          />
        </div>
        <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value as FilterPriority)} className={selectClass}>
          <option value="ALL">All Priorities</option>
          <option value="URGENT">Urgent</option>
          <option value="HIGH">High</option>
          <option value="MEDIUM">Medium</option>
          <option value="LOW">Low</option>
        </select>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as FilterStatus)} className={selectClass}>
          <option value="ACTIVE">Active</option>
          <option value="ALL">All</option>
          <option value="TODO">To Do</option>
          <option value="IN_PROGRESS">In Progress</option>
          <option value="DONE">Done</option>
          <option value="DROPPED">Dropped</option>
        </select>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortOption)} className={selectClass}>
          <option value="PRIORITY">Sort: Priority</option>
          <option value="DUE_DATE">Sort: Due Date</option>
          <option value="NEWEST">Sort: Newest</option>
        </select>
      </div>

      {/* Task List */}
      {!tasks ? (
        <div className="text-center py-12 text-[var(--text-muted)]">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <Zap className="h-10 w-10 mx-auto mb-3 text-[var(--text-muted)]" />
          <p className="text-[var(--text-secondary)] mb-4">No active reactive tasks</p>
          <Link
            href="/reactive-tasks/new"
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition-all hover:brightness-110"
            style={{ background: 'var(--prism-gradient)' }}
          >
            <Plus className="h-4 w-4" />
            Create One
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((task) => {
            const isExpanded = expandedId === task.id;
            const isUpdating = updatingId === task.id;
            const priorityBadge = PRIORITY_BADGE[task.priority] ?? PRIORITY_BADGE.MEDIUM;
            const statusBadge = STATUS_BADGE[task.status] ?? STATUS_BADGE.TODO;
            const isDone = task.status === 'DONE' || task.status === 'DROPPED';

            return (
              <div
                key={task.id}
                className={`rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] transition-colors ${isUpdating ? 'opacity-60' : ''}`}
              >
                {/* Main Row */}
                <div className="flex items-center gap-3 px-4 py-3">
                  {/* Quick Complete */}
                  {!isDone && (
                    <button
                      onClick={() => handleComplete(task)}
                      className="flex-shrink-0 h-5 w-5 rounded border border-[var(--border-color)] text-[var(--text-muted)] hover:border-green-500 hover:text-green-400 transition-colors flex items-center justify-center"
                      title="Mark as done"
                    >
                      <Check className="h-3 w-3" />
                    </button>
                  )}
                  {isDone && (
                    <div className="flex-shrink-0 h-5 w-5 rounded bg-green-600/20 border border-green-600/40 flex items-center justify-center">
                      <Check className="h-3 w-3 text-green-400" />
                    </div>
                  )}

                  {/* Priority Badge */}
                  <span className={`flex-shrink-0 inline-flex items-center rounded px-2 py-0.5 text-[10px] font-medium border ${priorityBadge.classes}`}>
                    {priorityBadge.label}
                  </span>

                  {/* Title + expand toggle */}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : task.id)}
                    className={`flex-1 text-left text-sm font-medium transition-colors ${isDone ? 'line-through text-[var(--text-muted)]' : 'text-[var(--text-primary)] hover:text-indigo-400'}`}
                  >
                    <span className="flex items-center gap-1.5">
                      {isExpanded ? <ChevronDown className="h-3.5 w-3.5 flex-shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 flex-shrink-0" />}
                      {task.title}
                    </span>
                  </button>

                  {/* Status Badge (clickable to toggle) */}
                  {!isDone ? (
                    <button
                      onClick={() => handleStatusToggle(task)}
                      className={`flex-shrink-0 inline-flex items-center rounded px-2 py-0.5 text-[10px] font-medium border cursor-pointer hover:brightness-125 transition-all ${statusBadge.classes}`}
                      title={`Click to switch to ${task.status === 'TODO' ? 'In Progress' : 'To Do'}`}
                    >
                      {statusBadge.label}
                    </button>
                  ) : (
                    <span className={`flex-shrink-0 inline-flex items-center rounded px-2 py-0.5 text-[10px] font-medium border ${statusBadge.classes}`}>
                      {statusBadge.label}
                    </span>
                  )}

                  {/* Due Date */}
                  {task.dueDate && (
                    <span className={`flex-shrink-0 text-xs ${
                      new Date(task.dueDate) < new Date() && !isDone
                        ? 'text-red-400 font-medium'
                        : 'text-[var(--text-muted)]'
                    }`}>
                      {formatRelativeDate(task.dueDate)}
                    </span>
                  )}

                  {/* Comment count */}
                  {task._count.comments > 0 && (
                    <span className="flex-shrink-0 flex items-center gap-1 text-xs text-[var(--text-muted)]">
                      <MessageSquare className="h-3 w-3" />
                      {task._count.comments}
                    </span>
                  )}

                  {/* Edit button */}
                  <button
                    onClick={() => setEditingTask(task)}
                    className="flex-shrink-0 p-1 rounded text-[var(--text-muted)] hover:text-indigo-400 hover:bg-[var(--hover-bg)] transition-colors"
                    title="Edit task"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>

                  {/* Drop button */}
                  {!isDone && (
                    <button
                      onClick={() => handleDrop(task)}
                      className="flex-shrink-0 p-1 rounded text-[var(--text-muted)] hover:text-red-400 hover:bg-[var(--hover-bg)] transition-colors"
                      title="Drop task"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {/* Expanded Detail Panel */}
                {isExpanded && (
                  <div className="px-4 pb-4 pt-1 border-t border-[var(--border-color)]">
                    {task.description ? (
                      <pre className="whitespace-pre-wrap text-sm text-[var(--text-secondary)] font-sans leading-relaxed">
                        {task.description}
                      </pre>
                    ) : (
                      <p className="text-sm text-[var(--text-muted)] italic">No description provided</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* TaskEditor Modal */}
      {editingTask && (
        <TaskEditor
          task={editingTask}
          onSave={() => {
            setEditingTask(null);
            mutate();
          }}
          onClose={() => setEditingTask(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify the page renders**

Open `http://localhost:3000/reactive-tasks` in the browser. Confirm:
- Header shows "Reactive Tasks" with Zap icon and "Create New" button
- Filter toolbar renders with search, priority, status, and sort dropdowns
- If reactive tasks exist, they appear as cards with priority badges, titles, status badges, dates
- If no reactive tasks exist, empty state shows with "Create One" button
- Clicking "Create New" navigates to `/reactive-tasks/new`

- [ ] **Step 3: Test task actions**

Test each action on an existing reactive task (create one via `/reactive-tasks/new` first if needed):
- Click the checkmark to complete a task — it should show as done with strikethrough
- Click the status badge to toggle between TODO and IN_PROGRESS
- Click the chevron/title to expand and see the CARS description
- Click the pencil icon to open the TaskEditor modal — make an edit, save, confirm list refreshes
- Click the X icon to drop a task — confirm the confirmation dialog appears, then confirm the task is marked as dropped

- [ ] **Step 4: Test filtering and sorting**

- Type in the search box — only matching titles should show
- Change priority dropdown — only tasks of that priority should show
- Change status to "All" — done and dropped tasks should appear
- Change status to "Done" — only completed tasks should show
- Change sort to "Due Date" — tasks should reorder by due date ascending
- Change sort to "Newest" — tasks should show newest first

- [ ] **Step 5: Test sidebar navigation**

- Click "Reactive Tasks" in the sidebar — should navigate to `/reactive-tasks`
- The sidebar item should highlight when on `/reactive-tasks`
- Create a new task via the form — after creation, should redirect back to `/reactive-tasks`

- [ ] **Step 6: Commit**

```bash
git add src/app/(app)/reactive-tasks/page.tsx
git commit -m "feat: add reactive tasks list page with filters, sorting, and inline actions"
```

---

### Task 4: Final Verification

- [ ] **Step 1: Full flow test**

1. Navigate to `/reactive-tasks` via sidebar
2. Click "Create New" to go to form
3. Fill out form and submit
4. Confirm redirect back to `/reactive-tasks`
5. Verify new task appears in the list
6. Expand the task to see CARS description
7. Toggle status, then mark complete
8. Switch filter to "All" to see completed task
9. Confirm no console errors throughout

- [ ] **Step 2: Commit any fixes if needed**

```bash
git add -A
git commit -m "fix: reactive tasks list page polish"
```
