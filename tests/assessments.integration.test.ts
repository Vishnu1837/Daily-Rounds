import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SessionUser } from '@/lib/auth/session';

import { createTestCohort, createTestMember, db, schema } from './helpers/db';

/**
 * The assessment engine's non-negotiables, against a real database.
 *
 * These are the rules a UI cannot enforce and a reviewer cannot eyeball: that one student
 * can never reach another's result, that a refresh does not buy more time, that a question
 * whose clock has run out is stored as expired however the answer was posted, and that a
 * restart keeps the sitting it replaced rather than erasing it.
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

/** A published assessment: two MCQs and one written question. */
async function createAssessment(
  cohortId: string,
  options?: { totalTimeSeconds?: number; focusGraceSeconds?: number; passMarkPct?: number },
) {
  const [assessment] = await db
    .insert(schema.assessments)
    .values({
      cohortId,
      title: 'Inflammation check',
      status: 'published',
      defaultQuestionSeconds: 60,
      totalTimeSeconds: options?.totalTimeSeconds ?? null,
      focusGraceSeconds: options?.focusGraceSeconds ?? 5,
      passMarkPct: options?.passMarkPct ?? 60,
      publishedAt: new Date(),
    })
    .returning();

  const questions = await db
    .insert(schema.assessmentQuestions)
    .values([
      {
        assessmentId: assessment!.id,
        position: 0,
        type: 'mcq',
        prompt: 'Which cell arrives first in acute inflammation?',
        options: ['Neutrophil', 'Macrophage', 'Lymphocyte', 'Eosinophil'],
        correctIndex: 0,
        points: 1,
      },
      {
        assessmentId: assessment!.id,
        position: 1,
        type: 'mcq',
        prompt: 'Which mediator causes vasodilation?',
        options: ['Histamine', 'Thromboxane', 'Fibrin', 'Collagen'],
        correctIndex: 0,
        points: 1,
      },
      {
        assessmentId: assessment!.id,
        position: 2,
        type: 'short_answer',
        prompt: 'Name the cardinal signs of inflammation.',
        referenceAnswer: 'Rubor, calor, tumor, dolor, functio laesa.',
        points: 2,
      },
    ])
    .returning();

  return { assessment: assessment!, questions };
}

const attemptRow = async (id: string) =>
  (
    await db
      .select()
      .from(schema.assessmentAttempts)
      .where(eq(schema.assessmentAttempts.id, id))
      .limit(1)
  )[0];

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

beforeEach(() => {
  state.user = null;
});

