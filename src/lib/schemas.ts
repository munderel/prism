import { z } from 'zod';
import { IdeaStatus } from '@prisma/client';

// === SHARED FIELD SCHEMAS ===

const hhmmTime = z.string().regex(/^\d{2}:\d{2}$/, 'Must be HH:mm format').optional().nullable();
const reviewDuration = z.number().int().min(1).max(480).optional().nullable();

/** Accept bare YYYY-MM-DD or any string `new Date(...)` can parse. Rejects
 *  garbage at the API boundary so callers get a structured 400 instead of a
 *  Prisma 500. Empty/null short-circuit because the field is optional. */
const dateInputString = z
  .string()
  .optional()
  .nullable()
  .refine(
    (v) =>
      v === null ||
      v === undefined ||
      v === '' ||
      /^\d{4}-\d{2}-\d{2}$/.test(v) ||
      !Number.isNaN(new Date(v).getTime()),
    { message: 'Must be YYYY-MM-DD or a valid ISO datetime' },
  );

// === AUTH ===

export const registerSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z
    .string()
    .min(12, 'Password must be at least 12 characters')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/\d/, 'Password must contain at least one digit')
    .regex(/[^a-zA-Z0-9]/, 'Password must contain at least one special character'),
  name: z.string().optional(),
  invitationId: z.string().min(1, 'Invitation ID is required'),
});

// === TASKS ===

export const createTaskSchema = z.object({
  taskType: z.enum(['IMPROVE', 'REACT', 'MAINTENANCE', 'REVIEW']),
  title: z.string().min(1, 'Title is required').max(500),
  description: z.string().max(5000).optional().nullable(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  dueDate: dateInputString,
  goalId: z.string().optional().nullable(),
  processId: z.string().optional().nullable(),
  ownerId: z.string().optional(),
  recurrenceRule: z.string().max(500).optional().nullable(),
  timeBlockStart: z.string().optional().nullable(),
  timeBlockEnd: z.string().optional().nullable(),
  startTime: z.string().optional().nullable(),
  estimatedMinutes: z.number().int().min(1).max(9600).optional().nullable(),
  isWinTheDay: z.boolean().optional(),
  parentId: z.string().optional().nullable(),
  assigneeId: z.string().optional().nullable(),
  deliverableItems: z
    .array(z.object({ text: z.string().min(1).max(1000) }))
    .max(100)
    .optional(),
});

export const updateTaskSchema = z.object({
  status: z.enum(['TODO', 'IN_PROGRESS', 'DONE', 'DROPPED']).optional(),
  title: z.string().min(3, 'Title must be at least 3 characters').max(500).optional(),
  description: z.string().max(5000).optional().nullable(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  dueDate: dateInputString,
  timeBlockStart: z.string().optional().nullable(),
  timeBlockEnd: z.string().optional().nullable(),
  startTime: z.string().optional().nullable(),
  isWinTheDay: z.boolean().optional(),
  winTheDayRank: z.number().int().min(1).max(3).optional().nullable(),
  estimatedMinutes: z.number().int().min(1).max(9600).optional().nullable(),
  isPinned: z.boolean().optional(),
  isAutoScheduled: z.boolean().optional(),
  goalId: z.string().optional().nullable(),
  assigneeId: z.string().optional().nullable(),
  parentId: z.string().optional().nullable(),
});

// === GOALS ===

export const createGoalSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters').max(500),
  description: z.string().max(5000).optional().nullable(),
  stackId: z.string().min(1, 'Stack is required'),
  parentId: z.string().optional().nullable(),
  impact: z.number().int().min(1).max(5).optional(),
  confidence: z.number().int().min(1).max(5).optional(),
  ease: z.number().int().min(1).max(5).optional(),
  targetDate: z.string().optional().nullable(),
  level: z.enum(['HIGH_HARD', 'STRATEGIC', 'MONTHLY', 'WEEKLY', 'DAILY']),
  sortOrder: z.number().int().optional(),
  dueDate: z.string().optional().nullable(),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  autoGenerate: z.boolean().optional(),
});

