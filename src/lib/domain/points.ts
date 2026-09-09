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
  flashcard_session: 5,
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

/**
 * The behaviours a given cohort actually asks its students for.
 *
 * `BEHAVIOUR_EVENTS` is the full catalogue of things this product can score. It was also,
 * for a long time, the denominator — every cohort was marked out of all six whether or not
 * it ran all six. A cohort with no study room could not exceed 60/80, so its students
 * topped out at 75% while doing everything asked of them, and the 40% intervention floor
 * sat only 15 points below a perfect day. On 2026-09-09 that showed up as a members list
 * where nine of ten active students were flagged `needs_intervention` for
 * "recent consistency is only …%" — none of them for missing a day.
 *
 * So the denominator is now the behaviours the cohort offers, and nothing else. A behaviour
 * the cohort does not run is not a behaviour its students are failing to do.
 *
 * Derived, not stored, in keeping with the rest of the scoring model: the study-room slot is
 * expected exactly when the cohort has a room to attend. `override` is the cohort lead's
 * say-so (`CohortSettings.expectedBehaviours`) for the judgements the data cannot make —
 * a cohort that does not ask for a written reflection, say. An empty or unset override
 * means "use the derived set"; an override never adds a behaviour the cohort cannot run.
 */
export function expectedBehaviours(args: {
  /** True when the cohort has a study room for students to attend. */
  hasStudyRoom: boolean;
  override?: readonly BehaviourEvent[] | null;
}): BehaviourEvent[] {
  const offered = BEHAVIOUR_EVENTS.filter(
    (event) => event !== 'live_session_present' || args.hasStudyRoom,
  );

  const override = args.override?.filter((event) => offered.includes(event)) ?? [];
  return override.length > 0 ? offered.filter((event) => override.includes(event)) : offered;
}

/**
 * Maximum points a student can earn in one day from the behaviours actually asked of them.
 *
 * Defaults to the full catalogue so a caller with no cohort in hand — the settings screen
 * explaining the rules, for instance — still gets the headline number.
 */
export function maxDailyBehaviourPoints(
  rules: PointRules,
  expected: readonly BehaviourEvent[] = BEHAVIOUR_EVENTS,
): number {
  return expected.reduce((sum, e) => sum + Math.max(0, rules[e]), 0);
}

export type DayScoreContext = {
  /** The behaviours this cohort asks for. Defaults to the full catalogue. */
  expected?: readonly BehaviourEvent[];
  /**
   * True when the study room's own record puts this student in it, and no cohort lead has
   * ruled otherwise.
   *
   * `showedUpForDay` has always accepted this as proof of attendance, but the score did not:
   * the attendance slot is filled by a ledger entry, and the join only writes one when it is
   * also the thing that creates the day's attendance row. A student an admin had already
   * marked, or whose mark was recut, could therefore be present in the room, `showedUp`, and
   * scored zero for attending — the two derived facts disagreeing about the same day, with
   * the disagreement landing on the student as a 0% morning.
   *
   * Filling the slot from presence closes that. It is credit for the behaviour that actually
   * happened, not a second payment: an entry already in the slot wins, so this can never
   * double-count a join that was scored normally, and nothing is written to the ledger.
   */
  verifiedPresence?: boolean;
};

/**
 * A day's completion score in [0, 1]: behaviour points earned over the behaviour maximum.
 * Quiz, streak, achievement and admin points are excluded by construction.
 */
export function dayScore(
  entries: readonly { event: PointEvent; points: number }[],
  rules: PointRules,
  context?: DayScoreContext,
): number {
  const expected = context?.expected ?? BEHAVIOUR_EVENTS;
  const max = maxDailyBehaviourPoints(rules, expected);
  if (max <= 0) return 0;

  let earned = entries.reduce(
    (sum, e) => (behaviourSlot(e.event) ? sum + Math.max(0, e.points) : sum),
    0,
  );

  const attendanceScored = entries.some(
    (e) => behaviourSlot(e.event) === 'live_session_present' && e.points > 0,
  );
  if (context?.verifiedPresence && !attendanceScored && expected.includes('live_session_present')) {
    earned += Math.max(0, rules.live_session_present);
  }

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
 * "Showing up" is deliberately generous: any real behaviour on an active study day counts,
 * and returning at 30% beats not returning. An attendance mark counts, whoever made it.
 *
 * That last part was restricted for a while, and the restriction is worth recording because
 * the reasoning behind it was sound. Attendance is the one behaviour a cohort lead can grant
 * to the whole cohort in a single click, and it is worth more points than any other, so a
 * bulk mark can hand every student a scoring day, an unbroken streak and `on_track` status
 * whether or not they opened the app — the register once read 26 present on a morning one
 * student was in the room. Requiring the study room to corroborate the mark closed that off.
 *
 * It also closed off something else. `showedUp` is not only the turnout number; the streak
 * engine, the missed-day counter and risk detection all read it. So the rule did not merely
 * decline to credit a hand-marked day, it counted the day against the student: a cohort lead
 * confirmed they were in the room and the app told them they had missed it. On 2026-09-07
 * that was 7 of 23 marked students, two of them flagged for intervention.
 *
 * The cohort lead is in the room and the software is not, and this product is run by people
 * who mark a register. So the mark is trusted again, and the exposure that comes with it is
 * handled by making it visible rather than by refusing it: `showedUpOnMarkAlone` says which
 * days rest on a hand mark and nothing else, `attendance.source` says who made every mark,
 * and the admin console reports the verified count alongside the headline. A number that can
 * be inflated and shows you when it has been is more use than one nobody trusts.
 */
export function showedUpForDay(args: {
  entries: readonly { event: PointEvent; points: number }[];
  /** True when the student's client registered them in the study room that day. */
  verifiedPresence: boolean;
}): boolean {
  if (args.verifiedPresence) return true;
  return args.entries.some((e) => behaviourSlot(e.event) && e.points > 0);
}

/**
 * Did this day's show-up rest on an admin's attendance mark and nothing else?
 *
 * Not a penalty and not a deduction — the day counts in full everywhere. This is the
 * reporting flag that keeps the headline honest: it is what lets the admin console say "23
 * of 25 showed up, 17 of them verified by the study room", so a bulk mark is visible as a
 * bulk mark instead of being indistinguishable from a full room.
 *
 * False for a day the student also worked under their own steam, and false for a verified
 * join — in both cases there is evidence beyond the mark.
 */
export function showedUpOnMarkAlone(args: {
  entries: readonly { event: PointEvent; points: number }[];
  verifiedPresence: boolean;
}): boolean {
  if (args.verifiedPresence) return false;
  const earned = args.entries.filter((e) => behaviourSlot(e.event) && e.points > 0);
  if (earned.length === 0) return false;
  return earned.every((e) => isAdminGrantable(e.event));
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
  /*
   * Keyed on the session, not on the deck and the date.
   *
   * A deck is meant to be run again — that is the entire premise of spaced recall — so a
   * deck-and-date key would refuse to pay for the second run of the evening while happily
   * recording the reviews it produced. The per-session cap in `sessionPoints` is what stops
   * that being farmable; the idempotency key only has to stop a double submit.
   */
  flashcardSession: (memberId: string, sessionId: string) =>
    `flashcard_session:${memberId}:${sessionId}`,
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
  flashcard_session: 'Finished a flashcard deck',
  streak_bonus: 'Streak milestone',
  achievement: 'Achievement unlocked',
  weekly_review: 'Weekly review',
  admin_adjustment: 'Admin adjustment',
};
