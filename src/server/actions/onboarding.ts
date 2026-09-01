'use server';

import { and, asc, eq, inArray } from 'drizzle-orm';
import { redirect } from 'next/navigation';

import { db } from '@/db/client';
import { cohortMembers, cohorts, studentGoals, subjects, users } from '@/db/schema';
import { requireUserAction } from '@/lib/auth/guards';
import { todayInTimezone } from '@/lib/domain/calendar';
import { SUBJECTS } from '@/lib/subjects';
import {
  CHALLENGE_TO_OBSTACLE,
  challengesSchema,
  fieldErrors,
  onboardingSchema,
  profileSchema,
} from '@/lib/validation';

import { ensureRoadmaps } from '../roadmap';

import { type Result, fail, guarded, ok } from './shared';
import { STUDENT_HOME } from '@/lib/routes';

/**
 * Completes onboarding: stores the profile and baseline, joins the active cohort, and
 * generates a roadmap for each chosen subject straight from the master syllabus.
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

    // Checkboxes share a field name, which `Object.fromEntries` above would collapse to a
    // single value — so the challenge list is read off the FormData directly.
    const parsedChallenges = challengesSchema.safeParse(formData.getAll('challenges'));
    if (!parsedChallenges.success) {
      return fail('Some answers need a second look.', {
        challenges: 'Pick at least one — this is what the cohort is built to fix',
      });
    }
    const challenges = parsedChallenges.data;

    // `biggest_obstacle` still drives risk scoring and takes exactly one value, so it is
    // projected from the student's first-picked challenge unless they set it explicitly.
    const biggestObstacle =
      input.biggestObstacle ?? CHALLENGE_TO_OBSTACLE[challenges[0]!] ?? 'other';

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
        biggestObstacle,
        challenges,
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
          biggestObstacle,
          challenges,
          obstacleNote: input.obstacleNote ?? null,
        },
      });

    // Both chosen subjects become roadmaps here and now. Neither the student nor an admin
    // has to create topics afterwards — the syllabus already knows what they are.
    const chosen = await subjectSlugsById([
      input.primarySubjectId,
      input.secondarySubjectId ?? null,
    ]);

    await ensureRoadmaps({
      memberId: membership.id,
      primarySubjectSlug: chosen.get(input.primarySubjectId) ?? null,
      secondarySubjectSlug: input.secondarySubjectId
        ? (chosen.get(input.secondarySubjectId) ?? null)
        : null,
      dailyMinutes: input.dailyCommitmentMinutes,
      cohortTimezone: cohort.timezone,
      today: todayInTimezone(cohort.timezone),
    });

    return ok();
  }, 'We could not finish setting up your account. Nothing was lost — please try again.');

  if (outcome.ok) redirect(STUDENT_HOME);
  return outcome;
}

/**
 * Maps subject ids to their curriculum slugs.
 *
 * Onboarding posts subject *ids* because that is what the picker renders, while the
 * curriculum is keyed by slug. Nulls are dropped so callers can pass an optional second
 * subject straight through.
 */
async function subjectSlugsById(ids: (string | null)[]): Promise<Map<string, string>> {
  const wanted = ids.filter((id): id is string => Boolean(id));
  if (wanted.length === 0) return new Map();

  const rows = await db
    .select({ id: subjects.id, slug: subjects.slug })
    .from(subjects)
    .where(inArray(subjects.id, wanted));

  return new Map(rows.map((r) => [r.id, r.slug]));
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
