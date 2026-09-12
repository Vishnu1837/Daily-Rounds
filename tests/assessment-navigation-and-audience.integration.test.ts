import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SessionUser } from '@/lib/auth/session';

import { createTestCohort, createTestMember, db, schema } from './helpers/db';

/**
 * Three things the assessment engine learned to do, against a real database.
 *
 *  - **One clock for the whole paper**, as an alternative to a timer on every question. The
 *    rule that matters is the negative one: under that mode nothing is allowed to expire a
 *    question on its own, however long the student spent elsewhere.
 *  - **Going back.** A student can leave a question and return to it, which introduced a way
 *    to lose marks that could not exist in a forward-only runner — a save posted on the way
 *    back into a question whose clock has since run out, taken at face value, would store
 *    "expired, nothing selected" over an answer given in time.
 *  - **Who an assessment is for.** Published no longer means visible to everyone, and the
 *    test that counts is that a student outside the audience cannot *start* it, not merely
 *    that they cannot see it in a list.
 */

const state: { user: SessionUser | null } = { user: null };

vi.mock('@/lib/auth/session', () => ({
  getCurrentUser: async () => state.user,
  SESSION_COOKIE: 'dr_session',
}));

vi.mock('next/cache', () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
  updateTag: () => {},
  cacheTag: () => {},
  cacheLife: () => {},
}));

function sessionUser(id: string, role: 'student' | 'admin'): SessionUser {
  return {
    id,
    email: `${id}@test.local`,
    fullName: 'Test User',
    role,
    timezone: 'Asia/Kolkata',
    avatarSeed: 'test',
    avatarUrl: null,
    mbbsYear: 2,
    university: null,
    whatsapp: null,
    onboardingCompletedAt: new Date('2025-08-01T00:00:00Z'),
  };
}

/** A published three-MCQ paper, timed however the caller asks for. */
async function createAssessment(
  cohortId: string,
  options?: {
    timerMode?: 'per_question' | 'whole_paper';
    totalTimeSeconds?: number | null;
    audience?: 'everyone' | 'selected';
  },
) {
  const [assessment] = await db
    .insert(schema.assessments)
    .values({
      cohortId,
      title: 'Mock paper',
      status: 'published',
      timerMode: options?.timerMode ?? 'per_question',
      defaultQuestionSeconds: 60,
      totalTimeSeconds: options?.totalTimeSeconds ?? null,
      audience: options?.audience ?? 'everyone',
      publishedAt: new Date(),
    })
    .returning();

  const questions = await db
    .insert(schema.assessmentQuestions)
    .values(
      [0, 1, 2].map((position) => ({
        assessmentId: assessment!.id,
        position,
        type: 'mcq' as const,
        prompt: `Question ${position + 1}?`,
        options: ['A', 'B', 'C', 'D'],
        correctIndex: 0,
        points: 1,
      })),
    )
    .returning();

  return { assessment: assessment!, questions };
}

const answerRow = async (attemptId: string, questionId: string) =>
  (
    await db
      .select()
      .from(schema.assessmentAnswers)
      .where(
        and(
          eq(schema.assessmentAnswers.attemptId, attemptId),
          eq(schema.assessmentAnswers.questionId, questionId),
        ),
      )
      .limit(1)
  )[0];

/** Pushes a question's start far enough into the past that its 60 seconds are gone. */
async function windBack(attemptId: string, questionId: string) {
  await db
    .update(schema.assessmentAnswers)
    .set({ startedAt: new Date(Date.now() - 10 * 60 * 1000) })
    .where(
      and(
        eq(schema.assessmentAnswers.attemptId, attemptId),
        eq(schema.assessmentAnswers.questionId, questionId),
      ),
    );
}

beforeEach(() => {
  state.user = null;
});