describe('sitting an assessment', () => {
  it('reuses the running attempt rather than starting a second one', async () => {
    const { cohort } = await createTestCohort();
    const student = await createTestMember(cohort.id);
    const { assessment } = await createAssessment(cohort.id);

    state.user = sessionUser(student.user.id, 'student');
    const { startAttemptAction } = await import('@/server/actions/assessments');

    const first = await startAttemptAction(assessment.id);
    const second = await startAttemptAction(assessment.id);

    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    // A double tap on "Start assessment" must not hand out a fresh clock.
    expect(second.data.attemptId).toBe(first.data.attemptId);
  });

  it('fixes a question deadline once, so reopening does not extend it', async () => {
    const { cohort } = await createTestCohort();
    const student = await createTestMember(cohort.id);
    const { assessment, questions } = await createAssessment(cohort.id);

    state.user = sessionUser(student.user.id, 'student');
    const { openQuestionAction, startAttemptAction } = await import('@/server/actions/assessments');

    const started = await startAttemptAction(assessment.id);
    expect(started.ok).toBe(true);
    if (!started.ok) return;

    const first = await openQuestionAction(started.data.attemptId, questions[0]!.id);
    const again = await openQuestionAction(started.data.attemptId, questions[0]!.id);

    expect(first.ok && again.ok).toBe(true);
    if (!first.ok || !again.ok) return;
    // The same instant both times: refreshing the page is worth nothing.
    expect(again.data.deadline).toBe(first.data.deadline);
  });

  it('stores an answer that arrives after the deadline as expired', async () => {
    const { cohort } = await createTestCohort();
    const student = await createTestMember(cohort.id);
    const { assessment, questions } = await createAssessment(cohort.id);

    state.user = sessionUser(student.user.id, 'student');
    const { openQuestionAction, startAttemptAction, submitAnswerAction } =
      await import('@/server/actions/assessments');

    const started = await startAttemptAction(assessment.id);
    if (!started.ok) throw new Error('attempt did not start');
    await openQuestionAction(started.data.attemptId, questions[0]!.id);

    // Wind the clock back so the question's 60 seconds are long gone.
    await db
      .update(schema.assessmentAnswers)
      .set({ startedAt: new Date(Date.now() - 10 * 60 * 1000) })
      .where(eq(schema.assessmentAnswers.attemptId, started.data.attemptId));

    const result = await submitAnswerAction({
      attemptId: started.data.attemptId,
      questionId: questions[0]!.id,
      selectedIndex: 0,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.expired).toBe(true);

    // The answer is discarded, not merely flagged — a late correct answer scores nothing.
    const stored = await answerRow(started.data.attemptId, questions[0]!.id);
    expect(stored?.expired).toBe(true);
    expect(stored?.selectedIndex).toBeNull();
  });

  it('grades the auto-gradable questions and leaves the written one pending', async () => {
    const { cohort } = await createTestCohort();
    const student = await createTestMember(cohort.id);
    const { assessment, questions } = await createAssessment(cohort.id);

    state.user = sessionUser(student.user.id, 'student');
    const { openQuestionAction, startAttemptAction, submitAnswerAction, submitAttemptAction } =
      await import('@/server/actions/assessments');

    const started = await startAttemptAction(assessment.id);
    if (!started.ok) throw new Error('attempt did not start');
    const attemptId = started.data.attemptId;

    for (const question of questions) await openQuestionAction(attemptId, question.id);

    // One right, one wrong, and something written.
    await submitAnswerAction({ attemptId, questionId: questions[0]!.id, selectedIndex: 0 });
    await submitAnswerAction({ attemptId, questionId: questions[1]!.id, selectedIndex: 2 });
    await submitAnswerAction({
      attemptId,
      questionId: questions[2]!.id,
      textAnswer: 'Rubor, calor, tumor, dolor.',
    });

    const submitted = await submitAttemptAction(attemptId);
    expect(submitted.ok).toBe(true);

    const attempt = await attemptRow(attemptId);
    expect(attempt?.status).toBe('submitted');
    expect(attempt?.autoScore).toBe(1);
    expect(attempt?.autoTotal).toBe(2);
    // The written question counts towards the paper but is not marked yet.
    expect(attempt?.manualTotal).toBe(2);
    expect(attempt?.reviewStatus).toBe('pending');

    expect((await answerRow(attemptId, questions[0]!.id))?.isCorrect).toBe(true);
    expect((await answerRow(attemptId, questions[1]!.id))?.isCorrect).toBe(false);
  });
});

describe('integrity', () => {
  it('logs a short absence and lets the attempt continue', async () => {
    const { cohort } = await createTestCohort();
    const student = await createTestMember(cohort.id);
    const { assessment } = await createAssessment(cohort.id, { focusGraceSeconds: 5 });

    state.user = sessionUser(student.user.id, 'student');
    const { recordFocusEventAction, startAttemptAction } =
      await import('@/server/actions/assessments');

    const started = await startAttemptAction(assessment.id);
    if (!started.ok) throw new Error('attempt did not start');

    const result = await recordFocusEventAction(started.data.attemptId, 2_000);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.restarted).toBe(false);
    expect((await attemptRow(started.data.attemptId))?.status).toBe('in_progress');

    const events = await db
      .select()
      .from(schema.assessmentIntegrityEvents)
      .where(eq(schema.assessmentIntegrityEvents.attemptId, started.data.attemptId));
    expect(events).toHaveLength(1);
    expect(events[0]?.kind).toBe('focus_returned');
  });

  it('restarts past the threshold and keeps the sitting it replaced', async () => {
    const { cohort } = await createTestCohort();
    const student = await createTestMember(cohort.id);
    const { assessment } = await createAssessment(cohort.id, { focusGraceSeconds: 5 });

    state.user = sessionUser(student.user.id, 'student');
    const { recordFocusEventAction, startAttemptAction } =
      await import('@/server/actions/assessments');

    const started = await startAttemptAction(assessment.id);
    if (!started.ok) throw new Error('attempt did not start');
    const original = started.data.attemptId;

    const result = await recordFocusEventAction(original, 30_000);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.restarted).toBe(true);
    expect(result.data.newAttemptId).toBeTruthy();

    // The original is kept as evidence rather than deleted.
    const previous = await attemptRow(original);
    expect(previous?.status).toBe('invalidated');

    const replacement = await attemptRow(result.data.newAttemptId!);
    expect(replacement?.status).toBe('in_progress');
    expect(replacement?.attemptNumber).toBe((previous?.attemptNumber ?? 0) + 1);
    expect(replacement?.restartCount).toBe(1);

    // And the breach itself is on the record.
    const events = await db
      .select()
      .from(schema.assessmentIntegrityEvents)
      .where(eq(schema.assessmentIntegrityEvents.attemptId, original));
    expect(events.some((e) => e.kind === 'threshold_breached')).toBe(true);
  });
});

