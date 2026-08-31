'use server';

import { and, asc, eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';

import { db } from '@/db/client';
import {
  cohortMembers,
  cohorts,
  dailyAssignments,
  roadmapTopics,
  roadmapWeeks,
  roadmaps,
  studentGoals,
  subjects,
  users,
} from '@/db/schema';
import { requireUserAction } from '@/lib/auth/guards';
import { todayInTimezone } from '@/lib/domain/calendar';
import { templateForSubject } from '@/lib/roadmap-templates';
import { SUBJECTS } from '@/lib/subjects';
import { fieldErrors, onboardingSchema, profileSchema } from '@/lib/validation';

import { type Result, fail, guarded, ok } from './shared';

/**
 * Completes onboarding: stores the profile and baseline, joins the active cohort, and
 * builds a starting roadmap so the student has something real on day one.
 */
export async function completeOnboardingAction(
  _prev: unknown,
  formData: FormData,
): Promise<Result> {
  const outcome = await guarded(async () => {
    const user = await requireUserAction();

    const parsed = onboardingSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return fail('Some answers need a second look.', fieldErrors(parsed.error));
    }
    const input = parsed.data;

    const cohortRows = await db
      .select()
      .from(cohorts)
      .where(eq(cohorts.isActive, true))
      .orderBy(asc(cohorts.startDate))
      .limit(1);

    const cohort = cohortRows[0];
    if (!cohort) {
      return fail(
        'There is no active cohort to join yet. Ask your cohort lead to open one, then try again.',
      );
    }

    await db
      .update(users)
      .set({
        fullName: input.fullName,
        whatsapp: input.whatsapp,
        university: input.university,
        mbbsYear: input.mbbsYear,
        timezone: input.timezone,
        onboardingCompletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    const [membership] = await db
      .insert(cohortMembers)
      .values({ cohortId: cohort.id, userId: user.id, status: 'active' })
      .onConflictDoUpdate({
        target: [cohortMembers.cohortId, cohortMembers.userId],
        set: { status: 'active' },
      })
      .returning();

    if (!membership) return fail('We could not add you to the cohort. Please try again.');

    await db
      .insert(studentGoals)
      .values({
        memberId: membership.id,
        primarySubjectId: input.primarySubjectId,
        secondarySubjectId: input.secondarySubjectId ?? null,
        cohortGoal: input.cohortGoal,
        dailyCommitmentMinutes: input.dailyCommitmentMinutes,
        examName: input.examName ?? null,
        examDate: input.examDate ?? null,
        baselineDaysStudiedLastWeek: input.baselineDaysStudiedLastWeek,
        baselineConsistencyRating: input.baselineConsistencyRating,
        baselineConfidence: input.baselineConfidence,
        biggestObstacle: input.biggestObstacle,
        obstacleNote: input.obstacleNote ?? null,
      })
      .onConflictDoUpdate({
        target: studentGoals.memberId,
        set: {
          primarySubjectId: input.primarySubjectId,
          secondarySubjectId: input.secondarySubjectId ?? null,
          cohortGoal: input.cohortGoal,
          dailyCommitmentMinutes: input.dailyCommitmentMinutes,
          examName: input.examName ?? null,
          examDate: input.examDate ?? null,
          baselineDaysStudiedLastWeek: input.baselineDaysStudiedLastWeek,
          baselineConsistencyRating: input.baselineConsistencyRating,
          baselineConfidence: input.baselineConfidence,
          biggestObstacle: input.biggestObstacle,
          obstacleNote: input.obstacleNote ?? null,
        },
      });

    await ensureStartingRoadmap({
      memberId: membership.id,
      subjectId: input.primarySubjectId,
      dailyMinutes: input.dailyCommitmentMinutes,
      cohortTimezone: cohort.timezone,
    });

    return ok();
  }, 'We could not finish setting up your account. Nothing was lost — please try again.');

  if (outcome.ok) redirect('/');
  return outcome;
}

/**
 * Gives a member a roadmap if they do not have one, seeded from the curated template for
 * their subject. Also assigns today's topic so the home screen is never empty.
 */
export async function ensureStartingRoadmap(args: {
  memberId: string;
  subjectId: string;
  dailyMinutes: number;
  cohortTimezone: string;
}): Promise<void> {
  const existing = await db
    .select({ id: roadmaps.id })
    .from(roadmaps)
    .where(eq(roadmaps.memberId, args.memberId))
    .limit(1);

  if (existing.length > 0) return;

  const subjectRows = await db
    .select()
    .from(subjects)
    .where(eq(subjects.id, args.subjectId))
    .limit(1);
  const subject = subjectRows[0];
  if (!subject) return;

  const template = templateForSubject(subject.slug);

  const [roadmap] = await db
    .insert(roadmaps)
    .values({
      memberId: args.memberId,
      subjectId: subject.id,
      title: template?.title ?? `${subject.name} — your roadmap`,
      track: template?.track ?? null,
    })
    .returning();

  if (!roadmap || !template) return;

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

  const topicRows = await db
    .insert(roadmapTopics)
    .values(
      template.weeks.flatMap((w, wi) =>
        w.topics.map((title, ti) => ({
          roadmapId: roadmap.id,
          weekId: weekRows[wi]!.id,
          title,
          // Carries the week's place in the curriculum, so quizzes and materials attach.
          curriculumRef: w.ref,
          position: wi * 100 + ti,
          estimatedMinutes: args.dailyMinutes,
          status: (wi === 0 && ti === 0 ? 'in_progress' : 'upcoming') as 'in_progress' | 'upcoming',
        })),
      ),
    )
    .returning();

  const first = topicRows.sort((a, b) => a.position - b.position)[0];
  if (!first) return;

  await db
    .insert(dailyAssignments)
    .values({
      memberId: args.memberId,
      date: todayInTimezone(args.cohortTimezone),
      topicId: first.id,
      plannedMinutes: args.dailyMinutes,
    })
    .onConflictDoNothing({ target: [dailyAssignments.memberId, dailyAssignments.date] });
}

export async function updateProfileAction(_prev: unknown, formData: FormData): Promise<Result> {
  return guarded(async () => {
    const user = await requireUserAction();
    const parsed = profileSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fail('Check the highlighted fields.', fieldErrors(parsed.error));

    await db
      .update(users)
      .set({
        fullName: parsed.data.fullName,
        whatsapp: parsed.data.whatsapp ?? null,
        university: parsed.data.university ?? null,
        mbbsYear: parsed.data.mbbsYear ?? null,
        timezone: parsed.data.timezone,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    return ok();
  }, 'We could not save your profile. Please try again.');
}

/** Subject list for onboarding and admin pickers. */
/**
 * The subject catalogue in course order, each row carrying the phase it is taught in.
 *
 * Ordering comes from the curriculum rather than from the database, because "Anatomy first,
 * Radiodiagnosis last" is a fact about the MBBS course, not about our rows.
 */
export async function listSubjects() {
  const rows = await db.select().from(subjects);
  const order = new Map<string, { index: number; phaseLabel: string }>(
    SUBJECTS.map((s, i) => [s.slug, { index: i, phaseLabel: s.phaseLabel }]),
  );

  return rows
    .map((row) => ({
      ...row,
      phaseLabel: order.get(row.slug)?.phaseLabel ?? 'Other',
      courseIndex: order.get(row.slug)?.index ?? Number.MAX_SAFE_INTEGER,
    }))
    .sort((a, b) => a.courseIndex - b.courseIndex || a.name.localeCompare(b.name));
}

/** Whether the signed-in user already belongs to an active cohort. */
export async function hasActiveMembership(userId: string): Promise<boolean> {
  const rows = await db
    .select({ id: cohortMembers.id })
    .from(cohortMembers)
    .where(and(eq(cohortMembers.userId, userId), eq(cohortMembers.status, 'active')))
    .limit(1);
  return rows.length > 0;
}