// === SETTINGS ===

export const updateSettingsSchema = z.object({
  scope: z.enum(['user', 'company']).optional(),
  name: z.string().min(1).max(100).optional(),
  mtp: z.string().max(10000).optional().nullable(),
  timezone: z.string().optional(),
  hasCompletedOnboarding: z.boolean().optional(),
  hiddenFeatures: z.array(z.string()).optional(),
  workingHoursStart: hhmmTime,
  workingHoursEnd: hhmmTime,
  casualHoursStart: hhmmTime,
  casualHoursEnd: hhmmTime,
  taskSchedulePeriod: z.enum(['working', 'casual', 'both']).optional().nullable(),
  selectedCalendarIds: z.array(z.string()).optional(),
  syncTargetCalendarId: z.string().max(200).optional().nullable(),
  calendarColorOverrides: z.record(z.string(), z.string()).optional(),
  weeklyTargetCalendarIds: z.array(z.string()).optional(),
  powerdownTime: hhmmTime,
  defaultWorkBlockMinutes: z.number().int().min(15).max(480).optional(),
  // Daily hours target in MINUTES (UI converts hours ↔ minutes); null clears the
  // header. Cap at 24h = 1440min so a typo can't store a nonsensical value.
  dailyHoursTarget: z.number().int().min(1).max(1440).optional().nullable(),
  weeklyReviewDayOfWeek: z.number().int().min(0).max(6).optional().nullable(),
  weeklyReviewTime: hhmmTime,
  weeklyReviewDuration: reviewDuration,
  monthlyReviewRecurrenceRule: z.enum(['last-friday', 'last-monday', '1st-monday', '1st-friday', '15th']).optional().nullable(),
  monthlyReviewTime: hhmmTime,
  monthlyReviewDuration: reviewDuration,
  yearlyReviewRecurrenceRule: z.string().max(50).optional().nullable(),
  yearlyReviewTime: hhmmTime,
  yearlyReviewDuration: reviewDuration,
  isPublicOnLeaderboard: z.boolean().optional(),
  streakGraceDays:      z.boolean().optional(),
  beeminderAuthToken: z.string().max(200).optional().nullable(),
  beeminderGoalSlug: z.string().max(200).optional().nullable(),
  companyMtp: z.string().max(10000).optional(),
});

// === ATTACHMENTS ===

export const createAttachmentSchema = z.object({
  fileName: z.string().min(1).max(255),
  fileUrl: z.string().url().max(2048),
  fileSize: z.number().int().positive(),
  mimeType: z.string().min(1).max(255),
});

// === INVITATIONS ===

export const createInvitationSchema = z.object({
  email: z.string().email('Invalid email format'),
  role: z.enum(['admin', 'user']).optional(),
});

// === GOALS (update / reorder / link / import) ===

export const updateGoalSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters').max(500).optional(),
  description: z.string().max(5000).optional().nullable(),
  status: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'ABANDONED']).optional(),
  level: z.enum(['HIGH_HARD', 'STRATEGIC', 'MONTHLY', 'WEEKLY', 'DAILY']).optional(),
  dueDate: z.string().optional().nullable(),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  progressPct: z.number().min(0).max(100).optional(),
});

export const reorderGoalSchema = z.object({
  sortOrder: z.number().int().min(0).optional(),
  parentId: z.string().optional().nullable(),
});

export const linkGoalSchema = z.object({
  individualGoalId: z.string().min(1, 'individualGoalId is required'),
  weight: z.number().min(0).max(100).optional(),
});

export const importGoalsSchema = z.object({
  stackId: z.string().min(1, 'stackId is required'),
  yamlContent: z.string().min(1, 'yamlContent is required').max(256 * 1024, 'YAML content must be under 256KB'),
  confirmed: z.boolean().optional(),
});

// === KPIs ===

