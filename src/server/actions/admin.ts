'use server';

import { randomUUID } from 'node:crypto';

import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { db } from '@/db/client';
import {
  announcements,
  attendance,
  cohortExtraStudyDays,
  cohortHolidays,
  cohortMembers,
  cohorts,
  dailyAssignments,
  events,
  materials,
  pointRules,
  pointsLedger,
  roadmapTopics,
  roadmapWeeks,
  roadmaps,
  users,
} from '@/db/schema';
import { requireAdminAction } from '@/lib/auth/guards';
import { hashPassword } from '@/lib/auth/password';
import { ledgerKey } from '@/lib/domain/points';
import { templateList } from '@/lib/roadmap-templates';
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
  materialSchema,
  pointAdjustmentSchema,
  pointRuleSchema,
  roadmapSchema,
  roadmapWeekSchema,
  studentAdminSchema,
  topicReorderSchema,
  topicSchema,
  topicUpdateSchema,
} from '@/lib/validation';
import { getCohortContext } from '@/server/context';
import { awardPoints, recomputeRange, revokeAward, settleDay } from '@/server/scoring';

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

/* ------------------------------------------------------------- attendance */

export async function markAttendanceAction(
  cohortId: string,
  input: { date: string; entries: { memberId: string; status: 'present' | 'late' | 'absent' }[] },
): Promise<Result<{ marked: number }>> {
  return guarded(async () => {
    const { user, ctx } = await adminContext(cohortId);
    const parsed = attendanceMarkSchema.safeParse(input);
    if (!parsed.success) return fail('That attendance data was not valid.', fieldErrors(parsed.error));

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

    for (const entry of accepted) {
      await db
        .insert(attendance)
        .values({
          memberId: entry.memberId,
          date,
          status: entry.status,
          markedBy: user.id,
          markedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [attendance.memberId, attendance.date],
          set: { status: entry.status, markedBy: user.id, markedAt: new Date() },
        });

      // Attendance points are re-cut from scratch: withdraw the old award, then re-award
      // at the correct value. The ledger key is per member-day, so this stays idempotent.
      const key = ledgerKey.attendance(entry.memberId, date);
      await revokeAward(key);

      if (entry.status !== 'absent') {
        const event = entry.status === 'present' ? 'live_session_present' : 'live_session_late';
        await awardPoints({
          memberId: entry.memberId,
          event,
          points: ctx.rules[event],
          occurredOn: date,
          idempotencyKey: key,
          reason: entry.status === 'present' ? 'Attended the study room' : 'Joined late',
          createdBy: user.id,
        });
      }

      await settleDay({
        memberId: entry.memberId,
        date,
        calendar: ctx.calendar,
        rules: ctx.rules,
      });
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

    revalidatePath('/admin/settings');
    revalidatePath('/admin');
    revalidatePath('/');
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
        from: ctx.calendar.startDate,
        to: ctx.today,
        calendar: ctx.calendar,
        rules: ctx.rules,
      });
    }

    revalidatePath('/admin');
    revalidatePath('/');
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

    revalidatePath('/admin/students');
    return ok();
  }, 'We could not save those changes. Please try again.');
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

export async function createRoadmapAction(
  cohortId: string,
  _prev: unknown,
  formData: FormData,
): Promise<Result> {
  return guarded(async () => {
    const { user } = await adminContext(cohortId);
    const parsed = roadmapSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fail('Check the highlighted fields.', fieldErrors(parsed.error));

    await assertMemberInCohort(parsed.data.memberId, cohortId);

    const [created] = await db
      .insert(roadmaps)
      .values({
        memberId: parsed.data.memberId,
        subjectId: parsed.data.subjectId,
        title: parsed.data.title,
        track: parsed.data.track ?? null,
      })
      .returning({ id: roadmaps.id });

    await recordAudit({
      actorUserId: user.id,
      action: 'roadmap.create',
      entity: 'roadmap',
      entityId: created?.id,
      payload: { memberId: parsed.data.memberId },
    });

    revalidatePath('/admin/roadmaps');
    return ok();
  }, 'We could not create that roadmap. Please try again.');
}

