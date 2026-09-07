/**
 * Point rules and the day-score model.
 *
 * Points are stored as an append-only ledger. Nothing here ever mutates or removes an
 * earned point — corrections are new, signed ledger rows attributed to an admin.
 *
 * Product rule that shapes the whole file: PROCESS beats RESULT. The behaviours that make
 * up a day (showing up, doing the block, checking in, planning tomorrow) are what
 * `BEHAVIOUR_EVENTS` measures, and only those count toward consistency. Quiz points sit
 * outside that denominator entirely, so no amount of quiz performance can outrank someone
 * who simply shows up every day.
 */
import type { PointEvent } from '@/db/schema';

export type PointRules = Record<PointEvent, number>;

export const DEFAULT_POINT_RULES: PointRules = {
  daily_check_in: 5,
  tomorrow_plan: 10,
  live_session_present: 20,
  live_session_late: 10,
  study_block_completed: 20,
  daily_target_completed: 15,
  reflection: 10,
  quiz_attempt: 5,
  quiz_bonus: 5,
  // The three below are placeholders, not settings. See `COMPUTED_POINT_EVENTS`.
  streak_bonus: 0,
  achievement: 0,
  admin_adjustment: 0,
  weekly_review: 15,
};

/**
 * The events whose value is NOT read from `point_rules`, and cannot be.
 *
 * Their amounts are computed at the moment of the award and vary per instance, so a single
 * stored number could not express them:
 *
 *   - `streak_bonus` — a fixed ladder by milestone, `milestoneBonusPoints()`;
 *   - `achievement` — by badge tier, `achievementPoints()`;
 *   - `admin_adjustment` — whatever the admin typed, with a reason attached.
 *
 * The rows still exist in `point_rules` because the table is keyed on the enum, but their
 * values are never consulted. That was the bug: the settings screen offered an editable
 * **Achievement** field that changed nothing at all, and the ledger paid ten-to-fifty while
 * the configuration said twenty-five — so the screen the cohort lead used to understand
 * scoring was describing a system that did not exist.
 *
 * This list is the single source of that distinction. `EDITABLE_POINT_EVENTS` derives from
 * it, the settings UI renders from that, and `updatePointRulesAction` validates against it,
 * so the screen and the server can no longer drift apart — and adding a new computed event
 * cannot leave a dead control behind.
 */
export const COMPUTED_POINT_EVENTS = [
  'streak_bonus',
  'achievement',
  'admin_adjustment',
] as const satisfies readonly PointEvent[];

export type ComputedPointEvent = (typeof COMPUTED_POINT_EVENTS)[number];

export function isComputedPointEvent(event: PointEvent): event is ComputedPointEvent {
  return (COMPUTED_POINT_EVENTS as readonly PointEvent[]).includes(event);
}

/** The events an admin can actually set a value for. Everything else is computed. */
export const EDITABLE_POINT_EVENTS = (Object.keys(DEFAULT_POINT_RULES) as PointEvent[]).filter(
  (event) => !isComputedPointEvent(event),
);

/**
 * How a computed event's value is arrived at, in one line, for the screens that have to
 * explain it. Keeping the copy here rather than in a component is what stops the admin
 * screen and the student screen describing the same rule differently.
 */
export const COMPUTED_POINT_EXPLANATIONS: Record<ComputedPointEvent, string> = {
  streak_bonus: 'Set by the milestone reached — a fixed ladder from 3 days to 50.',
  achievement: 'Set by the badge tier: bronze 10, silver 25, gold 50.',
  admin_adjustment: 'Whatever a cohort lead enters, with a reason recorded against it.',
};

/**
 * The events that constitute "did you show up and do the work today".
 * These, and only these, form the denominator of the consistency metric.
 */
export const BEHAVIOUR_EVENTS = [
  'live_session_present',
  'study_block_completed',
  'daily_target_completed',
  'daily_check_in',
  'tomorrow_plan',
  'reflection',
] as const satisfies readonly PointEvent[];

export type BehaviourEvent = (typeof BEHAVIOUR_EVENTS)[number];

/** Attendance may be scored late instead of present; both map to the same slot. */
const EVENT_SLOT: Partial<Record<PointEvent, BehaviourEvent>> = {
  live_session_late: 'live_session_present',
};

export function behaviourSlot(event: PointEvent): BehaviourEvent | null {
  const mapped = EVENT_SLOT[event];
  if (mapped) return mapped;
  return (BEHAVIOUR_EVENTS as readonly PointEvent[]).includes(event)
    ? (event as BehaviourEvent)
    : null;
}

