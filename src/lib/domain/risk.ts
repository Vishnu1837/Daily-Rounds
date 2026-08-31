/**
 * Risk detection.
 *
 * Derived entirely from source data — never stored as an authoritative flag — so an admin
 * can trust that a red badge reflects what actually happened this week.
 *
 * 🟢 on track            — participating.
 * 🟡 at risk             — N consecutive active days missed, or a meaningful consistency drop.
 * 🔴 needs intervention  — M+ consecutive active days missed, or very low participation.
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
  /** How many recent active study days the participation check looks at. */
  participationWindowDays: number;
};

export const DEFAULT_RISK_THRESHOLDS: RiskThresholds = {
  atRiskMissedDays: 2,
  interventionMissedDays: 3,
  atRiskConsistencyDropPct: 15,
  minConsistencyPct: 40,
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
  const overall = calculateConsistency(calendar, lookup, since, today);

  // Trailing window: the last N active study days the student has actually had.
  const recentDays = activeStudyDaysBetween(calendar, since, today).slice(
    -t.participationWindowDays,
  );
  const recent = recentDays.length
    ? calculateConsistency(calendar, lookup, recentDays[0]!, today)
    : overall;

  const thisWeekStart = weekStart(today);
  const lastWeekStart = addDays(thisWeekStart, -7);
  const currentWeek = calculateConsistency(calendar, lookup, thisWeekStart, today);
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
    escalate('needs_intervention');
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
