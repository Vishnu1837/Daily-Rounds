import { and, eq, sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SessionUser } from '@/lib/auth/session';
import { scorePercent } from '@/lib/assessments/grade';
import { BEHAVIOUR_EVENTS, DEFAULT_POINT_RULES, quizPoints } from '@/lib/domain/points';

import { createTestCohort, createTestMember, db, schema } from './helpers/db';

/**
 * What sitting an assessment is worth, and what it can never be worth.
 *
 * Assessments awarded nothing at all before this: a student could sit a timed paper and
 * watch their points not move, which is the clearest way a product can say the work did not
 * count. They now pay through `quiz_attempt` / `quiz_bonus` — the events that already exist
 * for this shape of thing — rather than through a scoring path of their own.
 *
 * The constraint that matters more than the amount: neither event is in `BEHAVIOUR_EVENTS`,
 * so no assessment result can move consistency or outrank showing up (ADR-004). That is
 * asserted here rather than left to the reader.
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

function sessionUser(id: string): SessionUser {
  return {
    id,
    email: `${id}@test.local`,
    fullName: 'Test User',
    role: 'student',
    timezone: 'Asia/Kolkata',
    avatarSeed: 'test',
    avatarUrl: null,
    mbbsYear: 2,
    university: null,
    whatsapp: null,
    onboardingCompletedAt: new Date('2025-08-01T00:00:00Z'),
  };
}

/** Two MCQs and one written question, published. */
async function createAssessment(cohortId: string) {
  const [assessment] = await db
    .insert(schema.assessments)
    .values({
      cohortId,
      title: 'Inflammation check',
      status: 'published',
      defaultQuestionSeconds: 600,
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
        options: ['Neutrophil', 'Macrophage'],
        correctIndex: 0,
        explanation: 'Neutrophils dominate the first 24 hours.',
        points: 1,
      },
      {
        assessmentId: assessment!.id,
        position: 1,
        type: 'mcq',
        prompt: 'Which mediator causes vasodilation?',
        options: ['Histamine', 'Fibrin'],
        correctIndex: 0,
        explanation: 'Histamine acts on H1 receptors.',
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

async function ledgerFor(memberId: string) {
  return db
    .select({
      event: schema.pointsLedger.event,
      points: schema.pointsLedger.points,
      key: schema.pointsLedger.idempotencyKey,
    })
    .from(schema.pointsLedger)
    .where(eq(schema.pointsLedger.memberId, memberId));
}

/** Sits the paper, answering the MCQs as told, and submits. */
async function sit(
  assessmentId: string,
  questions: { id: string; type: string }[],
  mcqAnswers: number[],
  writtenAnswer?: string,
) {
  const { startAttemptAction, openQuestionAction, submitAnswerAction, submitAttemptAction } =
    await import('@/server/actions/assessments');

  const started = await startAttemptAction(assessmentId);
  if (!started.ok) throw new Error(started.message);
  const attemptId = started.data.attemptId;

  const mcqs = questions.filter((q) => q.type === 'mcq');
  for (const [i, question] of mcqs.entries()) {
    await openQuestionAction(attemptId, question.id);
    await submitAnswerAction({ attemptId, questionId: question.id, selectedIndex: mcqAnswers[i] });
  }

  const written = questions.find((q) => q.type === 'short_answer');
  if (written && writtenAnswer !== undefined) {
    await openQuestionAction(attemptId, written.id);
    await submitAnswerAction({ attemptId, questionId: written.id, textAnswer: writtenAnswer });
  }

  const submitted = await submitAttemptAction(attemptId);
  if (!submitted.ok) throw new Error(submitted.message);
  return attemptId;
}

beforeEach(() => {
  state.user = null;
});

describe('assessment points', () => {
  it('pays for the sitting and for accuracy on the auto-marked questions', async () => {
    const { cohort } = await createTestCohort();
    const student = await createTestMember(cohort.id);
    const { assessment, questions } = await createAssessment(cohort.id);
    state.user = sessionUser(student.user.id);

    const attemptId = await sit(assessment.id, questions, [0, 0], 'Rubor, calor, tumor, dolor.');

    const entries = await ledgerFor(student.memberId);
    const expected = quizPoints(2, 2, DEFAULT_POINT_RULES);

    const attemptEntry = entries.find((e) => e.event === 'quiz_attempt');
    const bonusEntry = entries.find((e) => e.event === 'quiz_bonus');

    expect(attemptEntry?.points).toBe(expected.attempt);
    expect(bonusEntry?.points).toBe(expected.bonus);
    // Keyed on the attempt, so a second sitting is payable and a replay is not.
    expect(attemptEntry?.key).toContain(attemptId);
  });

  it('pays the sitting but no accuracy bonus when nothing was right', async () => {
    const { cohort } = await createTestCohort();
    const student = await createTestMember(cohort.id);
    const { assessment, questions } = await createAssessment(cohort.id);
    state.user = sessionUser(student.user.id);

    await sit(assessment.id, questions, [1, 1]);

    const entries = await ledgerFor(student.memberId);
    expect(entries.find((e) => e.event === 'quiz_attempt')?.points).toBe(
      DEFAULT_POINT_RULES.quiz_attempt,
    );
    // A zero-value award is never written at all — `awardPoints` skips those.
    expect(entries.find((e) => e.event === 'quiz_bonus')).toBeUndefined();
  });

  it('re-submitting pays nothing more', async () => {
    const { cohort } = await createTestCohort();
    const student = await createTestMember(cohort.id);
    const { assessment, questions } = await createAssessment(cohort.id);
    state.user = sessionUser(student.user.id);

    const attemptId = await sit(assessment.id, questions, [0, 0]);
    const before = await ledgerFor(student.memberId);

    const { submitAttemptAction } = await import('@/server/actions/assessments');
    await submitAttemptAction(attemptId);
    await submitAttemptAction(attemptId);

    expect(await ledgerFor(student.memberId)).toHaveLength(before.length);
  });

  it('a second sitting is a separate award, not a duplicate', async () => {
    const { cohort } = await createTestCohort();
    const student = await createTestMember(cohort.id);
    const { assessment, questions } = await createAssessment(cohort.id);
    state.user = sessionUser(student.user.id);

    const first = await sit(assessment.id, questions, [0, 0]);
    const second = await sit(assessment.id, questions, [0, 0]);

    expect(second).not.toBe(first);
    const attempts = (await ledgerFor(student.memberId)).filter((e) => e.event === 'quiz_attempt');
    expect(attempts).toHaveLength(2);
  });

  it('cannot move consistency, however well the student did', async () => {
    // Structural, not a matter of choosing small numbers: neither event is a behaviour
    // event, and `dayScore` only counts behaviour events. See ADR-004.
    expect(BEHAVIOUR_EVENTS).not.toContain('quiz_attempt');
    expect(BEHAVIOUR_EVENTS).not.toContain('quiz_bonus');

    const { cohort } = await createTestCohort();
    const student = await createTestMember(cohort.id);
    const { assessment, questions } = await createAssessment(cohort.id);
    state.user = sessionUser(student.user.id);

    await sit(assessment.id, questions, [0, 0]);

    const [activity] = await db
      .select()
      .from(schema.dailyActivity)
      .where(eq(schema.dailyActivity.memberId, student.memberId));

    expect(activity!.points).toBeGreaterThan(0);
    expect(activity!.scorePct).toBe(0);
    expect(activity!.showedUp).toBe(false);
  });

  it('leaves the written answer unmarked and the attempt pending review', async () => {
    const { cohort } = await createTestCohort();
    const student = await createTestMember(cohort.id);
    const { assessment, questions } = await createAssessment(cohort.id);
    state.user = sessionUser(student.user.id);

    const attemptId = await sit(assessment.id, questions, [0, 0], 'Rubor, calor, tumor, dolor.');

    const [attempt] = await db
      .select()
      .from(schema.assessmentAttempts)
      .where(eq(schema.assessmentAttempts.id, attemptId));
    expect(attempt!.reviewStatus).toBe('pending');

    const written = questions.find((q) => q.type === 'short_answer')!;
    const [answer] = await db
      .select()
      .from(schema.assessmentAnswers)
      .where(
        and(
          eq(schema.assessmentAnswers.attemptId, attemptId),
          eq(schema.assessmentAnswers.questionId, written.id),
        ),
      );
    // `null`, not `false`: nobody has decided yet, which is what the queue looks for.
    expect(answer!.isCorrect).toBeNull();
  });
});

describe('the review queue', () => {
  it('lists only attempts a human still has to mark, oldest first', async () => {
    await db.delete(schema.assessmentAttempts);
    const ctx = await createTestCohort();
    const { assessment, questions } = await createAssessment(ctx.cohort.id);

    const waited = await createTestMember(ctx.cohort.id, { fullName: 'Waited Longest' });
    const recent = await createTestMember(ctx.cohort.id, { fullName: 'Sat Just Now' });
    const clean = await createTestMember(ctx.cohort.id, { fullName: 'No Written Answer' });

    state.user = sessionUser(waited.user.id);
    const oldAttempt = await sit(assessment.id, questions, [0, 0], 'An answer from last week.');
    await db
      .update(schema.assessmentAttempts)
      .set({ submittedAt: new Date(Date.now() - 7 * 86_400_000) })
      .where(eq(schema.assessmentAttempts.id, oldAttempt));

    state.user = sessionUser(recent.user.id);
    await sit(assessment.id, questions, [0, 0], 'An answer from today.');

    // Left the written question blank: nothing for anyone to mark.
    state.user = sessionUser(clean.user.id);
    await sit(assessment.id, questions, [0, 0]);

    const { getReviewQueue } = await import('@/server/queries/assessments');
    const queue = await getReviewQueue({ cohort: ctx.cohort });

    expect(queue.map((r) => r.studentName)).toEqual(['Waited Longest', 'Sat Just Now']);
    expect(queue[0]!.waitingDays).toBe(7);
    expect(queue[0]!.unmarked).toBe(1);
    expect(queue[0]!.assessmentTitle).toBe('Inflammation check');
  });
});

describe('the badge engine and the result screen answer the same question', () => {
  it('counts a pass on the marked questions, as the student was already told', async () => {
    const ctx = await createTestCohort();
    const student = await createTestMember(ctx.cohort.id);
    const { assessment, questions } = await createAssessment(ctx.cohort.id);
    state.user = sessionUser(student.user.id);

    // Both MCQs right (2 of 2), and an essay worth 2 more points left unmarked. The pass
    // mark is 60%.
    const attemptId = await sit(assessment.id, questions, [0, 0], 'An answer for a human.');

    const [attempt] = await db
      .select()
      .from(schema.assessmentAttempts)
      .where(eq(schema.assessmentAttempts.id, attemptId));

    expect(attempt!.reviewStatus).toBe('pending');

    // What the student is shown: the unmarked half counts towards neither side.
    const shown = scorePercent(attempt!, false);
    expect(shown.pct).toBe(100);
    expect(shown.provisional).toBe(true);
    expect(shown.pct).toBeGreaterThanOrEqual(assessment.passMarkPct);

    /*
     * What the badge engine now sees. It used to divide by the whole paper while the essay
     * scored zero — 2 of 4, 50%, below the pass mark — so a student told they had passed was
     * quietly denied the badge until somebody marked their essay. With a marking backlog,
     * that is indefinitely.
     */
    const badge = await db
      .select({
        passed: sql<number>`count(*) FILTER (
            WHERE (
              ${schema.assessmentAttempts.autoTotal} + CASE
                WHEN ${schema.assessmentAttempts.reviewStatus} = 'pending' THEN 0
                ELSE ${schema.assessmentAttempts.manualTotal}
              END
            ) > 0
              AND round(
                100.0 * (
                  ${schema.assessmentAttempts.autoScore} + CASE
                    WHEN ${schema.assessmentAttempts.reviewStatus} = 'pending' THEN 0
                    ELSE ${schema.assessmentAttempts.manualScore}
                  END
                )
                / (
                  ${schema.assessmentAttempts.autoTotal} + CASE
                    WHEN ${schema.assessmentAttempts.reviewStatus} = 'pending' THEN 0
                    ELSE ${schema.assessmentAttempts.manualTotal}
                  END
                )
              ) >= ${schema.assessments.passMarkPct}
          )::int`,
      })
      .from(schema.assessmentAttempts)
      .innerJoin(
        schema.assessments,
        eq(schema.assessments.id, schema.assessmentAttempts.assessmentId),
      )
      .where(eq(schema.assessmentAttempts.id, attemptId));

    expect(badge[0]!.passed).toBe(1);
  });
});
