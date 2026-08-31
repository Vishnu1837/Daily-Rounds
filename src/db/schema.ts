/**
 * Daily Rounds — relational schema.
 *
 * Architectural rule (see docs/ARCHITECTURE.md):
 *   SOURCE data lives here as facts (attendance, sessions, check-ins, points ledger
 *   entries). DERIVED metrics (streaks, consistency %, leaderboard rank, risk level,
 *   cohort streak) are computed by services in src/lib/domain and are always recalculable
 *   from source. `daily_activity` is a *cache* of derived state, never a source of truth.
 *
 * Dates that represent "a study day" use the `date` type and are always evaluated in the
 * cohort's timezone. Instants use `timestamptz`.
 */
import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

/* ------------------------------------------------------------------ enums */

export const userRoleEnum = pgEnum('user_role', ['student', 'admin']);
export const membershipStatusEnum = pgEnum('membership_status', ['active', 'paused', 'left']);
export const topicStatusEnum = pgEnum('topic_status', ['upcoming', 'in_progress', 'completed']);
export const sessionStatusEnum = pgEnum('study_session_status', [
  'running',
  'paused',
  'completed',
  'abandoned',
]);
export const attendanceStatusEnum = pgEnum('attendance_status', ['present', 'late', 'absent']);
export const checkInCompletionEnum = pgEnum('check_in_completion', [
  'completed',
  'partial',
  'none',
]);
export const obstacleEnum = pgEnum('obstacle', [
  'procrastination',
  'social_media',
  'sleep',
  'classes',
  'unclear_what_to_study',
  'lack_of_motivation',
  'personal',
  'other',
  'none',
]);
export const eventTypeEnum = pgEnum('event_type', [
  'study_room',
  'workshop',
  'guest_session',
  'weekly_review',
  'assessment',
  'other',
]);
export const materialTypeEnum = pgEnum('material_type', [
  'pdf',
  'drive',
  'video',
  'textbook',
  'website',
  'recording',
]);
export const riskLevelEnum = pgEnum('risk_level', ['on_track', 'at_risk', 'needs_intervention']);
export const dayBandEnum = pgEnum('day_band', [
  'perfect',
  'strong',
  'active',
  'weak',
  'missed',
  'off',
]);
export const pointEventEnum = pgEnum('point_event', [
  'daily_check_in',
  'tomorrow_plan',
  'live_session_present',
  'live_session_late',
  'study_block_completed',
  'daily_target_completed',
  'reflection',
  'quiz_attempt',
  'quiz_bonus',
  'streak_bonus',
  'achievement',
  'weekly_review',
  'admin_adjustment',
]);

/* ------------------------------------------------------------------ users */

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: varchar('email', { length: 255 }).notNull(),
    passwordHash: text('password_hash').notNull(),
    fullName: varchar('full_name', { length: 120 }).notNull(),
    whatsapp: varchar('whatsapp', { length: 32 }),
    university: varchar('university', { length: 160 }),
    mbbsYear: smallint('mbbs_year'),
    role: userRoleEnum('role').notNull().default('student'),
    timezone: varchar('timezone', { length: 64 }).notNull().default('Asia/Kolkata'),
    avatarSeed: varchar('avatar_seed', { length: 32 }).notNull().default('dr'),
    onboardingCompletedAt: timestamp('onboarding_completed_at', { withTimezone: true }),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('users_email_lower_idx').on(sql`lower(${t.email})`)],
);

export const authSessions = pgTable(
  'auth_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('auth_sessions_token_idx').on(t.tokenHash),
    index('auth_sessions_user_idx').on(t.userId),
  ],
);

export const passwordResetTokens = pgTable(
  'password_reset_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('password_reset_token_idx').on(t.tokenHash)],
);

/* ---------------------------------------------------------------- cohorts */

export type CohortSettings = {
  atRiskMissedDays?: number;
  interventionMissedDays?: number;
  atRiskConsistencyDropPct?: number;
  minConsistencyPct?: number;
};

export const cohorts = pgTable(
  'cohorts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 120 }).notNull(),
    slug: varchar('slug', { length: 80 }).notNull(),
    timezone: varchar('timezone', { length: 64 }).notNull().default('Asia/Kolkata'),
    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),
    /** ISO weekday numbers that count as active study days. 1 = Monday … 7 = Sunday. */
    activeWeekdays: integer('active_weekdays').array().notNull().default([1, 2, 3, 4, 5]),
    /** % of members who must show up for the cohort streak to survive a day. */
    streakThresholdPct: smallint('streak_threshold_pct').notNull().default(70),
    meetUrl: text('meet_url'),
    meetStartTime: varchar('meet_start_time', { length: 5 }).notNull().default('06:00'),
    meetEndTime: varchar('meet_end_time', { length: 5 }).notNull().default('07:00'),
    /** Risk thresholds & other admin-editable knobs. */
    settings: jsonb('settings')
      .$type<CohortSettings>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('cohorts_slug_idx').on(t.slug)],
);

