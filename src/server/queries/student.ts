import 'server-only';

import { and, asc, desc, eq, gte, inArray, isNull, lte, ne, or, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import type { AttendanceStatus, DayBand, PointEvent } from '@/db/schema';
import {
  announcements,
  attendance,
  checkIns,
  cohortMembers,
  dailyActivity,
  dailyAssignments,
  events,
  materials,
  pointsLedger,
  quizAttempts,
  quizQuestions,
  quizzes,
  roadmapTopics,
  roadmapWeeks,
  roadmaps,
  studentAchievements,
  studentGoals,
  studySessions,
  subjects,
  users,
  weeklyReviews,
} from '@/db/schema';
import { ACHIEVEMENTS_BY_CODE } from '@/lib/domain/achievements';
import {
  type ISODate,
  activeStudyDaysBetween,
  addDays,
  cohortWeekNumber,
  datesBetween,
  isActiveStudyDay,
  isHoliday,
  minDate,
  weekStart,
} from '@/lib/domain/calendar';
import {
  calculateConsistency,
  calculateCurrentWeekConsistency,
  calculateImprovement,
  calculateOverallConsistency,
  calculateWeeklyProgress,
} from '@/lib/domain/consistency';
import { BEHAVIOUR_EVENTS, maxDailyBehaviourPoints } from '@/lib/domain/points';
import {
  calculateBestStreak,
  calculateCurrentStreak,
  calculateComebackState,
  nextMilestone,
} from '@/lib/domain/streak';
import type { MemberContext } from '@/server/context';
import { loadActivity, totalPoints } from '@/server/scoring';

/* ------------------------------------------------------------------ home */

export type TodayTask = {
  key: PointEvent | 'study_session';
  label: string;
  done: boolean;
  points: number;
  href?: string;
};

export type HomeData = {
  weekNumber: number;
  weekdayLabel: string;
  streak: number;
  bestStreak: number;
  nextMilestone: number | null;
  comeback: { isComeback: boolean; missedDays: ISODate[] };
  isActiveDay: boolean;
  isHolidayToday: boolean;
  assignment: {
    topicTitle: string | null;
    topicId: string | null;
    subjectName: string | null;
    plannedMinutes: number;
    note: string | null;
  } | null;
  session: {
    id: string;
    status: 'running' | 'paused' | 'completed' | 'abandoned';
    elapsedSeconds: number;
    resumedAt: string | null;
    plannedMinutes: number;
  } | null;
  studyRoom: {
    url: string | null;
    startTime: string;
    endTime: string;
    attended: AttendanceStatus | null;
  };
  tasks: TodayTask[];
  todayPoints: number;
  maxDailyPoints: number;
  totalPoints: number;
  weeklyConsistency: number;
  roadmapPct: number;
  rank: number | null;
  cohortSize: number;
  checkedIn: boolean;
  upcoming: {
    id: string;
    title: string;
    type: string;
    date: ISODate;
    startTime: string;
    meetUrl: string | null;
  }[];
  announcement: { id: string; title: string; body: string } | null;
  unseenAchievements: { code: string; name: string; description: string; emoji: string }[];
};

export async function getHomeData(ctx: MemberContext): Promise<HomeData> {
  const { memberId, calendar, today, rules, cohort } = ctx;
  const upTo = minDate(today, calendar.endDate);

  const [
    activity,
    assignmentRows,
    sessionRows,
    attendanceRows,
    ledgerRows,
    checkInRows,
    topicCounts,
    upcomingRows,
    announcementRows,
    unseenRows,
    points,
  ] = await Promise.all([
    loadActivity(memberId, calendar.startDate, upTo),
    db
      .select({
        plannedMinutes: dailyAssignments.plannedMinutes,
        note: dailyAssignments.note,
        topicId: roadmapTopics.id,
        topicTitle: roadmapTopics.title,
        subjectName: subjects.name,
      })
      .from(dailyAssignments)
      .leftJoin(roadmapTopics, eq(roadmapTopics.id, dailyAssignments.topicId))
      .leftJoin(roadmaps, eq(roadmaps.id, roadmapTopics.roadmapId))
      .leftJoin(subjects, eq(subjects.id, roadmaps.subjectId))
      .where(and(eq(dailyAssignments.memberId, memberId), eq(dailyAssignments.date, today)))
      .limit(1),
    db
      .select()
      .from(studySessions)
      .where(and(eq(studySessions.memberId, memberId), eq(studySessions.date, today)))
      .orderBy(desc(studySessions.startedAt))
      .limit(1),
    db
      .select({ status: attendance.status })
      .from(attendance)
      .where(and(eq(attendance.memberId, memberId), eq(attendance.date, today)))
      .limit(1),
    db
      .select({ event: pointsLedger.event, points: pointsLedger.points })
      .from(pointsLedger)
      .where(and(eq(pointsLedger.memberId, memberId), eq(pointsLedger.occurredOn, today))),
    db
      .select({ id: checkIns.id })
      .from(checkIns)
      .where(and(eq(checkIns.memberId, memberId), eq(checkIns.date, today)))
      .limit(1),
    db
      .select({
        total: sql<number>`count(*)::int`,
        completed: sql<number>`count(*) FILTER (WHERE ${roadmapTopics.status} = 'completed')::int`,
      })
      .from(roadmapTopics)
      .innerJoin(roadmaps, eq(roadmaps.id, roadmapTopics.roadmapId))
      .where(eq(roadmaps.memberId, memberId)),
    db
      .select({
        id: events.id,
        title: events.title,
        type: events.type,
        date: events.date,
        startTime: events.startTime,
        meetUrl: events.meetUrl,
      })
      .from(events)
      .where(
        and(eq(events.cohortId, cohort.id), gte(events.date, today), ne(events.type, 'study_room')),
      )
      .orderBy(asc(events.date), asc(events.startTime))
      .limit(3),
    db
      .select({ id: announcements.id, title: announcements.title, body: announcements.body })
      .from(announcements)
      .where(eq(announcements.cohortId, cohort.id))
      .orderBy(desc(announcements.isPinned), desc(announcements.createdAt))
      .limit(1),
    db
      .select({ code: studentAchievements.code })
      .from(studentAchievements)
      .where(and(eq(studentAchievements.memberId, memberId), isNull(studentAchievements.seenAt))),
    totalPoints(memberId),
  ]);

  const streak = calculateCurrentStreak(calendar, activity.showedUp, today);
  const best = calculateBestStreak(calendar, activity.showedUp, upTo);
  const comeback = calculateComebackState(calendar, activity.showedUp, today);

  const earned = new Map<PointEvent, number>();
  for (const row of ledgerRows) {
    earned.set(row.event, (earned.get(row.event) ?? 0) + row.points);
  }
  const has = (e: PointEvent) => earned.has(e);

  const assignment = assignmentRows[0] ?? null;
  const session = sessionRows[0] ?? null;
  const attendedStatus = attendanceRows[0]?.status ?? null;

  const tasks: TodayTask[] = [
    {
      key: 'live_session_present',
      label: 'Study room',
      done: has('live_session_present') || has('live_session_late'),
      points: rules.live_session_present,
    },
    {
      key: 'study_block_completed',
      label: 'Study block',
      done: has('study_block_completed'),
      points: rules.study_block_completed,
      href: '/study',
    },
    {
      key: 'daily_target_completed',
      label: "Today's target",
      done: has('daily_target_completed'),
      points: rules.daily_target_completed,
      href: '/study',
    },
    {
      key: 'daily_check_in',
      label: 'Check-in',
      done: has('daily_check_in'),
      points: rules.daily_check_in,
      href: '/check-in',
    },
    {
      key: 'tomorrow_plan',
      label: "Tomorrow's plan",
      done: has('tomorrow_plan'),
      points: rules.tomorrow_plan,
      href: '/check-in',
    },
  ];

  const weekly = calculateCurrentWeekConsistency(calendar, activity.lookup, upTo);
  const topics = topicCounts[0] ?? { total: 0, completed: 0 };
  const { rank, cohortSize } = await getRankFor(ctx);

  return {
    weekNumber: cohortWeekNumber(calendar, today),
    weekdayLabel: new Date(`${today}T12:00:00Z`).toLocaleDateString('en-GB', {
      weekday: 'long',
      timeZone: 'UTC',
    }),
    streak: streak.length,
    bestStreak: best.length,
    nextMilestone: nextMilestone(streak.length),
    comeback: { isComeback: comeback.isComeback, missedDays: comeback.missedDays },
    isActiveDay: isActiveStudyDay(calendar, today),
    isHolidayToday: isHoliday(calendar, today),
    assignment: assignment
      ? {
          topicTitle: assignment.topicTitle,
          topicId: assignment.topicId,
          subjectName: assignment.subjectName,
          plannedMinutes: assignment.plannedMinutes,
          note: assignment.note,
        }
      : null,
    session: session
      ? {
          id: session.id,
          status: session.status,
          elapsedSeconds: session.elapsedSeconds,
          resumedAt: session.resumedAt?.toISOString() ?? null,
          plannedMinutes: session.plannedMinutes,
        }
      : null,
    studyRoom: {
      url: cohort.meetUrl,
      startTime: cohort.meetStartTime,
      endTime: cohort.meetEndTime,
      attended: attendedStatus,
    },
    tasks,
    todayPoints: ledgerRows.reduce((s, r) => s + r.points, 0),
    maxDailyPoints: maxDailyBehaviourPoints(rules),
    totalPoints: points,
    weeklyConsistency: weekly.consistencyPct,
    roadmapPct: topics.total === 0 ? 0 : Math.round((topics.completed / topics.total) * 100),
    rank,
    cohortSize,
    checkedIn: checkInRows.length > 0,
    upcoming: upcomingRows,
    announcement: announcementRows[0] ?? null,
    unseenAchievements: unseenRows
      .map((r) => ACHIEVEMENTS_BY_CODE.get(r.code))
      .filter((a): a is NonNullable<typeof a> => Boolean(a))
      .map((a) => ({ code: a.code, name: a.name, description: a.description, emoji: a.emoji })),
  };
}

/* ----------------------------------------------------------- leaderboard */

export type LeaderboardRow = {
  memberId: string;
  userId: string;
  name: string;
  mbbsYear: number | null;
  consistencyPct: number;
  showUpRatePct: number;
  streak: number;
  bestStreak: number;
  points: number;
  improvementPct: number;
  perfectWeeks: number;
  isSelf: boolean;
};

export type Recognitions = {
  mostConsistent: LeaderboardRow | null;
  longestStreak: LeaderboardRow | null;
  mostImproved: LeaderboardRow | null;
  bestComeback: LeaderboardRow | null;
  perfectWeek: LeaderboardRow | null;
};

/**
 * Builds the full cohort leaderboard in a handful of queries rather than per-student.
 * Ranking is by consistency first — process over result — with points as the tiebreak.
 */
export async function getLeaderboard(
  ctx: Pick<MemberContext, 'cohort' | 'calendar' | 'today'> & { memberId?: string },
): Promise<{ rows: LeaderboardRow[]; recognitions: Recognitions }> {
  const { cohort, calendar, today } = ctx;
  const upTo = minDate(today, calendar.endDate);

  const members = await db
    .select({
      memberId: cohortMembers.id,
      userId: users.id,
      name: users.fullName,
      mbbsYear: users.mbbsYear,
    })
    .from(cohortMembers)
    .innerJoin(users, eq(users.id, cohortMembers.userId))
    .where(and(eq(cohortMembers.cohortId, cohort.id), eq(cohortMembers.status, 'active')));

  if (members.length === 0) {
    return {
      rows: [],
      recognitions: {
        mostConsistent: null,
        longestStreak: null,
        mostImproved: null,
        bestComeback: null,
        perfectWeek: null,
      },
    };
  }

  const memberIds = members.map((m) => m.memberId);

  const [activityRows, pointRows, comebackRows] = await Promise.all([
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
        memberId: checkIns.memberId,
        n: sql<number>`count(*)::int`,
        latest: sql<string>`max(${checkIns.date})`,
      })
      .from(checkIns)
      .where(and(inArray(checkIns.memberId, memberIds), eq(checkIns.isComeback, true)))
      .groupBy(checkIns.memberId),
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
  const comebacksBy = new Map(comebackRows.map((r) => [r.memberId, r]));

  const rows: LeaderboardRow[] = members.map((m) => {
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

    const overall = calculateOverallConsistency(calendar, lookup, upTo);
    const weeks = calculateWeeklyProgress(calendar, lookup, upTo);

    return {
      memberId: m.memberId,
      userId: m.userId,
      name: m.name,
      mbbsYear: m.mbbsYear,
      consistencyPct: overall.consistencyPct,
      showUpRatePct: overall.showUpRatePct,
      streak: calculateCurrentStreak(calendar, showedUp, today).length,
      bestStreak: calculateBestStreak(calendar, showedUp, upTo).length,
      points: pointsBy.get(m.memberId) ?? 0,
      improvementPct: calculateImprovement(weeks).deltaPct,
      perfectWeeks: weeks.filter((w) => w.activeDays > 0 && w.completedDays === w.activeDays)
        .length,
      isSelf: m.memberId === ctx.memberId,
    };
  });

  // Consistency first, then points, then name — deterministic ties.
  rows.sort(
    (a, b) =>
      b.consistencyPct - a.consistencyPct || b.points - a.points || a.name.localeCompare(b.name),
  );

  const mostConsistent = rows[0] ?? null;

  /**
   * Spread the recognitions. The whole point of having five categories is that five
   * different people can be recognised, so the overall leader is skipped for the others
   * whenever a genuine runner-up exists.
   */
  const claimed = new Set<string>();
  if (mostConsistent) claimed.add(mostConsistent.memberId);

  const award = (
    candidates: LeaderboardRow[],
    compare: (a: LeaderboardRow, b: LeaderboardRow) => number,
  ): LeaderboardRow | null => {
    const sorted = [...candidates].sort(compare);
    const fresh = sorted.find((r) => !claimed.has(r.memberId));
    const winner = fresh ?? sorted[0] ?? null;
    if (winner) claimed.add(winner.memberId);
    return winner;
  };

  // Most recent comeback wins, then the strength of the streak rebuilt since.
  const comebackCandidates = rows.filter((r) => (comebacksBy.get(r.memberId)?.n ?? 0) > 0);

  return {
    rows,
    recognitions: {
      mostConsistent,
      longestStreak: award(
        rows.filter((r) => r.bestStreak > 0),
        (a, b) => b.bestStreak - a.bestStreak,
      ),
      bestComeback: award(comebackCandidates, (a, a2) => {
        const latestA = comebacksBy.get(a.memberId)?.latest ?? '';
        const latestB = comebacksBy.get(a2.memberId)?.latest ?? '';
        return latestB.localeCompare(latestA) || a2.streak - a.streak;
      }),
      mostImproved: award(
        rows.filter((r) => r.improvementPct > 0),
        (a, b) => b.improvementPct - a.improvementPct,
      ),
      perfectWeek: award(
        rows.filter((r) => r.perfectWeeks > 0),
        (a, b) => b.perfectWeeks - a.perfectWeeks,
      ),
    },
  };
}

async function getRankFor(
  ctx: MemberContext,
): Promise<{ rank: number | null; cohortSize: number }> {
  const { rows } = await getLeaderboard(ctx);
  const index = rows.findIndex((r) => r.memberId === ctx.memberId);
  return { rank: index === -1 ? null : index + 1, cohortSize: rows.length };
}

/* --------------------------------------------------------------- roadmap */

export type RoadmapView = {
  id: string;
  title: string;
  track: string | null;
  subjectName: string;
  completed: number;
  total: number;
  weeks: {
    id: string;
    weekNumber: number;
    title: string;
    topics: {
      id: string;
      title: string;
      description: string | null;
      status: 'upcoming' | 'in_progress' | 'completed';
      estimatedMinutes: number;
      isToday: boolean;
    }[];
  }[];
};

export async function getRoadmaps(ctx: MemberContext): Promise<RoadmapView[]> {
  const { memberId, today } = ctx;

  const [roadmapRows, todayAssignment] = await Promise.all([
    db
      .select({
        roadmapId: roadmaps.id,
        roadmapTitle: roadmaps.title,
        track: roadmaps.track,
        subjectName: subjects.name,
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
      .innerJoin(subjects, eq(subjects.id, roadmaps.subjectId))
      .leftJoin(roadmapTopics, eq(roadmapTopics.roadmapId, roadmaps.id))
      .leftJoin(roadmapWeeks, eq(roadmapWeeks.id, roadmapTopics.weekId))
      .where(eq(roadmaps.memberId, memberId))
      .orderBy(asc(roadmaps.createdAt), asc(roadmapTopics.position)),
    db
      .select({ topicId: dailyAssignments.topicId })
      .from(dailyAssignments)
      .where(and(eq(dailyAssignments.memberId, memberId), eq(dailyAssignments.date, today)))
      .limit(1),
  ]);

  const todayTopicId = todayAssignment[0]?.topicId ?? null;
  const views = new Map<string, RoadmapView>();

  for (const row of roadmapRows) {
    let view = views.get(row.roadmapId);
    if (!view) {
      view = {
        id: row.roadmapId,
        title: row.roadmapTitle,
        track: row.track,
        subjectName: row.subjectName,
        completed: 0,
        total: 0,
        weeks: [],
      };
      views.set(row.roadmapId, view);
    }
    if (!row.topicId) continue;

    const weekKey = row.weekId ?? 'unscheduled';
    let week = view.weeks.find((w) => w.id === weekKey);
    if (!week) {
      week = {
        id: weekKey,
        weekNumber: row.weekNumber ?? 99,
        title: row.weekTitle ?? 'Unscheduled topics',
        topics: [],
      };
      view.weeks.push(week);
    }

    week.topics.push({
      id: row.topicId,
      title: row.topicTitle!,
      description: row.topicDescription,
      status: row.topicStatus!,
      estimatedMinutes: row.estimatedMinutes!,
      isToday: row.topicId === todayTopicId,
    });

    view.total += 1;
    if (row.topicStatus === 'completed') view.completed += 1;
  }

  for (const view of views.values()) {
    view.weeks.sort((a, b) => a.weekNumber - b.weekNumber);
  }

  return [...views.values()];
}

/* -------------------------------------------------------------- calendar */

export type CalendarDay = {
  date: ISODate;
  isActiveDay: boolean;
  isHoliday: boolean;
  isToday: boolean;
  isFuture: boolean;
  inCohort: boolean;
  band: DayBand;
  points: number;
  studyMinutes: number;
  showedUp: boolean;
  topicTitle: string | null;
  plannedMinutes: number | null;
  attendance: AttendanceStatus | null;
  events: { id: string; title: string; type: string; startTime: string }[];
  holidayLabel: string | null;
};

export async function getCalendarMonth(ctx: MemberContext, month: ISODate): Promise<CalendarDay[]> {
  const { memberId, calendar, today, cohort } = ctx;
  const first = `${month.slice(0, 7)}-01`;
  const firstAnchor = new Date(`${first}T12:00:00Z`);
  const daysInMonth = new Date(
    Date.UTC(firstAnchor.getUTCFullYear(), firstAnchor.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const last = `${month.slice(0, 7)}-${String(daysInMonth).padStart(2, '0')}`;

  const [activityRows, assignmentRows, attendanceRows, eventRows] = await Promise.all([
    db
      .select()
      .from(dailyActivity)
      .where(
        and(
          eq(dailyActivity.memberId, memberId),
          gte(dailyActivity.date, first),
          lte(dailyActivity.date, last),
        ),
      ),
    db
      .select({
        date: dailyAssignments.date,
        plannedMinutes: dailyAssignments.plannedMinutes,
        topicTitle: roadmapTopics.title,
      })
      .from(dailyAssignments)
      .leftJoin(roadmapTopics, eq(roadmapTopics.id, dailyAssignments.topicId))
      .where(
        and(
          eq(dailyAssignments.memberId, memberId),
          gte(dailyAssignments.date, first),
          lte(dailyAssignments.date, last),
        ),
      ),
    db
      .select({ date: attendance.date, status: attendance.status })
      .from(attendance)
      .where(
        and(
          eq(attendance.memberId, memberId),
          gte(attendance.date, first),
          lte(attendance.date, last),
        ),
      ),
    db
      .select({
        id: events.id,
        title: events.title,
        type: events.type,
        date: events.date,
        startTime: events.startTime,
      })
      .from(events)
      .where(and(eq(events.cohortId, cohort.id), gte(events.date, first), lte(events.date, last))),
  ]);

  const activityBy = new Map(activityRows.map((r) => [r.date, r]));
  const assignmentBy = new Map(assignmentRows.map((r) => [r.date, r]));
  const attendanceBy = new Map(attendanceRows.map((r) => [r.date, r.status]));
  const eventsBy = new Map<ISODate, typeof eventRows>();
  for (const e of eventRows) {
    const list = eventsBy.get(e.date) ?? [];
    list.push(e);
    eventsBy.set(e.date, list);
  }

  return datesBetween(first, last).map((date) => {
    const activity = activityBy.get(date);
    const assignment = assignmentBy.get(date);
    return {
      date,
      isActiveDay: isActiveStudyDay(calendar, date),
      isHoliday: isHoliday(calendar, date),
      isToday: date === today,
      isFuture: date > today,
      inCohort: date >= calendar.startDate && date <= calendar.endDate,
      band:
        activity?.band ?? (isActiveStudyDay(calendar, date) && date <= today ? 'missed' : 'off'),
      points: activity?.points ?? 0,
      studyMinutes: activity?.studyMinutes ?? 0,
      showedUp: activity?.showedUp ?? false,
      topicTitle: assignment?.topicTitle ?? null,
      plannedMinutes: assignment?.plannedMinutes ?? null,
      attendance: attendanceBy.get(date) ?? null,
      events: (eventsBy.get(date) ?? []).map((e) => ({
        id: e.id,
        title: e.title,
        type: e.type,
        startTime: e.startTime,
      })),
      holidayLabel: null,
    };
  });
}

/* -------------------------------------------------------------- progress */

export type ProgressData = {
  overall: ReturnType<typeof calculateOverallConsistency>;
  streak: number;
  bestStreak: number;
  weeks: ReturnType<typeof calculateWeeklyProgress>;
  improvement: ReturnType<typeof calculateImprovement>;
  sessionsAttended: number;
  sessionsPossible: number;
  topicsCompleted: number;
  topicsTotal: number;
  subjectName: string | null;
  studyMinutes: number;
  points: number;
  heatmap: { date: ISODate; band: DayBand; isActiveDay: boolean; points: number }[];
  achievements: {
    code: string;
    name: string;
    description: string;
    emoji: string;
    tier: string;
    earnedOn: ISODate | null;
  }[];
  pointsByEvent: { event: PointEvent; points: number }[];
  baseline: {
    daysStudiedLastWeek: number;
    consistencyRating: number;
    confidence: number;
  } | null;
};

export async function getProgressData(ctx: MemberContext): Promise<ProgressData> {
  const { memberId, calendar, today } = ctx;
  const upTo = minDate(today, calendar.endDate);

  const [activity, attendanceRows, topicRows, goalRows, achievementRows, ledgerByEvent, points] =
    await Promise.all([
      loadActivity(memberId, calendar.startDate, upTo),
      db
        .select({
          present: sql<number>`count(*) FILTER (WHERE ${attendance.status} <> 'absent')::int`,
          total: sql<number>`count(*)::int`,
        })
        .from(attendance)
        .where(and(eq(attendance.memberId, memberId), lte(attendance.date, upTo))),
      db
        .select({
          total: sql<number>`count(*)::int`,
          completed: sql<number>`count(*) FILTER (WHERE ${roadmapTopics.status} = 'completed')::int`,
          subjectName: sql<string>`min(${subjects.name})`,
        })
        .from(roadmapTopics)
        .innerJoin(roadmaps, eq(roadmaps.id, roadmapTopics.roadmapId))
        .innerJoin(subjects, eq(subjects.id, roadmaps.subjectId))
        .where(eq(roadmaps.memberId, memberId)),
      db
        .select({
          daysStudiedLastWeek: studentGoals.baselineDaysStudiedLastWeek,
          consistencyRating: studentGoals.baselineConsistencyRating,
          confidence: studentGoals.baselineConfidence,
        })
        .from(studentGoals)
        .where(eq(studentGoals.memberId, memberId))
        .limit(1),
      db
        .select({ code: studentAchievements.code, earnedOn: studentAchievements.earnedOn })
        .from(studentAchievements)
        .where(eq(studentAchievements.memberId, memberId)),
      db
        .select({
          event: pointsLedger.event,
          points: sql<number>`sum(${pointsLedger.points})::int`,
        })
        .from(pointsLedger)
        .where(eq(pointsLedger.memberId, memberId))
        .groupBy(pointsLedger.event),
      totalPoints(memberId),
    ]);

  const overall = calculateOverallConsistency(calendar, activity.lookup, upTo);
  const weeks = calculateWeeklyProgress(calendar, activity.lookup, upTo);
  const earnedBy = new Map(achievementRows.map((r) => [r.code, r.earnedOn]));

  const heatmap = datesBetween(
    calendar.startDate,
    minDate(addDays(today, 6), calendar.endDate),
  ).map((date) => {
    const rec = activity.lookup(date);
    const active = isActiveStudyDay(calendar, date);
    return {
      date,
      band: (rec
        ? bandOf(rec.score, active)
        : active && date <= today
          ? 'missed'
          : 'off') as DayBand,
      isActiveDay: active,
      points: rec?.points ?? 0,
    };
  });

  const topics = topicRows[0] ?? { total: 0, completed: 0, subjectName: null };

  return {
    overall,
    streak: calculateCurrentStreak(calendar, activity.showedUp, today).length,
    bestStreak: calculateBestStreak(calendar, activity.showedUp, upTo).length,
    weeks,
    improvement: calculateImprovement(weeks),
    sessionsAttended: attendanceRows[0]?.present ?? 0,
    sessionsPossible: activeStudyDaysBetween(calendar, calendar.startDate, upTo).length,
    topicsCompleted: topics.completed,
    topicsTotal: topics.total,
    subjectName: topics.subjectName,
    studyMinutes: overall.studyMinutes,
    points,
    heatmap,
    achievements: [...ACHIEVEMENTS_BY_CODE.values()].map((a) => ({
      code: a.code,
      name: a.name,
      description: a.description,
      emoji: a.emoji,
      tier: a.tier,
      earnedOn: earnedBy.get(a.code) ?? null,
    })),
    pointsByEvent: ledgerByEvent.sort((a, b) => b.points - a.points),
    baseline: goalRows[0] ?? null,
  };
}

function bandOf(score: number, active: boolean): DayBand {
  if (!active) return 'off';
  if (score >= 0.95) return 'perfect';
  if (score >= 0.75) return 'strong';
  if (score >= 0.4) return 'active';
  if (score > 0) return 'weak';
  return 'missed';
}

/* ------------------------------------------------------------- materials */

export async function getMaterials(ctx: MemberContext) {
  const rows = await db
    .select({
      id: materials.id,
      title: materials.title,
      description: materials.description,
      type: materials.type,
      url: materials.url,
      topicKey: materials.topicKey,
      subjectName: subjects.name,
    })
    .from(materials)
    .leftJoin(subjects, eq(subjects.id, materials.subjectId))
    .where(eq(materials.cohortId, ctx.cohort.id))
    .orderBy(asc(subjects.name), asc(materials.topicKey), asc(materials.title));

  return rows;
}

/* --------------------------------------------------------------- check-in */

export type CheckInContext = {
  existing: {
    completion: 'completed' | 'partial' | 'none';
    actualMinutes: number;
    whatStudied: string;
    satisfaction: number;
  } | null;
  topicTitle: string | null;
  plannedMinutes: number;
  nextTopicTitle: string | null;
  comeback: { isComeback: boolean; missedDays: ISODate[] };
  sessionMinutes: number;
  isActiveDay: boolean;
};

export async function getCheckInContext(ctx: MemberContext): Promise<CheckInContext> {
  const { memberId, calendar, today } = ctx;

  const [existingRows, assignmentRows, nextAssignmentRows, sessionRows, activity] =
    await Promise.all([
      db
        .select()
        .from(checkIns)
        .where(and(eq(checkIns.memberId, memberId), eq(checkIns.date, today)))
        .limit(1),
      db
        .select({
          plannedMinutes: dailyAssignments.plannedMinutes,
          topicTitle: roadmapTopics.title,
        })
        .from(dailyAssignments)
        .leftJoin(roadmapTopics, eq(roadmapTopics.id, dailyAssignments.topicId))
        .where(and(eq(dailyAssignments.memberId, memberId), eq(dailyAssignments.date, today)))
        .limit(1),
      db
        .select({ topicTitle: roadmapTopics.title })
        .from(dailyAssignments)
        .leftJoin(roadmapTopics, eq(roadmapTopics.id, dailyAssignments.topicId))
        .where(
          and(
            eq(dailyAssignments.memberId, memberId),
            gte(dailyAssignments.date, addDays(today, 1)),
          ),
        )
        .orderBy(asc(dailyAssignments.date))
        .limit(1),
      db
        .select({ elapsedSeconds: studySessions.elapsedSeconds })
        .from(studySessions)
        .where(and(eq(studySessions.memberId, memberId), eq(studySessions.date, today))),
      loadActivity(memberId, calendar.startDate, minDate(today, calendar.endDate)),
    ]);

  const comeback = calculateComebackState(calendar, activity.showedUp, today);
  const existing = existingRows[0];

  return {
    existing: existing
      ? {
          completion: existing.completion,
          actualMinutes: existing.actualMinutes,
          whatStudied: existing.whatStudied,
          satisfaction: existing.satisfaction,
        }
      : null,
    topicTitle: assignmentRows[0]?.topicTitle ?? null,
    plannedMinutes: assignmentRows[0]?.plannedMinutes ?? 90,
    nextTopicTitle: nextAssignmentRows[0]?.topicTitle ?? null,
    comeback: { isComeback: comeback.isComeback, missedDays: comeback.missedDays },
    sessionMinutes: Math.round(sessionRows.reduce((s, r) => s + r.elapsedSeconds, 0) / 60),
    isActiveDay: isActiveStudyDay(calendar, today),
  };
}

/* ---------------------------------------------------------------- quizzes */

export async function getQuizForTopic(topicTitle: string | null) {
  if (!topicTitle) return null;
  const rows = await db.select().from(quizzes).where(eq(quizzes.topicKey, topicTitle)).limit(1);
  const quiz = rows[0];
  if (!quiz) return null;

  const questions = await db
    .select({
      id: quizQuestions.id,
      prompt: quizQuestions.prompt,
      options: quizQuestions.options,
    })
    .from(quizQuestions)
    .where(eq(quizQuestions.quizId, quiz.id))
    .orderBy(asc(quizQuestions.id));

  return { id: quiz.id, title: quiz.title, questions };
}

export async function getAvailableQuizzes(ctx: MemberContext) {
  const topicTitles = await db
    .select({ title: roadmapTopics.title, status: roadmapTopics.status })
    .from(roadmapTopics)
    .innerJoin(roadmaps, eq(roadmaps.id, roadmapTopics.roadmapId))
    .where(eq(roadmaps.memberId, ctx.memberId));

  const titles = topicTitles.map((t) => t.title);
  if (titles.length === 0) return [];

  /*
   * The question count is a grouped join rather than a correlated subquery.
   *
   * The subquery this replaces aliased `quiz_questions` inside its own scope while
   * correlating on the outer `quizzes.id`, and returned zero for every row — so the
   * materials screen advertised every knowledge check as "0 questions" while the quiz
   * itself happily rendered five. A left join and a group-by cannot go wrong in that way.
   */
  const [quizRows, countRows, attemptRows] = await Promise.all([
    db
      .select({ id: quizzes.id, title: quizzes.title, topicKey: quizzes.topicKey })
      .from(quizzes)
      .where(inArray(quizzes.topicKey, titles)),
    db
      .select({ quizId: quizQuestions.quizId, n: sql<number>`count(*)::int` })
      .from(quizQuestions)
      .groupBy(quizQuestions.quizId),
    db
      .select({ quizId: quizAttempts.quizId, score: quizAttempts.score, total: quizAttempts.total })
      .from(quizAttempts)
      .where(eq(quizAttempts.memberId, ctx.memberId)),
  ]);

  const countBy = new Map(countRows.map((r) => [r.quizId, r.n]));

  const bestBy = new Map<string, { score: number; total: number }>();
  for (const a of attemptRows) {
    const prev = bestBy.get(a.quizId);
    if (!prev || a.score > prev.score) bestBy.set(a.quizId, { score: a.score, total: a.total });
  }

  return quizRows.map((q) => ({
    ...q,
    questionCount: countBy.get(q.id) ?? 0,
    best: bestBy.get(q.id) ?? null,
  }));
}

/* --------------------------------------------------------- weekly review */

export async function getWeeklyReviewContext(ctx: MemberContext) {
  const { memberId, calendar, today } = ctx;
  const upTo = minDate(today, calendar.endDate);
  const thisWeek = weekStart(today);
  const lastWeek = addDays(thisWeek, -7);

  const [activity, existingRows] = await Promise.all([
    loadActivity(memberId, calendar.startDate, upTo),
    db
      .select({ weekStart: weeklyReviews.weekStart })
      .from(weeklyReviews)
      .where(eq(weeklyReviews.memberId, memberId)),
  ]);

  const current = calculateConsistency(calendar, activity.lookup, thisWeek, upTo);
  const previous = calculateConsistency(calendar, activity.lookup, lastWeek, addDays(lastWeek, 6));
  const submitted = new Set(existingRows.map((r) => r.weekStart));

  const attendanceCount = await db
    .select({
      present: sql<number>`count(*) FILTER (WHERE ${attendance.status} <> 'absent')::int`,
    })
    .from(attendance)
    .where(
      and(
        eq(attendance.memberId, memberId),
        gte(attendance.date, thisWeek),
        lte(attendance.date, upTo),
      ),
    );

  const topicsThisWeek = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(roadmapTopics)
    .innerJoin(roadmaps, eq(roadmaps.id, roadmapTopics.roadmapId))
    .where(
      and(
        eq(roadmaps.memberId, memberId),
        eq(roadmapTopics.status, 'completed'),
        gte(roadmapTopics.completedAt, new Date(`${thisWeek}T00:00:00Z`)),
      ),
    );

  return {
    weekStart: thisWeek,
    alreadySubmitted: submitted.has(thisWeek),
    current,
    previous,
    deltaPct: current.consistencyPct - previous.consistencyPct,
    streak: calculateCurrentStreak(calendar, activity.showedUp, today).length,
    attendancePresent: attendanceCount[0]?.present ?? 0,
    topicsCompleted: topicsThisWeek[0]?.n ?? 0,
  };
}

/* ------------------------------------------------------------- cohort feed */

export async function getCohortPulse(ctx: Pick<MemberContext, 'cohort' | 'calendar' | 'today'>) {
  const { cohort, calendar, today } = ctx;
  const upTo = minDate(today, calendar.endDate);

  const memberRows = await db
    .select({ id: cohortMembers.id })
    .from(cohortMembers)
    .where(and(eq(cohortMembers.cohortId, cohort.id), eq(cohortMembers.status, 'active')));

  const memberIds = memberRows.map((m) => m.id);
  if (memberIds.length === 0) {
    return {
      size: 0,
      showedUpToday: 0,
      weeklyConsistency: 0,
      totalStudyMinutes: 0,
      cohortStreak: 0,
      thresholdPct: cohort.streakThresholdPct,
    };
  }

  const rows = await db
    .select({
      date: dailyActivity.date,
      showedUp: sql<number>`count(*) FILTER (WHERE ${dailyActivity.showedUp})::int`,
      avgScore: sql<number>`coalesce(round(avg(${dailyActivity.scorePct})), 0)::int`,
      minutes: sql<number>`coalesce(sum(${dailyActivity.studyMinutes}), 0)::int`,
    })
    .from(dailyActivity)
    .where(
      and(
        inArray(dailyActivity.memberId, memberIds),
        gte(dailyActivity.date, calendar.startDate),
        lte(dailyActivity.date, upTo),
        eq(dailyActivity.isActiveDay, true),
      ),
    )
    .groupBy(dailyActivity.date);

  const byDate = new Map(rows.map((r) => [r.date, r]));
  const total = memberIds.length;

  const { calculateCohortStreak } = await import('@/lib/domain/streak');
  const cohortStreak = calculateCohortStreak(
    calendar,
    (d) => ({ showedUp: byDate.get(d)?.showedUp ?? 0, total }),
    cohort.streakThresholdPct,
    today,
  );

  const weekDays = activeStudyDaysBetween(calendar, weekStart(today), upTo);
  const weekScores = weekDays.map((d) => byDate.get(d)?.avgScore ?? 0);

  return {
    size: total,
    showedUpToday: byDate.get(today)?.showedUp ?? 0,
    weeklyConsistency:
      weekScores.length === 0
        ? 0
        : Math.round(weekScores.reduce((a, b) => a + b, 0) / weekScores.length),
    totalStudyMinutes: rows.reduce((s, r) => s + r.minutes, 0),
    cohortStreak: cohortStreak.length,
    thresholdPct: cohort.streakThresholdPct,
  };
}

/* ------------------------------------------------------------- point log */

export async function getPointsLog(memberId: string, limit = 40) {
  return db
    .select({
      id: pointsLedger.id,
      event: pointsLedger.event,
      points: pointsLedger.points,
      occurredOn: pointsLedger.occurredOn,
      reason: pointsLedger.reason,
      createdAt: pointsLedger.createdAt,
    })
    .from(pointsLedger)
    .where(eq(pointsLedger.memberId, memberId))
    .orderBy(desc(pointsLedger.occurredOn), desc(pointsLedger.createdAt))
    .limit(limit);
}

export const BEHAVIOUR_EVENT_LIST = BEHAVIOUR_EVENTS;
