import 'server-only';

import { and, eq } from 'drizzle-orm';
import { cacheLife, cacheTag } from 'next/cache';
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
import { cohortTag } from '@/server/cache';

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

/*
 * The two reads below used to run on every request of every screen, for data that changes
 * when a cohort lead edits a setting — perhaps monthly. Together they were the single most
 * repeated pair of queries in the application.
 *
 * They are cached across requests and across students, keyed only by cohort id, and cleared
 * by `invalidateCohortConfig` from the handful of admin actions that can change them. The
 * long `cacheLife` is safe precisely because the invalidation is exact: the expiry is a
 * backstop for a missed tag, not the mechanism.
 *
 * Note what is *not* in here. `buildCalendar` and `todayInTimezone` stay outside the cached
 * boundary — the first because a `CohortCalendar` holds `Set`s and would not survive being
 * serialised into a cache entry, the second because caching a function of the current time
 * is how a cohort wakes up still believing it is yesterday.
 */
const loadCalendarDays = async (cohortId: string) => {
  'use cache';
  cacheTag(cohortTag.config(cohortId));
  cacheLife('hours');

  const [holidays, extras] = await Promise.all([
    db
      .select({ date: cohortHolidays.date })
      .from(cohortHolidays)
      .where(eq(cohortHolidays.cohortId, cohortId)),
    db
      .select({ date: cohortExtraStudyDays.date })
      .from(cohortExtraStudyDays)
      .where(eq(cohortExtraStudyDays.cohortId, cohortId)),
  ]);

  return {
    holidays: holidays.map((h) => h.date),
    extraStudyDays: extras.map((e) => e.date),
  };
};

/** Loads the calendar for a cohort, including holidays and extra study days. */
export const loadCalendar = cache(async (cohort: Cohort): Promise<CohortCalendar> => {
  const { holidays, extraStudyDays } = await loadCalendarDays(cohort.id);

  return buildCalendar({
    timezone: cohort.timezone,
    startDate: cohort.startDate,
    endDate: cohort.endDate,
    activeWeekdays: cohort.activeWeekdays,
    holidays,
    extraStudyDays,
  });
});

const loadPointRuleRows = async (cohortId: string) => {
  'use cache';
  cacheTag(cohortTag.config(cohortId));
  cacheLife('hours');

  return db
    .select({ event: pointRules.event, points: pointRules.points })
    .from(pointRules)
    .where(eq(pointRules.cohortId, cohortId));
};

export const loadPointRules = cache(async (cohortId: string): Promise<PointRules> => {
  const rows = await loadPointRuleRows(cohortId);

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

/** Builds the cohort context from a cohort the caller already has in hand. */
const cohortContextFor = cache(async (cohort: Cohort) => {
  const [calendar, rules] = await Promise.all([loadCalendar(cohort), loadPointRules(cohort.id)]);
  return {
    cohort,
    calendar,
    rules,
    thresholds: thresholdsFor(cohort),
    today: todayInTimezone(cohort.timezone),
  };
});

export type CohortContext = NonNullable<Awaited<ReturnType<typeof cohortContextFor>>>;

/**
 * Cohort-level context for admin screens.
 *
 * Every admin page runs `getPrimaryCohort()` and then this, and this used to re-select the
 * same cohort row by id — a wasted round trip at the very front of every render, before any
 * of the page's own reads could start. Passing the row it already has skips it.
 */
export const getCohortContext = cache(async (cohort: Cohort | string) => {
  if (typeof cohort !== 'string') return cohortContextFor(cohort);

  const rows = await db.select().from(cohorts).where(eq(cohorts.id, cohort)).limit(1);
  const row = rows[0];
  if (!row) return null;
  return cohortContextFor(row);
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
