import { z } from 'zod';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const isoDateSchema = z.string().regex(ISO_DATE, 'Expected a YYYY-MM-DD date');

export const emailSchema = z
  .string()
  .trim()
  .min(1, 'Email is required')
  .max(255)
  .email('That does not look like an email address')
  .transform((v) => v.toLowerCase());

export const passwordSchema = z
  .string()
  .min(8, 'Use at least 8 characters')
  .max(200, 'That password is too long');

/* ------------------------------------------------------------------- auth */

export const signUpSchema = z.object({
  fullName: z.string().trim().min(2, 'Tell us your name').max(120),
  email: emailSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password'),
});

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z
  .object({
    token: z.string().min(10, 'This reset link is not valid'),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

/* ------------------------------------------------------------- onboarding */

export const obstacleValues = [
  'procrastination',
  'social_media',
  'sleep',
  'classes',
  'unclear_what_to_study',
  'lack_of_motivation',
  'personal',
  'other',
] as const;

export const OBSTACLE_LABELS: Record<string, string> = {
  procrastination: 'Procrastination',
  social_media: 'Social media',
  sleep: 'Sleep',
  classes: 'Classes',
  unclear_what_to_study: "Don't know what to study",
  lack_of_motivation: 'Lack of motivation',
  personal: 'Personal reasons',
  other: 'Other',
  none: 'Nothing stopped me',
};

export const onboardingSchema = z.object({
  fullName: z.string().trim().min(2, 'Tell us your name').max(120),
  whatsapp: z
    .string()
    .trim()
    .min(7, 'Enter a WhatsApp number we can reach you on')
    .max(32)
    .regex(/^[+0-9 ()-]+$/, 'Use digits, spaces and + only'),
  university: z.string().trim().min(2, 'Which university?').max(160),
  mbbsYear: z.coerce.number().int().min(1, 'Pick your year').max(5),
  timezone: z.string().trim().min(3).max(64).default('Asia/Kolkata'),

  primarySubjectId: z.string().uuid('Choose a primary subject'),
  secondarySubjectId: z.string().uuid().optional().or(z.literal('')).transform((v) => v || undefined),
  cohortGoal: z
    .string()
    .trim()
    .min(10, 'Describe what you want to finish — a sentence is enough')
    .max(500),
  dailyCommitmentMinutes: z.coerce
    .number()
    .int()
    .min(15, 'Commit to at least 15 minutes')
    .max(720, 'That is more than 12 hours — pick something realistic'),
  examName: z.string().trim().max(160).optional().or(z.literal('')).transform((v) => v || undefined),
  examDate: isoDateSchema.optional().or(z.literal('')).transform((v) => v || undefined),

  baselineDaysStudiedLastWeek: z.coerce.number().int().min(0).max(7),
  baselineConsistencyRating: z.coerce.number().int().min(1).max(10),
  baselineConfidence: z.coerce.number().int().min(1).max(5),
  biggestObstacle: z.enum(obstacleValues),
  obstacleNote: z.string().trim().max(300).optional().or(z.literal('')).transform((v) => v || undefined),
});

export type OnboardingInput = z.infer<typeof onboardingSchema>;

/* --------------------------------------------------------------- check-in */

export const checkInSchema = z.object({
  date: isoDateSchema,
  completion: z.enum(['completed', 'partial', 'none']),
  actualMinutes: z.coerce
    .number()
    .int()
    .min(0, 'Minutes cannot be negative')
    .max(1440, 'A day only has 1440 minutes'),
  whatStudied: z.string().trim().min(3, 'A few words is enough').max(500),
  obstacle: z.enum([...obstacleValues, 'none']),
  obstacleNote: z.string().trim().max(300).optional().or(z.literal('')).transform((v) => v || undefined),
  tomorrowTarget: z.string().trim().max(500).optional().or(z.literal('')).transform((v) => v || undefined),
  satisfaction: z.coerce.number().int().min(1).max(5),
  reflection: z.string().trim().max(1000).optional().or(z.literal('')).transform((v) => v || undefined),
  comebackReason: z.string().trim().max(500).optional().or(z.literal('')).transform((v) => v || undefined),
});

export type CheckInInput = z.infer<typeof checkInSchema>;

/* --------------------------------------------------------- study sessions */

export const startSessionSchema = z.object({
  date: isoDateSchema,
  plannedMinutes: z.coerce.number().int().min(5).max(720),
});

export const sessionIdSchema = z.object({ sessionId: z.string().uuid() });

export const finishSessionSchema = z.object({
  sessionId: z.string().uuid(),
  /** Client-reported elapsed seconds; the server clamps it against wall-clock time. */
  elapsedSeconds: z.coerce.number().int().min(0).max(24 * 3600),
});

/* ------------------------------------------------------------ weekly review */

export const weeklyReviewSchema = z.object({
  weekStart: isoDateSchema,
  whatWentWell: z.string().trim().min(3, 'Even one line helps').max(1000),
  whatStopped: z.string().trim().min(3, 'Even one line helps').max(1000),
  whatToChange: z.string().trim().min(3, 'Even one line helps').max(1000),
  subjectConfidence: z.coerce.number().int().min(1).max(5),
});

/* ------------------------------------------------------------------ quiz */

export const quizSubmissionSchema = z.object({
  quizId: z.string().uuid(),
  answers: z.array(z.coerce.number().int().min(-1).max(10)).min(1).max(20),
});

/* ----------------------------------------------------------------- admin */

export const cohortSettingsSchema = z.object({
  cohortId: z.string().uuid(),
  name: z.string().trim().min(2).max(120),
  timezone: z.string().trim().min(3).max(64),
  startDate: isoDateSchema,
  endDate: isoDateSchema,
  activeWeekdays: z.array(z.coerce.number().int().min(1).max(7)).min(1, 'Pick at least one day'),
  streakThresholdPct: z.coerce.number().int().min(1).max(100),
  meetUrl: z.string().trim().url('Enter a full URL').max(500).optional().or(z.literal('')).transform((v) => v || undefined),
  meetStartTime: z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:MM'),
  meetEndTime: z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:MM'),
  atRiskMissedDays: z.coerce.number().int().min(1).max(30),
  interventionMissedDays: z.coerce.number().int().min(1).max(30),
  atRiskConsistencyDropPct: z.coerce.number().int().min(1).max(100),
  minConsistencyPct: z.coerce.number().int().min(0).max(100),
}).refine((v) => v.endDate >= v.startDate, {
  message: 'End date must be after the start date',
  path: ['endDate'],
});

export const holidaySchema = z.object({
  cohortId: z.string().uuid(),
  date: isoDateSchema,
  label: z.string().trim().min(2).max(120),
  kind: z.enum(['holiday', 'extra_study_day']),
});

export const pointRuleSchema = z.object({
  cohortId: z.string().uuid(),
  rules: z.record(z.string(), z.coerce.number().int().min(0).max(500)),
});

export const attendanceMarkSchema = z.object({
  date: isoDateSchema,
  entries: z
    .array(
      z.object({
        memberId: z.string().uuid(),
        status: z.enum(['present', 'late', 'absent']),
      }),
    )
    .min(1)
    .max(500),
});

export const roadmapSchema = z.object({
  memberId: z.string().uuid(),
  subjectId: z.string().uuid(),
  title: z.string().trim().min(2).max(160),
  track: z.string().trim().max(160).optional().or(z.literal('')).transform((v) => v || undefined),
});

export const roadmapWeekSchema = z.object({
  roadmapId: z.string().uuid(),
  weekNumber: z.coerce.number().int().min(1).max(52),
  title: z.string().trim().min(2).max(160),
});

export const topicSchema = z.object({
  roadmapId: z.string().uuid(),
  weekId: z.string().uuid().optional().or(z.literal('')).transform((v) => v || undefined),
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().max(1000).optional().or(z.literal('')).transform((v) => v || undefined),
  estimatedMinutes: z.coerce.number().int().min(5).max(720),
});

export const topicUpdateSchema = topicSchema.extend({ topicId: z.string().uuid() });

export const topicReorderSchema = z.object({
  roadmapId: z.string().uuid(),
  topicIds: z.array(z.string().uuid()).min(1).max(500),
});

export const assignmentSchema = z.object({
  memberId: z.string().uuid(),
  date: isoDateSchema,
  topicId: z.string().uuid().optional().or(z.literal('')).transform((v) => v || undefined),
  plannedMinutes: z.coerce.number().int().min(5).max(720),
  note: z.string().trim().max(500).optional().or(z.literal('')).transform((v) => v || undefined),
});

export const bulkAssignmentSchema = z.object({
  cohortId: z.string().uuid(),
  date: isoDateSchema,
  plannedMinutes: z.coerce.number().int().min(5).max(720),
  /** Assign each student the next uncompleted topic on their own roadmap. */
  strategy: z.literal('next_topic'),
});

export const materialSchema = z.object({
  cohortId: z.string().uuid(),
  subjectId: z.string().uuid().optional().or(z.literal('')).transform((v) => v || undefined),
  topicKey: z.string().trim().max(200).optional().or(z.literal('')).transform((v) => v || undefined),
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().max(500).optional().or(z.literal('')).transform((v) => v || undefined),
  type: z.enum(['pdf', 'drive', 'video', 'textbook', 'website', 'recording']),
  url: z.string().trim().url('Enter a full URL including https://').max(1000),
});

export const eventSchema = z.object({
  cohortId: z.string().uuid(),
  type: z.enum(['study_room', 'workshop', 'guest_session', 'weekly_review', 'assessment', 'other']),
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().max(1000).optional().or(z.literal('')).transform((v) => v || undefined),
  date: isoDateSchema,
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:MM'),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:MM'),
  meetUrl: z.string().trim().url('Enter a full URL').max(500).optional().or(z.literal('')).transform((v) => v || undefined),
});

export const announcementSchema = z.object({
  cohortId: z.string().uuid(),
  title: z.string().trim().min(2).max(160),
  body: z.string().trim().min(2).max(2000),
  isPinned: z.coerce.boolean().default(false),
});

export const pointAdjustmentSchema = z.object({
  memberId: z.string().uuid(),
  points: z.coerce
    .number()
    .int()
    .min(-1000)
    .max(1000)
    .refine((v) => v !== 0, 'Enter a non-zero adjustment'),
  reason: z.string().trim().min(3, 'Record why — this is auditable').max(300),
  date: isoDateSchema,
});

export const studentAdminSchema = z.object({
  userId: z.string().uuid(),
  fullName: z.string().trim().min(2).max(120),
  email: emailSchema,
  whatsapp: z.string().trim().max(32).optional().or(z.literal('')).transform((v) => v || undefined),
  university: z.string().trim().max(160).optional().or(z.literal('')).transform((v) => v || undefined),
  mbbsYear: z.coerce.number().int().min(1).max(5).optional(),
  role: z.enum(['student', 'admin']),
  status: z.enum(['active', 'paused', 'left']),
});

export const createStudentSchema = z.object({
  cohortId: z.string().uuid(),
  fullName: z.string().trim().min(2).max(120),
  email: emailSchema,
  password: passwordSchema,
  mbbsYear: z.coerce.number().int().min(1).max(5).optional(),
  university: z.string().trim().max(160).optional().or(z.literal('')).transform((v) => v || undefined),
});

export const profileSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  whatsapp: z.string().trim().max(32).optional().or(z.literal('')).transform((v) => v || undefined),
  university: z.string().trim().max(160).optional().or(z.literal('')).transform((v) => v || undefined),
  mbbsYear: z.coerce.number().int().min(1).max(5).optional(),
  timezone: z.string().trim().min(3).max(64),
});

/* ----------------------------------------------------- form error helpers */

export type FieldErrors = Record<string, string>;

/** Flattens a Zod error into a `{ field: firstMessage }` map for form rendering. */
export function fieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'form';
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}