export const createKpiSchema = z.object({
  name: z.string().min(1, 'name is required').max(200),
  type: z.enum(['NUMERIC', 'BINARY']),
  unit: z.string().max(50).optional().nullable(),
  targetValue: z.number().optional().nullable(),
  linkedKpiId: z.string().optional().nullable(),
  // null / omitted = team-shared (no individual owner).
  ownerId: z.string().min(1).optional().nullable(),
});

export const updateKpiSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  unit: z.string().max(50).optional().nullable(),
  targetValue: z.number().optional().nullable(),
  actualValue: z.number().optional().nullable(),
  isComplete: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
  // null explicitly clears the owner (reverts to team-shared).
  ownerId: z.string().min(1).optional().nullable(),
});

// === STACKS ===

export const createStackSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  description: z.string().max(2000).optional().nullable(),
  color: z.string().max(50).optional().nullable(),
  icon: z.string().max(50).optional().nullable(),
  isCompany: z.boolean().optional(),
  visibility: z.enum(['private', 'group', 'company']).optional(),
});

export const updateStackSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200).optional(),
  weekStartDay: z.number().int().min(0).max(6).optional(),
});

// === ADMIN ===

export const adminToggleSchema = z.object({
  userId: z.string({ message: 'userId is required' }).min(1, 'userId is required'),
  isAdmin: z.boolean(),
});

export const adminDeleteUserSchema = z.object({
  userId: z.string({ message: 'userId is required' }).min(1, 'userId is required'),
});

export const adminCreateUserSchema = z.object({
  email: z.string().email('Invalid email format'),
  name: z.string().optional(),
  role: z.enum(['admin', 'user']).optional(),
});

export const adminUserActionSchema = z.object({
  action: z.enum(['lockout', 'unlock', 'reset-2fa', 'reset-password']),
});

// === AUTH SETTINGS ===

export const authSettingsSchema = z.object({
  enforce2FA: z.boolean(),
});

// === FEEDBACK ===

export const createFeedbackSchema = z.object({
  content: z.string().min(1, 'Feedback content is required').max(10000),
});

// === 2FA ===

export const totpCodeSchema = z.object({
  code: z.string().min(1, 'Code is required'),
});

// === NOTIFICATIONS ===

export const pushSubscriptionSchema = z.object({
  endpoint: z.string().min(1, 'endpoint is required'),
  keys: z.object({
    p256dh: z.string().min(1, 'keys.p256dh is required'),
    auth: z.string().min(1, 'keys.auth is required'),
  }),
});

// === COMMENTS ===

export const createCommentSchema = z.object({
  content: z.string().min(1, 'Content is required').max(5000),
});

// === CLEAR GOALS ===

export const createClearGoalSchema = z.object({
  text: z.string().min(1, 'Text is required').max(1000),
  powerdownId: z.string().optional().nullable(),
});

export const updateClearGoalsSchema = z.object({
  goals: z.array(
    z.object({
      id: z.string().min(1),
      text: z.string().max(1000).optional(),
      isComplete: z.boolean().optional(),
      sortOrder: z.number().int().min(0).optional(),
    })
  ).min(1, 'goals array is required'),
});

// === BATCH SCHEDULE ===

export const batchScheduleSchema = z.object({
  updates: z.array(
    z.object({
      id: z.string().min(1, 'Each update must have a valid id'),
      timeBlockStart: z.string().min(1, 'timeBlockStart is required'),
      timeBlockEnd: z.string().min(1, 'timeBlockEnd is required'),
      isAutoScheduled: z.boolean().optional(),
      isPinned: z.boolean().optional(),
    })
  ).min(1, 'updates must be a non-empty array'),
});

// === BATCH WIN THE DAY ===

export const batchWinTheDaySchema = z.object({
  taskIds: z.array(z.string().min(1)).min(1).max(3, 'taskIds must be an array of 1\u20133 task IDs'),
  dueDate: z.string().optional(),
});

// === AI SUGGEST ===