describe('one clock for the whole paper', () => {
  it('gives a question no deadline of its own, however long the student is away', async () => {
    const { cohort } = await createTestCohort();
    const student = await createTestMember(cohort.id);
    const { assessment, questions } = await createAssessment(cohort.id, {
      timerMode: 'whole_paper',
      totalTimeSeconds: 3600,
    });

    state.user = sessionUser(student.user.id, 'student');
    const { openQuestionAction, startAttemptAction, submitAnswerAction } =
      await import('@/server/actions/assessments');

    const started = await startAttemptAction(assessment.id);
    if (!started.ok) throw new Error('attempt did not start');
    const attemptId = started.data.attemptId;

    const opened = await openQuestionAction(attemptId, questions[0]!.id);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    // No per-question clock exists, so there is no instant to hand back.
    expect(opened.data.deadline).toBeNull();

    // Ten minutes on question one is exactly what this mode is for.
    await windBack(attemptId, questions[0]!.id);

    const saved = await submitAnswerAction({
      attemptId,
      questionId: questions[0]!.id,
      selectedIndex: 0,
    });

    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.data.expired).toBe(false);

    const stored = await answerRow(attemptId, questions[0]!.id);
    expect(stored?.expired).toBe(false);
    expect(stored?.selectedIndex).toBe(0);
  });

  it('still ends the sitting when the paper clock itself runs out', async () => {
    const { cohort } = await createTestCohort();
    const student = await createTestMember(cohort.id);
    const { assessment, questions } = await createAssessment(cohort.id, {
      timerMode: 'whole_paper',
      totalTimeSeconds: 60,
    });

    state.user = sessionUser(student.user.id, 'student');
    const { openQuestionAction, startAttemptAction, submitAnswerAction } =
      await import('@/server/actions/assessments');

    const started = await startAttemptAction(assessment.id);
    if (!started.ok) throw new Error('attempt did not start');
    const attemptId = started.data.attemptId;
    await openQuestionAction(attemptId, questions[0]!.id);

    // The paper's own deadline, moved into the past.
    await db
      .update(schema.assessmentAttempts)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(schema.assessmentAttempts.id, attemptId));

    const saved = await submitAnswerAction({
      attemptId,
      questionId: questions[0]!.id,
      selectedIndex: 0,
    });

    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.data.expired).toBe(true);
  });

  it('sends the runtime no per-question timers at all', async () => {
    const { cohort } = await createTestCohort();
    const student = await createTestMember(cohort.id);
    const { assessment, questions } = await createAssessment(cohort.id, {
      timerMode: 'whole_paper',
      totalTimeSeconds: 1800,
    });

    state.user = sessionUser(student.user.id, 'student');
    const { openQuestionAction, startAttemptAction } = await import('@/server/actions/assessments');
    const { getAttemptRuntime } = await import('@/server/queries/assessments');

    const started = await startAttemptAction(assessment.id);
    if (!started.ok) throw new Error('attempt did not start');
    await openQuestionAction(started.data.attemptId, questions[0]!.id);

    const runtime = await getAttemptRuntime({
      attemptId: started.data.attemptId,
      memberId: student.memberId,
    });

    expect(runtime?.timerMode).toBe('whole_paper');
    expect(runtime?.questions.every((q) => q.deadline === null)).toBe(true);
    expect(runtime?.questions.every((q) => q.timeLimitSeconds === null)).toBe(true);
    // The paper's clock is still there, and it is the only one.
    expect(runtime?.expiresAt).not.toBeNull();
  });
});

