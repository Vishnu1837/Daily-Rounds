/**
 * Consistency, show-up rate and weekly progress.
 *
 * Two distinct metrics, deliberately kept separate:
 *   SHOW-UP RATE  — binary. Of the active study days so far, how many did you turn up for?
 *   CONSISTENCY   — quality-weighted. The mean day score across those same active days.
 *
 * Both use active study days as the denominator, so weekends and holidays can never dilute
 * a student's numbers.
 */
import {
  type CohortCalendar,
  type ISODate,
  activeStudyDaysBetween,
  addDays,
  cohortWeekStarts,
  minDate,
  weekStart,
} from './calendar';

/**
 * How to treat a day the student is still living.
 *
 * This is the whole subject of this module's hardest bug. Consistency counted TODAY in its
 * denominator from midnight, scoring it 0 until the student got round to their work — so
 * every student's headline number collapsed each morning and climbed back through the day.
 * A cohort three settled days old at 89% opened Monday reading 67%, and had to be told why.
 *
 * The streak engine has never had this problem, because ADR-005 states the rule plainly: *a
 * day in progress is not a miss*. Consistency simply never got the same treatment. It does
 * now — the in-progress day is excluded from the numerator and the denominator alike, and a
 * day's score joins the average only once the day is over and the score is final.
 *
 * Minutes are deliberately exempt. They are a fact that accrues as it happens rather than a
 * judgement that needs the day to finish, and a student who has just studied for two hours
 * should see two hours.
 */
export type ConsistencyOptions = {
  /** The day still being lived, normally today. Omit for a window that is entirely settled. */
  inProgress?: ISODate | null;
};

/** Per-day derived facts, sourced from the `daily_activity` cache. */
export type DayRecord = {
  date: ISODate;
  showedUp: boolean;
  /** Behaviour completion in [0, 1]. */
  score: number;
  studyMinutes: number;
  points: number;
};

export type DayLookup = (date: ISODate) => DayRecord | undefined;

export type ConsistencyResult = {
  activeDays: number;
  completedDays: number;
  missedDays: number;
  /** Mean day score across active days, 0–100. */
  consistencyPct: number;
  /** Completed / active, 0–100. */
  showUpRatePct: number;
  studyMinutes: number;
};

export function calculateConsistency(
  cal: CohortCalendar,
  lookup: DayLookup,
  from: ISODate,
  to: ISODate,
  options?: ConsistencyOptions,
): ConsistencyResult {
  const days = activeStudyDaysBetween(cal, from, to);
  const inProgress = options?.inProgress ?? null;

  let settledDays = 0;
  let completed = 0;
  let scoreSum = 0;
  let minutes = 0;

  for (const day of days) {
    const rec = lookup(day);

    /*
     * Minutes accrue as they happen; the verdict on the day waits for the day to end. So the
     * in-progress day contributes its study time and nothing else — see `ConsistencyOptions`.
     */
    if (day === inProgress) {
      minutes += rec?.studyMinutes ?? 0;
      continue;
    }

    settledDays += 1;
    if (!rec) continue;
    if (rec.showedUp) completed += 1;
    scoreSum += rec.score;
    minutes += rec.studyMinutes;
  }

  return {
    activeDays: settledDays,
    completedDays: completed,
    missedDays: settledDays - completed,
    consistencyPct: settledDays === 0 ? 0 : Math.round((scoreSum / settledDays) * 100),
    showUpRatePct: settledDays === 0 ? 0 : Math.round((completed / settledDays) * 100),
    studyMinutes: minutes,
  };
}

/**
 * Consistency to date. `asOf` is normally today; days that have not happened yet are never
 * counted as missed.
 */
export function calculateOverallConsistency(
  cal: CohortCalendar,
  lookup: DayLookup,
  asOf: ISODate,
  options?: ConsistencyOptions,
): ConsistencyResult {
  return calculateConsistency(cal, lookup, cal.startDate, minDate(asOf, cal.endDate), options);
}

export type WeekProgress = {
  weekNumber: number;
  weekStart: ISODate;
  weekEnd: ISODate;
  activeDays: number;
  completedDays: number;
  consistencyPct: number;
  studyMinutes: number;
};

