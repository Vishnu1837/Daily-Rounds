/**
 * Risk detection.
 *
 * Derived entirely from source data — never stored as an authoritative flag — so an admin
 * can trust that a red badge reflects what actually happened this week.
 *
 * 🟢 on track            — participating.
 * 🟡 at risk             — N consecutive active days missed, a meaningful consistency drop, or
 *                          low participation on its own.
 * 🔴 needs intervention  — M+ consecutive active days missed, or low participation that is
 *                          either negligible or comes with days actually missed.
 *
 * The distinction in those last two lines is the point of the amber band, and it was missing.
 * Low consistency escalated straight to red, so a student who attended every session but only
 * recorded two of the six behaviours the cohort was scored out of got the same badge as one
 * who had not appeared in a week. On 2026-09-09 that read as nine of ten active students
 * needing intervention, none of them for missing a day — a list that says everything is
 * urgent says nothing, and the student who really had stopped coming was invisible in it.
 *
 * So a thin record is now a warning. It becomes an intervention when the record is not merely
 * thin but negligible, or when the thinness is corroborated by absence — the two cases where
 * "we have lost this student" is a fair reading of the data rather than a guess about it.
 */
import type { RiskLevel } from '@/db/schema';

import type { CohortCalendar, ISODate } from './calendar';
import { type DayLookup, calculateConsistency } from './consistency';
import { type ShowedUp, consecutiveMissedActiveDays } from './streak';
import { activeStudyDaysBetween, addDays, weekStart } from './calendar';

export type RiskThresholds = {
  atRiskMissedDays: number;
  interventionMissedDays: number;
  /** Percentage-point drop week-over-week that flags a student. */
  atRiskConsistencyDropPct: number;
  /**
   * Consistency below this over the recent window counts as very low participation.
   * Deliberately measured over a trailing window rather than all-time, so a student who
   * had a rough first week is not permanently red once they turn things around.
   */
  minConsistencyPct: number;
  /**
   * Consistency below this is negligible rather than merely low, and is an intervention on
   * its own — no missed days needed.
   *
   * Kept well under `minConsistencyPct` on purpose. Between the two a student is showing up
   * and recording *something*, which is a conversation; below it they are enrolled and
   * absent in all but attendance, which is not.
   */
  interventionConsistencyPct: number;
  /** How many recent active study days the participation check looks at. */
  participationWindowDays: number;
};

export const DEFAULT_RISK_THRESHOLDS: RiskThresholds = {
  atRiskMissedDays: 2,
  interventionMissedDays: 3,
  atRiskConsistencyDropPct: 15,
  minConsistencyPct: 40,
  interventionConsistencyPct: 20,
  participationWindowDays: 10,
};

export type RiskAssessment = {
  level: RiskLevel;
  /** Human-readable reasons, ordered by severity. Shown verbatim in the admin dashboard. */
  reasons: string[];
  missedActiveDays: number;
  /** Consistency since the student joined. Reported, not used as a trigger on its own. */
  consistencyPct: number;
  /** Consistency across the recent participation window. */
  recentConsistencyPct: number;
  previousWeekPct: number;
  currentWeekPct: number;
};

export function calculateRiskStatus(args: {
  calendar: CohortCalendar;
  lookup: DayLookup;
  showedUp: ShowedUp;
  today: ISODate;
  /** The day the student joined; days before it never count against them. */
  since?: ISODate;
  thresholds?: Partial<RiskThresholds>;
}): RiskAssessment {
  const t = { ...DEFAULT_RISK_THRESHOLDS, ...args.thresholds };
  const { calendar, lookup, showedUp, today } = args;
  const since = args.since && args.since > calendar.startDate ? args.since : calendar.startDate;

  const missed = consecutiveMissedActiveDays(calendar, showedUp, today);

  /*
   * Today is excluded from every window below. Risk is a judgement about a student's record,
   * and until the day is over today is not part of the record — counting it would have flagged
   * the whole cohort every morning and cleared them again by evening.
   */
  const inProgress = { inProgress: today };
  const overall = calculateConsistency(calendar, lookup, since, today, inProgress);

  // Trailing window: the last N active study days the student has actually had.
  const recentDays = activeStudyDaysBetween(calendar, since, today).slice(
    -t.participationWindowDays,
  );
  const recent = recentDays.length
    ? calculateConsistency(calendar, lookup, recentDays[0]!, today, inProgress)
    : overall;

  const thisWeekStart = weekStart(today);
  const lastWeekStart = addDays(thisWeekStart, -7);
  const currentWeek = calculateConsistency(calendar, lookup, thisWeekStart, today, inProgress);
  // Entirely in the past, so nothing to exclude.
  const previousWeek = calculateConsistency(
    calendar,
    lookup,
    lastWeekStart,
    addDays(lastWeekStart, 6),
  );

  const reasons: string[] = [];
  let level: RiskLevel = 'on_track';

  const escalate = (next: RiskLevel) => {
    const rank = { on_track: 0, at_risk: 1, needs_intervention: 2 } as const;
    if (rank[next] > rank[level]) level = next;
  };

  if (missed >= t.interventionMissedDays) {
    reasons.push(`Missed ${missed} consecutive study days`);
    escalate('needs_intervention');
  } else if (missed >= t.atRiskMissedDays) {
    reasons.push(`Missed ${missed} consecutive study days`);
    escalate('at_risk');
  }

  if (recent.activeDays >= 5 && recent.consistencyPct < t.minConsistencyPct) {
    reasons.push(`Recent consistency is only ${recent.consistencyPct}%`);

    /*
     * Amber unless the data says more than "thin". Either of these makes it red:
     *   - negligible participation, which needs no corroboration; or
     *   - days actually missed alongside it, which is a student pulling away rather than a
     *     student logging less than the scoring model asks for.
     */
    const negligible = recent.consistencyPct < t.interventionConsistencyPct;
    const alsoAbsent = missed >= t.atRiskMissedDays;
    escalate(negligible || alsoAbsent ? 'needs_intervention' : 'at_risk');
  }

  // Only compare weeks once the current one has enough elapsed days to be a fair sample —
  // otherwise every Monday morning would look like a collapse.
  const drop = previousWeek.consistencyPct - currentWeek.consistencyPct;
  if (
    previousWeek.activeDays > 0 &&
    currentWeek.activeDays >= 3 &&
    drop >= t.atRiskConsistencyDropPct
  ) {
    reasons.push(
      `Consistency dropped from ${previousWeek.consistencyPct}% to ${currentWeek.consistencyPct}%`,
    );
    escalate('at_risk');
  }

  return {
    level,
    reasons,
    missedActiveDays: missed,
    consistencyPct: overall.consistencyPct,
    recentConsistencyPct: recent.consistencyPct,
    previousWeekPct: previousWeek.consistencyPct,
    currentWeekPct: currentWeek.consistencyPct,
  };
}

export const RISK_LABELS: Record<RiskLevel, string> = {
  on_track: 'On track',
  at_risk: 'At risk',
  needs_intervention: 'Needs intervention',
};

export const RISK_ORDER: Record<RiskLevel, number> = {
  needs_intervention: 0,
  at_risk: 1,
  on_track: 2,
};
