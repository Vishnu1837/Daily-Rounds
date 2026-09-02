import 'server-only';

import {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  like,
  lte,
  ne,
  or,
  sql,
} from 'drizzle-orm';
import { cacheLife, cacheTag } from 'next/cache';
import { cache } from 'react';

import { db } from '@/db/client';
import type { AttendanceStatus, DayBand, PointEvent } from '@/db/schema';
import {
  announcementReads,
  announcements,
  attendance,
  checkIns,
  cohortMembers,
  cohorts,
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
  studyRoomPresence,
  studySessions,
  subjects,
  users,
  weeklyReviews,
} from '@/db/schema';
import { ancestorRefs, bestRefMatch, isSameBranch, resolveRef } from '@/lib/curriculum';
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
  timeInTimezone,
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
import { PRESENCE_STALE_SECONDS, parseHm, roomTitle } from '@/lib/domain/study-room';
import {
  calculateBestStreak,
  calculateCohortStreak,
  calculateCurrentStreak,
  calculateComebackState,
  nextMilestone,
} from '@/lib/domain/streak';
import { formatTimeInZone, timezoneLabel } from '@/lib/timezones';
import { cohortTag } from '@/server/cache';
import { type MemberContext, loadCalendar } from '@/server/context';
import { readActivity, readTotalPoints } from '@/server/scoring';

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
    /** Where the topic sits in the curriculum; drives the matching knowledge check. */
    topicRef: string | null;
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
    /** What to call it: the cohort's own name, else one derived from the hour it runs at. */
    title: string;
    /** The window in COHORT time — what every attendance decision is made against. */
    startTime: string;
    endTime: string;
    /** The same window as the student's own timezone renders it. What the card prints. */
    displayStartTime: string;
    displayEndTime: string;
    /** Set only when the two zones differ, so the card can say whose clock it is showing. */
    zoneNote: string | null;
    attended: AttendanceStatus | null;
    /** Cohort wall clock in minutes since midnight, so the card's countdown is not the browser's. */
    nowMinutes: number;
    /** Whether this student is on the live roster right now. */
    joined: boolean;
    /** Everyone in the room, freshest heartbeat window only. */
    occupants: { memberId: string; name: string; avatarUrl: string | null }[];
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
    /** In the student's timezone, like every other time on this screen. */
    startTime: string;
    meetUrl: string | null;
  }[];
  announcement: { id: string; title: string; body: string } | null;
  unseenAchievements: { code: string; name: string; description: string; emoji: string }[];
};

