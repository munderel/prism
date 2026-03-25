# Daily & Weekly Aims System — Design Spec

**Date:** 2026-03-24
**Status:** Draft

## Problem

The Flow Research Collective framework prescribes specific daily and weekly practices (deep work, flow activities, exercise, active recovery, weakness training, feedback, social support) that are essential for peak performance and flow states. The app currently has no way to track, schedule, or manage these practices. Users need an opt-in system where they select which aims to follow, customize durations/frequencies, and schedule them into their calendar alongside work tasks.

## Solution Overview

A new Aims system with:
- Aim categories (daily and weekly) with defaults based on the FRC framework
- User opt-in/opt-out per category with customizable duration and frequency
- Active Recovery as a customizable sub-section (add/remove activities)
- Aim instances that appear as schedulable blocks in the calendar
- Privacy controls: aims are private by default, group-able aims can be opened for others to join

## Data Models

### AimCategory

```prisma
model AimCategory {
  id                String   @id @default(cuid())
  name              String
  description       String?  @db.Text
  defaultFrequency  Int      // times per week
  defaultDurationMin Int     // minutes
  isGroupable       Boolean  @default(false)
  isDefault         Boolean  @default(true)
  isDaily           Boolean  @default(false)
  activities        Json?    // for Active Recovery: ["sauna", "massage", ...]
  createdAt         DateTime @default(now())

  userAims     UserAim[]
  aimInstances AimInstance[]
}
```

### UserAim

```prisma
model UserAim {
  id              String   @id @default(cuid())
  userId          String
  aimCategoryId   String
  isActive        Boolean  @default(true)
  customDuration  Int?
  customFrequency Int?
  customActivities Json?   // user's custom activity list (for Active Recovery)
  createdAt       DateTime @default(now())

  user        User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  aimCategory AimCategory @relation(fields: [aimCategoryId], references: [id], onDelete: Cascade)

  @@unique([userId, aimCategoryId])
}
```

### AimInstance

```prisma
model AimInstance {
  id             String    @id @default(cuid())
  userId         String
  aimCategoryId  String
  scheduledDate  DateTime
  timeBlockStart DateTime?
  timeBlockEnd   DateTime?
  isGroupOpen    Boolean   @default(false)
  status         String    @default("SCHEDULED") // SCHEDULED, COMPLETED, SKIPPED
  completedAt    DateTime?
  activityNote   String?   // what specific activity was done
  createdAt      DateTime  @default(now())

  user        User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  aimCategory AimCategory @relation(fields: [aimCategoryId], references: [id], onDelete: Cascade)

  @@index([userId, scheduledDate])
}
```

### User Model Addition

```prisma
model User {
  // ... existing fields ...
  userAims      UserAim[]
  aimInstances  AimInstance[]
}
```

## Default Aim Categories (Seed Data)

### Daily

| Name | Duration | Freq | Groupable | Description |
|------|----------|------|-----------|-------------|
| Deep Work | 90-120 min | 1x/day | No | Uninterrupted concentration on your most important task. Apply one strength in a new way. Push the challenge-skills sweet spot. |

### Weekly

| Name | Duration | Freq | Groupable | Description |
|------|----------|------|-----------|-------------|
| Flow Activity | 120-360 min | 1-2x/wk | Yes | Highest-flow activity (skiing, dancing, singing, etc.). Deploy flow triggers, be creative, take risks. |
| Exercise | 60 min | 3x/wk | Yes | Cognitively challenging exercise (trail running > treadmill). Cross-train grit, reset nervous system. |
| Active Recovery | 20-40 min | 3x/wk | Yes | Sauna, massage, extended mindfulness, light yoga. |
| Train Weakness | 30-60 min | 1x/wk | No | Train a weakness, practice being your best when at your worst, practice taking risks. |
| Get Feedback | 30-60 min | 1x/wk | No | Get feedback on work from uninterrupted concentration periods. |
| Social Support | 120 min | 1x/wk | Yes | Relationships and emotional intelligence practice. Especially important for introverts. |