/** One entry per cohort week that has begun on or before `asOf`. */
export function calculateWeeklyProgress(
  cal: CohortCalendar,
  lookup: DayLookup,
  asOf: ISODate,
  options?: ConsistencyOptions,
): WeekProgress[] {
  return cohortWeekStarts(cal, asOf).map((start, i) => {
    const end = minDate(addDays(start, 6), minDate(asOf, cal.endDate));
    const result = calculateConsistency(cal, lookup, start, end, options);
    return {
      weekNumber: i + 1,
      weekStart: start,
      weekEnd: addDays(start, 6),
      activeDays: result.activeDays,
      completedDays: result.completedDays,
      consistencyPct: result.consistencyPct,
      studyMinutes: result.studyMinutes,
    };
  });
}

/** Consistency for the week containing `asOf`, up to and including `asOf`. */
export function calculateCurrentWeekConsistency(
  cal: CohortCalendar,
  lookup: DayLookup,
  asOf: ISODate,
  options?: ConsistencyOptions,
): ConsistencyResult {
  return calculateConsistency(cal, lookup, weekStart(asOf), asOf, options);
}

/**
 * True once a week has finished, so its record is final.
 *
 * A week that still contains the day being lived is not settled, however well it has gone.
 * This is what stops "perfect week" being awarded on a Tuesday off the back of a good
 * Monday — a claim about a week cannot be made from the middle of it.
 */
export function isSettledWeek(week: WeekProgress, inProgress: ISODate | null): boolean {
  if (!inProgress) return true;
  return week.weekEnd < inProgress;
}

/** A week needs this many settled active days before it is a fair comparison. */
const MIN_DAYS_FOR_COMPARISON = 3;

export type ImprovementResult = {
  firstPct: number;
  latestPct: number;
  deltaPct: number;
  /**
   * False when there are not yet two weeks worth comparing.
   *
   * Callers must show this as "not enough data" rather than as a change of zero — and
   * certainly never as a decline. See below for what happens when they do not.
   */
  comparable: boolean;
};

/**
 * Percentage-point change between the first and most recent *representative* week.
 *
 * This function had a fallback that read, in effect: if fewer than two weeks are worth
 * comparing, compare the ones that are not. In a cohort's second week that meant holding a
 * full first week against a Monday morning — and since a Monday morning is 0% by
 * construction, every student's improvement was reported as *minus their first-week score*.
 * The admin leaderboard showed a column of −89%, −75%, −74% and so on down the cohort, which
 * is not a cohort in collapse; it is one week of data subtracted from itself.
 *
 * There is no fallback now. Two representative weeks or nothing, because the honest answer to
 * "how much has this student improved?" after one week is that we cannot say yet.
 */
export function calculateImprovement(weeks: WeekProgress[]): ImprovementResult {
  const scored = weeks.filter((w) => w.activeDays >= MIN_DAYS_FOR_COMPARISON);
  const first = scored[0];
  const latest = scored[scored.length - 1];

  if (!first || !latest || scored.length < 2) {
    return {
      firstPct: first?.consistencyPct ?? 0,
      latestPct: latest?.consistencyPct ?? first?.consistencyPct ?? 0,
      deltaPct: 0,
      comparable: false,
    };
  }

  return {
    firstPct: first.consistencyPct,
    latestPct: latest.consistencyPct,
    deltaPct: latest.consistencyPct - first.consistencyPct,
    comparable: true,
  };
}

/**
 * True when every active study day in the given week was completed (and there was ≥1).
 *
 * A week containing the in-progress day is never perfect, however well it has gone so far:
 * it is not over. Without that guard, excluding today from the denominator would declare a
 * perfect week on Tuesday morning off the back of a good Monday — and hand out the badge.
 */
export function isPerfectWeek(
  cal: CohortCalendar,
  lookup: DayLookup,
  anyDateInWeek: ISODate,
  options?: ConsistencyOptions,
): boolean {
  const start = weekStart(anyDateInWeek);
  const end = addDays(start, 6);

  const inProgress = options?.inProgress ?? null;
  if (inProgress && inProgress >= start && inProgress <= end) return false;

  const result = calculateConsistency(cal, lookup, start, end, options);
  return result.activeDays > 0 && result.missedDays === 0;
}
