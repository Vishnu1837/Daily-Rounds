import 'server-only';

import { and, asc, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import type { AttendanceStatus, RiskLevel } from '@/db/schema';
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
  roadmapTopics,
  roadmapWeeks,
  roadmaps,
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
import { RISK_ORDER, calculateRiskStatus } from '@/lib/domain/risk';
import {
  calculateBestStreak,
  calculateCohortStreak,
  calculateCurrentStreak,
} from '@/lib/domain/streak';
import type { getCohortContext } from '@/server/context';

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
export async function getCohortStudents(ctx: CohortCtx): Promise<AdminStudentRow[]> {
  const { cohort, calendar, today, thresholds } = ctx;
  const upTo = minDate(today, calendar.endDate);

  const members = await db
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
    .orderBy(asc(users.fullName));

  if (members.length === 0) return [];
  const memberIds = members.map((m) => m.memberId);

  const [activityRows, pointRows, topicRows, subjectRows, attendanceRows, checkInRows] =
    await Promise.all([
      db
        .select()
        .from(dailyActivity)
        .where(
          and(
            inArray(dailyActivity.memberId, memberIds),
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
        .where(inArray(pointsLedger.memberId, memberIds))
        .groupBy(pointsLedger.memberId),
      db
        .select({
          memberId: roadmaps.memberId,
          total: sql<number>`count(*)::int`,
          completed: sql<number>`count(*) FILTER (WHERE ${roadmapTopics.status} = 'completed')::int`,
        })
        .from(roadmaps)
        .leftJoin(roadmapTopics, eq(roadmapTopics.roadmapId, roadmaps.id))
        .where(inArray(roadmaps.memberId, memberIds))
        .groupBy(roadmaps.memberId),
      db
        .select({ memberId: studentGoals.memberId, subjectName: subjects.name })
        .from(studentGoals)
        .leftJoin(subjects, eq(subjects.id, studentGoals.primarySubjectId))
        .where(inArray(studentGoals.memberId, memberIds)),
      db
        .select({ memberId: attendance.memberId, status: attendance.status })
        .from(attendance)
        .where(and(inArray(attendance.memberId, memberIds), eq(attendance.date, today))),
      db
        .select({ memberId: checkIns.memberId })
        .from(checkIns)
        .where(and(inArray(checkIns.memberId, memberIds), eq(checkIns.date, today))),
    ]);

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
}

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

export async function getCohortOverview(
  ctx: CohortCtx,
  students: AdminStudentRow[],
): Promise<CohortOverview> {
  const { cohort, calendar, today } = ctx;
  const upTo = minDate(today, calendar.endDate);
  const active = students.filter((s) => s.status === 'active');

  const turnoutRows = await db
    .select({
      date: dailyActivity.date,
      showedUp: sql<number>`count(*) FILTER (WHERE ${dailyActivity.showedUp})::int`,
      minutes: sql<number>`coalesce(sum(${dailyActivity.studyMinutes}), 0)::int`,
    })
    .from(dailyActivity)
    .where(
      and(
        inArray(
          dailyActivity.memberId,
          active.length > 0
            ? active.map((s) => s.memberId)
            : ['00000000-0000-0000-0000-000000000000'],
        ),
        gte(dailyActivity.date, calendar.startDate),
        lte(dailyActivity.date, upTo),
      ),
    )
    .groupBy(dailyActivity.date);

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

  const memberRows = await db
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
    .limit(1);

  const member = memberRows[0];
  if (!member) return null;

  const [goalRows, activityRows, checkInRows, ledgerRows, topicRows, reviewRows, attendanceRows] =
    await Promise.all([
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
    ]);

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

export async function getAssignmentsForDate(cohortId: string, date: ISODate) {
  return db
    .select({
      memberId: cohortMembers.id,
      name: users.fullName,
      assignmentId: dailyAssignments.id,
      topicId: dailyAssignments.topicId,
      topicTitle: roadmapTopics.title,
      plannedMinutes: dailyAssignments.plannedMinutes,
      note: dailyAssignments.note,
    })
    .from(cohortMembers)
    .innerJoin(users, eq(users.id, cohortMembers.userId))
    .leftJoin(
      dailyAssignments,
      and(eq(dailyAssignments.memberId, cohortMembers.id), eq(dailyAssignments.date, date)),
    )
    .leftJoin(roadmapTopics, eq(roadmapTopics.id, dailyAssignments.topicId))
    .where(and(eq(cohortMembers.cohortId, cohortId), eq(cohortMembers.status, 'active')))
    .orderBy(asc(users.fullName));
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
