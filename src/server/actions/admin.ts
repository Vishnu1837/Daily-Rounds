'use server';

import { randomUUID } from 'node:crypto';

import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { db } from '@/db/client';
import {
  invalidateCohortActivity,
  invalidateCohortConfig,
  invalidateCohortLibrary,
} from '@/server/cache';
import {
  announcements,
  attendance,
  checkIns,
  cohortExtraStudyDays,
  cohortHolidays,
  cohortMembers,
  cohorts,
  dailyActivity,
  dailyAssignments,
  events,
  materials,
  pointRules,
  pointsLedger,
  quizAttempts,
  roadmapTopics,
  roadmapWeeks,
  roadmaps,
  type RoadmapSlot,
  studentAchievements,
  studentGoals,
  studySessions,
  subjects,
  users,
  weeklyReviews,
} from '@/db/schema';
import { requireAdminAction } from '@/lib/auth/guards';
import { curriculumSubject, resolveRef } from '@/lib/curriculum';
import { hashPassword } from '@/lib/auth/password';
import { ledgerKey } from '@/lib/domain/points';
import {
  announcementSchema,
  assignmentSchema,
  attendanceMarkSchema,
  bulkAssignmentSchema,
  cohortSettingsSchema,
  createStudentSchema,
  eventSchema,
  fieldErrors,
  holidaySchema,
  individualAssignmentSchema,
  materialSchema,
  pointAdjustmentSchema,
  pointRuleSchema,
  roadmapSchema,
  roadmapWeekSchema,
  studentAdminSchema,
  syllabusAssignmentSchema,
  topicReorderSchema,
  topicSchema,
  topicUpdateSchema,
} from '@/lib/validation';
import { getCohortContext } from '@/server/context';
import { awardPoints, recomputeRange, revokeAward, settleDay } from '@/server/scoring';

import {
  deleteRoadmap,
  ensureRoadmaps,
  nextTopicForRoadmap,
  replaceActiveSubject,
  resetRoadmapProgress,
  syncGoalSubjects,
  syncRoadmapCompletion,
} from '../roadmap';

import { type Result, fail, guarded, ok, recordAudit } from './shared';

/** Loads the cohort context, asserting the caller is an admin. */
async function adminContext(cohortId: string) {
  const user = await requireAdminAction();
  const ctx = await getCohortContext(cohortId);
  if (!ctx) throw new Error('That cohort could not be found.');
  return { user, ctx };
}

/** Confirms a member really belongs to the cohort the admin is acting on. */
async function assertMemberInCohort(memberId: string, cohortId: string): Promise<void> {
  const rows = await db
    .select({ id: cohortMembers.id })
    .from(cohortMembers)
    .where(and(eq(cohortMembers.id, memberId), eq(cohortMembers.cohortId, cohortId)))
    .limit(1);
  if (rows.length === 0) throw new Error('That student is not in this cohort.');
}

/**
 * Clears any ad-hoc syllabus topic left on a day's assignment.
 *
 * Every write that sets `topic_id` must also blank these, or a row that once carried a
 * topic from outside the student's roadmaps would keep showing the old title alongside the
 * new one. Spelled out once and spread into each upsert rather than trusted to memory.
 */
const NO_CUSTOM_TOPIC = {
  customTopicTitle: null,
  customTopicRef: null,
  customSubjectName: null,
} as const;

/* ------------------------------------------------------------- attendance */

export async function markAttendanceAction(
  cohortId: string,
  input: { date: string; entries: { memberId: string; status: 'present' | 'late' | 'absent' }[] },
): Promise<Result<{ marked: number }>> {
  return guarded(async () => {
    const { user, ctx } = await adminContext(cohortId);
    const parsed = attendanceMarkSchema.safeParse(input);
    if (!parsed.success)
      return fail('That attendance data was not valid.', fieldErrors(parsed.error));

    const { date, entries } = parsed.data;

    // Every member must belong to this cohort — never trust the ids from the client.
    const valid = await db
      .select({ id: cohortMembers.id })
      .from(cohortMembers)
      .where(
        and(
          eq(cohortMembers.cohortId, cohortId),
          inArray(
            cohortMembers.id,
            entries.map((e) => e.memberId),
          ),
        ),
      );
    const allowed = new Set(valid.map((v) => v.id));
    const accepted = entries.filter((e) => allowed.has(e.memberId));
    if (accepted.length === 0) return fail('None of those students are in this cohort.');

    const markedAt = new Date();

    /*
     * One statement for the whole sheet.
     *
     * This used to be an upsert per student inside the loop below, which for a 27-person
     * cohort meant 27 sequential round trips before any of the scoring work even started.
     * Against a pooled hosted database that was most of the wall-clock time the admin spent
     * watching a spinner — the "attendance save stuck on loading" report in the brief.
     */
    await db
      .insert(attendance)
      .values(
        accepted.map((entry) => ({
          memberId: entry.memberId,
          date,
          status: entry.status,
          markedBy: user.id,
          markedAt,
        })),
      )
      .onConflictDoUpdate({
        target: [attendance.memberId, attendance.date],
        set: {
          status: sql`excluded.status`,
          markedBy: sql`excluded.marked_by`,
          markedAt: sql`excluded.marked_at`,
        },
      });

    // Withdraw every previous attendance award in one delete, for the same reason.
    const keys = accepted.map((entry) => ledgerKey.attendance(entry.memberId, date));
    await db.delete(pointsLedger).where(inArray(pointsLedger.idempotencyKey, keys));

    /*
     * Scoring stays per-student because `settleDay` reads and rewrites that student's whole
     * activity history. It is run in bounded batches rather than one at a time: independent
     * per member, so there is no ordering requirement, and capped so a large cohort cannot
     * open an unbounded number of connections against the pool.
     */
    const BATCH = 6;
    for (let i = 0; i < accepted.length; i += BATCH) {
      await Promise.all(
        accepted.slice(i, i + BATCH).map(async (entry) => {
          if (entry.status !== 'absent') {
            const event = entry.status === 'present' ? 'live_session_present' : 'live_session_late';
            await awardPoints({
              memberId: entry.memberId,
              event,
              points: ctx.rules[event],
              occurredOn: date,
              idempotencyKey: ledgerKey.attendance(entry.memberId, date),
              reason: entry.status === 'present' ? 'Attended the study room' : 'Joined late',
              createdBy: user.id,
            });
          }

          await settleDay({
            memberId: entry.memberId,
            cohortId,
            date,
            calendar: ctx.calendar,
            rules: ctx.rules,
          });
        }),
      );
    }

    await recordAudit({
      actorUserId: user.id,
      action: 'attendance.mark',
      entity: 'attendance',
      entityId: date,
      payload: { count: accepted.length, date },
    });

    revalidatePath('/admin');
    revalidatePath('/admin/attendance');
    return ok({ marked: accepted.length });
  }, 'We could not save attendance. Nothing has been changed — please try again.');
}

/* ------------------------------------------------------- cohort settings */

