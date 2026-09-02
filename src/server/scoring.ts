import { and, asc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { cache } from 'react';

import { db } from '@/db/client';
import type { PointEvent } from '@/db/schema';
import {
  checkIns,
  dailyActivity,
  pointsLedger,
  quizAttempts,
  studentAchievements,
  studySessions,
} from '@/db/schema';
import type { CohortCalendar, ISODate } from '@/lib/domain/calendar';
import { activeStudyDaysBetween, isActiveStudyDay, minDate } from '@/lib/domain/calendar';
import {
  type AchievementDefinition,
  achievementPoints,
  evaluateAchievements,
} from '@/lib/domain/achievements';
import type { DayLookup, DayRecord } from '@/lib/domain/consistency';
import {
  type PointRules,
  bandForDay,
  dayScore,
  ledgerKey,
  showedUpFromScore,
} from '@/lib/domain/points';
import {
  calculateComebackState,
  calculateCurrentStreak,
  milestoneBonusPoints,
  reachedMilestone,
} from '@/lib/domain/streak';

/* ------------------------------------------------------------ points ledger */

export type AwardInput = {
  memberId: string;
  event: PointEvent;
  points: number;
  occurredOn: ISODate;
  idempotencyKey: string;
  reason?: string;
  metadata?: Record<string, unknown>;
  createdBy?: string;
};

/**
 * Appends a ledger entry. The unique index on `idempotency_key` makes a repeat award a
 * no-op at the database level, so a student cannot be paid twice for the same action even
 * if they double-submit or replay a request.
 *
 * @returns true when a new entry was written.
 */
export async function awardPoints(input: AwardInput): Promise<boolean> {
  if (input.points === 0) return false;
  const inserted = await db
    .insert(pointsLedger)
    .values({
      memberId: input.memberId,
      event: input.event,
      points: input.points,
      occurredOn: input.occurredOn,
      idempotencyKey: input.idempotencyKey,
      reason: input.reason ?? null,
      metadata: input.metadata ?? {},
      createdBy: input.createdBy ?? null,
    })
    .onConflictDoNothing({ target: pointsLedger.idempotencyKey })
    .returning({ id: pointsLedger.id });

  return inserted.length > 0;
}

/**
 * Appends several ledger entries in one statement.
 *
 * The conflict target is still `idempotency_key`, so a batch containing an award that has
 * already been paid writes the rest and skips that one, exactly as the single-entry path
 * does. Awarding these one at a time cost a round trip each; a check-in that pays three
 * behaviours took three.
 *
 * @returns the idempotency keys that were actually written, so a caller can total only the
 *   points it just paid rather than the points it asked for.
 */
export async function awardMany(inputs: AwardInput[]): Promise<Set<string>> {
  const payable = inputs.filter((input) => input.points !== 0);
  if (payable.length === 0) return new Set();

  const inserted = await db
    .insert(pointsLedger)
    .values(
      payable.map((input) => ({
        memberId: input.memberId,
        event: input.event,
        points: input.points,
        occurredOn: input.occurredOn,
        idempotencyKey: input.idempotencyKey,
        reason: input.reason ?? null,
        metadata: input.metadata ?? {},
        createdBy: input.createdBy ?? null,
      })),
    )
    .onConflictDoNothing({ target: pointsLedger.idempotencyKey })
    .returning({ idempotencyKey: pointsLedger.idempotencyKey });

  return new Set(inserted.map((row) => row.idempotencyKey));
}

/** Removes an award (used only when the underlying fact is deleted, e.g. attendance recut). */
export async function revokeAward(idempotencyKey: string): Promise<void> {
  await db.delete(pointsLedger).where(eq(pointsLedger.idempotencyKey, idempotencyKey));
}

/* ----------------------------------------------------- daily activity cache */

/**
 * Recomputes the derived `daily_activity` row for one student-day from source records.
 * Safe to run repeatedly; it is the only writer of that table.
 */
export async function recomputeDay(args: {
  memberId: string;
  date: ISODate;
  calendar: CohortCalendar;
  rules: PointRules;
}): Promise<DayRecord> {
  const { memberId, date, calendar, rules } = args;

  const [entries, sessionRows, checkInRows] = await Promise.all([
    db
      .select({ event: pointsLedger.event, points: pointsLedger.points })
      .from(pointsLedger)
      .where(and(eq(pointsLedger.memberId, memberId), eq(pointsLedger.occurredOn, date))),
    db
      .select({ elapsedSeconds: studySessions.elapsedSeconds, status: studySessions.status })
      .from(studySessions)
      .where(and(eq(studySessions.memberId, memberId), eq(studySessions.date, date))),
    db
      .select({ actualMinutes: checkIns.actualMinutes })
      .from(checkIns)
      .where(and(eq(checkIns.memberId, memberId), eq(checkIns.date, date)))
      .limit(1),
  ]);

  const isActive = isActiveStudyDay(calendar, date);
  const score = dayScore(entries, rules);
  const points = entries.reduce((sum, e) => sum + e.points, 0);

  // Prefer the student's self-reported minutes; fall back to tracked session time.
  const trackedMinutes = Math.round(sessionRows.reduce((sum, s) => sum + s.elapsedSeconds, 0) / 60);
  const studyMinutes = checkInRows[0]?.actualMinutes ?? trackedMinutes;

  const record: DayRecord = {
    date,
    showedUp: isActive && showedUpFromScore(score),
    score,
    studyMinutes,
    points,
  };

  await db
    .insert(dailyActivity)
    .values({
      memberId,
      date,
      isActiveDay: isActive,
      showedUp: record.showedUp,
      points,
      scorePct: Math.round(score * 100),
      band: bandForDay(score, isActive),
      studyMinutes,
      computedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [dailyActivity.memberId, dailyActivity.date],
      set: {
        isActiveDay: isActive,
        showedUp: record.showedUp,
        points,
        scorePct: Math.round(score * 100),
        band: bandForDay(score, isActive),
        studyMinutes,
        computedAt: new Date(),
      },
    });

  return record;
}

/** Rebuilds every day in a range. Used by the admin "recalculate" action and the seeder. */
export async function recomputeRange(args: {
  memberId: string;
  from: ISODate;
  to: ISODate;
  calendar: CohortCalendar;
  rules: PointRules;
}): Promise<void> {
  const { memberId, calendar, rules } = args;
  const days = activeStudyDaysBetween(calendar, args.from, args.to);
  // Also refresh non-active days that carry data, so the calendar shows weekend effort.
  const extra = await db
    .selectDistinct({ date: pointsLedger.occurredOn })
    .from(pointsLedger)
    .where(
      and(
        eq(pointsLedger.memberId, memberId),
        gte(pointsLedger.occurredOn, args.from),
        lte(pointsLedger.occurredOn, args.to),
      ),
    );

  const all = [...new Set<ISODate>([...days, ...extra.map((e) => e.date)])].sort();

  /*
   * Days are independent of one another — `recomputeDay` reads and writes exactly one
   * student-day — so they run in bounded batches rather than one at a time. A cohort
   * recalculation over a 30-day window was 30 serial round trips per student; it is now
   * roughly four. The bound keeps a whole-cohort recalculation from opening the pool wide.
   */
  const BATCH = 8;
  for (let i = 0; i < all.length; i += BATCH) {
    await Promise.all(
      all.slice(i, i + BATCH).map((date) => recomputeDay({ memberId, date, calendar, rules })),
    );
  }
}

/* ---------------------------------------------------------------- lookups */

export type LoadedActivity = {
  lookup: DayLookup;
  showedUp: (date: ISODate) => boolean;
  records: DayRecord[];
};

/** Loads the derived activity cache for a member into in-memory lookups. */
export async function loadActivity(
  memberId: string,
  from: ISODate,
  to: ISODate,
): Promise<LoadedActivity> {
  const rows = await db
    .select()
    .from(dailyActivity)
    .where(
      and(
        eq(dailyActivity.memberId, memberId),
        gte(dailyActivity.date, from),
        lte(dailyActivity.date, to),
      ),
    )
    .orderBy(asc(dailyActivity.date));

  const map = new Map<ISODate, DayRecord>();
  for (const row of rows) {
    map.set(row.date, {
      date: row.date,
      showedUp: row.showedUp,
      score: row.scorePct / 100,
      studyMinutes: row.studyMinutes,
      points: row.points,
    });
  }

  return {
    lookup: (date) => map.get(date),
    showedUp: (date) => map.get(date)?.showedUp ?? false,
    records: [...map.values()],
  };
}

/* ------------------------------------------------------ streak + achievements */

export type ScoringOutcome = {
  pointsAwarded: number;
  streak: number;
  milestone: number | null;
  newAchievements: AchievementDefinition[];
};

/**
 * Runs after any scoring event: refreshes the day, pays streak milestones, and evaluates
 * achievements. Every award goes through the idempotent ledger, so calling this twice in a
 * row awards nothing the second time.
 */
export async function settleDay(args: {
  memberId: string;
  date: ISODate;
  calendar: CohortCalendar;
  rules: PointRules;
}): Promise<ScoringOutcome> {
  const { memberId, date, calendar, rules } = args;

  await recomputeDay({ memberId, date, calendar, rules });

  const to = minDate(date, calendar.endDate);

  /*
   * The activity cache and the achievement tallies both read what `recomputeDay` has just
   * written, so both wait on it — but not on each other. Fetching them together halves the
   * serial round trips on the path every scoring interaction takes.
   */
  const [activity, [existing, checkInCount, minutesRow, quizCount, comebackCount]] =
    await Promise.all([
      loadActivity(memberId, calendar.startDate, to),
      Promise.all([
        db
          .select({ code: studentAchievements.code })
          .from(studentAchievements)
          .where(eq(studentAchievements.memberId, memberId)),
        db
          .select({ n: sql<number>`count(*)::int` })
          .from(checkIns)
          .where(eq(checkIns.memberId, memberId)),
        db
          .select({ n: sql<number>`coalesce(sum(${dailyActivity.studyMinutes}), 0)::int` })
          .from(dailyActivity)
          .where(eq(dailyActivity.memberId, memberId)),
        db
          .select({ n: sql<number>`count(*)::int` })
          .from(quizAttempts)
          .where(eq(quizAttempts.memberId, memberId)),
        db
          .select({ n: sql<number>`count(*)::int` })
          .from(checkIns)
          .where(and(eq(checkIns.memberId, memberId), eq(checkIns.isComeback, true))),
      ]),
    ]);

  const streak = calculateCurrentStreak(calendar, activity.showedUp, date);
  let pointsAwarded = 0;

  const milestone = reachedMilestone(streak.length);
  if (milestone) {
    const bonus = milestoneBonusPoints(milestone);
    const written = await awardPoints({
      memberId,
      event: 'streak_bonus',
      points: bonus,
      occurredOn: date,
      idempotencyKey: ledgerKey.streakMilestone(memberId, milestone),
      reason: `${milestone}-day streak`,
      metadata: { milestone },
    });
    if (written) pointsAwarded += bonus;
  }

  const earned = new Set(existing.map((e) => e.code));
  const newAchievements = evaluateAchievements(
    {
      calendar,
      lookup: activity.lookup,
      showedUp: activity.showedUp,
      today: date,
      totalCheckIns: checkInCount[0]?.n ?? 0,
      totalStudyMinutes: minutesRow[0]?.n ?? 0,
      quizAttempts: quizCount[0]?.n ?? 0,
      comebackDays: comebackCount[0]?.n ?? 0,
    },
    earned,
  );

  for (const achievement of newAchievements) {
    const inserted = await db
      .insert(studentAchievements)
      .values({ memberId, code: achievement.code, earnedOn: date })
      .onConflictDoNothing({ target: [studentAchievements.memberId, studentAchievements.code] })
      .returning({ id: studentAchievements.id });

    if (inserted.length > 0) {
      const value = achievementPoints(achievement.tier);
      const written = await awardPoints({
        memberId,
        event: 'achievement',
        points: value,
        occurredOn: date,
        idempotencyKey: ledgerKey.achievement(memberId, achievement.code),
        reason: achievement.name,
        metadata: { code: achievement.code },
      });
      if (written) pointsAwarded += value;
    }
  }

  /*
   * Only a fresh award can change the day, and only a changed day can change the streak.
   * When nothing was paid — the overwhelmingly common case, because every one of these
   * writes is idempotent and most interactions replay an award that already exists — the
   * streak computed above is still the answer, and the two extra round trips this used to
   * spend re-deriving it are pure waste.
   */
  if (pointsAwarded === 0) {
    return { pointsAwarded, streak: streak.length, milestone, newAchievements };
  }

  await recomputeDay({ memberId, date, calendar, rules });
  const settled = await loadActivity(memberId, calendar.startDate, to);

  return {
    pointsAwarded,
    streak: calculateCurrentStreak(calendar, settled.showedUp, date).length,
    milestone,
    newAchievements,
  };
}

/** Whether today is a comeback day for this student. */
export async function getComebackState(args: {
  memberId: string;
  date: ISODate;
  calendar: CohortCalendar;
}) {
  const activity = await loadActivity(
    args.memberId,
    args.calendar.startDate,
    minDate(args.date, args.calendar.endDate),
  );
  return calculateComebackState(args.calendar, activity.showedUp, args.date);
}

/**
 * Read-path variants of `loadActivity` / `totalPoints`, memoised for the lifetime of one
 * request.
 *
 * A single dashboard render asks for the same student's activity from the layout, from
 * `getHomeData` and from the rank calculation; before this they were three separate
 * round trips to the same rows. Memoisation collapses them into one.
 *
 * They are deliberately *separate exports* rather than a `cache()` wrapped around the
 * originals: `settleDay` re-reads activity immediately after writing it, and a memoised
 * read would hand it the pre-write snapshot and report the wrong streak. Writers keep the
 * uncached functions; readers use these.
 */
export const readActivity = cache(loadActivity);

/** Total points to date, straight from the ledger. */
export async function totalPoints(memberId: string): Promise<number> {
  const rows = await db
    .select({ total: sql<number>`coalesce(sum(${pointsLedger.points}), 0)::int` })
    .from(pointsLedger)
    .where(eq(pointsLedger.memberId, memberId));
  return rows[0]?.total ?? 0;
}

/** Request-memoised `totalPoints`. See `readActivity` for why this is a separate export. */
export const readTotalPoints = cache(totalPoints);

export async function totalPointsForMembers(memberIds: string[]): Promise<Map<string, number>> {
  if (memberIds.length === 0) return new Map();
  const rows = await db
    .select({
      memberId: pointsLedger.memberId,
      total: sql<number>`coalesce(sum(${pointsLedger.points}), 0)::int`,
    })
    .from(pointsLedger)
    .where(inArray(pointsLedger.memberId, memberIds))
    .groupBy(pointsLedger.memberId);
  return new Map(rows.map((r) => [r.memberId, r.total]));
}