export const cohortHolidays = pgTable(
  'cohort_holidays',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    cohortId: uuid('cohort_id')
      .notNull()
      .references(() => cohorts.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    label: varchar('label', { length: 120 }).notNull(),
  },
  (t) => [uniqueIndex('cohort_holiday_unique').on(t.cohortId, t.date)],
);

/** Ad-hoc extra study day (e.g. a Saturday catch-up the cohort agreed to). */
export const cohortExtraStudyDays = pgTable(
  'cohort_extra_study_days',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    cohortId: uuid('cohort_id')
      .notNull()
      .references(() => cohorts.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    label: varchar('label', { length: 120 }).notNull(),
  },
  (t) => [uniqueIndex('cohort_extra_day_unique').on(t.cohortId, t.date)],
);

export const cohortMembers = pgTable(
  'cohort_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    cohortId: uuid('cohort_id')
      .notNull()
      .references(() => cohorts.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: membershipStatusEnum('status').notNull().default('active'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('cohort_member_unique').on(t.cohortId, t.userId),
    index('cohort_member_cohort_idx').on(t.cohortId),
  ],
);

/* --------------------------------------------------------------- subjects */

export const subjects = pgTable(
  'subjects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 120 }).notNull(),
    slug: varchar('slug', { length: 80 }).notNull(),
    /** Accent token consumed by the UI theme. */
    accent: varchar('accent', { length: 24 }).notNull().default('violet'),
  },
  (t) => [uniqueIndex('subjects_slug_idx').on(t.slug)],
);

/** Onboarding baseline + goals. One row per membership. */
export const studentGoals = pgTable(
  'student_goals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    memberId: uuid('member_id')
      .notNull()
      .references(() => cohortMembers.id, { onDelete: 'cascade' }),
    primarySubjectId: uuid('primary_subject_id').references(() => subjects.id),
    secondarySubjectId: uuid('secondary_subject_id').references(() => subjects.id),
    cohortGoal: text('cohort_goal').notNull(),
    dailyCommitmentMinutes: integer('daily_commitment_minutes').notNull().default(90),
    examName: varchar('exam_name', { length: 160 }),
    examDate: date('exam_date'),
    baselineDaysStudiedLastWeek: smallint('baseline_days_studied_last_week').notNull(),
    baselineConsistencyRating: smallint('baseline_consistency_rating').notNull(),
    baselineConfidence: smallint('baseline_confidence').notNull(),
    biggestObstacle: obstacleEnum('biggest_obstacle').notNull(),
    obstacleNote: text('obstacle_note'),
    /** Filled at cohort end for the before/after report. */
    finalConsistencyRating: smallint('final_consistency_rating'),
    finalConfidence: smallint('final_confidence'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('student_goals_member_unique').on(t.memberId)],
);

/* --------------------------------------------------------------- roadmaps */

export const roadmaps = pgTable(
  'roadmaps',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    memberId: uuid('member_id')
      .notNull()
      .references(() => cohortMembers.id, { onDelete: 'cascade' }),
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => subjects.id),
    title: varchar('title', { length: 160 }).notNull(),
    /** e.g. "General Pathology" */
    track: varchar('track', { length: 160 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('roadmaps_member_idx').on(t.memberId)],
);

export const roadmapWeeks = pgTable(
  'roadmap_weeks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    roadmapId: uuid('roadmap_id')
      .notNull()
      .references(() => roadmaps.id, { onDelete: 'cascade' }),
    weekNumber: smallint('week_number').notNull(),
    title: varchar('title', { length: 160 }).notNull(),
  },
  (t) => [uniqueIndex('roadmap_week_unique').on(t.roadmapId, t.weekNumber)],
);

export const roadmapTopics = pgTable(
  'roadmap_topics',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    roadmapId: uuid('roadmap_id')
      .notNull()
      .references(() => roadmaps.id, { onDelete: 'cascade' }),
    weekId: uuid('week_id').references(() => roadmapWeeks.id, { onDelete: 'set null' }),
    title: varchar('title', { length: 200 }).notNull(),
    description: text('description'),
    position: integer('position').notNull().default(0),
    status: topicStatusEnum('status').notNull().default('upcoming'),
    estimatedMinutes: integer('estimated_minutes').notNull().default(90),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => [index('roadmap_topics_roadmap_idx').on(t.roadmapId, t.position)],
);

