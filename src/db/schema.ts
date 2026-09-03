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
export const treeStatusEnum = pgEnum('focus_tree_status', ['growing', 'grown', 'withered']);
export const treeSpeciesEnum = pgEnum('focus_tree_species', [
  'sprout',
  'fern',
  'neem',
  'banyan',
  'deodar',
]);
export const witherReasonEnum = pgEnum('focus_wither_reason', ['left', 'gave_up', 'abandoned']);
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
/**
 * Which of a student's two active roadmaps this is.
 *
 * A student has at most one roadmap per slot, which is how "maximum two active subjects" is
 * enforced by the database rather than by hoping every call site remembers to check.
 */
export const roadmapSlotEnum = pgEnum('roadmap_slot', ['primary', 'secondary']);
export const assessmentStatusEnum = pgEnum('assessment_status', ['draft', 'published', 'archived']);
export const questionTypeEnum = pgEnum('assessment_question_type', [
  'mcq',
  'image_mcq',
  'short_answer',
  'long_answer',
]);
export const attemptStatusEnum = pgEnum('assessment_attempt_status', [
  'in_progress',
  'submitted',
  /** Ended by the total timer running out rather than by the student submitting. */
  'expired',
  /** Superseded by a restart after an integrity breach. Kept, never deleted. */
  'invalidated',
]);
export const reviewStatusEnum = pgEnum('assessment_review_status', [
  /** Nothing to mark by hand: every question was auto-gradable. */
  'auto',
  'pending',
  'reviewed',
]);
export const integrityEventEnum = pgEnum('assessment_integrity_event', [
  'focus_lost',
  'focus_returned',
  'threshold_breached',
  'restarted',
]);
export const waitlistStatusEnum = pgEnum('waitlist_status', [
  'new',
  'contacted',
  'enrolled',
  'declined',
]);
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
    /**
     * An uploaded profile picture, stored inline as a `data:image/...` URL. The client
     * downscales to a 256px square before upload, so a row is tens of kilobytes; null
     * means "use the generated initials avatar".
     */
    avatarUrl: text('avatar_url'),
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
    /**
     * What the study room is called on a student's home screen.
     *
     * Null means "name it after the hour it runs at" — see `roomTitle` in
     * src/lib/domain/study-room.ts. A cohort that moves its room from 06:00 to 19:00 should
     * not still be told to attend the *morning* study room, and a cohort lead who wants to
     * call it something else entirely sets this and the derived name steps aside.
     */
    meetTitle: varchar('meet_title', { length: 120 }),
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
    /*
     * Every authenticated request resolves a session to a membership by `user_id` alone.
     * The composite unique index above is keyed on the cohort first, so it cannot serve
     * that lookup; without this one it was a sequential scan on the hottest path in the
     * application.
     */
    index('cohort_member_user_idx').on(t.userId),
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
    /**
     * Every consistency challenge the student picked, not just the worst one.
     *
     * `biggestObstacle` above stays as the single headline value because the risk and
     * check-in logic keys off one obstacle; this array is the fuller picture onboarding now
     * collects, and is what the admin student view shows.
     */
    challenges: text('challenges')
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
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
    /**
     * Which of the student's two active subjects this roadmap fills.
     *
     * The partial unique index below allows exactly one roadmap per (member, slot), so a
     * student can never end up with three active subjects. Replacing a subject rewrites the
     * roadmap in that slot and leaves the other slot untouched.
     */
    slot: roadmapSlotEnum('slot').notNull().default('primary'),
    /**
     * The subject slug this roadmap was generated from, e.g. `anatomy`.
     *
     * Denormalised from `subjects.slug` on purpose: it is the key back into the curriculum
     * tree, and carrying it here means a roadmap can be regenerated or verified against the
     * syllabus without a join.
     */
    curriculumRef: varchar('curriculum_ref', { length: 200 }),
    /**
     * Whether an admin has hand-edited this student's sequence.
     *
     * The roadmap is generated from the master syllabus and, left alone, stays in syllabus
     * order. The moment an admin reorders, inserts or repositions a topic for this one
     * student, this flips — which is what "Custom" vs "Default" reports on the admin
     * screen, and what `Reset to default` clears. It is a label on the sequence, never a
     * gate: bulk advancement walks whatever order it finds, customised or not.
     */
    isCustomized: boolean('is_customized').notNull().default(false),
    /**
     * Set when the last topic of the subject is finished.
     *
     * Without it, "no next topic" and "subject finished" are the same silent state, and the
     * bulk advance had no way to say which. A completed roadmap stops receiving daily
     * assignments and reports itself as complete instead of quietly wrapping to topic 1.
     */
    completedAt: timestamp('completed_at', { withTimezone: true }),
    /** Bumped every time the roadmap is regenerated from the syllabus. */
    generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('roadmaps_member_idx').on(t.memberId),
    uniqueIndex('roadmaps_member_slot_unique').on(t.memberId, t.slot),
  ],
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
    /**
     * Where this topic sits in the MBBS curriculum, as a slug path — `anatomy/upper-limb`
     * or `anatomy/upper-limb/wrist-and-hand`. Set when a template is applied; null for a
     * topic an admin typed by hand. Quizzes and materials attach through it.
     */
    curriculumRef: varchar('curriculum_ref', { length: 200 }),
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
    /**
     * Which of the student's two subjects this day's topic belongs to.
     *
     * A student carries two roadmaps, so a day has up to two topics — one per slot — and
     * the home screen shows both. The slot is derived from the roadmap the topic sits on;
     * an off-roadmap topic (see `customTopicTitle`) has no roadmap to derive it from and
     * takes the primary slot, because it is standing in for the day's main focus.
     */
    slot: roadmapSlotEnum('slot').notNull().default('primary'),
    topicId: uuid('topic_id').references(() => roadmapTopics.id, { onDelete: 'set null' }),
    /**
     * A topic taken straight from the syllabus, for a subject this student has no roadmap
     * for.
     *
     * A member gets at most two roadmaps (the `primary`/`secondary` slots), but an admin is
     * allowed to point anyone at any topic in the whole curriculum on any day. When the
     * subject *is* one of their two, the topic is materialised on that roadmap and `topicId`
     * carries it, so roadmap progress stays coherent. When it is not, there is no roadmap to
     * hang it on and the day's topic is recorded here instead: a title, the curriculum ref
     * that quizzes and materials attach through, and the subject name to label it with.
     *
     * Reads coalesce the two — `topicId` wins when both are set.
     */
    customTopicTitle: varchar('custom_topic_title', { length: 200 }),
    customTopicRef: varchar('custom_topic_ref', { length: 200 }),
    customSubjectName: varchar('custom_subject_name', { length: 120 }),
    plannedMinutes: integer('planned_minutes').notNull().default(90),
    note: text('note'),
    /**
     * Where this row came from: `auto` for the bulk run and the onboarding fallback,
     * `admin` for a topic an admin chose for this one student.
     *
     * Bulk assignment reads this before it writes. Without it, "assign the next topic to
     * everyone" would quietly undo every individual assignment made that morning, which is
     * the one thing the two features must never do to each other.
     */
    source: varchar('source', { length: 16 }).$type<AssignmentSource>().notNull().default('auto'),
    assignedByUserId: uuid('assigned_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    assignedAt: timestamp('assigned_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('daily_assignment_unique').on(t.memberId, t.date, t.slot)],
);