export async function getHomeData(ctx: MemberContext): Promise<HomeData> {
  const { memberId, calendar, today, rules, cohort, user } = ctx;
  const upTo = minDate(today, calendar.endDate);

  /*
   * Session times are stored as a wall clock against the *cohort's* zone, so a student in
   * another country was being shown a time that was never theirs — the profile timezone
   * picker changed nothing on the screen. Every clock time this page prints is translated
   * once, here, and the untranslated cohort window travels alongside it because that is
   * still what attendance is judged against.
   */
  const viewerZone = user.timezone || cohort.timezone;
  const roomWindow = {
    startTime: formatTimeInZone(cohort.meetStartTime, today, cohort.timezone, viewerZone),
    endTime: formatTimeInZone(cohort.meetEndTime, today, cohort.timezone, viewerZone),
    zoneNote:
      viewerZone === cohort.timezone
        ? null
        : `${timezoneLabel(viewerZone)} · ${cohort.meetStartTime}–${cohort.meetEndTime} cohort time`,
  };

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
    presenceRows,
    standing,
  ] = await Promise.all([
    readActivity(memberId, calendar.startDate, upTo),
    db
      .select({
        plannedMinutes: dailyAssignments.plannedMinutes,
        note: dailyAssignments.note,
        topicId: roadmapTopics.id,
        /*
         * An admin may set the day's topic from anywhere in the syllabus, including a
         * subject this student has no roadmap for — that one has no `roadmap_topics` row to
         * join to and is recorded on the assignment itself. The roadmap topic wins whenever
         * there is one.
         */
        topicTitle: sql<
          string | null
        >`coalesce(${roadmapTopics.title}, ${dailyAssignments.customTopicTitle})`,
        topicRef: sql<
          string | null
        >`coalesce(${roadmapTopics.curriculumRef}, ${dailyAssignments.customTopicRef})`,
        subjectName: sql<
          string | null
        >`coalesce(${subjects.name}, ${dailyAssignments.customSubjectName})`,
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
    readTotalPoints(memberId),
    db
      .select({
        memberId: studyRoomPresence.memberId,
        name: users.fullName,
        avatarUrl: users.avatarUrl,
      })
      .from(studyRoomPresence)
      .innerJoin(cohortMembers, eq(cohortMembers.id, studyRoomPresence.memberId))
      .innerJoin(users, eq(users.id, cohortMembers.userId))
      .where(
        and(
          eq(cohortMembers.cohortId, cohort.id),
          eq(studyRoomPresence.date, today),
          isNull(studyRoomPresence.leftAt),
          gt(studyRoomPresence.lastSeenAt, new Date(Date.now() - PRESENCE_STALE_SECONDS * 1000)),
        ),
      )
      .orderBy(asc(studyRoomPresence.joinedAt)),
    /*
     * The student's rank needs the whole cohort's activity, so it is by far the most
     * expensive thing on this page. It depends on nothing else here, which is the only
     * reason it belongs *inside* this batch: awaited afterwards it added two more serial
     * round trips to every dashboard render.
     */
    getRankFor(ctx),
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
  const { rank, cohortSize } = standing;

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
          topicRef: assignment.topicRef,
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
      /*
       * Named after the start time *the student sees*, not the cohort's. A 06:00 Delhi room
       * is an evening room in Toronto, and a card that says "Morning Study Room · 20:30" is
       * wrong in the only way that matters.
       */
      title: roomTitle(roomWindow.startTime, cohort.meetTitle),
      startTime: cohort.meetStartTime,
      endTime: cohort.meetEndTime,
      displayStartTime: roomWindow.startTime,
      displayEndTime: roomWindow.endTime,
      zoneNote: roomWindow.zoneNote,
      attended: attendedStatus,
      nowMinutes: parseHm(timeInTimezone(cohort.timezone)) ?? 0,
      joined: presenceRows.some((row) => row.memberId === memberId),
      occupants: presenceRows,
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
    upcoming: upcomingRows.map((e) => ({
      ...e,
      startTime: formatTimeInZone(e.startTime, e.date, cohort.timezone, viewerZone),
    })),
    announcement: announcementRows[0] ?? null,
    unseenAchievements: unseenRows
      .map((r) => ACHIEVEMENTS_BY_CODE.get(r.code))
      .filter((a): a is NonNullable<typeof a> => Boolean(a))
      .map((a) => ({ code: a.code, name: a.name, description: a.description, emoji: a.emoji })),
  };
}

/* --------------------------------------------------------------- study */

export type StudySnapshot = {
  assignment: HomeData['assignment'];
  session: HomeData['session'];
  blockDone: boolean;
  targetDone: boolean;
  checkedIn: boolean;
};

/**
 * Just enough to open the study timer.
 *
 * The study screen used to read the whole of `getHomeData`, which meant every visit to it
 * built the cohort leaderboard, the announcement feed, the events list and the study-room
 * roster in order to answer four questions about one student. This asks only those four.
 */
export async function getStudySnapshot(ctx: MemberContext): Promise<StudySnapshot> {
  const { memberId, today } = ctx;

  const [assignmentRows, sessionRows, ledgerRows, checkInRows] = await Promise.all([
    db
      .select({
        plannedMinutes: dailyAssignments.plannedMinutes,
        note: dailyAssignments.note,
        topicId: roadmapTopics.id,
        /*
         * An admin may set the day's topic from anywhere in the syllabus, including a
         * subject this student has no roadmap for — that one has no `roadmap_topics` row to
         * join to and is recorded on the assignment itself. The roadmap topic wins whenever
         * there is one.
         */
        topicTitle: sql<
          string | null
        >`coalesce(${roadmapTopics.title}, ${dailyAssignments.customTopicTitle})`,
        topicRef: sql<
          string | null
        >`coalesce(${roadmapTopics.curriculumRef}, ${dailyAssignments.customTopicRef})`,
        subjectName: sql<
          string | null
        >`coalesce(${subjects.name}, ${dailyAssignments.customSubjectName})`,
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
      .select({ event: pointsLedger.event })
      .from(pointsLedger)
      .where(and(eq(pointsLedger.memberId, memberId), eq(pointsLedger.occurredOn, today))),
    db
      .select({ id: checkIns.id })
      .from(checkIns)
      .where(and(eq(checkIns.memberId, memberId), eq(checkIns.date, today)))
      .limit(1),
  ]);

  const assignment = assignmentRows[0] ?? null;
  const session = sessionRows[0] ?? null;
  const events = new Set(ledgerRows.map((r) => r.event));

  return {
    assignment: assignment
      ? {
          topicTitle: assignment.topicTitle,
          topicId: assignment.topicId,
          topicRef: assignment.topicRef,
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
    blockDone: events.has('study_block_completed'),
    targetDone: events.has('daily_target_completed'),
    checkedIn: checkInRows.length > 0,
  };
}

/* ----------------------------------------------------------- leaderboard */

export type LeaderboardRow = {
  memberId: string;
  userId: string;
  name: string;
  avatarUrl: string | null;
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

/** The ranking as the cohort sees it, before anyone's own row is picked out of it. */
type CohortStandings = {
  rows: Omit<LeaderboardRow, 'isSelf'>[];
  /** Recognition winners as member ids, resolved back to rows once `isSelf` is known. */
  recognitions: Record<keyof Recognitions, string | null>;
};

/**
 * Builds the full cohort leaderboard in a handful of queries rather than per-student.
 * Ranking is by consistency first — process over result — with points as the tiebreak.
 *
 * Cached for the whole cohort, because it is the same work for all of them. Every student
 * loading the dashboard needs their rank, and computing a rank means ranking everybody — so
 * a cohort of thirty opening the app in the same hour used to run this thirty times over
 * identical rows. Keyed by cohort and by day, so it rolls over on its own at midnight in the
 * cohort's timezone, and cleared the moment anybody's numbers actually move.
 *
 * `isSelf` is deliberately absent from what is cached. It is the one field that differs per
 * viewer, and leaving it in would have given every student their own copy of the cache entry
 * — the same thirty renders, just harder to see.
 */
const loadCohortStandings = async (cohortId: string, today: ISODate): Promise<CohortStandings> => {
  'use cache';
  cacheTag(cohortTag.activity(cohortId), cohortTag.config(cohortId));
  /*
   * Short by the standards of a cache, and that is the point: this is a backstop, not the
   * mechanism. Another student's check-in clears the tag immediately, so the only window
   * this covers is a write that somehow bypassed `recomputeDay`. A minute of drift on
   * someone else's position in a ranking is a fair price for that insurance; a stale view
   * of your *own* numbers would not be, and the tag is what prevents it.
   */
  cacheLife({ stale: 60, revalidate: 60, expire: 300 });

  const cohortRows = await db.select().from(cohorts).where(eq(cohorts.id, cohortId)).limit(1);
  const cohort = cohortRows[0];
  if (!cohort) return { rows: [], recognitions: EMPTY_RECOGNITIONS };
  const calendar = await loadCalendar(cohort);
  const upTo = minDate(today, calendar.endDate);

  /*
   * The roster as a subquery, so the four reads below all start in the same tick.
   *
   * Fetching the member ids first and threading them through as `IN (...)` lists made this
   * two serial waves — and this function is the single most expensive thing the dashboard
   * does, because the student's rank needs the whole cohort. One wave instead of two takes
   * a round trip off both the leaderboard and the dashboard.
   */
  const activeMembers = db
    .select({ id: cohortMembers.id })
    .from(cohortMembers)
    .where(and(eq(cohortMembers.cohortId, cohort.id), eq(cohortMembers.status, 'active')));

  const [members, activityRows, pointRows, comebackRows] = await Promise.all([
    db
      .select({
        memberId: cohortMembers.id,
        userId: users.id,
        name: users.fullName,
        avatarUrl: users.avatarUrl,
        mbbsYear: users.mbbsYear,
      })
      .from(cohortMembers)
      .innerJoin(users, eq(users.id, cohortMembers.userId))
      .where(and(eq(cohortMembers.cohortId, cohort.id), eq(cohortMembers.status, 'active'))),
    db
      .select()
      .from(dailyActivity)
      .where(
        and(
          inArray(dailyActivity.memberId, activeMembers),
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
      .where(inArray(pointsLedger.memberId, activeMembers))
      .groupBy(pointsLedger.memberId),
    db
      .select({
        memberId: checkIns.memberId,
        n: sql<number>`count(*)::int`,
        latest: sql<string>`max(${checkIns.date})`,
      })
      .from(checkIns)
      .where(and(inArray(checkIns.memberId, activeMembers), eq(checkIns.isComeback, true)))
      .groupBy(checkIns.memberId),
  ]);

  if (members.length === 0) return { rows: [], recognitions: EMPTY_RECOGNITIONS };

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

  const rows: Omit<LeaderboardRow, 'isSelf'>[] = members.map((m) => {
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
      avatarUrl: m.avatarUrl,
      mbbsYear: m.mbbsYear,
      consistencyPct: overall.consistencyPct,
      showUpRatePct: overall.showUpRatePct,
      streak: calculateCurrentStreak(calendar, showedUp, today).length,
      bestStreak: calculateBestStreak(calendar, showedUp, upTo).length,
      points: pointsBy.get(m.memberId) ?? 0,
      improvementPct: calculateImprovement(weeks).deltaPct,
      perfectWeeks: weeks.filter((w) => w.activeDays > 0 && w.completedDays === w.activeDays)
        .length,
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
    candidates: Omit<LeaderboardRow, 'isSelf'>[],
    compare: (a: Omit<LeaderboardRow, 'isSelf'>, b: Omit<LeaderboardRow, 'isSelf'>) => number,
  ): Omit<LeaderboardRow, 'isSelf'> | null => {
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
    /*
     * Ids rather than rows. The winners are the very rows in the list above, and returning
     * them directly worked only for as long as this was a plain function call: a cache entry
     * is serialised, so the copy stored under `recognitions` would come back as a *different*
     * object from the one in `rows`. Marking the viewer's own row would then update one and
     * not the other, and the badge would quietly stop saying "You".
     */
    recognitions: {
      mostConsistent: mostConsistent?.memberId ?? null,
      longestStreak:
        award(
          rows.filter((r) => r.bestStreak > 0),
          (a, b) => b.bestStreak - a.bestStreak,
        )?.memberId ?? null,
      bestComeback:
        award(comebackCandidates, (a, a2) => {
          const latestA = comebacksBy.get(a.memberId)?.latest ?? '';
          const latestB = comebacksBy.get(a2.memberId)?.latest ?? '';
          return latestB.localeCompare(latestA) || a2.streak - a.streak;
        })?.memberId ?? null,
      mostImproved:
        award(
          rows.filter((r) => r.improvementPct > 0),
          (a, b) => b.improvementPct - a.improvementPct,
        )?.memberId ?? null,
      perfectWeek:
        award(
          rows.filter((r) => r.perfectWeeks > 0),
          (a, b) => b.perfectWeeks - a.perfectWeeks,
        )?.memberId ?? null,
    },
  };
};

const EMPTY_RECOGNITIONS: CohortStandings['recognitions'] = {
  mostConsistent: null,
  longestStreak: null,
  mostImproved: null,
  bestComeback: null,
  perfectWeek: null,
};

/**
 * The cohort ranking with the viewer's own row marked.
 *
 * The only per-student work left: one pass to set `isSelf`, and a lookup to point the
 * recognition badges back at the marked rows so "You" reads correctly on both.
 */
export const getLeaderboard = cache(async function getLeaderboard(
  ctx: Pick<MemberContext, 'cohort' | 'today'> & { memberId?: string },
): Promise<{ rows: LeaderboardRow[]; recognitions: Recognitions }> {
  const standings = await loadCohortStandings(ctx.cohort.id, ctx.today);

  const rows: LeaderboardRow[] = standings.rows.map((row) => ({
    ...row,
    isSelf: row.memberId === ctx.memberId,
  }));
  const byId = new Map(rows.map((row) => [row.memberId, row]));
  const resolve = (id: string | null) => (id === null ? null : (byId.get(id) ?? null));

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
});

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
  slot: 'primary' | 'secondary';
  subjectName: string;
  subjectSlug: string;
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
        slot: roadmaps.slot,
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
      .innerJoin(subjects, eq(subjects.id, roadmaps.subjectId))
      .leftJoin(roadmapTopics, eq(roadmapTopics.roadmapId, roadmaps.id))
      .leftJoin(roadmapWeeks, eq(roadmapWeeks.id, roadmapTopics.weekId))
      .where(eq(roadmaps.memberId, memberId))
      // Slot order, so the primary subject is always the first tab.
      .orderBy(asc(roadmaps.slot), asc(roadmapTopics.position)),
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
        slot: row.slot,
        subjectName: row.subjectName,
        subjectSlug: row.subjectSlug,
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
  const { memberId, calendar, today, cohort, user } = ctx;
  const viewerZone = user.timezone || cohort.timezone;
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
        topicTitle: sql<
          string | null
        >`coalesce(${roadmapTopics.title}, ${dailyAssignments.customTopicTitle})`,
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
        startTime: formatTimeInZone(e.startTime, e.date, cohort.timezone, viewerZone),
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
      readActivity(memberId, calendar.startDate, upTo),
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
      readTotalPoints(memberId),
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

/**
 * The cohort's materials shelf.
 *
 * The same list for everyone in the cohort, and it changes only when a cohort lead adds or
 * removes something — so it is cached on the library tag rather than the activity one. No
 * expiry worth worrying about: an edit clears it, and nothing else can change it.
 */
export async function getMaterials(ctx: MemberContext) {
  return loadMaterials(ctx.cohort.id);
}

const loadMaterials = async (cohortId: string) => {
  'use cache';
  cacheTag(cohortTag.library(cohortId));
  cacheLife('hours');

  const rows = await db
    .select({
      id: materials.id,
      title: materials.title,
      description: materials.description,
      type: materials.type,
      url: materials.url,
      curriculumRef: materials.curriculumRef,
      subjectName: subjects.name,
    })
    .from(materials)
    .leftJoin(subjects, eq(subjects.id, materials.subjectId))
    .where(eq(materials.cohortId, cohortId))
    .orderBy(asc(subjects.name), asc(materials.curriculumRef), asc(materials.title));

  // The heading a material groups under is resolved from its ref, so renaming a curriculum
  // section renames the group everywhere rather than leaving a stale typed-in string.
  return rows.map((row) => ({
    ...row,
    topicLabel: resolveRef(row.curriculumRef)?.label ?? null,
  }));
};

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
      readActivity(memberId, calendar.startDate, minDate(today, calendar.endDate)),
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

/**
 * The knowledge check for a roadmap topic, matched through the curriculum rather than by
 * title. The topic's own ref wins; failing that the nearest quiz above it in the tree, so a
 * quiz written for a whole section still reaches a student working through one node of it.
 */
export async function getQuizForTopic(topicRef: string | null) {
  if (!topicRef) return null;

  const candidates = await db
    .select({ id: quizzes.id, title: quizzes.title, curriculumRef: quizzes.curriculumRef })
    .from(quizzes)
    .where(
      or(
        inArray(quizzes.curriculumRef, ancestorRefs(topicRef)),
        like(quizzes.curriculumRef, `${topicRef}/%`),
      ),
    )
    // Two quizzes filed at the same place are equally good answers; ordering makes the
    // choice between them the same one on every request.
    .orderBy(asc(quizzes.id));

  const quiz = bestRefMatch(topicRef, candidates);
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
  /*
   * The question count is a grouped join rather than a correlated subquery.
   *
   * The subquery this replaces aliased `quiz_questions` inside its own scope while
   * correlating on the outer `quizzes.id`, and returned zero for every row — so the
   * materials screen advertised every knowledge check as "0 questions" while the quiz
   * itself happily rendered five. A left join and a group-by cannot go wrong in that way.
   */
  const [topicRefs, quizRows, countRows, attemptRows] = await Promise.all([
    /*
     * The student's own curriculum refs. Fetched alongside the catalogue rather than
     * before it: the filtering happens in memory afterwards either way, so making the
     * catalogue wait on this read only added a round trip.
     */
    db
      .select({ ref: roadmapTopics.curriculumRef })
      .from(roadmapTopics)
      .innerJoin(roadmaps, eq(roadmaps.id, roadmapTopics.roadmapId))
      .where(eq(roadmaps.memberId, ctx.memberId)),
    /*
     * Every filed quiz, filtered in memory rather than in SQL.
     *
     * Branch matching is "one ref contains the other, either way round", which against a
     * list of the student's refs would be a pile of OR'd LIKEs. The quiz catalogue is
     * cohort content in the hundreds, not per-student rows, so reading it whole and
     * filtering here is both cheaper to run and far easier to read.
     */
    db
      .select({ id: quizzes.id, title: quizzes.title, curriculumRef: quizzes.curriculumRef })
      .from(quizzes)
      .where(isNotNull(quizzes.curriculumRef)),
    db
      .select({ quizId: quizQuestions.quizId, n: sql<number>`count(*)::int` })
      .from(quizQuestions)
      .groupBy(quizQuestions.quizId),
    db
      .select({ quizId: quizAttempts.quizId, score: quizAttempts.score, total: quizAttempts.total })
      .from(quizAttempts)
      .where(eq(quizAttempts.memberId, ctx.memberId)),
  ]);

  const refs = [...new Set(topicRefs.map((t) => t.ref).filter((r): r is string => r !== null))];
  if (refs.length === 0) return [];

  const onMyRoadmap = quizRows.filter((q) =>
    refs.some((ref) => isSameBranch(q.curriculumRef!, ref)),
  );

  const countBy = new Map(countRows.map((r) => [r.quizId, r.n]));

  const bestBy = new Map<string, { score: number; total: number }>();
  for (const a of attemptRows) {
    const prev = bestBy.get(a.quizId);
    if (!prev || a.score > prev.score) bestBy.set(a.quizId, { score: a.score, total: a.total });
  }

  return onMyRoadmap.map((q) => ({
    id: q.id,
    title: q.title,
    topicLabel: resolveRef(q.curriculumRef)?.label ?? null,
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

  // One wave: none of these four reads depends on another's result.
  const [activity, existingRows, attendanceCount, topicsThisWeek] = await Promise.all([
    readActivity(memberId, calendar.startDate, upTo),
    db
      .select({ weekStart: weeklyReviews.weekStart })
      .from(weeklyReviews)
      .where(eq(weeklyReviews.memberId, memberId)),
    db
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
      ),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(roadmapTopics)
      .innerJoin(roadmaps, eq(roadmaps.id, roadmapTopics.roadmapId))
      .where(
        and(
          eq(roadmaps.memberId, memberId),
          eq(roadmapTopics.status, 'completed'),
          gte(roadmapTopics.completedAt, new Date(`${thisWeek}T00:00:00Z`)),
        ),
      ),
  ]);

  const current = calculateConsistency(calendar, activity.lookup, thisWeek, upTo);
  const previous = calculateConsistency(calendar, activity.lookup, lastWeek, addDays(lastWeek, 6));
  const submitted = new Set(existingRows.map((r) => r.weekStart));

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

/**
 * How the cohort as a whole is doing today.
 *
 * Cached alongside the leaderboard and for the same reason: there is one answer per cohort
 * per day, and the dashboard asks for it once per student. It shares the activity tag, so a
 * check-in that changes the turnout figure clears both in one call.
 */
const loadCohortPulse = async (cohortId: string, today: ISODate) => {
  'use cache';
  cacheTag(cohortTag.activity(cohortId), cohortTag.config(cohortId));
  cacheLife({ stale: 60, revalidate: 60, expire: 300 });

  const cohortRows = await db.select().from(cohorts).where(eq(cohorts.id, cohortId)).limit(1);
  const cohort = cohortRows[0];
  if (!cohort) {
    return {
      size: 0,
      showedUpToday: 0,
      weeklyConsistency: 0,
      totalStudyMinutes: 0,
      cohortStreak: 0,
      thresholdPct: 0,
    };
  }
  const calendar = await loadCalendar(cohort);
  const upTo = minDate(today, calendar.endDate);

  /*
   * The roster is a subquery rather than a separate round trip. Fetching the member ids
   * first only to send them straight back as an `IN (...)` list cost a full extra
   * round trip on both the dashboard and the leaderboard, for a list the database already
   * has in front of it.
   */
  const activeMembers = db
    .select({ id: cohortMembers.id })
    .from(cohortMembers)
    .where(and(eq(cohortMembers.cohortId, cohort.id), eq(cohortMembers.status, 'active')));

  const [sizeRows, rows] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(cohortMembers)
      .where(and(eq(cohortMembers.cohortId, cohort.id), eq(cohortMembers.status, 'active'))),
    db
      .select({
        date: dailyActivity.date,
        showedUp: sql<number>`count(*) FILTER (WHERE ${dailyActivity.showedUp})::int`,
        avgScore: sql<number>`coalesce(round(avg(${dailyActivity.scorePct})), 0)::int`,
        minutes: sql<number>`coalesce(sum(${dailyActivity.studyMinutes}), 0)::int`,
      })
      .from(dailyActivity)
      .where(
        and(
          inArray(dailyActivity.memberId, activeMembers),
          gte(dailyActivity.date, calendar.startDate),
          lte(dailyActivity.date, upTo),
          eq(dailyActivity.isActiveDay, true),
        ),
      )
      .groupBy(dailyActivity.date),
  ]);

  const total = sizeRows[0]?.n ?? 0;
  if (total === 0) {
    return {
      size: 0,
      showedUpToday: 0,
      weeklyConsistency: 0,
      totalStudyMinutes: 0,
      cohortStreak: 0,
      thresholdPct: cohort.streakThresholdPct,
    };
  }

  const byDate = new Map(rows.map((r) => [r.date, r]));

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
};

export const getCohortPulse = cache(async function getCohortPulse(
  ctx: Pick<MemberContext, 'cohort' | 'today'>,
) {
  return loadCohortPulse(ctx.cohort.id, ctx.today);
});

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

/* ---------------------------------------------------------- announcements */

export type PopupAnnouncement = {
  id: string;
  title: string;
  body: string;
  createdAt: Date;
};

/**
 * Announcements that should interrupt the student on entry.
 *
 * "Unread" is a real per-student fact in `announcement_reads`, not a client-side flag, so a
 * student who acknowledges on their phone is not shown the same modal again on a laptop.
 * A persistent announcement ignores that and always returns, which is what makes it
 * persistent — reserved for the rare notice that must be seen every time.
 *
 * Ordered oldest-first: if two are waiting, the student reads them in the order they were
 * written rather than backwards.
 */
export async function getPopupAnnouncements(ctx: MemberContext): Promise<PopupAnnouncement[]> {
  return db
    .select({
      id: announcements.id,
      title: announcements.title,
      body: announcements.body,
      createdAt: announcements.createdAt,
    })
    .from(announcements)
    .leftJoin(
      announcementReads,
      and(
        eq(announcementReads.announcementId, announcements.id),
        eq(announcementReads.memberId, ctx.memberId),
      ),
    )
    .where(
      and(
        eq(announcements.cohortId, ctx.cohort.id),
        eq(announcements.isPopup, true),
        // Persistent notices reappear regardless of acknowledgement.
        or(eq(announcements.isPersistent, true), isNull(announcementReads.announcementId)),
      ),
    )
    .orderBy(asc(announcements.createdAt))
    .limit(3);
}