/* ------------------------------------------------------ daily assignments */

export const dailyAssignments = pgTable(
  'daily_assignments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    memberId: uuid('member_id')
      .notNull()
      .references(() => cohortMembers.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    topicId: uuid('topic_id').references(() => roadmapTopics.id, { onDelete: 'set null' }),
    plannedMinutes: integer('planned_minutes').notNull().default(90),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('daily_assignment_unique').on(t.memberId, t.date)],
);

/* --------------------------------------------------------- study sessions */

export const studySessions = pgTable(
  'study_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    memberId: uuid('member_id')
      .notNull()
      .references(() => cohortMembers.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    topicId: uuid('topic_id').references(() => roadmapTopics.id, { onDelete: 'set null' }),
    plannedMinutes: integer('planned_minutes').notNull().default(90),
    /** Accumulated focus seconds; excludes paused time. */
    elapsedSeconds: integer('elapsed_seconds').notNull().default(0),
    status: sessionStatusEnum('status').notNull().default('running'),
    /** When the current running segment began; null while paused or finished. */
    resumedAt: timestamp('resumed_at', { withTimezone: true }),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
  },
  (t) => [index('study_sessions_member_date_idx').on(t.memberId, t.date)],
);

/* -------------------------------------------------- events and attendance */

export const events = pgTable(
  'events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    cohortId: uuid('cohort_id')
      .notNull()
      .references(() => cohorts.id, { onDelete: 'cascade' }),
    type: eventTypeEnum('type').notNull().default('other'),
    title: varchar('title', { length: 160 }).notNull(),
    description: text('description'),
    date: date('date').notNull(),
    startTime: varchar('start_time', { length: 5 }).notNull().default('18:00'),
    endTime: varchar('end_time', { length: 5 }).notNull().default('19:00'),
    meetUrl: text('meet_url'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('events_cohort_date_idx').on(t.cohortId, t.date)],
);

