import { z } from 'zod';

// === SHARED FIELD SCHEMAS ===

const hhmmTime = z.string().regex(/^\d{2}:\d{2}$/, 'Must be HH:mm format').optional().nullable();
const reviewDuration = z.number().int().min(1).max(480).optional().nullable();

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
  dueDate: z.string().optional().nullable(),
  goalId: z.string().optional().nullable(),
  processId: z.string().optional().nullable(),
  ownerId: z.string().optional(),
  recurrenceRule: z.string().max(500).optional().nullable(),
  timeBlockStart: z.string().optional().nullable(),
  timeBlockEnd: z.string().optional().nullable(),
  deliverable: z.string().max(1000).optional().nullable(),
  estimatedMinutes: z.number().int().min(1).max(1440).optional().nullable(),
  preferredTimeStart: z.string().optional().nullable(),
  preferredTimeEnd: z.string().optional().nullable(),
  isWinTheDay: z.boolean().optional(),
  parentId: z.string().optional().nullable(),
  assigneeId: z.string().optional().nullable(),
});

export const updateTaskSchema = z.object({
  status: z.enum(['TODO', 'IN_PROGRESS', 'DONE', 'DROPPED']).optional(),
  title: z.string().min(3, 'Title must be at least 3 characters').max(500).optional(),
  description: z.string().max(5000).optional().nullable(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  dueDate: z.string().optional().nullable(),
  timeBlockStart: z.string().optional().nullable(),
  timeBlockEnd: z.string().optional().nullable(),
  isWinTheDay: z.boolean().optional(),
  deliverable: z.string().max(1000).optional().nullable(),
  estimatedMinutes: z.number().int().min(1).max(1440).optional().nullable(),
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
  powerdownTime: hhmmTime,
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
  streakCountAims:      z.boolean().optional(),
  streakCountProcesses: z.boolean().optional(),
  streakCountReviews:   z.boolean().optional(),
  streakCountPowerdown: z.boolean().optional(),
  companyMtp: z.string().max(10000).optional(),
  notificationPrefs: z.object({
    emailEnabled: z.boolean().optional(),
    pushEnabled: z.boolean().optional(),
    derailingAlerts: z.boolean().optional(),
    mentionAlerts: z.boolean().optional(),
    reviewNags: z.boolean().optional(),
  }).optional(),
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

// === STACKS ===

export const createStackSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  description: z.string().max(2000).optional().nullable(),
  color: z.string().max(50).optional().nullable(),
  icon: z.string().max(50).optional().nullable(),
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