describe('who can see a result', () => {
  it('refuses another student the attempt, and gives the owner and the admin all of it', async () => {
    const { cohort } = await createTestCohort();
    const owner = await createTestMember(cohort.id, { fullName: 'Owner Student' });
    const other = await createTestMember(cohort.id, { fullName: 'Nosy Student' });
    const { assessment, questions } = await createAssessment(cohort.id);

    state.user = sessionUser(owner.user.id, 'student');
    const { openQuestionAction, startAttemptAction, submitAnswerAction, submitAttemptAction } =
      await import('@/server/actions/assessments');

    const started = await startAttemptAction(assessment.id);
    if (!started.ok) throw new Error('attempt did not start');
    const attemptId = started.data.attemptId;

    await openQuestionAction(attemptId, questions[0]!.id);
    await submitAnswerAction({ attemptId, questionId: questions[0]!.id, selectedIndex: 0 });
    await submitAttemptAction(attemptId);

    const { getAttemptDetail } = await import('@/server/queries/assessments');

    // The owner sees their own paper.
    const mine = await getAttemptDetail({
      attemptId,
      viewer: { kind: 'student', memberId: owner.memberId },
    });
    expect(mine).not.toBeNull();
    expect(mine?.correct).toBe(1);

    // A classmate asking for the same id gets nothing at all — not a redacted version.
    const theirs = await getAttemptDetail({
      attemptId,
      viewer: { kind: 'student', memberId: other.memberId },
    });
    expect(theirs).toBeNull();

    // The admin sees it, including the integrity log the student never gets.
    const asAdmin = await getAttemptDetail({
      attemptId,
      viewer: { kind: 'admin', cohortId: cohort.id },
    });
    expect(asAdmin).not.toBeNull();
    expect(Array.isArray(asAdmin?.integrity)).toBe(true);
    expect(mine?.integrity).toEqual([]);
  });

  it('withholds the correct answers when the admin turned review off', async () => {
    const { cohort } = await createTestCohort();
    const student = await createTestMember(cohort.id);
    const { assessment, questions } = await createAssessment(cohort.id);

    await db
      .update(schema.assessments)
      .set({ allowAnswerReview: false })
      .where(eq(schema.assessments.id, assessment.id));

    state.user = sessionUser(student.user.id, 'student');
    const { openQuestionAction, startAttemptAction, submitAnswerAction, submitAttemptAction } =
      await import('@/server/actions/assessments');

    const started = await startAttemptAction(assessment.id);
    if (!started.ok) throw new Error('attempt did not start');
    await openQuestionAction(started.data.attemptId, questions[0]!.id);
    await submitAnswerAction({
      attemptId: started.data.attemptId,
      questionId: questions[0]!.id,
      selectedIndex: 1,
    });
    await submitAttemptAction(started.data.attemptId);

    const { getAttemptDetail } = await import('@/server/queries/assessments');
    const result = await getAttemptDetail({
      attemptId: started.data.attemptId,
      viewer: { kind: 'student', memberId: student.memberId },
    });

    // They can see what they chose, but not which one was right.
    expect(result?.answers[0]?.selectedIndex).toBe(1);
    expect(result?.answers[0]?.correctIndex).toBeNull();
  });

  it('never hands a student the model answer to a written question', async () => {
    const { cohort } = await createTestCohort();
    const student = await createTestMember(cohort.id);
    const { assessment, questions } = await createAssessment(cohort.id);

    state.user = sessionUser(student.user.id, 'student');
    const { startAttemptAction, submitAttemptAction } =
      await import('@/server/actions/assessments');

    const started = await startAttemptAction(assessment.id);
    if (!started.ok) throw new Error('attempt did not start');
    await submitAttemptAction(started.data.attemptId);

    const { getAttemptDetail, getAttemptRuntime } = await import('@/server/queries/assessments');

    const result = await getAttemptDetail({
      attemptId: started.data.attemptId,
      viewer: { kind: 'student', memberId: student.memberId },
    });
    const written = result?.answers.find((a) => a.questionId === questions[2]!.id);
    expect(written?.referenceAnswer).toBeNull();

    // And a finished attempt cannot be reopened as a runtime at all.
    const runtime = await getAttemptRuntime({
      attemptId: started.data.attemptId,
      memberId: student.memberId,
    });
    expect(runtime).toBeNull();
  });

  it('keeps correct answers out of the runtime payload entirely', async () => {
    const { cohort } = await createTestCohort();
    const student = await createTestMember(cohort.id);
    const { assessment } = await createAssessment(cohort.id);

    state.user = sessionUser(student.user.id, 'student');
    const { startAttemptAction } = await import('@/server/actions/assessments');
    const started = await startAttemptAction(assessment.id);
    if (!started.ok) throw new Error('attempt did not start');

    const { getAttemptRuntime } = await import('@/server/queries/assessments');
    const runtime = await getAttemptRuntime({
      attemptId: started.data.attemptId,
      memberId: student.memberId,
    });

    expect(runtime).not.toBeNull();
    // Serialising the whole payload is the honest check: a correct answer anywhere in it is
    // an open book however carefully the interface hides it.
    const payload = JSON.stringify(runtime);
    expect(payload).not.toContain('correctIndex');
    expect(payload).not.toContain('referenceAnswer');
    expect(payload).not.toContain('explanation');
  });

  it('refuses a student who posts into an attempt that is not theirs', async () => {
    const { cohort } = await createTestCohort();
    const owner = await createTestMember(cohort.id);
    const other = await createTestMember(cohort.id);
    const { assessment, questions } = await createAssessment(cohort.id);

    state.user = sessionUser(owner.user.id, 'student');
    const { startAttemptAction, submitAnswerAction } = await import('@/server/actions/assessments');
    const started = await startAttemptAction(assessment.id);
    if (!started.ok) throw new Error('attempt did not start');

    // Now the other student posts an answer into it with the id they should not have.
    state.user = sessionUser(other.user.id, 'student');
    const result = await submitAnswerAction({
      attemptId: started.data.attemptId,
      questionId: questions[0]!.id,
      selectedIndex: 0,
    });

    expect(result.ok).toBe(false);
    expect(await answerRow(started.data.attemptId, questions[0]!.id)).toBeUndefined();
  });
});