export type AssignmentSource = 'auto' | 'admin';

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

/* ---------------------------------------------------------- the grove */

/**
 * One Pomodoro round, drawn as a tree.
 *
 * A row is written the moment the round starts, not when it finishes, because the whole
 * mechanic depends on the commitment existing before the outcome does. `planted_at` and
 * `due_at` are the only evidence the server trusts: whether a tree survived is a question
 * about the wall clock, never about what the browser claims its countdown reached.
 *
 * Rows are never deleted. A withered tree is the point of the feature.
 */
export const focusTrees = pgTable(
  'focus_trees',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    memberId: uuid('member_id')
      .notNull()
      .references(() => cohortMembers.id, { onDelete: 'cascade' }),
    /** The cohort-local day the round belongs to, so a grove day matches a roadmap day. */
    date: date('date').notNull(),
    /** The study block this round was sat inside, when there was one. */
    sessionId: uuid('session_id').references(() => studySessions.id, { onDelete: 'set null' }),
    topicId: uuid('topic_id').references(() => roadmapTopics.id, { onDelete: 'set null' }),
    /** Which Pomodoro preset was chosen: classic, deep or marathon. */
    preset: varchar('preset', { length: 16 }).notNull().default('classic'),
    /** The length promised, in minutes. Fixed at planting; never edited afterwards. */
    focusMinutes: integer('focus_minutes').notNull(),
    species: treeSpeciesEnum('species').notNull(),
    status: treeStatusEnum('status').notNull().default('growing'),
    witherReason: witherReasonEnum('wither_reason'),
    plantedAt: timestamp('planted_at', { withTimezone: true }).notNull().defaultNow(),
    /** When the round is owed. Stored so a sweep can settle trees nobody came back to. */
    dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
    settledAt: timestamp('settled_at', { withTimezone: true }),
  },
  (t) => [
    index('focus_trees_member_date_idx').on(t.memberId, t.date),
    index('focus_trees_status_idx').on(t.status),
  ],
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

