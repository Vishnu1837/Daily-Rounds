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
  streak_bonus: 0, // computed per milestone
  achievement: 25,
  weekly_review: 15,
  admin_adjustment: 0, // supplied by the admin
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

export type DayBandName = 'perfect' | 'strong' | 'active' | 'weak' | 'missed' | 'off';

/** Maps a day score to the band used by the calendar and the activity heatmap. */
export function bandForDay(score: number, isActiveDay: boolean): DayBandName {
  if (!isActiveDay) return 'off';
  if (score >= 0.95) return 'perfect';
  if (score >= 0.75) return 'strong';
  if (score >= 0.4) return 'active';
  if (score > 0) return 'weak';
  return 'missed';
}

export const BAND_LABELS: Record<DayBandName, string> = {
  perfect: 'Perfect day',
  strong: 'Strong day',
  active: 'Active day',
  weak: 'Weak day',
  missed: 'Missed day',
  off: 'Rest day',
};

/**
 * "Showing up" is deliberately generous: any real behaviour on an active study day counts.
 * Consistency measures *how much* of the day was completed; show-up rate measures whether
 * the student turned up at all. Returning at 30% beats not returning.
 */
export function showedUpFromScore(score: number): boolean {
  return score > 0;
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
  streakMilestone: (memberId: string, milestone: number) =>
    `streak_bonus:${memberId}:${milestone}`,
  achievement: (memberId: string, code: string) => `achievement:${memberId}:${code}`,
  weeklyReview: (memberId: string, weekStart: string) =>
    `weekly_review:${memberId}:${weekStart}`,
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
