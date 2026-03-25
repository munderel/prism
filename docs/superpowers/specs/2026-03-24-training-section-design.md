# Training Section (Books & Courses) — Design Spec

**Date:** 2026-03-24
**Status:** Draft

## Problem

The FRC framework emphasizes continuous learning as a driver of flow and growth. Users have no way to track books or courses, break them into actionable tasks, or test their comprehension. Books and courses are currently managed outside the app, disconnected from the goal stack and scheduling system.

## Solution Overview

A new Training section where users can add books or courses, and AI (via OpenRouter) automatically breaks them into chunked, schedulable tasks. Books support uploading content for AI-powered quizzes. Courses display in a goal-stack-like tree view. Training items can optionally link to goal stack goals.

## Data Models

### TrainingType Enum

```prisma
enum TrainingType {
  BOOK
  COURSE
}
```

### TrainingItem

```prisma
model TrainingItem {
  id                   String       @id @default(cuid())
  ownerId              String
  type                 TrainingType
  title                String
  description          String?      @db.Text
  sourceUrl            String?
  uploadedFileUrl      String?
  aiMetadata           Json?        // AI-generated breakdown
  targetCompletionDate DateTime?
  goalId               String?
  status               String       @default("ACTIVE")
  createdAt            DateTime     @default(now())
  updatedAt            DateTime     @updatedAt

  owner         User            @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  goal          Goal?           @relation(fields: [goalId], references: [id])
  trainingTasks TrainingTask[]
  quizAttempts  QuizAttempt[]

  @@index([ownerId])
}
```

### TrainingTask

```prisma
model TrainingTask {
  id             String  @id @default(cuid())
  trainingItemId String
  taskId         String  @unique
  chapterRange   String?
  moduleIndex    Int?
  isQuizDay      Boolean @default(false)
  sortOrder      Int     @default(0)

  trainingItem TrainingItem @relation(fields: [trainingItemId], references: [id], onDelete: Cascade)
  task         Task         @relation(fields: [taskId], references: [id], onDelete: Cascade)

  @@index([trainingItemId])
}
```

### QuizAttempt

```prisma
model QuizAttempt {
  id             String    @id @default(cuid())
  trainingItemId String
  trainingTaskId String?
  questions      Json
  userAnswers    Json?
  score          Float?
  llmFeedback    Json?
  completedAt    DateTime?
  createdAt      DateTime  @default(now())

  trainingItem TrainingItem @relation(fields: [trainingItemId], references: [id], onDelete: Cascade)

  @@index([trainingItemId])
}
```

### Reverse Relations

Add to Task model: `trainingTask TrainingTask?`
Add to Goal model: `trainingItems TrainingItem[]`
Add to User model: `trainingItems TrainingItem[]`

## New Page: `/training`

### Layout

```
┌─────────────────────────────────────────────┐
│  Training                    [+ Book] [+ Course]│
├─────────────────────────────────────────────┤
│  📚 The Art of Impossible                   │
│  Book · 12/18 tasks done · Due: Apr 15      │
│  ├─ ✅ Read Ch 1-2: Motivation (30m)        │
│  ├─ ✅ Read Ch 3-4: Learning (30m)          │
│  ├─ ✅ Quiz: Chapters 1-4 (Score: 85%)      │
│  ├─ ⬜ Read Ch 5-6: Creativity (30m)        │
│  └─ ...                                     │
├─────────────────────────────────────────────┤
│  🎓 Machine Learning Fundamentals          │
│  Course · 4/10 modules done · Due: May 30   │
│  ├─ Module 1: Linear Algebra ✅             │
│  │  ├─ Lesson 1.1: Vectors ✅               │
│  │  ├─ Lesson 1.2: Matrices ✅              │
│  │  └─ Assignment 1 ✅                      │
│  ├─ Module 2: Statistics ⬜                 │
│  └─ ...                                     │
└─────────────────────────────────────────────┘
```

## Book Flow

### 1. Add Book

User enters book title → `POST /api/training/books`