/** Applies a curated template to a student who has no roadmap yet. */
export async function applyRoadmapTemplateAction(
  cohortId: string,
  memberId: string,
  templateKey: string,
  subjectId: string,
): Promise<Result> {
  return guarded(async () => {
    const { user } = await adminContext(cohortId);
    await assertMemberInCohort(memberId, cohortId);

    const template = templateList().find((t) => t.key === templateKey);
    if (!template) return fail('That template could not be found.');

    const [roadmap] = await db
      .insert(roadmaps)
      .values({ memberId, subjectId, title: template.title, track: template.track })
      .returning({ id: roadmaps.id });
    if (!roadmap) return fail('We could not create that roadmap.');

    const weekRows = await db
      .insert(roadmapWeeks)
      .values(
        template.weeks.map((w, i) => ({
          roadmapId: roadmap.id,
          weekNumber: i + 1,
          title: w.title,
        })),
      )
      .returning();

    await db.insert(roadmapTopics).values(
      template.weeks.flatMap((w, wi) =>
        w.topics.map((title, ti) => ({
          roadmapId: roadmap.id,
          weekId: weekRows[wi]!.id,
          title,
          position: wi * 100 + ti,
          status: (wi === 0 && ti === 0 ? 'in_progress' : 'upcoming') as 'in_progress' | 'upcoming',
        })),
      ),
    );

    await recordAudit({
      actorUserId: user.id,
      action: 'roadmap.apply_template',
      entity: 'roadmap',
      entityId: roadmap.id,
      payload: { memberId, templateKey },
    });

    revalidatePath('/admin/roadmaps');
    revalidatePath('/roadmap');
    return ok();
  }, 'We could not apply that template. Please try again.');
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

    revalidatePath('/admin/roadmaps');
    revalidatePath('/roadmap');
    return ok();
  }, 'We could not reorder those topics. Please try again.');
}

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

    await db
      .insert(dailyAssignments)
      .values({
        memberId: input.memberId,
        date: input.date,
        topicId: input.topicId ?? null,
        plannedMinutes: input.plannedMinutes,
        note: input.note ?? null,
      })
      .onConflictDoUpdate({
        target: [dailyAssignments.memberId, dailyAssignments.date],
        set: {
          topicId: input.topicId ?? null,
          plannedMinutes: input.plannedMinutes,
          note: input.note ?? null,
        },
      });

    revalidatePath('/admin/roadmaps');
    revalidatePath('/');
    return ok();
  }, 'We could not save that assignment. Please try again.');
}

/**
 * Assigns every active student their next uncompleted roadmap topic for a date.
 * This is the action that turns "27 students" into one click.
 */
export async function bulkAssignAction(
  _prev: unknown,
  formData: FormData,
): Promise<Result<{ assigned: number }>> {
  return guarded(async () => {
    const user = await requireAdminAction();
    const parsed = bulkAssignmentSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fail('Check the date and duration.', fieldErrors(parsed.error));

    const { cohortId, date, plannedMinutes } = parsed.data;

    const members = await db
      .select({ id: cohortMembers.id })
      .from(cohortMembers)
      .where(and(eq(cohortMembers.cohortId, cohortId), eq(cohortMembers.status, 'active')));

    let assigned = 0;
    for (const member of members) {
      const next = await db
        .select({ id: roadmapTopics.id })
        .from(roadmapTopics)
        .innerJoin(roadmaps, eq(roadmaps.id, roadmapTopics.roadmapId))
        .where(
          and(
            eq(roadmaps.memberId, member.id),
            inArray(roadmapTopics.status, ['in_progress', 'upcoming']),
          ),
        )
        .orderBy(asc(roadmapTopics.status), asc(roadmapTopics.position))
        .limit(1);

      if (!next[0]) continue;

      await db
        .insert(dailyAssignments)
        .values({
          memberId: member.id,
          date,
          topicId: next[0].id,
          plannedMinutes,
        })
        .onConflictDoUpdate({
          target: [dailyAssignments.memberId, dailyAssignments.date],
          set: { topicId: next[0].id, plannedMinutes },
        });
      assigned += 1;
    }

    await recordAudit({
      actorUserId: user.id,
      action: 'assignment.bulk',
      entity: 'cohort',
      entityId: cohortId,
      payload: { date, assigned },
    });

    revalidatePath('/admin/roadmaps');
    revalidatePath('/');
    return ok({ assigned });
  }, 'We could not assign topics. Please try again.');
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
    revalidatePath('/');
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
    });
    if (!parsed.success) return fail('Check the highlighted fields.', fieldErrors(parsed.error));

    const input = parsed.data;
    if (announcementId) {
      await db
        .update(announcements)
        .set({ title: input.title, body: input.body, isPinned: input.isPinned })
        .where(
          and(eq(announcements.id, announcementId), eq(announcements.cohortId, input.cohortId)),
        );
    } else {
      await db.insert(announcements).values({
        cohortId: input.cohortId,
        title: input.title,
        body: input.body,
        isPinned: input.isPinned,
        createdBy: user.id,
      });
    }

    revalidatePath('/admin/events');
    revalidatePath('/');
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
    revalidatePath('/');
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
      topicKey: input.topicKey ?? null,
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