export const aiSuggestSchema = z.object({
  weeklyGoal: z.string().min(1, 'weeklyGoal is required').max(10000, 'weeklyGoal must be under 10000 characters'),
  existingTasks: z.array(z.string()).optional(),
});

// === DISTRACTIONS ===

export const createDistractionSchema = z.object({
  content: z.string().min(1, 'content is required').max(5000),
  notes: z.string().max(5000).optional().nullable(),
  logDate: z.string().optional().nullable(),
  source: z.string().max(100).optional().nullable(),
});

// === PROCESSES ===

const processCadence = z.enum(['ONE_TIME', 'DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY']);
const processMode = z.enum(['BASIC', 'ADVANCED']);
const kpiTimeLevel = z.enum(['WEEKLY', 'MONTHLY', 'YEARLY', 'FIVE_YEAR', 'HHG']);

const kpiGoalSchema = z.object({
  timeLevel: kpiTimeLevel,
  targetValue: z.number().finite('Goal targetValue must be a finite number'),
});

export const createBusinessFunctionSchema = z.object({
  name: z.string().min(1, 'name is required').max(200),
  description: z.string().max(2000).optional().nullable(),
});

export const updateBusinessFunctionSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional().nullable(),
});

export const createProcessSchema = z.object({
  title: z.string().min(1, 'title is required').max(500),
  description: z.string().max(5000).optional().nullable(),
  cadence: processCadence.optional().default('WEEKLY'),
  assigneeId: z.string().optional().nullable(),
  defaultDurationMinutes: z.number().positive('defaultDurationMinutes must be a positive number').optional(),
  scheduledTime: z.string().regex(/^\d{2}:\d{2}$/, 'scheduledTime is required in HH:mm format'),
  scheduledDayOfWeek: z.number().int().min(0).max(6).optional().nullable(),
  scheduledDayOfMonth: z.number().int().min(1).max(31).optional().nullable(),
  scheduleStartDate: z.string().optional().nullable(),
  mode: processMode.optional(),
  durationEndDate: z.string().optional().nullable(),
});

export const updateProcessSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(5000).optional().nullable(),
  cadence: processCadence.optional(),
  cadenceRule: z.string().max(500).optional().nullable(),
  assigneeId: z.string().optional().nullable(),
  delegateId: z.string().optional().nullable(),
  delegateUntil: z.string().optional().nullable(),
  scheduledTime: z.string().regex(/^\d{2}:\d{2}$/, 'Must be HH:mm format').optional().nullable(),
  scheduledDayOfWeek: z.number().int().min(0).max(6).optional().nullable(),
  scheduledDayOfMonth: z.number().int().min(1).max(31).optional().nullable(),
  defaultDurationMinutes: z.number().positive('defaultDurationMinutes must be a positive number').optional(),
  mode: processMode.optional(),
  durationEndDate: z.string().optional().nullable(),
  scheduleStartDate: z.string().optional().nullable(),
  scheduledDate: z.string().optional(),
  timeBlockStart: z.string().optional().nullable(),
  timeBlockEnd: z.string().optional().nullable(),
  regenerate: z.boolean().optional(),
});

export const createProcessStepSchema = z.object({
  title: z.string().min(1, 'title is required').max(500),
  description: z.string().max(5000).optional().nullable(),
  url: z.string().max(2048).optional().nullable(),
  sortOrder: z.number().int().min(0).optional(),
});

export const updateProcessStepSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(5000).optional().nullable(),
  url: z.string().max(2048).optional().nullable(),
  sortOrder: z.number().int().min(0).optional(),
});

export const scheduleProcessSchema = z.object({
  time: z.string().regex(/^\d{2}:\d{2}$/, 'time is required in HH:mm format'),
  dayOfWeek: z.number().int().min(0).max(6).optional(),
  dayOfMonth: z.number().int().min(1).max(31).optional(),
  date: z.string().optional(),
});