export const attendance = pgTable(
  'attendance',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    memberId: uuid('member_id')
      .notNull()
      .references(() => cohortMembers.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    /** null = the recurring daily study room. */
    eventId: uuid('event_id').references(() => events.id, { onDelete: 'cascade' }),
    status: attendanceStatusEnum('status').notNull(),
    note: text('note'),
    markedBy: uuid('marked_by').references(() => users.id, { onDelete: 'set null' }),
    markedAt: timestamp('marked_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('attendance_unique').on(t.memberId, t.date),
    index('attendance_date_idx').on(t.date),
  ],
);

/* --------------------------------------------------------------- check-in */

export const checkIns = pgTable(
  'check_ins',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    memberId: uuid('member_id')
      .notNull()
      .references(() => cohortMembers.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    completion: checkInCompletionEnum('completion').notNull(),
    actualMinutes: integer('actual_minutes').notNull().default(0),
    whatStudied: text('what_studied').notNull(),
    obstacle: obstacleEnum('obstacle').notNull().default('none'),
    obstacleNote: text('obstacle_note'),
    tomorrowTarget: text('tomorrow_target'),
    satisfaction: smallint('satisfaction').notNull(),
    reflection: text('reflection'),
    /** True when this check-in was the first day back after a broken streak. */
    isComeback: boolean('is_comeback').notNull().default(false),
    comebackReason: text('comeback_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('check_in_unique').on(t.memberId, t.date)],
);

/* ---------------------------------------------------------- points ledger */

export const pointRules = pgTable(
  'point_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    cohortId: uuid('cohort_id')
      .notNull()
      .references(() => cohorts.id, { onDelete: 'cascade' }),
    event: pointEventEnum('event').notNull(),
    points: integer('points').notNull(),
  },
  (t) => [uniqueIndex('point_rule_unique').on(t.cohortId, t.event)],
);

export const pointsLedger = pgTable(
  'points_ledger',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    memberId: uuid('member_id')
      .notNull()
      .references(() => cohortMembers.id, { onDelete: 'cascade' }),
    event: pointEventEnum('event').notNull(),
    points: integer('points').notNull(),
    /** The study day this award belongs to (cohort timezone). */
    occurredOn: date('occurred_on').notNull(),
    /** Guards duplicate awards, e.g. `daily_check_in:<memberId>:<date>`. */
    idempotencyKey: text('idempotency_key').notNull(),
    reason: text('reason'),
    metadata: jsonb('metadata')
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('points_idempotency_unique').on(t.idempotencyKey),
    index('points_member_date_idx').on(t.memberId, t.occurredOn),
  ],
);

/* ------------------------------------------- derived daily activity cache */

export const dailyActivity = pgTable(
  'daily_activity',
  {
    memberId: uuid('member_id')
      .notNull()
      .references(() => cohortMembers.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    isActiveDay: boolean('is_active_day').notNull(),
    showedUp: boolean('showed_up').notNull().default(false),
    points: integer('points').notNull().default(0),
    /** Behaviour completion for the day, 0–100. The exact consistency numerator. */
    scorePct: smallint('score_pct').notNull().default(0),
    band: dayBandEnum('band').notNull().default('off'),
    studyMinutes: integer('study_minutes').notNull().default(0),
    computedAt: timestamp('computed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.memberId, t.date] }),
    index('daily_activity_date_idx').on(t.date),
  ],
);

/* ----------------------------------------------------------- achievements */

export const studentAchievements = pgTable(
  'student_achievements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    memberId: uuid('member_id')
      .notNull()
      .references(() => cohortMembers.id, { onDelete: 'cascade' }),
    code: varchar('code', { length: 48 }).notNull(),
    earnedOn: date('earned_on').notNull(),
    metadata: jsonb('metadata')
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    /** Set once the celebration has been shown to the student. */
    seenAt: timestamp('seen_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('student_achievement_unique').on(t.memberId, t.code)],
);

/* ---------------------------------------------------------------- quizzes */

export const quizzes = pgTable('quizzes', {
  id: uuid('id').primaryKey().defaultRandom(),
  subjectId: uuid('subject_id').references(() => subjects.id, { onDelete: 'set null' }),
  /** Matched against a topic title so one quiz can serve every personal roadmap. */
  topicKey: varchar('topic_key', { length: 200 }).notNull(),
  title: varchar('title', { length: 160 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const quizQuestions = pgTable(
  'quiz_questions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    quizId: uuid('quiz_id')
      .notNull()
      .references(() => quizzes.id, { onDelete: 'cascade' }),
    prompt: text('prompt').notNull(),
    options: jsonb('options').$type<string[]>().notNull(),
    correctIndex: smallint('correct_index').notNull(),
    explanation: text('explanation'),
  },
  (t) => [index('quiz_questions_quiz_idx').on(t.quizId)],
);

export const quizAttempts = pgTable(
  'quiz_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    memberId: uuid('member_id')
      .notNull()
      .references(() => cohortMembers.id, { onDelete: 'cascade' }),
    quizId: uuid('quiz_id')
      .notNull()
      .references(() => quizzes.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    score: smallint('score').notNull(),
    total: smallint('total').notNull(),
    answers: jsonb('answers').$type<number[]>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('quiz_attempts_member_idx').on(t.memberId)],
);

/* -------------------------------------------------------------- materials */

export const materials = pgTable(
  'materials',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    cohortId: uuid('cohort_id')
      .notNull()
      .references(() => cohorts.id, { onDelete: 'cascade' }),
    subjectId: uuid('subject_id').references(() => subjects.id, { onDelete: 'set null' }),
    topicKey: varchar('topic_key', { length: 200 }),
    title: varchar('title', { length: 200 }).notNull(),
    description: text('description'),
    type: materialTypeEnum('type').notNull().default('website'),
    url: text('url').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('materials_cohort_idx').on(t.cohortId)],
);

/* ---------------------------------------------------------- announcements */

export const announcements = pgTable(
  'announcements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    cohortId: uuid('cohort_id')
      .notNull()
      .references(() => cohorts.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 160 }).notNull(),
    body: text('body').notNull(),
    isPinned: boolean('is_pinned').notNull().default(false),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('announcements_cohort_idx').on(t.cohortId)],
);

/* --------------------------------------------------------- weekly reviews */

export const weeklyReviews = pgTable(
  'weekly_reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    memberId: uuid('member_id')
      .notNull()
      .references(() => cohortMembers.id, { onDelete: 'cascade' }),
    /** Monday of the reviewed week, cohort timezone. */
    weekStart: date('week_start').notNull(),
    whatWentWell: text('what_went_well').notNull(),
    whatStopped: text('what_stopped').notNull(),
    whatToChange: text('what_to_change').notNull(),
    subjectConfidence: smallint('subject_confidence').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('weekly_review_unique').on(t.memberId, t.weekStart)],
);

/* -------------------------------------------------------------- audit log */

export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    action: varchar('action', { length: 80 }).notNull(),
    entity: varchar('entity', { length: 80 }).notNull(),
    entityId: text('entity_id'),
    payload: jsonb('payload')
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('audit_log_created_idx').on(t.createdAt)],
);

/* -------------------------------------------------------------- relations */

export const usersRelations = relations(users, ({ many }) => ({
  memberships: many(cohortMembers),
}));

export const cohortsRelations = relations(cohorts, ({ many }) => ({
  members: many(cohortMembers),
  holidays: many(cohortHolidays),
  extraStudyDays: many(cohortExtraStudyDays),
  events: many(events),
  pointRules: many(pointRules),
}));

export const cohortMembersRelations = relations(cohortMembers, ({ one, many }) => ({
  cohort: one(cohorts, { fields: [cohortMembers.cohortId], references: [cohorts.id] }),
  user: one(users, { fields: [cohortMembers.userId], references: [users.id] }),
  roadmaps: many(roadmaps),
  assignments: many(dailyAssignments),
  sessions: many(studySessions),
  checkIns: many(checkIns),
  points: many(pointsLedger),
  achievements: many(studentAchievements),
}));

export const roadmapsRelations = relations(roadmaps, ({ one, many }) => ({
  member: one(cohortMembers, { fields: [roadmaps.memberId], references: [cohortMembers.id] }),
  subject: one(subjects, { fields: [roadmaps.subjectId], references: [subjects.id] }),
  weeks: many(roadmapWeeks),
  topics: many(roadmapTopics),
}));

export const roadmapWeeksRelations = relations(roadmapWeeks, ({ one, many }) => ({
  roadmap: one(roadmaps, { fields: [roadmapWeeks.roadmapId], references: [roadmaps.id] }),
  topics: many(roadmapTopics),
}));

export const roadmapTopicsRelations = relations(roadmapTopics, ({ one }) => ({
  roadmap: one(roadmaps, { fields: [roadmapTopics.roadmapId], references: [roadmaps.id] }),
  week: one(roadmapWeeks, { fields: [roadmapTopics.weekId], references: [roadmapWeeks.id] }),
}));

export const quizzesRelations = relations(quizzes, ({ many }) => ({
  questions: many(quizQuestions),
}));

export const quizQuestionsRelations = relations(quizQuestions, ({ one }) => ({
  quiz: one(quizzes, { fields: [quizQuestions.quizId], references: [quizzes.id] }),
}));

/* ------------------------------------------------------------ row types */

export type User = typeof users.$inferSelect;
export type Cohort = typeof cohorts.$inferSelect;
export type CohortMember = typeof cohortMembers.$inferSelect;
export type Subject = typeof subjects.$inferSelect;
export type StudentGoals = typeof studentGoals.$inferSelect;
export type Roadmap = typeof roadmaps.$inferSelect;
export type RoadmapWeek = typeof roadmapWeeks.$inferSelect;
export type RoadmapTopic = typeof roadmapTopics.$inferSelect;
export type DailyAssignment = typeof dailyAssignments.$inferSelect;
export type StudySession = typeof studySessions.$inferSelect;
export type Attendance = typeof attendance.$inferSelect;
export type CheckIn = typeof checkIns.$inferSelect;
export type PointsLedgerEntry = typeof pointsLedger.$inferSelect;
export type DailyActivity = typeof dailyActivity.$inferSelect;
export type StudentAchievement = typeof studentAchievements.$inferSelect;
export type Material = typeof materials.$inferSelect;
export type CohortEvent = typeof events.$inferSelect;
export type Announcement = typeof announcements.$inferSelect;
export type WeeklyReview = typeof weeklyReviews.$inferSelect;
export type Quiz = typeof quizzes.$inferSelect;
export type QuizQuestion = typeof quizQuestions.$inferSelect;
export type QuizAttempt = typeof quizAttempts.$inferSelect;
export type PointEvent = (typeof pointEventEnum.enumValues)[number];
export type RiskLevel = (typeof riskLevelEnum.enumValues)[number];
export type DayBand = (typeof dayBandEnum.enumValues)[number];
export type AttendanceStatus = (typeof attendanceStatusEnum.enumValues)[number];
export type Obstacle = (typeof obstacleEnum.enumValues)[number];
export type EventType = (typeof eventTypeEnum.enumValues)[number];
export type MaterialType = (typeof materialTypeEnum.enumValues)[number];