describe('going back to a question', () => {
  it('never erases an answer given in time when a later save arrives past the deadline', async () => {
    const { cohort } = await createTestCohort();
    const student = await createTestMember(cohort.id);
    const { assessment, questions } = await createAssessment(cohort.id);

    state.user = sessionUser(student.user.id, 'student');
    const { openQuestionAction, startAttemptAction, submitAnswerAction } =
      await import('@/server/actions/assessments');

    const started = await startAttemptAction(assessment.id);
    if (!started.ok) throw new Error('attempt did not start');
    const attemptId = started.data.attemptId;

    await openQuestionAction(attemptId, questions[0]!.id);
    await submitAnswerAction({ attemptId, questionId: questions[0]!.id, selectedIndex: 0 });

    // Answered in time, then left behind. Its clock runs out while the student is elsewhere,
    // and coming back posts one more save.
    await windBack(attemptId, questions[0]!.id);
    const late = await submitAnswerAction({
      attemptId,
      questionId: questions[0]!.id,
      selectedIndex: 0,
      markedForReview: true,
    });

    expect(late.ok).toBe(true);
    const stored = await answerRow(attemptId, questions[0]!.id);
    // The answer stands. Looking at your own work is not a way to lose a mark.
    expect(stored?.selectedIndex).toBe(0);
    expect(stored?.expired).toBe(false);
    // And the flag, which is the one thing a late visit is still allowed to change.
    expect(stored?.markedForReview).toBe(true);
  });

  it('keeps the review flag across a reload', async () => {
    const { cohort } = await createTestCohort();
    const student = await createTestMember(cohort.id);
    const { assessment, questions } = await createAssessment(cohort.id, {
      timerMode: 'whole_paper',
      totalTimeSeconds: 3600,
    });

    state.user = sessionUser(student.user.id, 'student');
    const { openQuestionAction, startAttemptAction, submitAnswerAction } =
      await import('@/server/actions/assessments');
    const { getAttemptRuntime } = await import('@/server/queries/assessments');

    const started = await startAttemptAction(assessment.id);
    if (!started.ok) throw new Error('attempt did not start');
    const attemptId = started.data.attemptId;

    await openQuestionAction(attemptId, questions[1]!.id);
    await submitAnswerAction({
      attemptId,
      questionId: questions[1]!.id,
      selectedIndex: null,
      markedForReview: true,
    });

    const runtime = await getAttemptRuntime({ attemptId, memberId: student.memberId });
    const second = runtime?.questions[1];
    expect(second?.markedForReview).toBe(true);
    // Seen but unanswered — what the palette draws as a skip.
    expect(second?.seen).toBe(true);
    expect(second?.selectedIndex).toBeNull();
    // And the first, never opened, is the other thing entirely.
    expect(runtime?.questions[0]?.seen).toBe(false);
  });

  it('lets an answer be changed after moving away and back', async () => {
    const { cohort } = await createTestCohort();
    const student = await createTestMember(cohort.id);
    const { assessment, questions } = await createAssessment(cohort.id, {
      timerMode: 'whole_paper',
      totalTimeSeconds: 3600,
    });

    state.user = sessionUser(student.user.id, 'student');
    const { openQuestionAction, startAttemptAction, submitAnswerAction, submitAttemptAction } =
      await import('@/server/actions/assessments');

    const started = await startAttemptAction(assessment.id);
    if (!started.ok) throw new Error('attempt did not start');
    const attemptId = started.data.attemptId;

    await openQuestionAction(attemptId, questions[0]!.id);
    await submitAnswerAction({ attemptId, questionId: questions[0]!.id, selectedIndex: 2 });
    await openQuestionAction(attemptId, questions[1]!.id);
    // Back to the first one, having thought better of it.
    await submitAnswerAction({ attemptId, questionId: questions[0]!.id, selectedIndex: 0 });

    await submitAttemptAction(attemptId);

    const stored = await answerRow(attemptId, questions[0]!.id);
    expect(stored?.selectedIndex).toBe(0);
    expect(stored?.isCorrect).toBe(true);
  });
});