export const completeProcessSchema = z.object({
  scheduledDate: z.string().min(1, 'scheduledDate is required'),
});

export const createProcessKpiSchema = z.object({
  name: z.string().min(1, 'name is required').max(200),
  unit: z.string().max(50).optional().nullable(),
  targetValue: z.number().finite().optional().nullable(),
  goalId: z.string().optional().nullable(),
  goals: z.array(kpiGoalSchema).optional(),
});

export const updateProcessKpiSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  unit: z.string().max(50).optional().nullable(),
  targetValue: z.number().finite().optional().nullable(),
  goalId: z.string().optional().nullable(),
  goals: z.array(kpiGoalSchema).optional(),
});

export const createKpiEntrySchema = z.object({
  value: z.number().finite('value must be a valid number'),
  date: z.string().optional(),
  notes: z.string().max(2000).optional().nullable(),
});

const importStepSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional().nullable(),
});

const importProcessSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  cadence: processCadence.optional().default('WEEKLY'),
  steps: z.array(importStepSchema).optional().default([]),
});

const importFunctionSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  processes: z.array(importProcessSchema).optional().default([]),
});

export const importProcessesSchema = z.object({
  functions: z.array(importFunctionSchema).min(1, 'functions array is required'),
});

// === MEETINGS ===

const meetingCadence = z.enum(['ONE_TIME', 'DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY']);

export const createMeetingSchema = z.object({
  title: z.string().min(1, 'title is required').max(500),
  description: z.string().max(5000).optional().nullable(),
  cadence: meetingCadence,
  dayOfWeek: z.number().int().min(0).max(6).optional().nullable(),
  occurDate: z.string().optional().nullable(),
  timeStart: z.string().regex(/^\d{2}:\d{2}$/, 'Must be HH:mm format'),
  timeEnd: z.string().regex(/^\d{2}:\d{2}$/, 'Must be HH:mm format'),
  attendeeIds: z.array(z.string()).optional().nullable(),
  addMeetLink: z.boolean().optional(),
});

export const updateMeetingSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(5000).optional().nullable(),
  cadence: meetingCadence.optional(),
  dayOfWeek: z.number().int().min(0).max(6).optional().nullable(),
  occurDate: z.string().optional().nullable(),
  timeStart: z.string().regex(/^\d{2}:\d{2}$/, 'Must be HH:mm format').optional(),
  timeEnd: z.string().regex(/^\d{2}:\d{2}$/, 'Must be HH:mm format').optional(),
  attendeeIds: z.array(z.string()).optional(),
});

// === IDEAS ===

export const createIdeaSchema = z.object({
  title: z.string().min(1, 'title is required').max(500),
  description: z.string().min(1, 'description is required').max(5000),
  processId: z.string().optional().nullable(),
  impactScore: z.number().int().min(1).max(5),
  confidenceScore: z.number().int().min(1).max(5),
  easeScore: z.number().int().min(1).max(5),
});

export const updateIdeaSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(5000).optional().nullable(),
  processId: z.string().optional().nullable(),
  impactScore: z.number().int().min(1).max(5).optional(),
  confidenceScore: z.number().int().min(1).max(5).optional(),
  easeScore: z.number().int().min(1).max(5).optional(),
  // Critical #19: z.string() let a non-enum value flow into Prisma and crash
  // at the DB boundary. Bind to the Prisma enum directly.
  status: z.nativeEnum(IdeaStatus).optional(),
});

export const convertIdeaSchema = z.object({
  ownerId: z.string().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  dueDate: z.string().optional().nullable(),
});

// === POWERDOWN ===

export const updatePowerdownSchema = z.object({
  sessionId: z.string().optional(),
  sessionDate: z.string().optional(),
  currentStep: z.number().int().min(0).optional(),
  checklistState: z.unknown().optional(),
  tomorrowPlan: z.array(z.string().max(200)).max(100).optional().nullable(),
  distractions: z.unknown().optional(),
  gratitudes: z.unknown().optional(),
  ideas: z.unknown().optional(),
  complete: z.boolean().optional(),
  timeBlockStart: z.string().optional().nullable(),
  timeBlockEnd: z.string().optional().nullable(),
});