/** Maximum points a student can earn in one day from behaviour alone. */
export function maxDailyBehaviourPoints(rules: PointRules): number {
  return BEHAVIOUR_EVENTS.reduce((sum, e) => sum + Math.max(0, rules[e]), 0);
}

/**
 * A day's completion score in [0, 1]: behaviour points earned over the behaviour maximum.
 * Quiz, streak, achievement and admin points are excluded by construction.
 */
export function dayScore(
  entries: readonly { event: PointEvent; points: number }[],
  rules: PointRules,
): number {
  const max = maxDailyBehaviourPoints(rules);
  if (max <= 0) return 0;
  const earned = entries.reduce(
    (sum, e) => (behaviourSlot(e.event) ? sum + Math.max(0, e.points) : sum),
    0,
  );
  return Math.min(1, earned / max);
}

export type DayBandName = 'perfect' | 'strong' | 'active' | 'weak' | 'missed' | 'off' | 'bonus';

/**
 * Maps a day score to the band used by the calendar and the activity heatmap.
 *
 * The non-active branch is the one that changed. It used to return `off` unconditionally,
 * which meant a Sunday spent working and a Sunday spent asleep drew the same empty square —
 * the audit found 18 student-days recorded in the source tables and shown nowhere. A rest
 * day with real work on it is now a `bonus` day.
 *
 * `bonus` is a display and credit band, deliberately not a scoring one. Consistency and
 * streaks still count active study days only (ADR-004, ADR-005), so the denominator does not
 * grow when a student works a weekend: they cannot be penalised for resting, and a weekend
 * can never quietly become expected. The day's XP and minutes were always being stored; this
 * is what finally shows them.
 */
export function bandForDay(score: number, isActiveDay: boolean): DayBandName {
  if (!isActiveDay) return score > 0 ? 'bonus' : 'off';
  if (score >= 0.95) return 'perfect';
  if (score >= 0.75) return 'strong';
  if (score >= 0.4) return 'active';
  if (score > 0) return 'weak';
  return 'missed';
}

/**
 * The band to *draw* for a day, given that today is not over.
 *
 * `bandForDay` answers what a day was worth. This answers what to show while it is still
 * being lived, and the two differ in exactly one case: an active day with nothing on it yet
 * is `missed` by score and is not a miss in fact. Painting today red from midnight tells a
 * student their day has already gone wrong before it has started — and it is the same
 * mistake the consistency denominator was making, in colour.
 *
 * Every other band passes through untouched, so a day that is going well still fills in as
 * the student works through it.
 */
export function displayBand(band: DayBandName, isInProgress: boolean): DayBandName {
  return isInProgress && band === 'missed' ? 'off' : band;
}

export const BAND_LABELS: Record<DayBandName, string> = {
  perfect: 'Perfect day',
  strong: 'Strong day',
  active: 'Active day',
  weak: 'Weak day',
  missed: 'Missed day',
  off: 'Rest day',
  bonus: 'Bonus day',
};

/**
 * The two events an admin can grant with a click on the attendance sheet.
 *
 * They are real behaviour when the student recorded them by walking into the room, and
 * nothing at all when a cohort lead ticked the whole column — and the ledger cannot tell
 * those apart, because both paths write the same row. See `showedUpForDay`.
 */
const ADMIN_GRANTABLE_EVENTS = ['live_session_present', 'live_session_late'] as const;

function isAdminGrantable(event: PointEvent): boolean {
  return (ADMIN_GRANTABLE_EVENTS as readonly PointEvent[]).includes(event);
}

/**
 * Did this student turn up today?
 *
 * "Showing up" stays deliberately generous — any real behaviour on an active study day
 * counts, and returning at 30% beats not returning — but it is no longer satisfied by the
 * attendance mark alone.
 *
 * Attendance is the one behaviour a cohort lead can grant to the whole cohort in a single
 * click, and it is worth more points than any other, so a bulk mark used to hand every
 * student a scoring day, an unbroken streak and `on_track` status whether or not they had
 * opened the app. That made the metric the product exists to report unfalsifiable in the
 * wrong direction: the register said 26 present on a day when one student was in the room.
 *
 * So attendance counts toward showing up only when the room itself corroborates it —
 * `verifiedPresence` is a `study_room_presence` row, written by the student's own client
 * heartbeat and not reachable from the admin screens. An admin mark still awards its points
 * and still lifts the day score; it just cannot, on its own, assert that someone was there.
 */
export function showedUpForDay(args: {
  entries: readonly { event: PointEvent; points: number }[];
  /** True when the student's client registered them in the study room that day. */
  verifiedPresence: boolean;
}): boolean {
  const earned = args.entries.filter((e) => behaviourSlot(e.event) && e.points > 0);
  if (earned.length === 0) return false;
  if (args.verifiedPresence) return true;
  return earned.some((e) => !isAdminGrantable(e.event));
}