describe('who an assessment is for', () => {
  it('hides a narrowly-published paper from everyone but its audience', async () => {
    const { cohort } = await createTestCohort();
    const admin = await createTestMember(cohort.id, { role: 'admin' });
    const tester = await createTestMember(cohort.id, { fullName: 'Test Account' });
    const other = await createTestMember(cohort.id, { fullName: 'Everyone Else' });
    const { assessment } = await createAssessment(cohort.id);

    state.user = sessionUser(admin.user.id, 'admin');
    const { setAssessmentAudienceAction } = await import('@/server/actions/assessments');
    const set = await setAssessmentAudienceAction(cohort.id, assessment.id, {
      audience: 'selected',
      memberIds: [tester.memberId],
    });
    expect(set.ok).toBe(true);

    const { getAssessmentBrief, getStudentAssessments } =
      await import('@/server/queries/assessments');

    const forTester = await getAssessmentBrief({
      assessmentId: assessment.id,
      cohortId: cohort.id,
      memberId: tester.memberId,
    });
    expect(forTester).not.toBeNull();

    const forOther = await getAssessmentBrief({
      assessmentId: assessment.id,
      cohortId: cohort.id,
      memberId: other.memberId,
    });
    // Not fetched and then hidden — un-fetchable.
    expect(forOther).toBeNull();

    const ctx = (memberId: string) => ({ memberId, cohort: { id: cohort.id } }) as never;
    expect(await getStudentAssessments(ctx(tester.memberId))).toHaveLength(1);
    expect(await getStudentAssessments(ctx(other.memberId))).toHaveLength(0);
  });

  it('refuses to start a sitting for someone outside the audience', async () => {
    const { cohort } = await createTestCohort();
    const admin = await createTestMember(cohort.id, { role: 'admin' });
    const tester = await createTestMember(cohort.id, { fullName: 'Test Account' });
    const other = await createTestMember(cohort.id, { fullName: 'Everyone Else' });
    const { assessment } = await createAssessment(cohort.id);

    state.user = sessionUser(admin.user.id, 'admin');
    const { setAssessmentAudienceAction, startAttemptAction } =
      await import('@/server/actions/assessments');
    await setAssessmentAudienceAction(cohort.id, assessment.id, {
      audience: 'selected',
      memberIds: [tester.memberId],
    });

    // A student who kept the URL from before the audience narrowed.
    state.user = sessionUser(other.user.id, 'student');
    const refused = await startAttemptAction(assessment.id);
    expect(refused.ok).toBe(false);

    state.user = sessionUser(tester.user.id, 'student');
    const allowed = await startAttemptAction(assessment.id);
    expect(allowed.ok).toBe(true);
  });

  it('opens the paper up again, and keeps the list for next time', async () => {
    const { cohort } = await createTestCohort();
    const admin = await createTestMember(cohort.id, { role: 'admin' });
    const tester = await createTestMember(cohort.id, { fullName: 'Test Account' });
    const other = await createTestMember(cohort.id, { fullName: 'Everyone Else' });
    const { assessment } = await createAssessment(cohort.id);

    state.user = sessionUser(admin.user.id, 'admin');
    const { setAssessmentAudienceAction } = await import('@/server/actions/assessments');
    await setAssessmentAudienceAction(cohort.id, assessment.id, {
      audience: 'selected',
      memberIds: [tester.memberId],
    });
    await setAssessmentAudienceAction(cohort.id, assessment.id, {
      audience: 'everyone',
      memberIds: [tester.memberId],
    });

    const { getAssessmentBrief, getAssessmentDetail } =
      await import('@/server/queries/assessments');

    const forOther = await getAssessmentBrief({
      assessmentId: assessment.id,
      cohortId: cohort.id,
      memberId: other.memberId,
    });
    expect(forOther).not.toBeNull();

    // The selection survives, so narrowing it again is one click rather than a rebuild.
    const detail = await getAssessmentDetail({ cohort: { id: cohort.id } }, assessment.id);
    expect(detail?.audience).toBe('everyone');
    expect(detail?.audienceMemberIds).toEqual([tester.memberId]);
  });

  it('refuses a member id belonging to another cohort', async () => {
    const { cohort } = await createTestCohort();
    const outside = await createTestCohort();
    const admin = await createTestMember(cohort.id, { role: 'admin' });
    const stranger = await createTestMember(outside.cohort.id, { fullName: 'Not Yours' });
    const { assessment } = await createAssessment(cohort.id);

    state.user = sessionUser(admin.user.id, 'admin');
    const { setAssessmentAudienceAction } = await import('@/server/actions/assessments');
    const result = await setAssessmentAudienceAction(cohort.id, assessment.id, {
      audience: 'selected',
      memberIds: [stranger.memberId],
    });

    // Every id was dropped, which leaves nobody — so the whole change is refused rather
    // than quietly saved as an assessment with an empty audience.
    expect(result.ok).toBe(false);

    const rows = await db
      .select()
      .from(schema.assessmentAudienceMembers)
      .where(eq(schema.assessmentAudienceMembers.assessmentId, assessment.id));
    expect(rows).toHaveLength(0);
  });
});
