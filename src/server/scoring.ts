import { and, asc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { cache } from 'react';

import { db } from '@/db/client';
import { invalidateCohortActivity } from '@/server/cache';
import type { PointEvent } from '@/db/schema';
import {
  assessmentAttempts,
  assessments,
  attendance,
  checkIns,
  dailyActivity,
  pointsLedger,
  quizAttempts,
  studentAchievements,
  studyRoomPresence,
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
  type BehaviourEvent,
  type PointRules,
  bandForDay,
  dayScore,
  ledgerKey,
  showedUpForDay,
  showedUpOnMarkAlone,
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
 *
 * Being the only writer is why cache invalidation lives here rather than in the actions
 * that trigger it. A check-in, a finished study block, a quiz, an attendance mark and an
 * admin points adjustment all end up in this function, so clearing the cohort's activity
 * tag once here covers every one of them — and covers the next feature that scores
 * something without its author having to know a cache exists. `cohortId` is required for
 * exactly that reason: the compiler, not a code review, is what keeps it supplied.
 */
export async function recomputeDay(args: {
  memberId: string;
  cohortId: string;
  date: ISODate;
  calendar: CohortCalendar;
  rules: PointRules;
  /**
   * The behaviours this cohort asks for — the day score's denominator. Omitted means the
   * full catalogue, which is right for a caller with no cohort in hand and wrong for one
   * that has it, so every real caller passes it. See `expectedBehavioursFor`.
   */
  expected?: readonly BehaviourEvent[];
}): Promise<DayRecord> {
  const { memberId, date, calendar, rules, expected } = args;

  const [entries, sessionRows, checkInRows, presenceRows, attendanceRows] = await Promise.all([
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
    /*
     * The room's own record of who was in it. Written only by the student's client
     * heartbeat, which is what makes it the corroboration `showedUpForDay` asks for — an
     * admin can mark the attendance sheet but cannot manufacture one of these.
     */
    db
      .select({ id: studyRoomPresence.id })
      .from(studyRoomPresence)
      .where(and(eq(studyRoomPresence.memberId, memberId), eq(studyRoomPresence.date, date)))
      .limit(1),
    /*
     * Read only to see whether a cohort lead has ruled this day absent. A human call
     * outranks a self-report everywhere else in this codebase and it does here too: without
     * this, crediting the attendance slot from a presence row would quietly overturn the
     * mark, which is the opposite of what an override is for.
     */
    db
      .select({ status: attendance.status })
      .from(attendance)
      .where(and(eq(attendance.memberId, memberId), eq(attendance.date, date)))
      .limit(1),
  ]);

  const isActive = isActiveStudyDay(calendar, date);
  const points = entries.reduce((sum, e) => sum + e.points, 0);

  // Prefer the student's self-reported minutes; fall back to tracked session time.
  const trackedMinutes = Math.round(sessionRows.reduce((sum, s) => sum + s.elapsedSeconds, 0) / 60);
  const studyMinutes = checkInRows[0]?.actualMinutes ?? trackedMinutes;

  /*
   * Whether the student turned up, independent of whether anyone asked them to.
   *
   * This used to be `isActive && …`, which meant a rest day the student worked was recorded
   * as a day they did not show up — the source rows existed, the points were paid, and the
   * only surface that could have said so said the opposite. The audit counted 18 such days.
   *
   * Nothing downstream is put at risk by recording it honestly, and that is by construction:
   * `calculateConsistency` and the streak engine both iterate `activeStudyDaysBetween`, so a
   * bonus day is never in either denominator and can never make a weekend expected. See
   * ADR-004 and ADR-005 — the exclusion is structural, not a matter of this flag.
   */
  const verifiedPresence = presenceRows.length > 0;
  const showedUp = showedUpForDay({ entries, verifiedPresence });

  /*
   * The room's record, minus any day a cohort lead has ruled absent. This is what fills the
   * attendance slot in the score when no ledger entry did — see `DayScoreContext`.
   */
  const ruledAbsent = attendanceRows[0]?.status === 'absent';
  const score = dayScore(entries, rules, {
    expected,
    verifiedPresence: verifiedPresence && !ruledAbsent,
  });

  /*
   * Reporting only — the day counts in full either way. This records whether the show-up
   * rests on a cohort lead's mark and nothing else, so the admin console can show the
   * verified split behind its headline instead of a number nobody can interrogate. See
   * `showedUpOnMarkAlone`.
   */
  const handMarkedOnly = showedUpOnMarkAlone({ entries, verifiedPresence });

  const record: DayRecord = {
    date,
    showedUp,
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
      handMarkedOnly,
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
        handMarkedOnly,
        points,
        scorePct: Math.round(score * 100),
        band: bandForDay(score, isActive),
        studyMinutes,
        computedAt: new Date(),
      },
    });

  invalidateCohortActivity(args.cohortId);

  return record;
}