export const decomposeGoalSchema = z.object({
  title: z.string().min(1, 'title is required').max(10000),
  description: z.string().max(10000).optional().nullable(),
});

// === STREAKS ===

export const createStreakSchema = z.object({
  streakType: z.string({ message: 'streakType is required' }).min(1, 'streakType is required').max(200),
});

export const updateStreakSchema = z.object({
  isActive: z.boolean({ message: 'isActive (boolean) is required' }),
});

// === TEAM REVIEWS ===

export const createTeamReviewSchema = z.object({
  reviewType: z.enum(['WEEKLY', 'MONTHLY', 'YEARLY']),
  dayOfWeek: z.number().int().min(0).max(6).optional().nullable(),
  recurrenceRule: z.string().max(500).optional().nullable(),
  time: z.string().regex(/^\d{2}:\d{2}$/, 'time must be HH:mm format'),
  duration: z.number().int().min(1).max(480).optional(),
  memberIds: z.array(z.string()).min(1, 'At least one member is required'),
});

export const updateTeamReviewSchema = z.object({
  reviewType: z.enum(['WEEKLY', 'MONTHLY', 'YEARLY']).optional(),
  dayOfWeek: z.number().int().min(0).max(6).optional().nullable(),
  recurrenceRule: z.string().max(500).optional().nullable(),
  time: z.string().regex(/^\d{2}:\d{2}$/, 'time must be HH:mm format').optional(),
  duration: z.number().int().min(1).max(480).optional(),
  isActive: z.boolean().optional(),
  memberIds: z.array(z.string()).optional(),
});

// === TRAINING ===

export const createTrainingItemSchema = z.object({
  title: z.string().min(1, 'title is required').max(500),
  type: z.enum(['BOOK', 'COURSE']),
  description: z.string().max(5000).optional().nullable(),
  targetCompletionDate: z.string().optional().nullable(),
  goalId: z.string().optional().nullable(),
});

export const updateTrainingItemSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(5000).optional().nullable(),
  status: z.enum(['ACTIVE', 'COMPLETED', 'ARCHIVED']).optional(),
  targetCompletionDate: z.string().optional().nullable(),
  goalId: z.string().optional().nullable(),
});

export const createBookSchema = z.object({
  title: z.string().min(1, 'title is required').max(10000),
  description: z.string().max(10000).optional().nullable(),
  targetCompletionDate: z.string().optional().nullable(),
  goalId: z.string().optional().nullable(),
});

export const createCourseSchema = z.object({
  title: z.string().min(1, 'title is required').max(10000),
  syllabus: z.string().max(10000).optional().nullable(),
  targetCompletionDate: z.string().optional().nullable(),
  goalId: z.string().optional().nullable(),
});

export const generateQuizSchema = z.object({
  trainingItemId: z.string().optional().nullable(),
  trainingTaskId: z.string().optional().nullable(),
  chapterRange: z.string().min(1, 'chapterRange is required').max(10000),
  material: z.string().max(10000).optional().nullable(),
});

export const checkQuizSchema = z.object({
  quizAttemptId: z.string().optional().nullable(),
  questions: z.array(z.unknown()).optional().nullable(),
  userAnswers: z.array(z.unknown()).min(1, 'userAnswers must be a non-empty array'),
});

// === REVIEWS ===

const scheduleConfigSchema = z.object({
  type: z.string().optional(),
  dayOfWeek: z.number().int().min(0).max(6).optional(),
  recurrenceRule: z.string().max(200).optional(),
  customDate: z.string().optional(),
  time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  duration: z.number().int().min(1).max(480).optional(),
}).optional().nullable();

