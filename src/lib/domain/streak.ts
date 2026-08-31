/**
 * Streak engine.
 *
 * A streak counts consecutive ACTIVE STUDY DAYS on which the student showed up. Weekends
 * and cohort holidays are not active study days, so they are skipped entirely rather than
 * "forgiven" — Friday and the following Monday are adjacent as far as this engine is
 * concerned. Missing an active study day breaks the streak.
 *
 * Every function here is pure: it takes a calendar plus a `showedUp(date)` predicate. The
 * predicate is backed by the `daily_activity` cache, which is itself derived from source
 * records, so a streak can always be recomputed from scratch.
 */
import {
  type CohortCalendar,
  type ISODate,
  activeStudyDaysBetween,
  currentOrPreviousActiveStudyDay,
  isActiveStudyDay,
  previousActiveStudyDay,
} from './calendar';

export type ShowedUp = (date: ISODate) => boolean;

export type StreakResult = {
  length: number;
  startedOn: ISODate | null;
  lastDay: ISODate | null;
};

export type BestStreakResult = StreakResult & { endedOn: ISODate | null };

/**
 * The student's live streak as of `today`.
 *
 * If today is an active study day that has not been completed *yet*, the streak is
 * measured up to the previous active study day — a day still in progress must never look
 * like a miss.
 */
export function calculateCurrentStreak(
  cal: CohortCalendar,
  showedUp: ShowedUp,
  today: ISODate,
): StreakResult {
  let cursor: ISODate | null =
    isActiveStudyDay(cal, today) && showedUp(today)
      ? today
      : previousActiveStudyDay(cal, today);

  // A date after the cohort ended still reports the final streak.
  if (cursor === null) cursor = currentOrPreviousActiveStudyDay(cal, today);
  if (cursor === null) return { length: 0, startedOn: null, lastDay: null };

  let length = 0;
  let lastDay: ISODate | null = null;
  let startedOn: ISODate | null = null;

  while (cursor !== null && showedUp(cursor)) {
    if (lastDay === null) lastDay = cursor;
    startedOn = cursor;
    length += 1;
    cursor = previousActiveStudyDay(cal, cursor);
  }

  return { length, startedOn, lastDay };
}

/** The longest run of completed active study days at any point up to `upTo`. */
export function calculateBestStreak(
  cal: CohortCalendar,
  showedUp: ShowedUp,
  upTo: ISODate,
): BestStreakResult {
  const days = activeStudyDaysBetween(cal, cal.startDate, upTo);

  let best = 0;
  let bestStart: ISODate | null = null;
  let bestEnd: ISODate | null = null;
  let run = 0;
  let runStart: ISODate | null = null;

  for (const day of days) {
    if (showedUp(day)) {
      if (run === 0) runStart = day;
      run += 1;
      if (run > best) {
        best = run;
        bestStart = runStart;
        bestEnd = day;
      }
    } else {
      run = 0;
      runStart = null;
    }
  }

  return { length: best, startedOn: bestStart, lastDay: bestEnd, endedOn: bestEnd };
}

export type ComebackState = {
  /** True when the most recent active study day(s) before today were missed. */
  isComeback: boolean;
  /** The consecutive active study days missed immediately before today, oldest first. */
  missedDays: ISODate[];
  /** The last active study day the student actually showed up for. */
  lastShowedUpOn: ISODate | null;
};

/**
 * Detects the "you missed yesterday, today is your comeback" state.
 *
 * Only meaningful on an active study day the student has not yet completed; once they
 * complete it their streak restarts at 1 and the app celebrates the return.
 */
export function calculateComebackState(
  cal: CohortCalendar,
  showedUp: ShowedUp,
  today: ISODate,
): ComebackState {
  const missedDays: ISODate[] = [];
  let cursor = previousActiveStudyDay(cal, today);

  while (cursor !== null && !showedUp(cursor)) {
    missedDays.unshift(cursor);
    cursor = previousActiveStudyDay(cal, cursor);
  }

  return {
    isComeback: missedDays.length > 0 && cursor !== null,
    missedDays,
    lastShowedUpOn: cursor,
  };
}

/** How many consecutive active study days have been missed immediately before `today`. */
export function consecutiveMissedActiveDays(
  cal: CohortCalendar,
  showedUp: ShowedUp,
  today: ISODate,
): number {
  return calculateComebackState(cal, showedUp, today).missedDays.length;
}

export const STREAK_MILESTONES = [3, 5, 10, 15, 20, 30, 50] as const;

export function reachedMilestone(streakLength: number): number | null {
  return STREAK_MILESTONES.includes(streakLength as (typeof STREAK_MILESTONES)[number])
    ? streakLength
    : null;
}

export function nextMilestone(streakLength: number): number | null {
  return STREAK_MILESTONES.find((m) => m > streakLength) ?? null;
}

/** Bonus points awarded once, on the day a milestone streak is reached. */
export function milestoneBonusPoints(milestone: number): number {
  if (milestone >= 30) return 100;
  if (milestone >= 20) return 60;
  if (milestone >= 15) return 45;
  if (milestone >= 10) return 30;
  if (milestone >= 5) return 15;
  return 10;
}

/**
 * Cohort streak: consecutive active study days on which at least `thresholdPct` of active
 * members showed up.
 */
export function calculateCohortStreak(
  cal: CohortCalendar,
  turnoutByDate: (date: ISODate) => { showedUp: number; total: number },
  thresholdPct: number,
  today: ISODate,
): StreakResult {
  const met = (date: ISODate) => {
    const { showedUp, total } = turnoutByDate(date);
    if (total === 0) return false;
    return (showedUp / total) * 100 >= thresholdPct;
  };

  let cursor: ISODate | null =
    isActiveStudyDay(cal, today) && met(today) ? today : previousActiveStudyDay(cal, today);

  let length = 0;
  let lastDay: ISODate | null = null;
  let startedOn: ISODate | null = null;

  while (cursor !== null && met(cursor)) {
    if (lastDay === null) lastDay = cursor;
    startedOn = cursor;
    length += 1;
    cursor = previousActiveStudyDay(cal, cursor);
  }

  return { length, startedOn, lastDay };
}
