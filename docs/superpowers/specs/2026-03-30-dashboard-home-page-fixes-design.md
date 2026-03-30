# Dashboard Home Page Fixes — Design Spec

**Date**: 2026-03-30
**Scope**: 2 files, 5 targeted edits

## Overview

Five dashboard changes requested. After codebase exploration, only **2 require code changes** — the other 3 are already implemented in the working tree.

---

## Change 1 — Remove Progress Bar

**Status**: Already removed in working tree. No code change needed.

The `"X/Y tasks done — keep going!"` progress bar (committed version `page.tsx` ~L373–398) has been deleted from the working tree. This removal is confirmed and final.

**Verification**: Search `page.tsx` for `keep going` — zero results.

---

## Change 2 — Verify React Tasks Sub-category

**Status**: Already implemented. No code change needed.

`groupedTasks` in `page.tsx` includes `REACT: []` as an explicit key (L248–264). The render loop at L515 iterates `Object.entries(groupedTasks)` and renders all types including React. `PRISM_COLORS.REACT` is defined in `src/lib/prism-colors.ts` as `{ emoji: '⚡', label: 'React' }`. Empty state shows "No react tasks".

---

## Change 3 — Verify AIMs Sub-category with Checkboxes (Daily View)

**Status**: Already implemented. No code change needed.

Daily view renders AIMs at L554–638 of `page.tsx` under a `💪 AIMs Today` heading. Each AIM has a checkbox button with optimistic updates via `mutateAims(asyncFn, { optimisticData, rollbackOnError: true })`. Phase badges, streaks, and selected activities are displayed.

---

## Change 4 — Fix Weekly View AIM Checkbox Performance

**Status**: Code change required.

**File**: `src/app/(app)/page.tsx` ~L449–456

### Problem

The weekly view AIM checkbox uses a blocking pattern:

```tsx
onChange={async () => {
  await fetch(`/api/aims/instances/${aim.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: aim.status === 'COMPLETED' ? 'SCHEDULED' : 'COMPLETED' }),
  });
  mutateAims();
}}
```

The UI waits for the full server round-trip (which includes phase graduation, streak updates, and points calculation) before visually toggling the checkbox. On production this can take seconds.

### Solution

Convert to the same optimistic update pattern used in the daily view:

```tsx
onChange={() => {
  const newStatus = aim.status === 'COMPLETED' ? 'SCHEDULED' : 'COMPLETED';
  mutateAims(
    async (currentData: DashboardAimInstance[] | undefined) => {
      await fetch(`/api/aims/instances/${aim.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      return (Array.isArray(currentData) ? currentData : []).map((a) =>
        a.id === aim.id ? { ...a, status: newStatus } : a
      );
    },
    {
      optimisticData: (currentData: DashboardAimInstance[] | undefined) =>
        (Array.isArray(currentData) ? currentData : []).map((a) =>
          a.id === aim.id ? { ...a, status: newStatus } : a
        ),
      rollbackOnError: true,
    }
  );
}}
```

The UI flips instantly. If the server call fails, SWR rolls back automatically.

### Verification

Toggle an AIM checkbox in weekly view with DevTools Network throttled to Slow 3G. The checkbox should flip at ~0ms latency (before server responds).

---

## Change 5 — Fix Timeline Drag (Currently Non-functional)

**Status**: Code change required.

**File**: `src/components/dashboard/DashboardTimeline.tsx`

### Problem

The `DndContext` at L212 has no `sensors` prop:

```tsx
<DndContext onDragEnd={handleDragEnd} modifiers={[restrictToHorizontalAxis]}>
```

In `@dnd-kit/core` v6.3.1, without explicit sensors the drag activation pipeline does not fire. The `onDragEnd` callback is never reached, so blocks appear static.

### Solution

**Edit 1 — Update import (L4)**

```tsx
// Before
import { DndContext, useDraggable, type DragEndEvent, type Modifier } from '@dnd-kit/core';

// After
import {
  DndContext, useDraggable, useSensors, useSensor,
  PointerSensor, MouseSensor,
  type DragEndEvent, type Modifier,
} from '@dnd-kit/core';
```

**Edit 2 — Add sensors setup (before `return` statement, ~L185)**

```tsx
const sensors = useSensors(
  useSensor(PointerSensor, {
    activationConstraint: { distance: 4 },
  }),
  useSensor(MouseSensor, {
    activationConstraint: { distance: 4 },
  })
);
```

`distance: 4` prevents accidental drag on click — only activates after 4px movement.

**Edit 3 — Pass sensors to DndContext (L212)**

```tsx
// Before
<DndContext onDragEnd={handleDragEnd} modifiers={[restrictToHorizontalAxis]}>

// After
<DndContext sensors={sensors} onDragEnd={handleDragEnd} modifiers={[restrictToHorizontalAxis]}>
```

**Edit 4 — Add userSelect to draggable block style (~L75)**

Add `userSelect: 'none'` to the style object in `DraggableBlock` to prevent text selection from fighting the drag gesture.

No new packages needed — all imports come from the already-installed `@dnd-kit/core` v6.3.1.

### Verification

Open daily view with time-blocked tasks/AIMs visible on the timeline. Grab a block and drag left or right. The block should:
1. Visually translate with the cursor during drag
2. Snap to a 15-minute boundary on release
3. Fire a PATCH request (visible in Network tab)

---

## Change Summary

| # | File | Lines | Action |
|---|------|-------|--------|
| 1 | — | — | Confirm progress bar already removed (no code change) |
| 2 | — | — | Confirm React Tasks already implemented (no code change) |
| 3 | — | — | Confirm daily AIMs already implemented (no code change) |
| 4 | `page.tsx` | ~449–456 | Replace weekly AIM checkbox with optimistic update |
| 5a | `DashboardTimeline.tsx` | L4 | Add sensor imports |
| 5b | `DashboardTimeline.tsx` | ~L185 | Add `useSensors()` setup |
| 5c | `DashboardTimeline.tsx` | L212 | Add `sensors={sensors}` to DndContext |
| 5d | `DashboardTimeline.tsx` | ~L75 | Add `userSelect: 'none'` to block style |

**Total**: 2 files touched, 5 edits.