## Active Recovery Sub-Section

Active Recovery has a special sub-section for managing activities:

**Default activities:** sauna, massage, extended mindfulness, light yoga

Stored in `AimCategory.activities` (JSON array) for defaults, and `UserAim.customActivities` for user customization.

**UI:**
- List of active recovery activities with remove button per item
- "Add custom activity" input field
- When scheduling an Active Recovery instance, user can note which activity they're doing

## New Page: `/aims`

### Layout

```
┌─────────────────────────────────────────┐
│  Daily Aims                             │
│  ┌─────────────────────────────────┐    │
│  │ [ON] Deep Work  90-120 min 1x/d│    │
│  │      Edit duration / frequency  │    │
│  └─────────────────────────────────┘    │
├─────────────────────────────────────────┤
│  Weekly Aims                            │
│  ┌─────────────────────────────────┐    │
│  │ [ON] Flow Activity  2-6h  1-2/w│    │
│  │ [ON] Exercise       60m   3x/w │    │
│  │ [ON] Active Recovery 20-40m 3/w│    │
│  │      └─ Activities: sauna, ...  │    │
│  │        [+ Add activity]         │    │
│  │ [OFF] Train Weakness 30-60m 1/w│    │
│  │ [OFF] Get Feedback   30-60m 1/w│    │
│  │ [ON] Social Support  120m  1/w │    │
│  └─────────────────────────────────┘    │
├─────────────────────────────────────────┤
│  Weekly Schedule Preview                │
│  Mon: Exercise (60m)                    │
│  Tue: Active Recovery (30m)             │
│  Wed: Exercise (60m), Flow (3h)         │
│  ...                                    │
└─────────────────────────────────────────┘
```

## Calendar Integration

### New Source Filter

Add "Aims" to `SOURCE_FILTERS` in CalendarView:
```typescript
{ key: 'aims', label: 'Aims', color: 'bg-teal-500' }
```

### Aim Instances in Calendar

- Aim instances appear as teal-colored blocks
- Distinct visual style from task blocks (rounded, lighter)
- Label shows aim name + activity note if set

### Group Aims

- When `isGroupOpen: true`, other users can see the aim instance in their calendar (if they're opted into the same aim category)
- "Join" button sends notification to the aim owner
- Joining creates a linked AimInstance for the joining user at the same time

### Privacy

- All aims are **private by default**
- Only group-able aim categories can be opened (`isGroupOpen`)
- Toggle per instance, not globally

## API Routes

- `GET /api/aims/categories` — List all aim categories
- `POST /api/aims/categories` — Create custom category (admin or user)
- `GET /api/aims/user` — Get current user's aim preferences (UserAim records)
- `PUT /api/aims/user` — Bulk update aim preferences (active/inactive, custom duration/frequency)
- `GET /api/aims/instances?start=&end=` — List aim instances for date range
- `POST /api/aims/instances` — Create aim instance (schedule into a time slot)
- `PATCH /api/aims/instances/[id]` — Update instance (complete, skip, toggle group, change time)
- `GET /api/aims/group?date=` — List group-open aim instances from other users for a date

## Sidebar Navigation

Add "Aims" to the sidebar nav in `src/components/layout/`:
- Icon: Target or Flame
- Position: between Reviews and Settings (or alongside Calendar)

## Testing

1. Seed default aim categories. Verify they appear on `/aims`.
2. Toggle aims on/off. Verify UserAim records created/updated.
3. Customize duration and frequency. Verify custom values override defaults.
4. Active Recovery: add/remove activities. Verify persistence.
5. Schedule an aim instance into the calendar. Verify it appears as a teal block.
6. Toggle group on a groupable aim. Verify another user can see it and join.
7. Run `npx vitest` and `npm run build`.