describe('publishing', () => {
  it('refuses to publish a paper with no questions', async () => {
    const { cohort } = await createTestCohort();
    const admin = await createTestMember(cohort.id, { role: 'admin' });

    const [empty] = await db
      .insert(schema.assessments)
      .values({ cohortId: cohort.id, title: 'Empty', status: 'draft' })
      .returning();

    state.user = sessionUser(admin.user.id, 'admin');
    const { setAssessmentStatusAction } = await import('@/server/actions/assessments');

    const result = await setAssessmentStatusAction(cohort.id, empty!.id, 'published');
    expect(result.ok).toBe(false);
  });

  it('refuses to delete a paper someone has already sat', async () => {
    const { cohort } = await createTestCohort();
    const admin = await createTestMember(cohort.id, { role: 'admin' });
    const student = await createTestMember(cohort.id);
    const { assessment } = await createAssessment(cohort.id);

    state.user = sessionUser(student.user.id, 'student');
    const { startAttemptAction, deleteAssessmentAction } =
      await import('@/server/actions/assessments');
    await startAttemptAction(assessment.id);

    state.user = sessionUser(admin.user.id, 'admin');
    const result = await deleteAssessmentAction(cohort.id, assessment.id);

    expect(result.ok).toBe(false);
    // Still there, with its attempt history intact.
    const [row] = await db
      .select()
      .from(schema.assessments)
      .where(eq(schema.assessments.id, assessment.id));
    expect(row).toBeTruthy();
  });

  it('will not let questions change under a published paper', async () => {
    const { cohort } = await createTestCohort();
    const admin = await createTestMember(cohort.id, { role: 'admin' });
    const { assessment } = await createAssessment(cohort.id);

    state.user = sessionUser(admin.user.id, 'admin');
    const { saveQuestionsAction } = await import('@/server/actions/assessments');

    const result = await saveQuestionsAction(cohort.id, assessment.id, [
      {
        type: 'mcq',
        prompt: 'A replacement question?',
        options: ['Yes', 'No'],
        correctIndex: 0,
        points: 1,
      },
    ]);

    expect(result.ok).toBe(false);
  });
});