export const createReviewSchema = z.object({
  reviewType: z.string().min(1, 'reviewType is required'),
  scheduledDate: z.string().optional().nullable(),
  startDate: z.string().optional().nullable(),
  recurrenceDayOfWeek: z.number().int().min(0).max(6).optional().nullable(),
  isTeamReview: z.boolean().optional(),
  scheduleConfig: scheduleConfigSchema,
});

export const deleteReviewSchema = z.object({
  reviewType: z.string().min(1, 'reviewType is required'),
});

export const updateReviewSchema = z.object({
  checklistState: z.any().optional(),
  notes: z.string().max(50000).optional().nullable(),
  timeBlockStart: z.string().optional().nullable(),
  timeBlockEnd: z.string().optional().nullable(),
  complete: z.boolean().optional(),
});

export const createReviewAnswerSchema = z.object({
  stepKey: z.string().min(1, 'stepKey is required'),
  answerType: z.string().min(1, 'answerType is required'),
  answerData: z.any().optional(),
});

// === AIMS ===

const aimInputSchema = z.object({
  aimCategoryId: z.string().min(1, 'aimCategoryId is required'),
  isActive: z.boolean().optional(),
  customDuration: z.number().int().min(1).optional().nullable(),
  customFrequency: z.number().int().min(1).optional().nullable(),
  customActivities: z.any().optional(),
  currentPhase: z.string().optional(),
  phaseStartedAt: z.string().optional(),
  completionCount: z.number().int().min(0).optional(),
  currentStreak: z.number().int().min(0).optional(),
  activeWeekdays: z
    .number()
    .int('activeWeekdays must be an integer')
    .min(0, 'activeWeekdays must be >= 0')
    .max(127, 'activeWeekdays must be <= 127')
    .optional(),
  // KPI linkage fields — live on AimCategory, not UserAim.
  linkedKpiId: z.string().optional().nullable(),
  kpiIncrement: z.number().gt(0, 'kpiIncrement must be > 0').optional().nullable(),
});

export const putUserAimsSchema = z.object({
  aims: z.array(aimInputSchema).min(1, 'aims must be a non-empty array'),
});

export const createAimInstanceSchema = z.object({
  aimCategoryId: z.string().min(1, 'aimCategoryId is required'),
  scheduledDate: z.string().min(1, 'scheduledDate is required'),
  timeBlockStart: z.string().optional().nullable(),
  timeBlockEnd: z.string().optional().nullable(),
  isGroupOpen: z.boolean().optional(),
  selectedActivity: z.string().optional().nullable(),
});

export const updateAimInstanceSchema = z.object({
  status: z.enum(['SCHEDULED', 'COMPLETED', 'SKIPPED']).optional(),
  timeBlockStart: z.string().optional().nullable(),
  timeBlockEnd: z.string().optional().nullable(),
  isGroupOpen: z.boolean().optional(),
  activityNote: z.string().max(5000).optional().nullable(),
  selectedActivity: z.string().optional().nullable(),
  taskIds: z.array(z.string()).optional(),
  actualMinutes: z.number().int().min(0).max(1440).optional().nullable(),
});

const scheduleDaySchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  timeStart: z.string().regex(/^\d{2}:\d{2}$/, 'timeStart must be HH:mm format'),
});

export const scheduleAimsSchema = z.object({
  aimCategoryId: z.string().min(1, 'aimCategoryId is required'),
  days: z.array(scheduleDaySchema).min(1, 'days must be a non-empty array'),
});

export const createAimCategorySchema = z.object({
  name: z.string().min(1, 'name is required').max(200),
  description: z.string().max(2000).optional().nullable(),
  defaultFrequency: z.number().int().min(1, 'defaultFrequency must be a positive integer'),
  defaultDurationMin: z.number().int().min(1, 'defaultDurationMin must be a positive integer'),
  isGroupable: z.boolean().optional(),
  isDaily: z.boolean().optional(),
  activities: z.any().optional(),
});

// === CALENDAR ===

