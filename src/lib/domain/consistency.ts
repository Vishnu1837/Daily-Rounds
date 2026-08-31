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
): ConsistencyResult {
  const days = activeStudyDaysBetween(cal, from, to);

  let completed = 0;
  let scoreSum = 0;
  let minutes = 0;

  for (const day of days) {
    const rec = lookup(day);
    if (!rec) continue;
    if (rec.showedUp) completed += 1;
    scoreSum += rec.score;
    minutes += rec.studyMinutes;
  }

  const activeDays = days.length;
  return {
    activeDays,
    completedDays: completed,
    missedDays: activeDays - completed,
    consistencyPct: activeDays === 0 ? 0 : Math.round((scoreSum / activeDays) * 100),
    showUpRatePct: activeDays === 0 ? 0 : Math.round((completed / activeDays) * 100),
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
): ConsistencyResult {
  return calculateConsistency(cal, lookup, cal.startDate, minDate(asOf, cal.endDate));
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
): WeekProgress[] {
  return cohortWeekStarts(cal, asOf).map((start, i) => {
    const end = minDate(addDays(start, 6), minDate(asOf, cal.endDate));
    const result = calculateConsistency(cal, lookup, start, end);
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
): ConsistencyResult {
  return calculateConsistency(cal, lookup, weekStart(asOf), asOf);
}

/** A week needs this many elapsed active days before it is a fair comparison. */
const MIN_DAYS_FOR_COMPARISON = 3;

/**
 * Percentage-point change between the first and most recent *representative* week.
 *
 * Weeks with only a day or two elapsed are excluded: on a Monday morning the current week
 * is near 0% by definition, and comparing against it would report a collapse that has not
 * happened. If nothing qualifies, we fall back to whatever weeks have data.
 */
export function calculateImprovement(weeks: WeekProgress[]): {
  firstPct: number;
  latestPct: number;
  deltaPct: number;
} {
  const representative = weeks.filter((w) => w.activeDays >= MIN_DAYS_FOR_COMPARISON);
  const scored =
    representative.length >= 2 ? representative : weeks.filter((w) => w.activeDays > 0);
  const first = scored[0];
  const latest = scored[scored.length - 1];
  if (!first || !latest || scored.length < 2) {
    return {
      firstPct: first?.consistencyPct ?? 0,
      latestPct: latest?.consistencyPct ?? 0,
      deltaPct: 0,
    };
  }
  return {
    firstPct: first.consistencyPct,
    latestPct: latest.consistencyPct,
    deltaPct: latest.consistencyPct - first.consistencyPct,
  };
}

/** True when every active study day in the given week was completed (and there was ≥1). */
export function isPerfectWeek(
  cal: CohortCalendar,
  lookup: DayLookup,
  anyDateInWeek: ISODate,
): boolean {
  const start = weekStart(anyDateInWeek);
  const result = calculateConsistency(cal, lookup, start, addDays(start, 6));
  return result.activeDays > 0 && result.missedDays === 0;
}
