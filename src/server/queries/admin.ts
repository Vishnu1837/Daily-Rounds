import 'server-only';

import { and, asc, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { cache } from 'react';

import { db } from '@/db/client';
import type { AttendanceStatus, RiskLevel, RoadmapSlot } from '@/db/schema';
import {
  announcements,
  attendance,
  checkIns,
  cohortExtraStudyDays,
  cohortHolidays,
  cohortMembers,
  dailyActivity,
  dailyAssignments,
  events,
  materials,
  pointsLedger,
  assessmentAttempts,
  assessments,
  roadmapTopics,
  roadmapWeeks,
  roadmaps,
  studentAchievements,
  studentGoals,
  subjects,
  users,
  weeklyReviews,
} from '@/db/schema';
import {
  type ISODate,
  activeStudyDaysBetween,
  addDays,
  minDate,
  weekStart,
} from '@/lib/domain/calendar';
import {
  calculateConsistency,
  calculateImprovement,
  calculateOverallConsistency,
  calculateWeeklyProgress,
} from '@/lib/domain/consistency';
import { ACHIEVEMENTS } from '@/lib/domain/achievements';
import { RISK_ORDER, calculateRiskStatus } from '@/lib/domain/risk';
import {
  calculateBestStreak,
  calculateCohortStreak,
  calculateCurrentStreak,
} from '@/lib/domain/streak';
import type { getCohortContext } from '@/server/context';
import {
  type LeaderboardRow,
  type Recognitions,
  loadCohortStandings,
} from '@/server/queries/student';

type CohortCtx = NonNullable<Awaited<ReturnType<typeof getCohortContext>>>;

export type AdminStudentRow = {
  memberId: string;
  userId: string;
  name: string;
  avatarUrl: string | null;
  email: string;
  mbbsYear: number | null;
  university: string | null;
  status: 'active' | 'paused' | 'left';
  joinedOn: ISODate;
  subjectName: string | null;
  consistencyPct: number;
  showUpRatePct: number;
  streak: number;
  bestStreak: number;
  points: number;
  roadmapPct: number;
  risk: RiskLevel;
  riskReasons: string[];
  missedActiveDays: number;
  improvementPct: number;
  showedUpToday: boolean;
  attendanceToday: AttendanceStatus | null;
  checkedInToday: boolean;
};

/**
 * One pass over the cohort producing every derived number the admin console needs.
 * Deliberately a handful of set-based queries rather than per-student work.
 */
export const getCohortStudents = cache(async function getCohortStudents(
  ctx: CohortCtx,
): Promise<AdminStudentRow[]> {
  const { cohort, calendar, today, thresholds } = ctx;
  const upTo = minDate(today, calendar.endDate);

  /*
   * The roster as a subquery. The six roll-up reads below used to wait for the member list
   * to come back so they could be handed an `IN (...)` of ids the database already had —
   * two serial waves where one will do, on every admin screen.
   */
  const cohortMemberIds = db
    .select({ id: cohortMembers.id })
    .from(cohortMembers)
    .where(eq(cohortMembers.cohortId, cohort.id));

  const [members, activityRows, pointRows, topicRows, subjectRows, attendanceRows, checkInRows] =
    await Promise.all([
      db
        .select({
          memberId: cohortMembers.id,
          userId: users.id,
          name: users.fullName,
          avatarUrl: users.avatarUrl,
          email: users.email,
          mbbsYear: users.mbbsYear,
          university: users.university,
          status: cohortMembers.status,
          joinedAt: cohortMembers.joinedAt,
        })
        .from(cohortMembers)
        .innerJoin(users, eq(users.id, cohortMembers.userId))
        .where(eq(cohortMembers.cohortId, cohort.id))
        .orderBy(asc(users.fullName)),
      db
        .select()
        .from(dailyActivity)
        .where(
          and(
            inArray(dailyActivity.memberId, cohortMemberIds),
            gte(dailyActivity.date, calendar.startDate),
            lte(dailyActivity.date, upTo),
          ),
        ),
      db
        .select({
          memberId: pointsLedger.memberId,
          total: sql<number>`coalesce(sum(${pointsLedger.points}), 0)::int`,
        })
        .from(pointsLedger)
        .where(inArray(pointsLedger.memberId, cohortMemberIds))
        .groupBy(pointsLedger.memberId),
      db
        .select({
          memberId: roadmaps.memberId,
          total: sql<number>`count(*)::int`,
          completed: sql<number>`count(*) FILTER (WHERE ${roadmapTopics.status} = 'completed')::int`,
        })
        .from(roadmaps)
        .leftJoin(roadmapTopics, eq(roadmapTopics.roadmapId, roadmaps.id))
        .where(inArray(roadmaps.memberId, cohortMemberIds))
        .groupBy(roadmaps.memberId),
      db
        .select({ memberId: studentGoals.memberId, subjectName: subjects.name })
        .from(studentGoals)
        .leftJoin(subjects, eq(subjects.id, studentGoals.primarySubjectId))
        .where(inArray(studentGoals.memberId, cohortMemberIds)),
      db
        .select({ memberId: attendance.memberId, status: attendance.status })
        .from(attendance)
        .where(and(inArray(attendance.memberId, cohortMemberIds), eq(attendance.date, today))),
      db
        .select({ memberId: checkIns.memberId })
        .from(checkIns)
        .where(and(inArray(checkIns.memberId, cohortMemberIds), eq(checkIns.date, today))),
    ]);

  if (members.length === 0) return [];

  const byMember = new Map<string, Map<ISODate, (typeof activityRows)[number]>>();
  for (const row of activityRows) {
    let m = byMember.get(row.memberId);
    if (!m) {
      m = new Map();
      byMember.set(row.memberId, m);
    }
    m.set(row.date, row);
  }

  const pointsBy = new Map(pointRows.map((r) => [r.memberId, r.total]));
  const topicsBy = new Map(topicRows.map((r) => [r.memberId, r]));
  const subjectBy = new Map(subjectRows.map((r) => [r.memberId, r.subjectName]));
  const attendanceBy = new Map(attendanceRows.map((r) => [r.memberId, r.status]));
  const checkedIn = new Set(checkInRows.map((r) => r.memberId));

  return members.map((m) => {
    const days = byMember.get(m.memberId) ?? new Map();
    const lookup = (d: ISODate) => {
      const row = days.get(d);
      return row
        ? {
            date: d,
            showedUp: row.showedUp,
            score: row.scorePct / 100,
            studyMinutes: row.studyMinutes,
            points: row.points,
          }
        : undefined;
    };
    const showedUp = (d: ISODate) => days.get(d)?.showedUp ?? false;
    const joinedOn = m.joinedAt.toISOString().slice(0, 10);

    const overall = calculateOverallConsistency(calendar, lookup, upTo);
    const risk = calculateRiskStatus({
      calendar,
      lookup,
      showedUp,
      today,
      since: joinedOn,
      thresholds,
    });
    const topics = topicsBy.get(m.memberId);

    return {
      memberId: m.memberId,
      userId: m.userId,
      name: m.name,
      avatarUrl: m.avatarUrl,
      email: m.email,
      mbbsYear: m.mbbsYear,
      university: m.university,
      status: m.status,
      joinedOn,
      subjectName: subjectBy.get(m.memberId) ?? null,
      consistencyPct: overall.consistencyPct,
      showUpRatePct: overall.showUpRatePct,
      streak: calculateCurrentStreak(calendar, showedUp, today).length,
      bestStreak: calculateBestStreak(calendar, showedUp, upTo).length,
      points: pointsBy.get(m.memberId) ?? 0,
      roadmapPct:
        !topics || topics.total === 0 ? 0 : Math.round((topics.completed / topics.total) * 100),
      risk: risk.level,
      riskReasons: risk.reasons,
      missedActiveDays: risk.missedActiveDays,
      improvementPct: calculateImprovement(calculateWeeklyProgress(calendar, lookup, upTo))
        .deltaPct,
      showedUpToday: showedUp(today),
      attendanceToday: attendanceBy.get(m.memberId) ?? null,
      checkedInToday: checkedIn.has(m.memberId),
    };
  });
});

export type CohortOverview = {
  size: number;
  activeToday: number;
  attendanceToday: number;
  attendanceMarked: number;
  avgConsistency: number;
  avgRoadmap: number;
  cohortStreak: number;
  thresholdPct: number;
  totalStudyMinutes: number;
  checkInsToday: number;
  needsAttention: AdminStudentRow[];
};

export async function getCohortOverview(ctx: CohortCtx): Promise<CohortOverview> {
  const { cohort, calendar, today } = ctx;
  const upTo = minDate(today, calendar.endDate);

  /*
   * The roster is a subquery rather than an id list built from `students`, so this read no
   * longer has to wait for the student roll-up to come back first. Both now start in the
   * same tick (see the admin overview page).
   */
  const activeMembers = db
    .select({ id: cohortMembers.id })
    .from(cohortMembers)
    .where(and(eq(cohortMembers.cohortId, cohort.id), eq(cohortMembers.status, 'active')));

  const [turnoutRows, students] = await Promise.all([
    db
      .select({
        date: dailyActivity.date,
        showedUp: sql<number>`count(*) FILTER (WHERE ${dailyActivity.showedUp})::int`,
        minutes: sql<number>`coalesce(sum(${dailyActivity.studyMinutes}), 0)::int`,
      })
      .from(dailyActivity)
      .where(
        and(
          inArray(dailyActivity.memberId, activeMembers),
          gte(dailyActivity.date, calendar.startDate),
          lte(dailyActivity.date, upTo),
        ),
      )
      .groupBy(dailyActivity.date),
    // Memoised, so the overview page's own call to this costs nothing extra.
    getCohortStudents(ctx),
  ]);

  const active = students.filter((s) => s.status === 'active');

  const byDate = new Map(turnoutRows.map((r) => [r.date, r]));
  const cohortStreak = calculateCohortStreak(
    calendar,
    (d) => ({ showedUp: byDate.get(d)?.showedUp ?? 0, total: active.length }),
    cohort.streakThresholdPct,
    today,
  );

  const avg = (values: number[]) =>
    values.length === 0 ? 0 : Math.round(values.reduce((a, b) => a + b, 0) / values.length);

  return {
    size: active.length,
    activeToday: active.filter((s) => s.showedUpToday).length,
    attendanceToday: active.filter((s) => s.attendanceToday && s.attendanceToday !== 'absent')
      .length,
    attendanceMarked: active.filter((s) => s.attendanceToday !== null).length,
    avgConsistency: avg(active.map((s) => s.consistencyPct)),
    avgRoadmap: avg(active.map((s) => s.roadmapPct)),
    cohortStreak: cohortStreak.length,
    thresholdPct: cohort.streakThresholdPct,
    totalStudyMinutes: turnoutRows.reduce((s, r) => s + r.minutes, 0),
    checkInsToday: active.filter((s) => s.checkedInToday).length,
    needsAttention: active
      .filter((s) => s.risk !== 'on_track')
      .sort(
        (a, b) =>
          RISK_ORDER[a.risk] - RISK_ORDER[b.risk] ||
          b.missedActiveDays - a.missedActiveDays ||
          a.consistencyPct - b.consistencyPct,
      ),
  };
}

/* -------------------------------------------------------- attendance sheet */

export async function getAttendanceSheet(ctx: CohortCtx, date: ISODate) {
  const rows = await db
    .select({
      memberId: cohortMembers.id,
      name: users.fullName,
      avatarUrl: users.avatarUrl,
      mbbsYear: users.mbbsYear,
      status: attendance.status,
      note: attendance.note,
    })
    .from(cohortMembers)
    .innerJoin(users, eq(users.id, cohortMembers.userId))
    .leftJoin(attendance, and(eq(attendance.memberId, cohortMembers.id), eq(attendance.date, date)))
    .where(and(eq(cohortMembers.cohortId, ctx.cohort.id), eq(cohortMembers.status, 'active')))
    .orderBy(asc(users.fullName));

  return rows;
}

/* ------------------------------------------------------------ student view */

export async function getStudentDetail(ctx: CohortCtx, memberId: string) {
  const { calendar, today } = ctx;
  const upTo = minDate(today, calendar.endDate);

  /*
   * The member row is fetched *alongside* the seven roll-ups rather than before them. It
   * used to gate them purely so a missing member could return early — but every one of the
   * seven keys on `memberId` directly, so for a member who does not exist they simply come
   * back empty. Guarding cost a serial round trip on every load of the page for the
   * overwhelmingly common case where the member does exist.
   */
  const [
    memberRows,
    goalRows,
    activityRows,
    checkInRows,
    ledgerRows,
    topicRows,
    reviewRows,
    attendanceRows,
    badgeRows,
    assessmentRows,
  ] = await Promise.all([
    db
      .select({
        memberId: cohortMembers.id,
        userId: users.id,
        name: users.fullName,
        avatarUrl: users.avatarUrl,
        email: users.email,
        whatsapp: users.whatsapp,
        university: users.university,
        mbbsYear: users.mbbsYear,
        role: users.role,
        status: cohortMembers.status,
        joinedAt: cohortMembers.joinedAt,
      })
      .from(cohortMembers)
      .innerJoin(users, eq(users.id, cohortMembers.userId))
      .where(and(eq(cohortMembers.id, memberId), eq(cohortMembers.cohortId, ctx.cohort.id)))
      .limit(1),
    db
      .select({
        cohortGoal: studentGoals.cohortGoal,
        dailyCommitmentMinutes: studentGoals.dailyCommitmentMinutes,
        examName: studentGoals.examName,
        examDate: studentGoals.examDate,
        baselineDaysStudiedLastWeek: studentGoals.baselineDaysStudiedLastWeek,
        baselineConsistencyRating: studentGoals.baselineConsistencyRating,
        baselineConfidence: studentGoals.baselineConfidence,
        biggestObstacle: studentGoals.biggestObstacle,
        subjectName: subjects.name,
      })
      .from(studentGoals)
      .leftJoin(subjects, eq(subjects.id, studentGoals.primarySubjectId))
      .where(eq(studentGoals.memberId, memberId))
      .limit(1),
    db
      .select()
      .from(dailyActivity)
      .where(
        and(
          eq(dailyActivity.memberId, memberId),
          gte(dailyActivity.date, calendar.startDate),
          lte(dailyActivity.date, upTo),
        ),
      )
      .orderBy(asc(dailyActivity.date)),
    db
      .select()
      .from(checkIns)
      .where(eq(checkIns.memberId, memberId))
      .orderBy(desc(checkIns.date))
      .limit(14),
    db
      .select({
        id: pointsLedger.id,
        event: pointsLedger.event,
        points: pointsLedger.points,
        occurredOn: pointsLedger.occurredOn,
        reason: pointsLedger.reason,
      })
      .from(pointsLedger)
      .where(eq(pointsLedger.memberId, memberId))
      .orderBy(desc(pointsLedger.occurredOn), desc(pointsLedger.createdAt))
      .limit(40),
    db
      .select({
        total: sql<number>`count(*)::int`,
        completed: sql<number>`count(*) FILTER (WHERE ${roadmapTopics.status} = 'completed')::int`,
      })
      .from(roadmapTopics)
      .innerJoin(roadmaps, eq(roadmaps.id, roadmapTopics.roadmapId))
      .where(eq(roadmaps.memberId, memberId)),
    db
      .select()
      .from(weeklyReviews)
      .where(eq(weeklyReviews.memberId, memberId))
      .orderBy(desc(weeklyReviews.weekStart))
      .limit(6),
    db
      .select({
        present: sql<number>`count(*) FILTER (WHERE ${attendance.status} = 'present')::int`,
        late: sql<number>`count(*) FILTER (WHERE ${attendance.status} = 'late')::int`,
        absent: sql<number>`count(*) FILTER (WHERE ${attendance.status} = 'absent')::int`,
      })
      .from(attendance)
      .where(and(eq(attendance.memberId, memberId), lte(attendance.date, upTo))),
    db
      .select({ code: studentAchievements.code, earnedOn: studentAchievements.earnedOn })
      .from(studentAchievements)
      .where(eq(studentAchievements.memberId, memberId)),
    db
      .select({
        attemptId: assessmentAttempts.id,
        assessmentId: assessmentAttempts.assessmentId,
        title: assessments.title,
        attemptNumber: assessmentAttempts.attemptNumber,
        status: assessmentAttempts.status,
        reviewStatus: assessmentAttempts.reviewStatus,
        submittedAt: assessmentAttempts.submittedAt,
        restartCount: assessmentAttempts.restartCount,
        autoScore: assessmentAttempts.autoScore,
        autoTotal: assessmentAttempts.autoTotal,
        manualScore: assessmentAttempts.manualScore,
        manualTotal: assessmentAttempts.manualTotal,
        passMarkPct: assessments.passMarkPct,
      })
      .from(assessmentAttempts)
      .innerJoin(assessments, eq(assessments.id, assessmentAttempts.assessmentId))
      .where(eq(assessmentAttempts.memberId, memberId))
      .orderBy(desc(assessmentAttempts.submittedAt))
      .limit(20),
  ]);

  const member = memberRows[0];
  if (!member) return null;

  const map = new Map(activityRows.map((r) => [r.date, r]));
  const lookup = (d: ISODate) => {
    const row = map.get(d);
    return row
      ? {
          date: d,
          showedUp: row.showedUp,
          score: row.scorePct / 100,
          studyMinutes: row.studyMinutes,
          points: row.points,
        }
      : undefined;
  };
  const showedUp = (d: ISODate) => map.get(d)?.showedUp ?? false;
  const joinedOn = member.joinedAt.toISOString().slice(0, 10);

  return {
    member: { ...member, joinedOn },
    goals: goalRows[0] ?? null,
    overall: calculateOverallConsistency(calendar, lookup, upTo),
    weeks: calculateWeeklyProgress(calendar, lookup, upTo),
    streak: calculateCurrentStreak(calendar, showedUp, today).length,
    bestStreak: calculateBestStreak(calendar, showedUp, upTo).length,
    risk: calculateRiskStatus({
      calendar,
      lookup,
      showedUp,
      today,
      since: joinedOn,
      thresholds: ctx.thresholds,
    }),
    heatmap: activeStudyDaysBetween(calendar, calendar.startDate, upTo).map((date) => {
      const row = map.get(date);
      return {
        date,
        band: row?.band ?? ('missed' as const),
        isActiveDay: true,
        points: row?.points ?? 0,
      };
    }),
    checkIns: checkInRows,
    ledger: ledgerRows,
    topics: topicRows[0] ?? { total: 0, completed: 0 },
    reviews: reviewRows,
    attendance: attendanceRows[0] ?? { present: 0, late: 0, absent: 0 },
    /**
     * Every badge in the catalog, with whether this student holds it.
     *
     * The whole catalog rather than only what they have earned, because the admin screen is
     * as much about granting a badge as about reading one — and a list you can only remove
     * from is not a grant control.
     */
    badges: ACHIEVEMENTS.map((definition) => {
      const earned = badgeRows.find((b) => b.code === definition.code) ?? null;
      return {
        code: definition.code,
        name: definition.name,
        description: definition.description,
        emoji: definition.emoji,
        tier: definition.tier,
        earnedOn: earned?.earnedOn ?? null,
      };
    }),
    /** This student's assessment attempts, newest first. Private to them and to the admin. */
    assessments: assessmentRows,
  };
}

/* ---------------------------------------------------------------- listing */

export async function getRecentCheckIns(ctx: CohortCtx, limit = 60) {
  return db
    .select({
      id: checkIns.id,
      memberId: checkIns.memberId,
      name: users.fullName,
      avatarUrl: users.avatarUrl,
      date: checkIns.date,
      completion: checkIns.completion,
      actualMinutes: checkIns.actualMinutes,
      whatStudied: checkIns.whatStudied,
      obstacle: checkIns.obstacle,
      obstacleNote: checkIns.obstacleNote,
      tomorrowTarget: checkIns.tomorrowTarget,
      satisfaction: checkIns.satisfaction,
      reflection: checkIns.reflection,
      isComeback: checkIns.isComeback,
    })
    .from(checkIns)
    .innerJoin(cohortMembers, eq(cohortMembers.id, checkIns.memberId))
    .innerJoin(users, eq(users.id, cohortMembers.userId))
    .where(eq(cohortMembers.cohortId, ctx.cohort.id))
    .orderBy(desc(checkIns.date), asc(users.fullName))
    .limit(limit);
}

export async function getCohortEvents(cohortId: string) {
  return db
    .select()
    .from(events)
    .where(eq(events.cohortId, cohortId))
    .orderBy(desc(events.date), asc(events.startTime));
}

export async function getCohortAnnouncements(cohortId: string) {
  return db
    .select()
    .from(announcements)
    .where(eq(announcements.cohortId, cohortId))
    .orderBy(desc(announcements.isPinned), desc(announcements.createdAt));
}

export async function getCohortMaterials(cohortId: string) {
  return db
    .select({
      id: materials.id,
      title: materials.title,
      description: materials.description,
      type: materials.type,
      url: materials.url,
      curriculumRef: materials.curriculumRef,
      subjectId: materials.subjectId,
      subjectName: subjects.name,
    })
    .from(materials)
    .leftJoin(subjects, eq(subjects.id, materials.subjectId))
    .where(eq(materials.cohortId, cohortId))
    .orderBy(asc(materials.title));
}

export async function getCohortCalendarConfig(cohortId: string) {
  const [holidays, extras] = await Promise.all([
    db
      .select()
      .from(cohortHolidays)
      .where(eq(cohortHolidays.cohortId, cohortId))
      .orderBy(asc(cohortHolidays.date)),
    db
      .select()
      .from(cohortExtraStudyDays)
      .where(eq(cohortExtraStudyDays.cohortId, cohortId))
      .orderBy(asc(cohortExtraStudyDays.date)),
  ]);
  return { holidays, extras };
}

/* ------------------------------------------------------- roadmap admin view */

export async function getStudentRoadmaps(cohortId: string, memberId: string) {
  const rows = await db
    .select({
      roadmapId: roadmaps.id,
      roadmapTitle: roadmaps.title,
      track: roadmaps.track,
      slot: roadmaps.slot,
      /** True once an admin has hand-edited this student's sequence. */
      isCustomized: roadmaps.isCustomized,
      /** Set when the last topic of the subject is done. */
      completedAt: roadmaps.completedAt,
      subjectId: roadmaps.subjectId,
      subjectName: subjects.name,
      subjectSlug: subjects.slug,
      weekId: roadmapWeeks.id,
      weekNumber: roadmapWeeks.weekNumber,
      weekTitle: roadmapWeeks.title,
      topicId: roadmapTopics.id,
      topicTitle: roadmapTopics.title,
      topicDescription: roadmapTopics.description,
      topicStatus: roadmapTopics.status,
      estimatedMinutes: roadmapTopics.estimatedMinutes,
      position: roadmapTopics.position,
    })
    .from(roadmaps)
    .innerJoin(cohortMembers, eq(cohortMembers.id, roadmaps.memberId))
    .innerJoin(subjects, eq(subjects.id, roadmaps.subjectId))
    .leftJoin(roadmapTopics, eq(roadmapTopics.roadmapId, roadmaps.id))
    .leftJoin(roadmapWeeks, eq(roadmapWeeks.id, roadmapTopics.weekId))
    .where(and(eq(roadmaps.memberId, memberId), eq(cohortMembers.cohortId, cohortId)))
    // Slot order, not creation order: the student's primary subject always reads first.
    .orderBy(asc(roadmaps.slot), asc(roadmapTopics.position));

  return rows;
}

/**
 * Every active student's topics for one date — one row per subject they are studying.
 *
 * A student with two subjects contributes two rows, and one with nothing assigned still
 * contributes a row (with a null slot) so the sheet can show them as unassigned rather than
 * dropping them off the list.
 */
export async function getAssignmentsForDate(cohortId: string, date: ISODate) {
  return db
    .select({
      memberId: cohortMembers.id,
      name: users.fullName,
      assignmentId: dailyAssignments.id,
      slot: dailyAssignments.slot,
      subjectName: sql<
        string | null
      >`coalesce(${subjects.name}, ${dailyAssignments.customSubjectName})`,
      topicId: dailyAssignments.topicId,
      // A syllabus topic assigned outside the student's two roadmaps lives on the
      // assignment row itself and has no `roadmap_topics` row to join to.
      topicTitle: sql<
        string | null
      >`coalesce(${roadmapTopics.title}, ${dailyAssignments.customTopicTitle})`,
      plannedMinutes: dailyAssignments.plannedMinutes,
      note: dailyAssignments.note,
      /** 'admin' when this topic was picked for this student individually. */
      source: dailyAssignments.source,
    })
    .from(cohortMembers)
    .innerJoin(users, eq(users.id, cohortMembers.userId))
    .leftJoin(
      dailyAssignments,
      and(eq(dailyAssignments.memberId, cohortMembers.id), eq(dailyAssignments.date, date)),
    )
    .leftJoin(roadmapTopics, eq(roadmapTopics.id, dailyAssignments.topicId))
    .leftJoin(roadmaps, eq(roadmaps.id, roadmapTopics.roadmapId))
    .leftJoin(subjects, eq(subjects.id, roadmaps.subjectId))
    .where(and(eq(cohortMembers.cohortId, cohortId), eq(cohortMembers.status, 'active')))
    .orderBy(asc(users.fullName), asc(dailyAssignments.slot));
}

/* -------------------------------------------------- end-of-cohort report */

export async function getEndOfCohortReport(ctx: CohortCtx, memberId: string) {
  const detail = await getStudentDetail(ctx, memberId);
  if (!detail) return null;

  const { calendar, today } = ctx;
  const upTo = minDate(today, calendar.endDate);
  const finalWeek = calculateConsistency(calendar, () => undefined, weekStart(upTo), upTo);
  void finalWeek;

  return {
    ...detail,
    sessionsAttended: detail.attendance.present + detail.attendance.late,
    sessionsPossible: activeStudyDaysBetween(calendar, calendar.startDate, upTo).length,
    improvement: calculateImprovement(detail.weeks),
    cohortName: ctx.cohort.name,
    cohortStart: calendar.startDate,
    cohortEnd: calendar.endDate,
  };
}

export const nextWeekStart = (d: ISODate) => addDays(weekStart(d), 7);

/* ----------------------------------------------- individual topic picker */

export type TopicPlanTopic = {
  id: string;
  title: string;
  status: 'upcoming' | 'in_progress' | 'completed';
  position: number;
  /** True for the topic today's assignment points at. */
  isToday: boolean;
};

export type TopicPlanSubject = {
  roadmapId: string;
  slot: 'primary' | 'secondary';
  subjectName: string;
  subjectSlug: string;
  completed: number;
  total: number;
  /** The topic the student is on: whatever is in progress, else the first one still to do. */
  current: { id: string; title: string; position: number } | null;
  /** Modules, in teaching order — the syllabus hierarchy the admin browses. */
  modules: {
    id: string;
    number: number;
    title: string;
    topics: TopicPlanTopic[];
  }[];
};

/** One subject's topic for the day, as the admin screen reports it. */
export type TopicPlanToday = {
  slot: RoadmapSlot;
  topicId: string | null;
  title: string | null;
  subjectName: string | null;
  /** 'admin' when this topic was chosen for this student by hand. */
  source: 'auto' | 'admin' | null;
  /**
   * True when the topic came from a subject this student has no roadmap for — the one case
   * where the day's topic is not a row on any of the roadmaps below.
   */
  offRoadmap: boolean;
  ref: string | null;
};

export type StudentTopicPlan = {
  date: ISODate;
  /** Today's topic in each of the student's subjects, primary slot first. */
  today: TopicPlanToday[];
  subjects: TopicPlanSubject[];
};

/**
 * One student's syllabus, shaped for the "assign an individual topic" picker.
 *
 * Built from the student's own roadmaps rather than from the master curriculum tree, and
 * that is the important decision: a roadmap is generated *from* the syllabus in teaching
 * order, so browsing it gives the admin the same hierarchy while guaranteeing that whatever
 * they pick is a row that already exists for this student. Picking a raw curriculum node
 * would leave the assignment pointing at nothing the roadmap, the progress bar or the
 * "next topic" logic could see.
 */
export async function getStudentTopicPlan(
  cohortId: string,
  memberId: string,
  date: ISODate,
): Promise<StudentTopicPlan> {
  const [rows, assignment] = await Promise.all([
    getStudentRoadmaps(cohortId, memberId),
    db
      .select({
        slot: dailyAssignments.slot,
        topicId: dailyAssignments.topicId,
        source: dailyAssignments.source,
        topicTitle: roadmapTopics.title,
        customTopicTitle: dailyAssignments.customTopicTitle,
        customTopicRef: dailyAssignments.customTopicRef,
        customSubjectName: dailyAssignments.customSubjectName,
      })
      .from(dailyAssignments)
      .leftJoin(roadmapTopics, eq(roadmapTopics.id, dailyAssignments.topicId))
      .where(and(eq(dailyAssignments.memberId, memberId), eq(dailyAssignments.date, date)))
      .orderBy(asc(dailyAssignments.slot)),
  ]);

  const todayTopicIds = new Set(
    assignment.map((a) => a.topicId).filter((id): id is string => Boolean(id)),
  );
  const subjects = new Map<string, TopicPlanSubject>();

  for (const row of rows) {
    let subject = subjects.get(row.roadmapId);
    if (!subject) {
      subject = {
        roadmapId: row.roadmapId,
        slot: row.slot,
        subjectName: row.subjectName,
        subjectSlug: row.subjectSlug,
        completed: 0,
        total: 0,
        current: null,
        modules: [],
      };
      subjects.set(row.roadmapId, subject);
    }
    if (!row.topicId) continue;

    const moduleId = row.weekId ?? 'unscheduled';
    let group = subject.modules.find((m) => m.id === moduleId);
    if (!group) {
      group = {
        id: moduleId,
        number: row.weekNumber ?? 99,
        title: row.weekTitle ?? 'Unscheduled topics',
        topics: [],
      };
      subject.modules.push(group);
    }

    group.topics.push({
      id: row.topicId,
      title: row.topicTitle!,
      status: row.topicStatus!,
      position: row.position ?? 0,
      isToday: todayTopicIds.has(row.topicId),
    });

    subject.total += 1;
    if (row.topicStatus === 'completed') subject.completed += 1;
  }

  for (const subject of subjects.values()) {
    subject.modules.sort((a, b) => a.number - b.number);
    for (const group of subject.modules) group.topics.sort((a, b) => a.position - b.position);

    const flat = subject.modules.flatMap((m) => m.topics).sort((a, b) => a.position - b.position);
    const current =
      flat.find((t) => t.status === 'in_progress') ?? flat.find((t) => t.status !== 'completed');
    subject.current = current
      ? { id: current.id, title: current.title, position: current.position }
      : null;
  }

  const bySlot = new Map([...subjects.values()].map((s) => [s.slot, s]));

  return {
    date,
    today: assignment.map((row) => ({
      slot: row.slot,
      topicId: row.topicId,
      title: row.topicTitle ?? row.customTopicTitle,
      subjectName: row.customSubjectName ?? bySlot.get(row.slot)?.subjectName ?? null,
      source: row.source,
      offRoadmap: Boolean(row.customTopicTitle),
      ref: row.customTopicRef,
    })),
    subjects: [...subjects.values()].sort((a, b) =>
      a.slot === b.slot ? 0 : a.slot === 'primary' ? -1 : 1,
    ),
  };
}

/* --------------------------------------------------------- admin leaderboard */

export type AdminLeaderboardRow = Omit<LeaderboardRow, 'isSelf'> & { rank: number };

export type AdminLeaderboardRecognitions = Record<
  keyof Recognitions,
  { name: string; memberId: string } | null
>;

/**
 * The cohort ranking, for the console.
 *
 * Reads exactly the same standings the student leaderboard does — the brief's requirement
 * is that the lead can see the data the ranking is calculated from, not a second ranking
 * calculated differently. Rank is materialised here because the admin table sorts by other
 * columns and a position that moved when you sorted by streak would be meaningless.
 */
export async function getAdminLeaderboard(ctx: CohortCtx): Promise<{
  rows: AdminLeaderboardRow[];
  recognitions: AdminLeaderboardRecognitions;
}> {
  const standings = await loadCohortStandings(ctx.cohort.id, ctx.today);

  const rows = standings.rows.map((row, index) => ({ ...row, rank: index + 1 }));
  const byId = new Map(rows.map((row) => [row.memberId, row]));
  const resolve = (id: string | null) => {
    const row = id === null ? null : (byId.get(id) ?? null);
    return row ? { name: row.name, memberId: row.memberId } : null;
  };

  return {
    rows,
    recognitions: {
      mostConsistent: resolve(standings.recognitions.mostConsistent),
      longestStreak: resolve(standings.recognitions.longestStreak),
      mostImproved: resolve(standings.recognitions.mostImproved),
      bestComeback: resolve(standings.recognitions.bestComeback),
      perfectWeek: resolve(standings.recognitions.perfectWeek),
    },
  };
}