export const createCalendarEventSchema = z.object({
  summary: z.string().min(1, 'summary is required').max(500),
  description: z.string().max(5000).optional().nullable(),
  start: z.string().min(1, 'start is required'),
  end: z.string().min(1, 'end is required'),
  addMeetLink: z.boolean().optional(),
});

export const syncCalendarSchema = z.object({
  start: z.string().min(1, 'start is required'),
  end: z.string().min(1, 'end is required'),
  force: z.boolean().optional(),
});

export const updateCalendarEventSchema = z.object({
  start: z.string().min(1, 'start is required'),
  end: z.string().min(1, 'end is required'),
  calendarId: z.string().optional(),
});

// === WORK BLOCKS ===

// Work-block windows are capped at 8h (matches the modal duration picker at 480 min).
// `.datetime()` rejects malformed strings before `new Date(...)` in the route.
const WORK_BLOCK_MAX_MINUTES = 480;

export const createWorkBlockSchema = z
  .object({
    taskId: z.string().min(1, 'taskId is required'),
    start: z.string().datetime({ message: 'start must be an ISO datetime' }),
    end: z.string().datetime({ message: 'end must be an ISO datetime' }),
    mainObjective: z.string().min(1, 'mainObjective is required').max(500),
    clearGoals: z.array(z.string().min(1).max(500)).max(20).optional(),
  })
  .refine((v) => new Date(v.end) > new Date(v.start), {
    message: 'end must be after start',
    path: ['end'],
  })
  .refine(
    (v) =>
      (new Date(v.end).getTime() - new Date(v.start).getTime()) / 60000 <= WORK_BLOCK_MAX_MINUTES,
    { message: `duration exceeds ${WORK_BLOCK_MAX_MINUTES} minutes`, path: ['end'] },
  );

export const updateWorkBlockSchema = z
  .object({
    start: z.string().datetime({ message: 'start must be an ISO datetime' }).optional(),
    end: z.string().datetime({ message: 'end must be an ISO datetime' }).optional(),
    mainObjective: z.string().min(1).max(500).optional(),
    completionStatus: z.enum(['PENDING', 'COMPLETED', 'PARTIAL', 'MISSED']).optional(),
    actualMinutes: z.number().int().min(0).max(WORK_BLOCK_MAX_MINUTES).optional().nullable(),
    notes: z.string().max(2000).optional().nullable(),
    clearGoals: z.array(z.string().min(1).max(500)).max(20).optional(),
  })
  .refine(
    (v) =>
      v.start === undefined || v.end === undefined || new Date(v.end) > new Date(v.start),
    { message: 'end must be after start', path: ['end'] },
  );

export const splitTaskSchema = z.object({
  sessions: z
    .array(
      z.object({
        title: z.string().min(1).max(200),
        durationMinutes: z.number().int().min(1).max(1440),
      }),
    )
    // At least two sessions — a single "split" makes no sense; the caller
    // should just edit the original task.
    .min(2)
    .max(20),
});

export const reviewWorkBlocksSchema = z.object({
  powerdownSessionId: z.string().min(1),
  reviews: z.array(
    z.object({
      workBlockId: z.string().min(1),
      completionStatus: z.enum(['COMPLETED', 'PARTIAL', 'MISSED']),
      actualMinutes: z.number().int().min(0).max(1440).optional().nullable(),
      notes: z.string().max(2000).optional().nullable(),
    })
  ).min(1),
});

// === HELPER ===

/**
 * Parse request body with a Zod schema.
 * Returns { data } on success, { error: Response } on failure.
 */
export async function parseBody<T>(
  request: Request,
  schema: z.ZodSchema<T>
): Promise<{ data: T; error?: never } | { data?: never; error: Response }> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return {
      error: Response.json(
        { error: 'Invalid or missing JSON body' },
        { status: 400 }
      ),
    };
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    const firstError = result.error.issues[0];
    return {
      error: Response.json(
        { error: firstError?.message ?? 'Validation failed' },
        { status: 400 }
      ),
    };
  }

  return { data: result.data };
}