export async function updateCohortSettingsAction(
  _prev: unknown,
  formData: FormData,
): Promise<Result> {
  return guarded(async () => {
    const user = await requireAdminAction();

    const raw = Object.fromEntries(formData);
    const parsed = cohortSettingsSchema.safeParse({
      ...raw,
      activeWeekdays: formData.getAll('activeWeekdays'),
    });
    if (!parsed.success) return fail('Check the highlighted fields.', fieldErrors(parsed.error));

    const input = parsed.data;
    await db
      .update(cohorts)
      .set({
        name: input.name,
        timezone: input.timezone,
        startDate: input.startDate,
        endDate: input.endDate,
        activeWeekdays: input.activeWeekdays,
        streakThresholdPct: input.streakThresholdPct,
        meetUrl: input.meetUrl ?? null,
        meetTitle: input.meetTitle ?? null,
        meetStartTime: input.meetStartTime,
        meetEndTime: input.meetEndTime,
        settings: {
          atRiskMissedDays: input.atRiskMissedDays,
          interventionMissedDays: input.interventionMissedDays,
          atRiskConsistencyDropPct: input.atRiskConsistencyDropPct,
          minConsistencyPct: input.minConsistencyPct,
        },
      })
      .where(eq(cohorts.id, input.cohortId));

    await recordAudit({
      actorUserId: user.id,
      action: 'cohort.update',
      entity: 'cohort',
      entityId: input.cohortId,
      payload: { name: input.name },
    });

    invalidateCohortConfig(input.cohortId);
    revalidatePath('/admin/settings');
    revalidatePath('/admin');
    revalidatePath('/today');
    return ok();
  }, 'We could not save the cohort settings. Please try again.');
}

export async function updatePointRulesAction(
  cohortId: string,
  rules: Record<string, number>,
): Promise<Result> {
  return guarded(async () => {
    const user = await requireAdminAction();
    const parsed = pointRuleSchema.safeParse({ cohortId, rules });
    if (!parsed.success) return fail('Those point values were not valid.');

    for (const [event, points] of Object.entries(parsed.data.rules)) {
      await db
        .insert(pointRules)
        .values({ cohortId, event: event as never, points })
        .onConflictDoUpdate({
          target: [pointRules.cohortId, pointRules.event],
          set: { points },
        });
    }

    await recordAudit({
      actorUserId: user.id,
      action: 'cohort.point_rules',
      entity: 'cohort',
      entityId: cohortId,
      payload: parsed.data.rules,
    });

    invalidateCohortConfig(cohortId);
    revalidatePath('/admin/settings');
    return ok();
  }, 'We could not save the scoring rules. Please try again.');
}

export async function addCalendarDayAction(_prev: unknown, formData: FormData): Promise<Result> {
  return guarded(async () => {
    const user = await requireAdminAction();
    const parsed = holidaySchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fail('Check the date and label.', fieldErrors(parsed.error));

    const { cohortId, date, label, kind } = parsed.data;
    const table = kind === 'holiday' ? cohortHolidays : cohortExtraStudyDays;

    await db.insert(table).values({ cohortId, date, label }).onConflictDoNothing();

    await recordAudit({
      actorUserId: user.id,
      action: `cohort.${kind}.add`,
      entity: 'cohort',
      entityId: cohortId,
      payload: { date, label },
    });

    /*
     * Before the recompute, not after. `recomputeCohort` reads the calendar back to work
     * out which days were active, so clearing the cached calendar afterwards would have it
     * rebuild every streak in the cohort from the very holiday list this action just
     * replaced. The ordering is the correctness here, not the invalidation itself.
     */
    invalidateCohortConfig(cohortId);
    await recomputeCohort(cohortId);
    revalidatePath('/admin/settings');
    return ok();
  }, 'We could not add that day. Please try again.');
}

export async function removeCalendarDayAction(
  cohortId: string,
  id: string,
  kind: 'holiday' | 'extra_study_day',
): Promise<Result> {
  return guarded(async () => {
    const user = await requireAdminAction();
    const table = kind === 'holiday' ? cohortHolidays : cohortExtraStudyDays;
    await db.delete(table).where(and(eq(table.id, id), eq(table.cohortId, cohortId)));

    await recordAudit({
      actorUserId: user.id,
      action: `cohort.${kind}.remove`,
      entity: 'cohort',
      entityId: cohortId,
      payload: { id },
    });

    invalidateCohortConfig(cohortId); // before the recompute — see `addCalendarDayAction`
    await recomputeCohort(cohortId);
    revalidatePath('/admin/settings');
    return ok();
  }, 'We could not remove that day. Please try again.');
}

/**
 * Rebuilds every derived row in the cohort. Used after any change that alters which days
 * are active study days, because streaks and consistency depend on that.
 */
export async function recomputeCohort(cohortId: string): Promise<Result<{ members: number }>> {
  return guarded(async () => {
    await requireAdminAction();
    const ctx = await getCohortContext(cohortId);
    if (!ctx) return fail('That cohort could not be found.');

    const members = await db
      .select({ id: cohortMembers.id })
      .from(cohortMembers)
      .where(eq(cohortMembers.cohortId, cohortId));

    for (const member of members) {
      await recomputeRange({
        memberId: member.id,
        cohortId,
        from: ctx.calendar.startDate,
        to: ctx.today,
        calendar: ctx.calendar,
        rules: ctx.rules,
      });
    }

    revalidatePath('/admin');
    revalidatePath('/today');
    return ok({ members: members.length });
  }, 'We could not recalculate the cohort. Please try again.');
}

/* --------------------------------------------------------------- students */