/**
 * Who is in the morning study room right now.
 *
 * Attendance is the *fact of the day* — it survives, and an admin can overrule it. Presence
 * is the *live signal*: a student joins, their tab heartbeats every minute, and a row goes
 * stale on its own once the heartbeats stop. One row per member per day; re-joining after a
 * drop reuses it rather than opening a second.
 */
export const studyRoomPresence = pgTable(
  'study_room_presence',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    memberId: uuid('member_id')
      .notNull()
      .references(() => cohortMembers.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
    /** Bumped by the client heartbeat; drives the "still in the room" window. */
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    leftAt: timestamp('left_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('study_room_presence_unique').on(t.memberId, t.date),
    index('study_room_presence_date_idx').on(t.date),
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

export const quizzes = pgTable(
  'quizzes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    subjectId: uuid('subject_id').references(() => subjects.id, { onDelete: 'set null' }),
    /**
     * The place in the curriculum this quiz belongs to. One quiz serves every personal
     * roadmap whose topics sit on the same branch, so a quiz written once for
     * `pathology/general-pathology/inflammation` reaches every student studying it.
     */
    curriculumRef: varchar('curriculum_ref', { length: 200 }),
    title: varchar('title', { length: 160 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('quizzes_curriculum_ref_idx').on(t.curriculumRef)],
);

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

/* ------------------------------------------------------------ assessments */

/**
 * A timed, roadmap-linked questionnaire.
 *
 * Distinct from `quizzes`, which stay what they have always been: a short, optional,
 * untimed knowledge check attached to a curriculum branch, taken as often as a student
 * likes. An assessment is the graded thing — it has a clock, a pass mark, one attempt
 * history per student, an integrity log, and a private result. Folding the two together
 * would have meant every existing quiz suddenly acquiring a timer and a permanent record.
 */
export const assessments = pgTable(
  'assessments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    cohortId: uuid('cohort_id')
      .notNull()
      .references(() => cohorts.id, { onDelete: 'cascade' }),
    subjectId: uuid('subject_id').references(() => subjects.id, { onDelete: 'set null' }),
    /**
     * The place in the curriculum this assessment belongs to — the same address quizzes and
     * materials are filed under, so one assessment written for
     * `pathology/general-pathology/inflammation` reaches every student studying it whatever
     * their personal roadmap looks like.
     */
    curriculumRef: varchar('curriculum_ref', { length: 200 }),
    title: varchar('title', { length: 200 }).notNull(),
    instructions: text('instructions'),
    status: assessmentStatusEnum('status').notNull().default('draft'),
    /** Whole-assessment limit in seconds. Null means only the per-question timers apply. */
    totalTimeSeconds: integer('total_time_seconds'),
    /** Fills in for any question that carries no timer of its own. */
    defaultQuestionSeconds: integer('default_question_seconds').notNull().default(60),
    /**
     * How long the student may have the tab in the background before the attempt restarts.
     *
     * Configurable because it is a deterrent, not proctoring: it cannot tell a second phone
     * from a notification shade, and a threshold tight enough to catch the former punishes
     * everyone who gets a phone call. Five seconds is the brief's default.
     */
    focusGraceSeconds: integer('focus_grace_seconds').notNull().default(5),
    /** Percentage at or above which an attempt counts as passed. */
    passMarkPct: smallint('pass_mark_pct').notNull().default(60),
    /** Whether a student may see the question-by-question breakdown after submitting. */
    allowAnswerReview: boolean('allow_answer_review').notNull().default(true),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('assessments_cohort_idx').on(t.cohortId, t.status),
    index('assessments_curriculum_ref_idx').on(t.curriculumRef),
  ],
);

export const assessmentQuestions = pgTable(
  'assessment_questions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    assessmentId: uuid('assessment_id')
      .notNull()
      .references(() => assessments.id, { onDelete: 'cascade' }),
    position: integer('position').notNull().default(0),
    type: questionTypeEnum('type').notNull().default('mcq'),
    prompt: text('prompt').notNull(),
    /** Image-based MCQs only. A URL the admin supplies; nothing is uploaded here. */
    imageUrl: text('image_url'),
    /** MCQ choices in display order. Empty for the two subjective types. */
    options: jsonb('options')
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    /** Index into `options`. Null for subjective questions, which are not auto-gradable. */
    correctIndex: smallint('correct_index'),
    /**
     * The model answer for a subjective question.
     *
     * Never auto-compared against what the student wrote — it is what the admin reads
     * beside the response while marking it. The exact response text is preserved verbatim
     * on the answer row.
     */
    referenceAnswer: text('reference_answer'),
    explanation: text('explanation'),
    /** Overrides the assessment's default. Null means "use the default". */
    timeLimitSeconds: integer('time_limit_seconds'),
    points: smallint('points').notNull().default(1),
  },
  (t) => [index('assessment_questions_assessment_idx').on(t.assessmentId, t.position)],
);

/**
 * One sitting of an assessment by one student.
 *
 * `attemptNumber` climbs and rows are never deleted, including the ones a restart
 * invalidated: the brief's requirement is that integrity history stays auditable, and a
 * restart that erased the attempt it replaced would destroy exactly the evidence the admin
 * is meant to see.
 */
export const assessmentAttempts = pgTable(
  'assessment_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    assessmentId: uuid('assessment_id')
      .notNull()
      .references(() => assessments.id, { onDelete: 'cascade' }),
    memberId: uuid('member_id')
      .notNull()
      .references(() => cohortMembers.id, { onDelete: 'cascade' }),
    attemptNumber: integer('attempt_number').notNull().default(1),
    status: attemptStatusEnum('status').notNull().default('in_progress'),
    /**
     * Server-stamped. Every deadline on the screen is derived from this and from the
     * assessment's limits, so a refresh re-derives the same instants and cannot buy time.
     */
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    /** Materialised from `startedAt + totalTimeSeconds`; null when there is no total limit. */
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    /** How many times this student has had to restart this assessment, ever. */
    restartCount: integer('restart_count').notNull().default(0),
    /** Points earned on auto-gradable questions, and the total those were out of. */
    autoScore: integer('auto_score').notNull().default(0),
    autoTotal: integer('auto_total').notNull().default(0),
    /** Marks the admin added by hand for subjective questions. */
    manualScore: integer('manual_score').notNull().default(0),
    manualTotal: integer('manual_total').notNull().default(0),
    reviewStatus: reviewStatusEnum('review_status').notNull().default('auto'),
    reviewedByUserId: uuid('reviewed_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    /** Free-text note from the admin, shown to the student on their private result. */
    feedback: text('feedback'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('assessment_attempt_unique').on(t.assessmentId, t.memberId, t.attemptNumber),
    index('assessment_attempts_member_idx').on(t.memberId),
    index('assessment_attempts_assessment_idx').on(t.assessmentId, t.status),
  ],
);

export const assessmentAnswers = pgTable(
  'assessment_answers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    attemptId: uuid('attempt_id')
      .notNull()
      .references(() => assessmentAttempts.id, { onDelete: 'cascade' }),
    questionId: uuid('question_id')
      .notNull()
      .references(() => assessmentQuestions.id, { onDelete: 'cascade' }),
    /** MCQ selection. Null when unanswered, expired, or the question is subjective. */
    selectedIndex: smallint('selected_index'),
    /** Subjective response, preserved exactly as the student typed it. */
    textAnswer: text('text_answer'),
    /** When the question was first shown — the clock this question's timer runs from. */
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    answeredAt: timestamp('answered_at', { withTimezone: true }),
    /** True when the per-question timer ran out before an answer was submitted. */
    expired: boolean('expired').notNull().default(false),
    /** Null while a subjective answer is still awaiting review. */
    isCorrect: boolean('is_correct'),
    awardedPoints: smallint('awarded_points').notNull().default(0),
    reviewerNote: text('reviewer_note'),
  },
  (t) => [uniqueIndex('assessment_answer_unique').on(t.attemptId, t.questionId)],
);

/**
 * What the attempt did while nobody could see the tab.
 *
 * Recorded rather than judged. Page-visibility detection cannot prove a student was not
 * reading a second device, so the product's honest claim is that it logs behaviour — the
 * admin reads the log and decides, and the only automatic consequence is the restart the
 * threshold triggers.
 */
export const assessmentIntegrityEvents = pgTable(
  'assessment_integrity_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    attemptId: uuid('attempt_id')
      .notNull()
      .references(() => assessmentAttempts.id, { onDelete: 'cascade' }),
    kind: integrityEventEnum('kind').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    /** How long the tab was in the background, where the client could measure it. */
    awayMs: integer('away_ms'),
    detail: jsonb('detail')
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
  },
  (t) => [index('assessment_integrity_attempt_idx').on(t.attemptId, t.occurredAt)],
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
    /** Curriculum slug path this material covers. Null = general cohort material. */
    curriculumRef: varchar('curriculum_ref', { length: 200 }),
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
    /**
     * Surface this as a modal when the student next enters the portal.
     *
     * Acknowledgement is recorded in `announcement_reads`, so a popup is shown once and
     * then lives on in the announcement list like any other.
     */
    isPopup: boolean('is_popup').notNull().default(false),
    /**
     * Keep showing the popup on every entry, even after acknowledgement.
     *
     * Reserved for the rare "cohort starts Monday, read this" notice. Ordinary popups
     * respect the acknowledgement.
     */
    isPersistent: boolean('is_persistent').notNull().default(false),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('announcements_cohort_idx').on(t.cohortId)],
);