/**
 * Was this day marked present by a human the room could not corroborate?
 *
 * The companion to `showedUpForDay`, and the reason that function can afford to be strict.
 *
 * Refusing to let an admin mark assert attendance was the right call — it is what stops one
 * click on "mark all present" manufacturing a cohort of unbroken streaks. But `showedUp` is
 * not only the turnout number: the streak engine, the missed-day counter and risk detection
 * are all built on it, so for a while the rule did not merely decline to credit a student
 * for a hand-marked day, it actively counted the day against them. A cohort lead confirmed
 * they were in the room and the app told them they had missed it.
 *
 * A day this returns true for is neither. It earns nothing — no streak, no consistency, no
 * turnout — and it costs nothing: the streak steps over it the way it steps over a weekend,
 * and it never becomes a missed day. Being marked present by hand is not evidence a student
 * was there, but it is certainly not evidence they were absent.
 *
 * A mark of `absent` is not excused. That one is a judgement a lead actually made, and it
 * goes on counting as a miss.
 */
export function attendanceExcusedForDay(args: {
  entries: readonly { event: PointEvent; points: number }[];
  verifiedPresence: boolean;
}): boolean {
  if (showedUpForDay(args)) return false;
  return args.entries.some((e) => isAdminGrantable(e.event) && e.points > 0);
}

/* ------------------------------------------------------------ quiz scoring */

/**
 * Participation is the point. Attempting pays the full attempt value; a perfect score adds
 * at most `quiz_bonus`, keeping the whole quiz worth roughly one behaviour slot.
 */
export function quizPoints(
  score: number,
  total: number,
  rules: PointRules,
): { attempt: number; bonus: number } {
  const attempt = rules.quiz_attempt;
  if (total <= 0) return { attempt, bonus: 0 };
  const ratio = Math.max(0, Math.min(1, score / total));
  return { attempt, bonus: Math.round(rules.quiz_bonus * ratio) };
}

/* -------------------------------------------------------- idempotency keys */

/**
 * Deterministic ledger keys. The `points_ledger.idempotency_key` unique index turns these
 * into a hard database guarantee that a student cannot be paid twice for one action.
 */
export const ledgerKey = {
  daily: (event: PointEvent, memberId: string, date: string) => `${event}:${memberId}:${date}`,
  attendance: (memberId: string, date: string) => `attendance:${memberId}:${date}`,
  quizAttempt: (memberId: string, quizId: string, date: string) =>
    `quiz_attempt:${memberId}:${quizId}:${date}`,
  quizBonus: (memberId: string, quizId: string, date: string) =>
    `quiz_bonus:${memberId}:${quizId}:${date}`,
  /*
   * Keyed on the *attempt*, not on the assessment and the date.
   *
   * A student may sit the same assessment more than once, and each sitting is its own piece
   * of work — so an assessment-and-date key would silently refuse to pay for the second one.
   * The attempt id is the natural unit, and it also makes a re-submitted or replayed
   * submission a no-op at the database, exactly as every other award here is.
   */
  assessmentAttempt: (memberId: string, attemptId: string) =>
    `quiz_attempt:assessment:${memberId}:${attemptId}`,
  assessmentBonus: (memberId: string, attemptId: string) =>
    `quiz_bonus:assessment:${memberId}:${attemptId}`,
  streakMilestone: (memberId: string, milestone: number) => `streak_bonus:${memberId}:${milestone}`,
  achievement: (memberId: string, code: string) => `achievement:${memberId}:${code}`,
  weeklyReview: (memberId: string, weekStart: string) => `weekly_review:${memberId}:${weekStart}`,
  adminAdjustment: (memberId: string, ref: string) => `admin_adjustment:${memberId}:${ref}`,
};

/* -------------------------------------------------------------- UI copy */

export const POINT_EVENT_LABELS: Record<PointEvent, string> = {
  daily_check_in: 'Daily check-in',
  tomorrow_plan: "Tomorrow's plan",
  live_session_present: 'Attended the study room',
  live_session_late: 'Joined the study room late',
  study_block_completed: 'Completed the study block',
  daily_target_completed: "Completed today's target",
  reflection: 'Wrote a reflection',
  quiz_attempt: 'Attempted a knowledge check',
  quiz_bonus: 'Knowledge check accuracy',
  streak_bonus: 'Streak milestone',
  achievement: 'Achievement unlocked',
  weekly_review: 'Weekly review',
  admin_adjustment: 'Admin adjustment',
};