export async function createStudentAction(_prev: unknown, formData: FormData): Promise<Result> {
  return guarded(async () => {
    const admin = await requireAdminAction();
    const parsed = createStudentSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fail('Check the highlighted fields.', fieldErrors(parsed.error));

    const input = parsed.data;

    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.email}) = ${input.email}`)
      .limit(1);
    if (existing.length > 0) {
      return fail('An account with that email already exists.', {
        email: 'That email is already registered.',
      });
    }

    const [created] = await db
      .insert(users)
      .values({
        email: input.email,
        fullName: input.fullName,
        passwordHash: await hashPassword(input.password),
        mbbsYear: input.mbbsYear ?? null,
        university: input.university ?? null,
        avatarSeed: input.fullName.split(' ')[0]?.toLowerCase() ?? 'dr',
      })
      .returning({ id: users.id });

    if (!created) return fail('We could not create that student.');

    await db
      .insert(cohortMembers)
      .values({ cohortId: input.cohortId, userId: created.id })
      .onConflictDoNothing();

    await recordAudit({
      actorUserId: admin.id,
      action: 'student.create',
      entity: 'user',
      entityId: created.id,
      payload: { email: input.email, cohortId: input.cohortId },
    });

    /*
     * The ranking is cached for the whole cohort, and it carries each student's name and
     * picture alongside their numbers — so who is in it, and what they are called, is part
     * of what has just changed here. Scoring changes clear this tag from `recomputeDay`;
     * roster and profile changes have to say so themselves.
     */
    invalidateCohortActivity(input.cohortId);
    revalidatePath('/admin/students');
    return ok();
  }, 'We could not create that student. Please try again.');
}

export async function updateStudentAction(
  cohortId: string,
  _prev: unknown,
  formData: FormData,
): Promise<Result> {
  return guarded(async () => {
    const admin = await requireAdminAction();
    const parsed = studentAdminSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fail('Check the highlighted fields.', fieldErrors(parsed.error));

    const input = parsed.data;

    const owned = await db
      .select({ id: cohortMembers.id })
      .from(cohortMembers)
      .where(and(eq(cohortMembers.userId, input.userId), eq(cohortMembers.cohortId, cohortId)))
      .limit(1);
    if (owned.length === 0) return fail('That student is not in this cohort.');

    // An admin may not demote themselves and lock everyone out of the console.
    if (input.userId === admin.id && input.role !== 'admin') {
      return fail('You cannot remove your own administrator access.');
    }

    await db
      .update(users)
      .set({
        fullName: input.fullName,
        email: input.email,
        whatsapp: input.whatsapp ?? null,
        university: input.university ?? null,
        mbbsYear: input.mbbsYear ?? null,
        role: input.role,
        updatedAt: new Date(),
      })
      .where(eq(users.id, input.userId));

    await db
      .update(cohortMembers)
      .set({ status: input.status })
      .where(eq(cohortMembers.id, owned[0]!.id));

    await recordAudit({
      actorUserId: admin.id,
      action: 'student.update',
      entity: 'user',
      entityId: input.userId,
      payload: { role: input.role, status: input.status },
    });

    invalidateCohortActivity(cohortId); // name and status both show in the ranking
    revalidatePath('/admin/students');
    return ok();
  }, 'We could not save those changes. Please try again.');
}

/**
 * Removes a student's account entirely.
 *
 * Deletes the `users` row, and every cascade hanging off it — membership, roadmaps,
 * check-ins, attendance, points. There is no soft-delete here on purpose: the alternative
 * an admin usually wants is "stop counting them", which is what setting membership status
 * to `left` already does, and offering two things that both look like deletion is how
 * people delete the wrong one.
 */
export async function deleteStudentAction(cohortId: string, userId: string): Promise<Result> {
  return guarded(async () => {
    const admin = await requireAdminAction();

    if (userId === admin.id) return fail('You cannot delete your own account.');

    const [membership] = await db
      .select({ id: cohortMembers.id })
      .from(cohortMembers)
      .where(and(eq(cohortMembers.userId, userId), eq(cohortMembers.cohortId, cohortId)))
      .limit(1);
    if (!membership) return fail('That student is not in this cohort.');

    const [target] = await db
      .select({ email: users.email, fullName: users.fullName })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    await db.delete(users).where(eq(users.id, userId));

    await recordAudit({
      actorUserId: admin.id,
      action: 'student.delete',
      entity: 'user',
      entityId: userId,
      // Recorded because the row itself is gone — this is the only remaining trace.
      payload: { email: target?.email, fullName: target?.fullName, cohortId },
    });

    invalidateCohortActivity(cohortId);
    revalidatePath('/admin/students');
    revalidatePath('/admin');
    return ok();
  }, 'We could not delete that student. Please try again.');
}

/**
 * Places a student into a cohort and gives them their two roadmaps.
 *
 * This is the post-signup path from the brief: a student creates an account, sits
 * unassigned, and an admin assigns them — optionally confirming or changing their two
 * subjects at the same time. Roadmaps are generated from the syllabus as part of the same
 * action, so "assigned" and "ready to study" are never two separate states.
 */
export async function assignCohortAction(
  cohortId: string,
  userId: string,
  subjectSlugs: { primary: string | null; secondary: string | null },
): Promise<Result> {
  return guarded(async () => {
    const { user: admin, ctx } = await adminContext(cohortId);

    if (subjectSlugs.primary && subjectSlugs.primary === subjectSlugs.secondary) {
      return fail('Pick two different subjects.');
    }

    const [membership] = await db
      .insert(cohortMembers)
      .values({ cohortId, userId, status: 'active' })
      .onConflictDoUpdate({
        target: [cohortMembers.cohortId, cohortMembers.userId],
        set: { status: 'active' },
      })
      .returning({ id: cohortMembers.id });

    if (!membership) return fail('We could not add that student to the cohort.');

    /*
     * `student_goals` is NOT NULL on its baseline columns, which onboarding fills in. A
     * student assigned before finishing onboarding has no row yet, so one is seeded with
     * neutral values rather than failing the assignment — they overwrite it themselves the
     * moment they complete onboarding.
     */
    await db
      .insert(studentGoals)
      .values({
        memberId: membership.id,
        cohortGoal: 'Set during onboarding.',
        baselineDaysStudiedLastWeek: 0,
        baselineConsistencyRating: 5,
        baselineConfidence: 3,
        biggestObstacle: 'other',
      })
      .onConflictDoNothing({ target: studentGoals.memberId });

    await ensureRoadmaps({
      memberId: membership.id,
      primarySubjectSlug: subjectSlugs.primary,
      secondarySubjectSlug: subjectSlugs.secondary,
      cohortTimezone: ctx.cohort.timezone,
      today: ctx.today,
    });

    await syncGoalSubjects(membership.id);

    await recordAudit({
      actorUserId: admin.id,
      action: 'cohort.assign',
      entity: 'cohort_member',
      entityId: membership.id,
      payload: { userId, cohortId, ...subjectSlugs },
    });

    invalidateCohortActivity(cohortId);
    revalidatePath('/admin/students');
    revalidatePath('/admin/roadmaps');
    revalidatePath('/admin');
    return ok();
  }, 'We could not assign that student. Please try again.');
}

export type RestartImpact = {
  students: number;
  checkIns: number;
  attendance: number;
  pointsEntries: number;
  topicsCompleted: number;
};

/**
 * What a cohort restart would clear, counted before anyone confirms it.
 *
 * The brief asks a restart to state exactly which cohort-level state resets. Counting it
 * for real — rather than describing it in prose that can drift from the code — means the
 * confirmation cannot quietly become wrong when a table is added.
 */
export async function getRestartImpact(cohortId: string): Promise<Result<RestartImpact>> {
  return guarded(async () => {
    await adminContext(cohortId);

    const memberIds = (
      await db
        .select({ id: cohortMembers.id })
        .from(cohortMembers)
        .where(eq(cohortMembers.cohortId, cohortId))
    ).map((m) => m.id);

    if (memberIds.length === 0) {
      return ok({
        students: 0,
        checkIns: 0,
        attendance: 0,
        pointsEntries: 0,
        topicsCompleted: 0,
      });
    }

    const [checkInCount, attendanceCount, pointsCount, topicCount] = await Promise.all([
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(checkIns)
        .where(inArray(checkIns.memberId, memberIds)),
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(attendance)
        .where(inArray(attendance.memberId, memberIds)),
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(pointsLedger)
        .where(inArray(pointsLedger.memberId, memberIds)),
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(roadmapTopics)
        .innerJoin(roadmaps, eq(roadmaps.id, roadmapTopics.roadmapId))
        .where(and(inArray(roadmaps.memberId, memberIds), eq(roadmapTopics.status, 'completed'))),
    ]);

    return ok({
      students: memberIds.length,
      checkIns: checkInCount[0]?.n ?? 0,
      attendance: attendanceCount[0]?.n ?? 0,
      pointsEntries: pointsCount[0]?.n ?? 0,
      topicsCompleted: topicCount[0]?.n ?? 0,
    });
  }, 'We could not work out what a restart would affect.');
}

/**
 * Restarts a cohort from day one.
 *
 * Clears cohort *progress* — check-ins, attendance, points, the derived activity cache,
 * achievements, quiz attempts, sessions, assignments, weekly reviews — and resets every
 * roadmap topic to upcoming. It deliberately does not touch accounts, memberships, subject
 * choices, goals, or the roadmaps themselves: the brief is explicit that a restart must not
 * silently delete unrelated profile or account data, and a student should come back on day
 * one with the same two subjects they chose, at 0%.
 */
export async function restartCohortAction(cohortId: string, confirmation: string): Promise<Result> {
  return guarded(async () => {
    const { user: admin, ctx } = await adminContext(cohortId);

    // Typed confirmation matched against the cohort's own name. A restart affects every
    // student at once, so it takes more than a click to reach.
    if (confirmation.trim().toLowerCase() !== ctx.cohort.name.trim().toLowerCase()) {
      return fail(`Type the cohort name exactly — ${ctx.cohort.name} — to confirm.`);
    }

    const memberIds = (
      await db
        .select({ id: cohortMembers.id })
        .from(cohortMembers)
        .where(eq(cohortMembers.cohortId, cohortId))
    ).map((m) => m.id);

    if (memberIds.length === 0) return fail('This cohort has no students to restart.');

    await db.transaction(async (tx) => {
      await tx.delete(checkIns).where(inArray(checkIns.memberId, memberIds));
      await tx.delete(attendance).where(inArray(attendance.memberId, memberIds));
      await tx.delete(pointsLedger).where(inArray(pointsLedger.memberId, memberIds));
      await tx.delete(dailyActivity).where(inArray(dailyActivity.memberId, memberIds));
      await tx.delete(studentAchievements).where(inArray(studentAchievements.memberId, memberIds));
      await tx.delete(quizAttempts).where(inArray(quizAttempts.memberId, memberIds));
      await tx.delete(studySessions).where(inArray(studySessions.memberId, memberIds));
      await tx.delete(dailyAssignments).where(inArray(dailyAssignments.memberId, memberIds));
      await tx.delete(weeklyReviews).where(inArray(weeklyReviews.memberId, memberIds));

      // Roadmaps survive; only their completion state is cleared.
      const roadmapIds = (
        await tx
          .select({ id: roadmaps.id })
          .from(roadmaps)
          .where(inArray(roadmaps.memberId, memberIds))
      ).map((r) => r.id);

      if (roadmapIds.length > 0) {
        await tx
          .update(roadmapTopics)
          .set({ status: 'upcoming', completedAt: null })
          .where(inArray(roadmapTopics.roadmapId, roadmapIds));
      }
    });

    await recordAudit({
      actorUserId: admin.id,
      action: 'cohort.restart',
      entity: 'cohort',
      entityId: cohortId,
      payload: { students: memberIds.length },
    });

    // A restart resets the scores and the calendar together, so both tags go.
    invalidateCohortActivity(cohortId);
    invalidateCohortConfig(cohortId);
    revalidatePath('/admin');
    revalidatePath('/admin/students');
    revalidatePath('/admin/attendance');
    revalidatePath('/today');
    return ok();
  }, 'We could not restart that cohort. Nothing has been changed — please try again.');
}

/** Signed, auditable score correction. Never edits or deletes existing entries. */
export async function adjustPointsAction(
  cohortId: string,
  _prev: unknown,
  formData: FormData,
): Promise<Result> {
  return guarded(async () => {
    const { user, ctx } = await adminContext(cohortId);
    const parsed = pointAdjustmentSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fail('Check the highlighted fields.', fieldErrors(parsed.error));

    const input = parsed.data;
    await assertMemberInCohort(input.memberId, cohortId);

    await awardPoints({
      memberId: input.memberId,
      event: 'admin_adjustment',
      points: input.points,
      occurredOn: input.date,
      idempotencyKey: ledgerKey.adminAdjustment(input.memberId, randomUUID()),
      reason: input.reason,
      createdBy: user.id,
    });

    await settleDay({
      memberId: input.memberId,
      cohortId,
      date: input.date,
      calendar: ctx.calendar,
      rules: ctx.rules,
    });

    await recordAudit({
      actorUserId: user.id,
      action: 'points.adjust',
      entity: 'cohort_member',
      entityId: input.memberId,
      payload: { points: input.points, reason: input.reason, date: input.date },
    });

    revalidatePath('/admin/students');
    revalidatePath('/leaderboard');
    return ok();
  }, 'We could not record that adjustment. Please try again.');
}

/* --------------------------------------------------------------- roadmaps */

/**
 * Generates (or regenerates) a student's roadmap for one slot, straight from the syllabus.
 *
 * This replaced the old "create roadmap" + "apply template" pair. An admin no longer types
 * a title, a track or any topics: choosing the subject is the whole decision, because the
 * master syllabus already holds its modules and topics in teaching order.
 */
export async function generateRoadmapAction(
  cohortId: string,
  memberId: string,
  slot: RoadmapSlot,
  subjectSlug: string,
): Promise<Result> {
  return guarded(async () => {
    const { user } = await adminContext(cohortId);
    await assertMemberInCohort(memberId, cohortId);

    const outcome = await replaceActiveSubject({ memberId, slot, subjectSlug });
    if (!outcome.ok) {
      if (outcome.reason === 'duplicate-subject') {
        return fail('That subject already fills the student’s other slot. Pick a different one.');
      }
      return fail('That subject is not part of the MBBS syllabus we hold.');
    }

    await recordAudit({
      actorUserId: user.id,
      action: 'roadmap.generate',
      entity: 'roadmap',
      entityId: memberId,
      payload: {
        memberId,
        slot,
        subjectSlug,
        replacedSubject: outcome.replacedSubject,
        topicCount: outcome.topicCount,
      },
    });

    revalidatePath('/admin/roadmaps');
    revalidatePath('/admin/students');
    revalidatePath('/roadmap');
    return ok();
  }, 'We could not generate that roadmap. Please try again.');
}

/** Clears completion state but keeps the topic list — the "start this subject again" action. */
export async function resetRoadmapAction(cohortId: string, roadmapId: string): Promise<Result> {
  return guarded(async () => {
    const { user } = await adminContext(cohortId);
    const owner = await roadmapOwner(roadmapId);
    if (!owner) return fail('That roadmap no longer exists.');
    await assertMemberInCohort(owner.memberId, cohortId);

    const { topicsReset } = await resetRoadmapProgress(roadmapId);

    await recordAudit({
      actorUserId: user.id,
      action: 'roadmap.reset',
      entity: 'roadmap',
      entityId: roadmapId,
      payload: { memberId: owner.memberId, topicsReset },
    });

    revalidatePath('/admin/roadmaps');
    revalidatePath('/roadmap');
    return ok();
  }, 'We could not reset that roadmap. Please try again.');
}

/**
 * Deletes a roadmap and frees its slot.
 *
 * Previously this silently failed. The fix is that deletion now goes through one service
 * call whose cascade removes the weeks and topics, and the freed slot is immediately
 * available to `generateRoadmapAction` — so recreate-after-delete works.
 */
export async function deleteRoadmapAction(cohortId: string, roadmapId: string): Promise<Result> {
  return guarded(async () => {
    const { user } = await adminContext(cohortId);
    const owner = await roadmapOwner(roadmapId);
    if (!owner) return fail('That roadmap no longer exists.');
    await assertMemberInCohort(owner.memberId, cohortId);

    await deleteRoadmap(roadmapId);
    await syncGoalSubjects(owner.memberId);

    await recordAudit({
      actorUserId: user.id,
      action: 'roadmap.delete',
      entity: 'roadmap',
      entityId: roadmapId,
      payload: { memberId: owner.memberId, slot: owner.slot },
    });

    revalidatePath('/admin/roadmaps');
    revalidatePath('/admin/students');
    revalidatePath('/roadmap');
    return ok();
  }, 'We could not delete that roadmap. Please try again.');
}

/** The member and slot a roadmap belongs to, for ownership checks before a destructive call. */
async function roadmapOwner(
  roadmapId: string,
): Promise<{ memberId: string; slot: RoadmapSlot } | null> {
  const [row] = await db
    .select({ memberId: roadmaps.memberId, slot: roadmaps.slot })
    .from(roadmaps)
    .where(eq(roadmaps.id, roadmapId))
    .limit(1);
  return row ?? null;
}

export async function addRoadmapWeekAction(
  cohortId: string,
  _prev: unknown,
  formData: FormData,
): Promise<Result> {
  return guarded(async () => {
    await adminContext(cohortId);
    const parsed = roadmapWeekSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fail('Check the highlighted fields.', fieldErrors(parsed.error));

    await assertRoadmapInCohort(parsed.data.roadmapId, cohortId);

    await db
      .insert(roadmapWeeks)
      .values({
        roadmapId: parsed.data.roadmapId,
        weekNumber: parsed.data.weekNumber,
        title: parsed.data.title,
      })
      .onConflictDoUpdate({
        target: [roadmapWeeks.roadmapId, roadmapWeeks.weekNumber],
        set: { title: parsed.data.title },
      });

    revalidatePath('/admin/roadmaps');
    return ok();
  }, 'We could not add that week. Please try again.');
}

export async function addTopicAction(
  cohortId: string,
  _prev: unknown,
  formData: FormData,
): Promise<Result> {
  return guarded(async () => {
    await adminContext(cohortId);
    const parsed = topicSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fail('Check the highlighted fields.', fieldErrors(parsed.error));

    await assertRoadmapInCohort(parsed.data.roadmapId, cohortId);

    const max = await db
      .select({ n: sql<number>`coalesce(max(${roadmapTopics.position}), 0)::int` })
      .from(roadmapTopics)
      .where(eq(roadmapTopics.roadmapId, parsed.data.roadmapId));

    await db.insert(roadmapTopics).values({
      roadmapId: parsed.data.roadmapId,
      weekId: parsed.data.weekId ?? null,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      estimatedMinutes: parsed.data.estimatedMinutes,
      position: (max[0]?.n ?? 0) + 1,
    });

    await markRoadmapCustomized(parsed.data.roadmapId);

    revalidatePath('/admin/roadmaps');
    revalidatePath('/roadmap');
    return ok();
  }, 'We could not add that topic. Please try again.');
}

export async function updateTopicAction(
  cohortId: string,
  _prev: unknown,
  formData: FormData,
): Promise<Result> {
  return guarded(async () => {
    await adminContext(cohortId);
    const parsed = topicUpdateSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fail('Check the highlighted fields.', fieldErrors(parsed.error));

    await assertRoadmapInCohort(parsed.data.roadmapId, cohortId);

    await db
      .update(roadmapTopics)
      .set({
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        estimatedMinutes: parsed.data.estimatedMinutes,
        weekId: parsed.data.weekId ?? null,
      })
      .where(
        and(
          eq(roadmapTopics.id, parsed.data.topicId),
          eq(roadmapTopics.roadmapId, parsed.data.roadmapId),
        ),
      );

    revalidatePath('/admin/roadmaps');
    revalidatePath('/roadmap');
    return ok();
  }, 'We could not save that topic. Please try again.');
}

export async function deleteTopicAction(
  cohortId: string,
  roadmapId: string,
  topicId: string,
): Promise<Result> {
  return guarded(async () => {
    await adminContext(cohortId);
    await assertRoadmapInCohort(roadmapId, cohortId);
    await db
      .delete(roadmapTopics)
      .where(and(eq(roadmapTopics.id, topicId), eq(roadmapTopics.roadmapId, roadmapId)));
    await markRoadmapCustomized(roadmapId);
    revalidatePath('/admin/roadmaps');
    revalidatePath('/roadmap');
    return ok();
  }, 'We could not delete that topic. Please try again.');
}

export async function reorderTopicsAction(
  cohortId: string,
  roadmapId: string,
  topicIds: string[],
): Promise<Result> {
  return guarded(async () => {
    await adminContext(cohortId);
    const parsed = topicReorderSchema.safeParse({ roadmapId, topicIds });
    if (!parsed.success) return fail('That ordering was not valid.');
    await assertRoadmapInCohort(roadmapId, cohortId);

    for (const [index, id] of parsed.data.topicIds.entries()) {
      await db
        .update(roadmapTopics)
        .set({ position: index })
        .where(and(eq(roadmapTopics.id, id), eq(roadmapTopics.roadmapId, roadmapId)));
    }

    await markRoadmapCustomized(roadmapId);

    revalidatePath('/admin/roadmaps');
    revalidatePath('/roadmap');
    return ok();
  }, 'We could not reorder those topics. Please try again.');
}

/**
 * Records that this student's sequence is no longer the generated one.
 *
 * Called by every write that changes *what is on* a roadmap or *what order it is in* —
 * reorder, add, delete, and an off-plan topic appended from the syllabus. Editing a topic's
 * title or estimate is not customisation of the sequence and deliberately does not set it.
 * `Reset to default` regenerates the roadmap from the syllabus, which produces a fresh row
 * and therefore clears this by construction.
 */
async function markRoadmapCustomized(roadmapId: string): Promise<void> {
  await db.update(roadmaps).set({ isCustomized: true }).where(eq(roadmaps.id, roadmapId));
}

/**
 * Which of the student's two subject slots a roadmap topic belongs to.
 *
 * A day holds one assignment per slot, so every write that sets today's topic has to know
 * which one it is filling. Returns null when the topic id does not belong to this member —
 * callers treat that as "not this student's topic".
 */
async function slotForTopic(memberId: string, topicId: string): Promise<RoadmapSlot | null> {
  const [row] = await db
    .select({ slot: roadmaps.slot })
    .from(roadmapTopics)
    .innerJoin(roadmaps, eq(roadmaps.id, roadmapTopics.roadmapId))
    .where(and(eq(roadmapTopics.id, topicId), eq(roadmaps.memberId, memberId)))
    .limit(1);
  return row?.slot ?? null;
}

/** The conflict target for one student's topic in one subject on one day. */
const ASSIGNMENT_KEY = [dailyAssignments.memberId, dailyAssignments.date, dailyAssignments.slot];

async function assertRoadmapInCohort(roadmapId: string, cohortId: string): Promise<void> {
  const rows = await db
    .select({ id: roadmaps.id })
    .from(roadmaps)
    .innerJoin(cohortMembers, eq(cohortMembers.id, roadmaps.memberId))
    .where(and(eq(roadmaps.id, roadmapId), eq(cohortMembers.cohortId, cohortId)))
    .limit(1);
  if (rows.length === 0) throw new Error('That roadmap is not in this cohort.');
}

/* ------------------------------------------------------------ assignments */

export async function setAssignmentAction(
  cohortId: string,
  _prev: unknown,
  formData: FormData,
): Promise<Result> {
  return guarded(async () => {
    await adminContext(cohortId);
    const parsed = assignmentSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fail('Check the highlighted fields.', fieldErrors(parsed.error));

    const input = parsed.data;
    await assertMemberInCohort(input.memberId, cohortId);

    /*
     * The slot follows the topic's own roadmap, so saving an Anatomy topic can never
     * overwrite the Physiology topic sitting alongside it on the same day. A save that
     * carries no topic — the minutes-and-note edit, which is all this sheet sends — names
     * the slot it is editing instead.
     */
    let slot: RoadmapSlot = input.slot ?? 'primary';
    if (input.topicId) {
      const resolved = await slotForTopic(input.memberId, input.topicId);
      if (!resolved) return fail('That topic is not on this student’s roadmap.');
      slot = resolved;
    }

    /*
     * Editing the minutes or the note leaves the topic alone. It used to null it: the sheet
     * has no topic field, so every save silently unassigned the student's topic for the day.
     */
    const topicFields = input.topicId ? { topicId: input.topicId, ...NO_CUSTOM_TOPIC } : {};

    await db
      .insert(dailyAssignments)
      .values({
        memberId: input.memberId,
        date: input.date,
        slot,
        topicId: input.topicId ?? null,
        plannedMinutes: input.plannedMinutes,
        note: input.note ?? null,
      })
      .onConflictDoUpdate({
        target: ASSIGNMENT_KEY,
        set: {
          plannedMinutes: input.plannedMinutes,
          note: input.note ?? null,
          ...topicFields,
        },
      });

    revalidatePath('/admin/roadmaps');
    revalidatePath('/today');
    return ok();
  }, 'We could not save that assignment. Please try again.');
}

/**
 * Assigns every active student their next uncompleted roadmap topic for a date.
 * This is the action that turns "27 students" into one click.
 *
 * It steps around students whose topic for that date was chosen by an admin by hand, and
 * reports how many it skipped so the caller can offer to overwrite them deliberately. A
 * bulk button that silently undoes individual work is the failure mode this whole pair of
 * features exists to avoid.
 */
export async function bulkAssignAction(
  _prev: unknown,
  formData: FormData,
): Promise<Result<{ assigned: number; skipped: number; skippedNames: string[] }>> {
  return guarded(async () => {
    const user = await requireAdminAction();
    const parsed = bulkAssignmentSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fail('Check the date and duration.', fieldErrors(parsed.error));

    const { cohortId, date, plannedMinutes, overwriteIndividual } = parsed.data;

    const members = await db
      .select({ id: cohortMembers.id, name: users.fullName })
      .from(cohortMembers)
      .innerJoin(users, eq(users.id, cohortMembers.userId))
      .where(and(eq(cohortMembers.cohortId, cohortId), eq(cohortMembers.status, 'active')))
      .orderBy(asc(users.fullName));

    /*
     * Hand-picked topics are pinned per *subject*, not per student: an admin who chose
     * today's Anatomy topic for someone has said nothing about their Physiology, and the
     * bulk run should still fill the slot they left alone.
     */
    const individual = await db
      .select({ memberId: dailyAssignments.memberId, slot: dailyAssignments.slot })
      .from(dailyAssignments)
      .innerJoin(cohortMembers, eq(cohortMembers.id, dailyAssignments.memberId))
      .where(
        and(
          eq(cohortMembers.cohortId, cohortId),
          eq(dailyAssignments.date, date),
          eq(dailyAssignments.source, 'admin'),
        ),
      );
    const pinned = new Set(individual.map((row) => `${row.memberId}:${row.slot}`));

    const memberIds = members.map((m) => m.id);
    const plans =
      memberIds.length > 0
        ? await db
            .select({ id: roadmaps.id, memberId: roadmaps.memberId, slot: roadmaps.slot })
            .from(roadmaps)
            .where(inArray(roadmaps.memberId, memberIds))
            .orderBy(asc(roadmaps.slot))
        : [];

    const nameById = new Map(members.map((m) => [m.id, m.name]));

    let assigned = 0;
    let completed = 0;
    const skippedNames = new Set<string>();

    for (const plan of plans) {
      /*
       * Each roadmap is advanced along its *own* sequence. A student whose order an admin
       * has redesigned follows that order; everyone else follows the syllabus order. The
       * bulk run never reads or writes the master syllabus, so one student's custom
       * sequence cannot reach another's.
       */
      const next = await nextTopicForRoadmap(plan.id);
      await syncRoadmapCompletion(plan.id, Boolean(next));

      if (!next) {
        // The subject is finished. It is marked complete above and deliberately does not
        // wrap back round to topic 1.
        completed += 1;
        continue;
      }

      if (!overwriteIndividual && pinned.has(`${plan.memberId}:${plan.slot}`)) {
        skippedNames.add(nameById.get(plan.memberId) ?? '');
        continue;
      }

      await db
        .insert(dailyAssignments)
        .values({
          memberId: plan.memberId,
          date,
          slot: plan.slot,
          topicId: next.id,
          plannedMinutes,
          source: 'auto',
        })
        .onConflictDoUpdate({
          target: ASSIGNMENT_KEY,
          // The row reverts to `auto` on an overwrite, because that is now what it is: a
          // later bulk run has no reason to treat it as hand-picked a second time.
          set: {
            topicId: next.id,
            plannedMinutes,
            source: 'auto',
            assignedByUserId: null,
            assignedAt: null,
            ...NO_CUSTOM_TOPIC,
          },
        });
      assigned += 1;
    }

    await recordAudit({
      actorUserId: user.id,
      action: 'assignment.bulk',
      entity: 'cohort',
      entityId: cohortId,
      payload: { date, assigned, completed, skipped: skippedNames.size, overwriteIndividual },
    });

    revalidatePath('/admin/roadmaps');
    revalidatePath('/admin/students');
    revalidatePath('/today');
    revalidatePath('/roadmap');
    const names = [...skippedNames].filter(Boolean).sort();
    return ok({ assigned, skipped: names.length, skippedNames: names });
  }, 'We could not assign topics. Please try again.');
}

/* ------------------------------------------------- individual assignment */

export type IndividualAssignmentOutcome = {
  topicTitle: string;
  subjectName: string;
  /** True when the assigned topic had already been completed and is now current again. */
  wasCompleted: boolean;
};

/**
 * Makes one topic the current topic for one student.
 *
 * The bulk action answers "everyone moves on today". This answers the case the brief calls
 * out: a student who picked Anatomy is not necessarily starting at the top of the Anatomy
 * syllabus, and until now the only way to move them was to move the whole cohort.
 *
 * Three things change together, which is why they belong in one action rather than in three
 * calls from the client:
 *
 *  - the topic becomes `in_progress`, and whatever *was* in progress on that roadmap drops
 *    back to `upcoming`, so "current position in the subject" has exactly one answer;
 *  - the day's assignment points at it, which is what "Today's Topic", the study screen and
 *    the roadmap's today badge all read;
 *  - the row is stamped `admin`, so the next bulk run has to ask before undoing it.
 *
 * Completed topics elsewhere on the roadmap are never touched, and no other student is read
 * or written.
 */
export async function assignIndividualTopicAction(
  cohortId: string,
  input: {
    memberId: string;
    topicId: string;
    date: string;
    plannedMinutes?: number;
    allowCompleted?: boolean;
  },
): Promise<Result<IndividualAssignmentOutcome>> {
  return guarded(async () => {
    const { user } = await adminContext(cohortId);

    const parsed = individualAssignmentSchema.safeParse(input);
    if (!parsed.success) return fail('Check the highlighted fields.', fieldErrors(parsed.error));

    const { memberId, topicId, date, plannedMinutes, allowCompleted } = parsed.data;
    await assertMemberInCohort(memberId, cohortId);

    /*
     * The topic is looked up *through* the student's own roadmap. That single join is the
     * ownership check: a topic id belonging to another student's roadmap — or to no roadmap
     * at all — simply returns no row, so a tampered request cannot move someone else's plan.
     */
    const [topic] = await db
      .select({
        id: roadmapTopics.id,
        title: roadmapTopics.title,
        status: roadmapTopics.status,
        roadmapId: roadmapTopics.roadmapId,
        slot: roadmaps.slot,
        subjectName: subjects.name,
      })
      .from(roadmapTopics)
      .innerJoin(roadmaps, eq(roadmaps.id, roadmapTopics.roadmapId))
      .innerJoin(subjects, eq(subjects.id, roadmaps.subjectId))
      .where(and(eq(roadmapTopics.id, topicId), eq(roadmaps.memberId, memberId)))
      .limit(1);

    if (!topic) return fail('That topic is not on this student’s roadmap.');

    const wasCompleted = topic.status === 'completed';
    if (wasCompleted && !allowCompleted) {
      return fail(
        `${topic.title} has already been completed. Confirm the reassignment to make it current again.`,
      );
    }

    // Only `in_progress` is cleared. Completed work stays completed — the brief is explicit
    // that reassigning a topic must not erase what the student has already finished.
    await db
      .update(roadmapTopics)
      .set({ status: 'upcoming' })
      .where(
        and(
          eq(roadmapTopics.roadmapId, topic.roadmapId),
          eq(roadmapTopics.status, 'in_progress'),
          ne(roadmapTopics.id, topic.id),
        ),
      );

    // `completedAt` is deliberately left as it was: it is the record of when this topic was
    // first finished, and the warning above already told the admin this is a redo.
    await db
      .update(roadmapTopics)
      .set({ status: 'in_progress' })
      .where(eq(roadmapTopics.id, topic.id));

    // The subject has work in it again, so it is no longer a finished roadmap.
    await syncRoadmapCompletion(topic.roadmapId, true);

    const stamp = {
      topicId: topic.id,
      plannedMinutes,
      source: 'admin' as const,
      assignedByUserId: user.id,
      assignedAt: new Date(),
      ...NO_CUSTOM_TOPIC,
    };

    // Filling this subject's slot leaves the student's other subject for the day alone.
    await db
      .insert(dailyAssignments)
      .values({ memberId, date, slot: topic.slot, ...stamp })
      .onConflictDoUpdate({ target: ASSIGNMENT_KEY, set: stamp });

    await recordAudit({
      actorUserId: user.id,
      action: 'assignment.individual',
      entity: 'cohort_member',
      entityId: memberId,
      payload: {
        date,
        topicId: topic.id,
        topicTitle: topic.title,
        subject: topic.subjectName,
        reassignedCompleted: wasCompleted,
      },
    });

    revalidateAfterAssignment(memberId);

    return ok({
      topicTitle: topic.title,
      subjectName: topic.subjectName,
      wasCompleted,
    });
  }, 'We could not assign that topic. Please try again.');
}

/* --------------------------------------- assignment from the full syllabus */

export type SyllabusAssignmentOutcome = {
  topicTitle: string;
  subjectName: string;
  /** True when the assigned topic had already been completed and is now current again. */
  wasCompleted: boolean;
  /**
   * How the topic was attached:
   *  - `roadmap` — it was already on one of the student's roadmaps;
   *  - `added` — it was added to the roadmap they have for that subject;
   *  - `off_roadmap` — they have no roadmap for that subject, so it is today's topic only.
   */
  placement: 'roadmap' | 'added' | 'off_roadmap';
};

/**
 * Makes any topic in the MBBS syllabus today's topic for one student.
 *
 * `assignIndividualTopicAction` can only offer what is already on the student's two
 * roadmaps, which is the wrong ceiling for an admin: a lead who wants to put someone on a
 * Pharmacology topic during an Anatomy block had no way to say so without hand-building a
 * roadmap first. This takes a curriculum ref — the same address quizzes and materials are
 * filed under — and does whatever it takes to honour it:
 *
 *  - the topic is already on the matching roadmap → it simply becomes current;
 *  - the student has that subject but not that topic → the topic is appended to the roadmap
 *    (unscheduled, at the end) so their progress bar and "next topic" logic still see it;
 *  - the student does not have that subject at all → there is no roadmap to extend without
 *    breaking the two-subject rule, so the topic is recorded on the day's assignment
 *    itself. It shows on Today's Focus and drives the matching knowledge check, and it
 *    leaves the roadmaps they *are* working through untouched.
 */
export async function assignSyllabusTopicAction(
  cohortId: string,
  input: {
    memberId: string;
    ref: string;
    date: string;
    plannedMinutes?: number;
    allowCompleted?: boolean;
  },
): Promise<Result<SyllabusAssignmentOutcome>> {
  return guarded(async () => {
    const { user } = await adminContext(cohortId);

    const parsed = syllabusAssignmentSchema.safeParse(input);
    if (!parsed.success) return fail('Check the highlighted fields.', fieldErrors(parsed.error));

    const { memberId, ref, date, plannedMinutes, allowCompleted } = parsed.data;
    await assertMemberInCohort(memberId, cohortId);

    // The tree is the authority on what exists. An unresolvable ref never reaches a write.
    const resolved = resolveRef(ref);
    if (!resolved || resolved.depth === 1) {
      return fail('Pick a topic (or a module) from the syllabus.');
    }

    const title = resolved.label;
    const subjectName = resolved.subjectName;

    /* The roadmap for this subject, if the student has one. */
    const [roadmap] = await db
      .select({ id: roadmaps.id, slot: roadmaps.slot })
      .from(roadmaps)
      .innerJoin(subjects, eq(subjects.id, roadmaps.subjectId))
      .where(and(eq(roadmaps.memberId, memberId), eq(subjects.slug, resolved.subjectSlug)))
      .limit(1);

    if (!roadmap) {
      /*
       * Off-roadmap. Nothing about the student's roadmaps changes — deliberately: the topic
       * is a detour for one day, and marking progress on a subject they are not tracking
       * would put a number on their profile that no roadmap can account for.
       */
      const stamp = {
        topicId: null,
        customTopicTitle: title,
        customTopicRef: ref,
        customSubjectName: subjectName,
        plannedMinutes,
        source: 'admin' as const,
        assignedByUserId: user.id,
        assignedAt: new Date(),
      };

      /*
       * There is no roadmap to read a slot from, so the detour takes the primary one: it is
       * standing in for the day's main focus. The student's secondary subject keeps its own
       * topic for the day.
       */
      await db
        .insert(dailyAssignments)
        .values({ memberId, date, slot: 'primary', ...stamp })
        .onConflictDoUpdate({ target: ASSIGNMENT_KEY, set: stamp });

      await recordAudit({
        actorUserId: user.id,
        action: 'assignment.syllabus',
        entity: 'cohort_member',
        entityId: memberId,
        payload: { date, ref, topicTitle: title, subject: subjectName, placement: 'off_roadmap' },
      });

      revalidateAfterAssignment(memberId);
      const outcome: SyllabusAssignmentOutcome = {
        topicTitle: title,
        subjectName,
        wasCompleted: false,
        placement: 'off_roadmap',
      };
      return ok(outcome);
    }

    /*
     * On the roadmap, or about to be. Matching is by ref first — the join key — and falls
     * back to the title, because a roadmap generated before refs were carried through has
     * the same topics under the same names and should not gain a duplicate row.
     */
    const existing = await db
      .select({
        id: roadmapTopics.id,
        title: roadmapTopics.title,
        status: roadmapTopics.status,
        curriculumRef: roadmapTopics.curriculumRef,
      })
      .from(roadmapTopics)
      .where(eq(roadmapTopics.roadmapId, roadmap.id));

    const match =
      existing.find((t) => t.curriculumRef === ref) ??
      existing.find((t) => t.title.trim().toLowerCase() === title.trim().toLowerCase()) ??
      null;

    let topicId: string;
    let wasCompleted = false;
    let placement: SyllabusAssignmentOutcome['placement'];

    if (match) {
      wasCompleted = match.status === 'completed';
      if (wasCompleted && !allowCompleted) {
        return fail(
          `${match.title} has already been completed. Confirm the reassignment to make it current again.`,
        );
      }
      topicId = match.id;
      placement = 'roadmap';
    } else {
      const [row] = await db
        .select({ next: sql<number>`coalesce(max(${roadmapTopics.position}), -1)::int + 1` })
        .from(roadmapTopics)
        .where(eq(roadmapTopics.roadmapId, roadmap.id));

      // The detail nodes become the description, which is exactly what a generated roadmap
      // topic carries — an added topic should be indistinguishable from a generated one.
      const subject = curriculumSubject(resolved.subjectSlug);
      const section = subject?.sections.find((sec) => sec.title === resolved.sectionTitle);
      const topicNode = resolved.topicTitle
        ? section?.topics.find((t) => t.title === resolved.topicTitle)
        : null;
      const description = topicNode
        ? topicNode.nodes.join(' · ')
        : (section?.topics.map((t) => t.title).join(' · ') ?? null);

      const [created] = await db
        .insert(roadmapTopics)
        .values({
          roadmapId: roadmap.id,
          // No week: it was not part of the generated plan, so it groups under
          // "Unscheduled topics" rather than pretending to belong to a module.
          weekId: null,
          title,
          curriculumRef: ref,
          description,
          position: row?.next ?? 0,
          status: 'upcoming',
        })
        .returning({ id: roadmapTopics.id });

      topicId = created!.id;
      placement = 'added';
      // A topic the syllabus never put here is an edit to this student's sequence.
      await markRoadmapCustomized(roadmap.id);
    }

    // Same rule as the individual assignment: exactly one topic is in progress per roadmap,
    // and completed work is never rewritten.
    await db
      .update(roadmapTopics)
      .set({ status: 'upcoming' })
      .where(
        and(
          eq(roadmapTopics.roadmapId, roadmap.id),
          eq(roadmapTopics.status, 'in_progress'),
          ne(roadmapTopics.id, topicId),
        ),
      );

    await db
      .update(roadmapTopics)
      .set({ status: 'in_progress' })
      .where(eq(roadmapTopics.id, topicId));

    await syncRoadmapCompletion(roadmap.id, true);

    const stamp = {
      topicId,
      plannedMinutes,
      source: 'admin' as const,
      assignedByUserId: user.id,
      assignedAt: new Date(),
      ...NO_CUSTOM_TOPIC,
    };

    await db
      .insert(dailyAssignments)
      .values({ memberId, date, slot: roadmap.slot, ...stamp })
      .onConflictDoUpdate({ target: ASSIGNMENT_KEY, set: stamp });

    await recordAudit({
      actorUserId: user.id,
      action: 'assignment.syllabus',
      entity: 'cohort_member',
      entityId: memberId,
      payload: {
        date,
        ref,
        topicId,
        topicTitle: title,
        subject: subjectName,
        placement,
        reassignedCompleted: wasCompleted,
      },
    });

    revalidateAfterAssignment(memberId);
    return ok({ topicTitle: title, subjectName, wasCompleted, placement });
  }, 'We could not assign that topic. Please try again.');
}

/** Every screen that reads "today's topic", for either side of the product. */
function revalidateAfterAssignment(memberId: string) {
  revalidatePath('/admin/roadmaps');
  revalidatePath('/admin/students');
  revalidatePath(`/admin/students/${memberId}`);
  revalidatePath('/today');
  revalidatePath('/roadmap');
  revalidatePath('/study');
  revalidatePath('/progress');
}

/* ------------------------------------------------- events & announcements */

export async function saveEventAction(
  eventId: string | null,
  _prev: unknown,
  formData: FormData,
): Promise<Result> {
  return guarded(async () => {
    const user = await requireAdminAction();
    const parsed = eventSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fail('Check the highlighted fields.', fieldErrors(parsed.error));

    const input = parsed.data;
    const values = {
      cohortId: input.cohortId,
      type: input.type,
      title: input.title,
      description: input.description ?? null,
      date: input.date,
      startTime: input.startTime,
      endTime: input.endTime,
      meetUrl: input.meetUrl ?? null,
    };

    if (eventId) {
      await db
        .update(events)
        .set(values)
        .where(and(eq(events.id, eventId), eq(events.cohortId, input.cohortId)));
    } else {
      await db.insert(events).values(values);
    }

    await recordAudit({
      actorUserId: user.id,
      action: eventId ? 'event.update' : 'event.create',
      entity: 'event',
      entityId: eventId ?? undefined,
      payload: { title: input.title, date: input.date },
    });

    revalidatePath('/admin/events');
    revalidatePath('/calendar');
    revalidatePath('/today');
    return ok();
  }, 'We could not save that event. Please try again.');
}

export async function deleteEventAction(cohortId: string, eventId: string): Promise<Result> {
  return guarded(async () => {
    const user = await requireAdminAction();
    await db.delete(events).where(and(eq(events.id, eventId), eq(events.cohortId, cohortId)));
    await recordAudit({
      actorUserId: user.id,
      action: 'event.delete',
      entity: 'event',
      entityId: eventId,
    });
    revalidatePath('/admin/events');
    revalidatePath('/calendar');
    return ok();
  }, 'We could not delete that event. Please try again.');
}

export async function saveAnnouncementAction(
  announcementId: string | null,
  _prev: unknown,
  formData: FormData,
): Promise<Result> {
  return guarded(async () => {
    const user = await requireAdminAction();
    const parsed = announcementSchema.safeParse({
      ...Object.fromEntries(formData),
      isPinned: formData.get('isPinned') === 'on',
      isPopup: formData.get('isPopup') === 'on',
      isPersistent: formData.get('isPersistent') === 'on',
    });
    if (!parsed.success) return fail('Check the highlighted fields.', fieldErrors(parsed.error));

    const input = parsed.data;
    if (announcementId) {
      await db
        .update(announcements)
        .set({
          title: input.title,
          body: input.body,
          isPinned: input.isPinned,
          isPopup: input.isPopup,
          isPersistent: input.isPersistent,
        })
        .where(
          and(eq(announcements.id, announcementId), eq(announcements.cohortId, input.cohortId)),
        );
    } else {
      await db.insert(announcements).values({
        cohortId: input.cohortId,
        title: input.title,
        body: input.body,
        isPinned: input.isPinned,
        isPopup: input.isPopup,
        isPersistent: input.isPersistent,
        createdBy: user.id,
      });
    }

    revalidatePath('/admin/events');
    revalidatePath('/today');
    return ok();
  }, 'We could not save that announcement. Please try again.');
}

export async function deleteAnnouncementAction(
  cohortId: string,
  announcementId: string,
): Promise<Result> {
  return guarded(async () => {
    await requireAdminAction();
    await db
      .delete(announcements)
      .where(and(eq(announcements.id, announcementId), eq(announcements.cohortId, cohortId)));
    revalidatePath('/admin/events');
    revalidatePath('/today');
    return ok();
  }, 'We could not delete that announcement. Please try again.');
}

/* -------------------------------------------------------------- materials */

export async function saveMaterialAction(
  materialId: string | null,
  _prev: unknown,
  formData: FormData,
): Promise<Result> {
  return guarded(async () => {
    const user = await requireAdminAction();
    const parsed = materialSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fail('Check the highlighted fields.', fieldErrors(parsed.error));

    const input = parsed.data;
    const values = {
      cohortId: input.cohortId,
      subjectId: input.subjectId ?? null,
      curriculumRef: input.curriculumRef ?? null,
      title: input.title,
      description: input.description ?? null,
      type: input.type,
      url: input.url,
    };

    if (materialId) {
      await db
        .update(materials)
        .set(values)
        .where(and(eq(materials.id, materialId), eq(materials.cohortId, input.cohortId)));
    } else {
      await db.insert(materials).values(values);
    }

    await recordAudit({
      actorUserId: user.id,
      action: materialId ? 'material.update' : 'material.create',
      entity: 'material',
      entityId: materialId ?? undefined,
      payload: { title: input.title },
    });

    invalidateCohortLibrary(input.cohortId);
    revalidatePath('/admin/materials');
    revalidatePath('/materials');
    return ok();
  }, 'We could not save that material. Please try again.');
}

export async function deleteMaterialAction(cohortId: string, materialId: string): Promise<Result> {
  return guarded(async () => {
    await requireAdminAction();
    await db
      .delete(materials)
      .where(and(eq(materials.id, materialId), eq(materials.cohortId, cohortId)));
    invalidateCohortLibrary(cohortId);
    revalidatePath('/admin/materials');
    revalidatePath('/materials');
    return ok();
  }, 'We could not delete that material. Please try again.');
}

/** Reads the full points ledger for one student, for the admin correction screen. */
export async function getMemberLedger(cohortId: string, memberId: string) {
  await requireAdminAction();
  await assertMemberInCohort(memberId, cohortId);
  return db
    .select()
    .from(pointsLedger)
    .where(eq(pointsLedger.memberId, memberId))
    .orderBy(asc(pointsLedger.occurredOn));
}