/** Rebuilds every day in a range. Used by the admin "recalculate" action and the seeder. */
export async function recomputeRange(args: {
  memberId: string;
  cohortId: string;
  from: ISODate;
  to: ISODate;
  calendar: CohortCalendar;
  rules: PointRules;
  expected?: readonly BehaviourEvent[];
}): Promise<void> {
  const { memberId, cohortId, calendar, rules, expected } = args;
  const days = activeStudyDaysBetween(calendar, args.from, args.to);

  /*
   * Non-active days that carry data are refreshed too, so a weekend the student worked is
   * recomputed into a bonus day rather than left at whatever the last pass wrote.
   *
   * Both sources are needed. The ledger catches any day that was paid for; study sessions
   * catch a weekend block that ran but fell short of the payout threshold, which records
   * minutes and no ledger row at all — and minutes are the whole of what a student sees on
   * a day like that.
   */
  const [paid, sat] = await Promise.all([
    db
      .selectDistinct({ date: pointsLedger.occurredOn })
      .from(pointsLedger)
      .where(
        and(
          eq(pointsLedger.memberId, memberId),
          gte(pointsLedger.occurredOn, args.from),
          lte(pointsLedger.occurredOn, args.to),
        ),
      ),
    db
      .selectDistinct({ date: studySessions.date })
      .from(studySessions)
      .where(
        and(
          eq(studySessions.memberId, memberId),
          gte(studySessions.date, args.from),
          lte(studySessions.date, args.to),
        ),
      ),
  ]);

  const all = [
    ...new Set<ISODate>([...days, ...paid.map((e) => e.date), ...sat.map((e) => e.date)]),
  ].sort();

  /*
   * Days are independent of one another — `recomputeDay` reads and writes exactly one
   * student-day — so they run in bounded batches rather than one at a time. A cohort
   * recalculation over a 30-day window was 30 serial round trips per student; it is now
   * roughly four. The bound keeps a whole-cohort recalculation from opening the pool wide.
   */
  const BATCH = 8;
  for (let i = 0; i < all.length; i += BATCH) {
    await Promise.all(
      all
        .slice(i, i + BATCH)
        .map((date) => recomputeDay({ memberId, cohortId, date, calendar, rules, expected })),
    );
  }
}

/* ---------------------------------------------------------------- lookups */

export type LoadedActivity = {
  lookup: DayLookup;
  showedUp: (date: ISODate) => boolean;
  /** See `showedUpOnMarkAlone`. Reporting only — nothing scored reads this. */
  handMarkedOnly: (date: ISODate) => boolean;
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
  const handMarked = new Set<ISODate>();
  for (const row of rows) {
    if (row.handMarkedOnly) handMarked.add(row.date);
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
    handMarkedOnly: (date) => handMarked.has(date),
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
  cohortId: string;
  date: ISODate;
  calendar: CohortCalendar;
  rules: PointRules;
  expected?: readonly BehaviourEvent[];
}): Promise<ScoringOutcome> {
  const { memberId, cohortId, date, calendar, rules, expected } = args;

  await recomputeDay({ memberId, cohortId, date, calendar, rules, expected });

  const to = minDate(date, calendar.endDate);

  /*
   * The activity cache and the achievement tallies both read what `recomputeDay` has just
   * written, so both wait on it — but not on each other. Fetching them together halves the
   * serial round trips on the path every scoring interaction takes.
   */
  const [
    activity,
    [existing, checkInCount, minutesRow, quizCount, comebackCount, assessmentCounts],
  ] = await Promise.all([
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
      /*
       * Assessments completed, and how many cleared their own pass mark.
       *
       * Counted in SQL against each assessment's own threshold rather than a fixed
       * number, because the pass mark is a per-assessment setting. Attempts a restart
       * invalidated are excluded — a sitting that was thrown away is not one the student
       * completed. Only the *count* reaches the badge engine; the score never does, which
       * is what keeps a public badge from carrying a private mark.
       *
       * The `CASE` clauses are `scorePercent`'s rule, written in SQL: while a review is
       * pending, the questions still sitting with a cohort lead count towards neither the
       * score nor the total. Without them this asked a different question from the one the
       * student's own result screen answers — a paper of ten MCQs answered perfectly and ten
       * unmarked essay points read as 100% to the student and 50% here, so the badge was
       * quietly withheld from someone who had been told they passed. With 107 answers
       * awaiting marking in the cohort, that was not a rare case.
       */
      db
        .select({
          completed: sql<number>`count(*)::int`,
          passed: sql<number>`count(*) FILTER (
              WHERE (
                ${assessmentAttempts.autoTotal} + CASE
                  WHEN ${assessmentAttempts.reviewStatus} = 'pending' THEN 0
                  ELSE ${assessmentAttempts.manualTotal}
                END
              ) > 0
                AND round(
                  100.0 * (
                    ${assessmentAttempts.autoScore} + CASE
                      WHEN ${assessmentAttempts.reviewStatus} = 'pending' THEN 0
                      ELSE ${assessmentAttempts.manualScore}
                    END
                  )
                  / (
                    ${assessmentAttempts.autoTotal} + CASE
                      WHEN ${assessmentAttempts.reviewStatus} = 'pending' THEN 0
                      ELSE ${assessmentAttempts.manualTotal}
                    END
                  )
                ) >= ${assessments.passMarkPct}
            )::int`,
        })
        .from(assessmentAttempts)
        .innerJoin(assessments, eq(assessments.id, assessmentAttempts.assessmentId))
        .where(
          and(
            eq(assessmentAttempts.memberId, memberId),
            inArray(assessmentAttempts.status, ['submitted', 'expired']),
          ),
        ),
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
      assessmentsCompleted: assessmentCounts[0]?.completed ?? 0,
      assessmentsPassed: assessmentCounts[0]?.passed ?? 0,
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

  await recomputeDay({ memberId, cohortId, date, calendar, rules, expected });
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