/** One row per student per announcement they have acknowledged. */
export const announcementReads = pgTable(
  'announcement_reads',
  {
    announcementId: uuid('announcement_id')
      .notNull()
      .references(() => announcements.id, { onDelete: 'cascade' }),
    memberId: uuid('member_id')
      .notNull()
      .references(() => cohortMembers.id, { onDelete: 'cascade' }),
    readAt: timestamp('read_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.announcementId, t.memberId] }),
    index('announcement_reads_member_idx').on(t.memberId),
  ],
);

/* --------------------------------------------------------------- waitlist */

/**
 * Next-cohort enquiries captured by the public landing page.
 *
 * Deliberately outside the cohort/member graph: these are people who do not have an
 * account yet, and nothing here is ever exposed to a student-facing surface.
 */
export const waitlistEntries = pgTable(
  'waitlist_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    fullName: varchar('full_name', { length: 120 }).notNull(),
    whatsapp: varchar('whatsapp', { length: 32 }).notNull(),
    email: varchar('email', { length: 255 }),
    mbbsYear: smallint('mbbs_year'),
    university: varchar('university', { length: 160 }),
    /** Free text: the consistency problem they came here to solve. */
    challenge: text('challenge'),
    status: waitlistStatusEnum('status').notNull().default('new'),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('waitlist_created_idx').on(t.createdAt),
    uniqueIndex('waitlist_whatsapp_unique').on(t.whatsapp),
    /*
     * Case-insensitive and partial, because most entries have no email at all and a plain
     * unique index would let exactly one of them exist. Declared here so `drizzle-kit`
     * stays in step with migration 0007; the migration is what actually creates it.
     */
    uniqueIndex('waitlist_email_unique')
      .on(sql`lower(${t.email})`)
      .where(sql`${t.email} IS NOT NULL`),
  ],
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
  trees: many(focusTrees),
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

export const assessmentsRelations = relations(assessments, ({ many }) => ({
  questions: many(assessmentQuestions),
  attempts: many(assessmentAttempts),
}));

export const assessmentQuestionsRelations = relations(assessmentQuestions, ({ one }) => ({
  assessment: one(assessments, {
    fields: [assessmentQuestions.assessmentId],
    references: [assessments.id],
  }),
}));

export const assessmentAttemptsRelations = relations(assessmentAttempts, ({ one, many }) => ({
  assessment: one(assessments, {
    fields: [assessmentAttempts.assessmentId],
    references: [assessments.id],
  }),
  answers: many(assessmentAnswers),
  integrityEvents: many(assessmentIntegrityEvents),
}));

export const assessmentAnswersRelations = relations(assessmentAnswers, ({ one }) => ({
  attempt: one(assessmentAttempts, {
    fields: [assessmentAnswers.attemptId],
    references: [assessmentAttempts.id],
  }),
  question: one(assessmentQuestions, {
    fields: [assessmentAnswers.questionId],
    references: [assessmentQuestions.id],
  }),
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
export type FocusTree = typeof focusTrees.$inferSelect;
export type Attendance = typeof attendance.$inferSelect;
export type StudyRoomPresence = typeof studyRoomPresence.$inferSelect;
export type CheckIn = typeof checkIns.$inferSelect;
export type PointsLedgerEntry = typeof pointsLedger.$inferSelect;
export type DailyActivity = typeof dailyActivity.$inferSelect;
export type StudentAchievement = typeof studentAchievements.$inferSelect;
export type Material = typeof materials.$inferSelect;
export type CohortEvent = typeof events.$inferSelect;
export type Announcement = typeof announcements.$inferSelect;
export type AnnouncementRead = typeof announcementReads.$inferSelect;
export type WaitlistEntry = typeof waitlistEntries.$inferSelect;
export type RoadmapSlot = (typeof roadmapSlotEnum.enumValues)[number];
export type WaitlistStatus = (typeof waitlistStatusEnum.enumValues)[number];
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
export type Assessment = typeof assessments.$inferSelect;
export type AssessmentQuestion = typeof assessmentQuestions.$inferSelect;
export type AssessmentAttempt = typeof assessmentAttempts.$inferSelect;
export type AssessmentAnswer = typeof assessmentAnswers.$inferSelect;
export type AssessmentIntegrityEvent = typeof assessmentIntegrityEvents.$inferSelect;
export type AssessmentStatus = (typeof assessmentStatusEnum.enumValues)[number];
export type QuestionType = (typeof questionTypeEnum.enumValues)[number];
export type AttemptStatus = (typeof attemptStatusEnum.enumValues)[number];
export type ReviewStatus = (typeof reviewStatusEnum.enumValues)[number];
export type IntegrityEventKind = (typeof integrityEventEnum.enumValues)[number];
