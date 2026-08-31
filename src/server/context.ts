import 'server-only';

import { and, eq } from 'drizzle-orm';
import { cache } from 'react';

import { db } from '@/db/client';
import type { Cohort, PointEvent } from '@/db/schema';
import {
  cohortExtraStudyDays,
  cohortHolidays,
  cohortMembers,
  cohorts,
  pointRules,
} from '@/db/schema';
import type { SessionUser } from '@/lib/auth/session';
import {
  type CohortCalendar,
  type ISODate,
  buildCalendar,
  formatInTimezone,
  todayInTimezone,
} from '@/lib/domain/calendar';
import { DEFAULT_POINT_RULES, type PointRules } from '@/lib/domain/points';
import { DEFAULT_RISK_THRESHOLDS, type RiskThresholds } from '@/lib/domain/risk';

export type MemberContext = {
  user: SessionUser;
  memberId: string;
  cohort: Cohort;
  calendar: CohortCalendar;
  rules: PointRules;
  thresholds: RiskThresholds;
  /** Today, in the cohort's timezone. The single source of "what day is it". */
  today: ISODate;
  /** The day this student joined the cohort, in cohort time. */
  joinedOn: ISODate;
};

/** Loads the calendar for a cohort, including holidays and extra study days. */
export const loadCalendar = cache(async (cohort: Cohort): Promise<CohortCalendar> => {
  const [holidays, extras] = await Promise.all([
    db
      .select({ date: cohortHolidays.date })
      .from(cohortHolidays)
      .where(eq(cohortHolidays.cohortId, cohort.id)),
    db
      .select({ date: cohortExtraStudyDays.date })
      .from(cohortExtraStudyDays)
      .where(eq(cohortExtraStudyDays.cohortId, cohort.id)),
  ]);

  return buildCalendar({
    timezone: cohort.timezone,
    startDate: cohort.startDate,
    endDate: cohort.endDate,
    activeWeekdays: cohort.activeWeekdays,
    holidays: holidays.map((h) => h.date),
    extraStudyDays: extras.map((e) => e.date),
  });
});

export const loadPointRules = cache(async (cohortId: string): Promise<PointRules> => {
  const rows = await db
    .select({ event: pointRules.event, points: pointRules.points })
    .from(pointRules)
    .where(eq(pointRules.cohortId, cohortId));

  const rules = { ...DEFAULT_POINT_RULES };
  for (const row of rows) rules[row.event as PointEvent] = row.points;
  return rules;
});

export function thresholdsFor(cohort: Cohort): RiskThresholds {
  const s = cohort.settings ?? {};
  return {
    atRiskMissedDays: s.atRiskMissedDays ?? DEFAULT_RISK_THRESHOLDS.atRiskMissedDays,
    interventionMissedDays:
      s.interventionMissedDays ?? DEFAULT_RISK_THRESHOLDS.interventionMissedDays,
    atRiskConsistencyDropPct:
      s.atRiskConsistencyDropPct ?? DEFAULT_RISK_THRESHOLDS.atRiskConsistencyDropPct,
    minConsistencyPct: s.minConsistencyPct ?? DEFAULT_RISK_THRESHOLDS.minConsistencyPct,
    participationWindowDays: DEFAULT_RISK_THRESHOLDS.participationWindowDays,
  };
}

/** The student's active membership plus everything needed to score their day. */
export const getMemberContext = cache(async (user: SessionUser): Promise<MemberContext | null> => {
  const rows = await db
    .select({ member: cohortMembers, cohort: cohorts })
    .from(cohortMembers)
    .innerJoin(cohorts, eq(cohorts.id, cohortMembers.cohortId))
    .where(and(eq(cohortMembers.userId, user.id), eq(cohortMembers.status, 'active')))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  const [calendar, rules] = await Promise.all([
    loadCalendar(row.cohort),
    loadPointRules(row.cohort.id),
  ]);

  return {
    user,
    memberId: row.member.id,
    cohort: row.cohort,
    calendar,
    rules,
    thresholds: thresholdsFor(row.cohort),
    today: todayInTimezone(row.cohort.timezone),
    joinedOn: formatInTimezone(row.member.joinedAt, row.cohort.timezone),
  };
});

/** Cohort-level context for admin screens. */
export const getCohortContext = cache(async (cohortId: string) => {
  const rows = await db.select().from(cohorts).where(eq(cohorts.id, cohortId)).limit(1);
  const cohort = rows[0];
  if (!cohort) return null;
  const [calendar, rules] = await Promise.all([loadCalendar(cohort), loadPointRules(cohort.id)]);
  return {
    cohort,
    calendar,
    rules,
    thresholds: thresholdsFor(cohort),
    today: todayInTimezone(cohort.timezone),
  };
});

/** The default cohort used by admin screens when none is specified. */
export const getPrimaryCohort = cache(async (): Promise<Cohort | null> => {
  const rows = await db
    .select()
    .from(cohorts)
    .where(eq(cohorts.isActive, true))
    .orderBy(cohorts.startDate)
    .limit(1);
  if (rows[0]) return rows[0];
  const any = await db.select().from(cohorts).orderBy(cohorts.startDate).limit(1);
  return any[0] ?? null;
});