### 2. AI Breakdown

Server calls OpenRouter using the `bookBreakdownPrompt()` template from `src/lib/ai-prompts.ts` (defined in the [OpenRouter AI Integration spec](2026-03-24-openrouter-ai-integration-design.md)). All prompt templates are maintained in that single file as the source of truth.

### 3. Task Generation

From AI response, create TrainingTasks linked to real Tasks:
- One Task per reading group: "Read chapters 1-2: {topic}" with `estimatedMinutes` from AI
- One Task per quiz point: "Quiz: Chapters 1-4" with `isQuizDay: true`
- Due dates spread across available days between now and `targetCompletionDate`

### 4. Upload Book

User uploads PDF/ePub → stored via file upload (Vercel Blob or S3)
- Uploaded content used for quiz question generation
- AI extracts key concepts per chapter for targeted quizzes

### 5. Quiz System

On a quiz day task:
1. "Start Quiz" button → `POST /api/training/quiz/generate`
2. Server calls OpenRouter using `quizGenerationPrompt()` from `src/lib/ai-prompts.ts` (see [OpenRouter AI Integration spec](2026-03-24-openrouter-ai-integration-design.md))
3. User answers questions in-app
4. Submit → `POST /api/training/quiz/check`
5. Server calls OpenRouter using `quizCheckPrompt()` from `src/lib/ai-prompts.ts`. For multiple-choice questions, consider deterministic grading (string match) and reserve LLM grading for short answer/application types to reduce AI costs.
6. Store QuizAttempt with score and feedback

## Course Flow

### 1. Add Course

User enters course name + optional syllabus upload → `POST /api/training/courses`

### 2. AI Breakdown

Server calls OpenRouter using the `courseBreakdownPrompt()` template from `src/lib/ai-prompts.ts` (defined in the [OpenRouter AI Integration spec](2026-03-24-openrouter-ai-integration-design.md)). If syllabus uploaded, it's passed as the second argument.

### 3. Goal-Stack-Like Tree View

Courses display as a collapsible tree (reuse GoalStackTree patterns):
- Module (top level, like STRATEGIC goal)
- Lesson (mid level, like MONTHLY goal)
- Assignment (leaf, like task)

### 4. Task Generation

From AI response, create TrainingTasks:
- One Task per lesson: "{module}: {lesson title}" with `estimatedMinutes`
- Tasks ordered by `sortOrder` matching curriculum sequence
- Due dates distributed between now and `targetCompletionDate`

### 5. Upload Overview

Upload course overview/summaries → stored alongside training item
- Used as reference material during course tasks
- Can be used for quiz generation if applicable

## Goal Stack Link

Training items can optionally link to a goal stack goal via `goalId`:
- Progress on training tasks contributes to goal progress
- Visible in goal stack tree as linked items
- Useful for goals like "Complete ML certification by Q3"

## API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/training` | GET | List user's training items |
| `/api/training` | POST | Create training item (manual) |
| `/api/training/[id]` | GET/PUT/DELETE | Training item CRUD |
| `/api/training/books` | POST | AI-powered book breakdown |
| `/api/training/courses` | POST | AI-powered course breakdown |
| `/api/training/quiz/generate` | POST | Generate quiz questions |
| `/api/training/quiz/check` | POST | Grade quiz answers |
| `/api/training/[id]/upload` | POST | Upload book/syllabus file |

## Sidebar Navigation

Add "Training" to sidebar nav:
- Icon: BookOpen or GraduationCap
- Position: between Goals and Tasks

## Testing

1. Add a book by title → verify AI breakdown generates reading tasks with due dates.
2. Complete reading tasks → verify progress updates on training item.
3. Reach a quiz day → start quiz → answer questions → verify grading and feedback.
4. Add a course → verify module/lesson tree view renders correctly.
5. Link training item to a goal → verify goal progress includes training task completion.
6. Upload a book PDF → verify quiz questions reference actual content.
7. Run `npx vitest` and `npm run build`.
