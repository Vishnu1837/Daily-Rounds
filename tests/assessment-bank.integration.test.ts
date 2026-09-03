import { and, asc, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SessionUser } from '@/lib/auth/session';

import { createTestCohort, createTestMember, db, schema } from './helpers/db';

/**
 * Question banks, against a real database.
 *
 * The claims worth proving here are the ones a reviewer cannot see by reading a query: that
 * a sitting is drawn once and stays drawn, that two sittings of the same bank differ, that
 * a student meets every question before meeting any of them twice, that grading is out of
 * the twenty they were asked rather than the five hundred that exist, and that neither a
 * reload, a restart, nor a hand-written request can reach a question the draw did not give
 * them.
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

/**
 * A published assessment holding `bankSize` single-mark MCQs, of which each sitting draws
 * `questionsPerAttempt`. Option A is always the correct one, so a test can answer a whole
 * paper correctly without caring which questions it was given.
 */
async function createBankedAssessment(
  cohortId: string,
  options: { bankSize: number; questionsPerAttempt: number | null },
) {
  const [assessment] = await db
    .insert(schema.assessments)
    .values({
      cohortId,
      title: 'Pathology bank',
      status: 'published',
      defaultQuestionSeconds: 60,
      questionsPerAttempt: options.questionsPerAttempt,
      passMarkPct: 60,
      publishedAt: new Date(),
    })
    .returning();

  const questions = await db
    .insert(schema.assessmentQuestions)
    .values(
      Array.from({ length: options.bankSize }, (_, i) => ({
        assessmentId: assessment!.id,
        position: i,
        type: 'mcq' as const,
        prompt: `Bank question ${i + 1}`,
        options: ['Right', 'Wrong', 'Also wrong', 'Wrong too'],
        correctIndex: 0,
        points: 1,
      })),
    )
    .returning();

  return { assessment: assessment!, questions };
}

/** The question ids one attempt was actually given, in the order it was given them. */
async function paperOf(attemptId: string): Promise<string[]> {
  const rows = await db
    .select({ questionId: schema.assessmentAttemptQuestions.questionId })
    .from(schema.assessmentAttemptQuestions)
    .where(eq(schema.assessmentAttemptQuestions.attemptId, attemptId))
    .orderBy(asc(schema.assessmentAttemptQuestions.position));
  return rows.map((r) => r.questionId);
}

beforeEach(() => {
  state.user = null;
});

describe('drawing a sitting from a bank', () => {
  it('gives one sitting the window, not the bank', async () => {
    const cohort = await createTestCohort();
    const member = await createTestMember(cohort.cohort.id, { fullName: 'Asha' });
    const { assessment } = await createBankedAssessment(cohort.cohort.id, {
      bankSize: 60,
      questionsPerAttempt: 10,
    });

    state.user = sessionUser(member.user.id, 'student');
    const { startAttemptAction } = await import('@/server/actions/assessments');
    const started = await startAttemptAction(assessment.id);
    expect(started.ok).toBe(true);
    if (!started.ok) return;

    const { getAttemptRuntime } = await import('@/server/queries/assessments');
    const runtime = await getAttemptRuntime({
      attemptId: started.data.attemptId,
      memberId: member.memberId,
    });

    expect(runtime?.questions).toHaveLength(10);
    // Numbered 0–9 as a ten-question paper, whatever their positions in the bank.
    expect(runtime?.questions.map((q) => q.position)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('holds the paper still across reloads, so a refresh cannot reshuffle it', async () => {
    const cohort = await createTestCohort();
    const member = await createTestMember(cohort.cohort.id, { fullName: 'Bala' });
    const { assessment } = await createBankedAssessment(cohort.cohort.id, {
      bankSize: 60,
      questionsPerAttempt: 10,
    });

    state.user = sessionUser(member.user.id, 'student');
    const { startAttemptAction } = await import('@/server/actions/assessments');
    const first = await startAttemptAction(assessment.id);
    // The rules screen posting twice, or a reload landing back in the same attempt.
    const second = await startAttemptAction(assessment.id);
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    expect(second.data.attemptId).toBe(first.data.attemptId);

    const { getAttemptRuntime } = await import('@/server/queries/assessments');
    const a = await getAttemptRuntime({
      attemptId: first.data.attemptId,
      memberId: member.memberId,
    });
    const b = await getAttemptRuntime({
      attemptId: first.data.attemptId,
      memberId: member.memberId,
    });

    expect(a?.questions.map((q) => q.id)).toEqual(b?.questions.map((q) => q.id));
  });

  it('gives a second sitting different questions, and repeats none until the bank runs out', async () => {
    const cohort = await createTestCohort();
    const member = await createTestMember(cohort.cohort.id, { fullName: 'Chitra' });
    const { assessment } = await createBankedAssessment(cohort.cohort.id, {
      bankSize: 50,
      questionsPerAttempt: 10,
    });

    state.user = sessionUser(member.user.id, 'student');
    const { startAttemptAction, submitAttemptAction } =
      await import('@/server/actions/assessments');

    const papers: string[][] = [];
    // Five sittings of ten out of a bank of fifty: exactly enough to cover it once.
    for (let sitting = 0; sitting < 5; sitting += 1) {
      const started = await startAttemptAction(assessment.id);
      expect(started.ok).toBe(true);
      if (!started.ok) return;
      papers.push(await paperOf(started.data.attemptId));
      await submitAttemptAction(started.data.attemptId);
    }

    const everything = papers.flat();
    expect(everything).toHaveLength(50);
    // Not one question came round twice while there were still unseen ones left.
    expect(new Set(everything).size).toBe(50);

    // The sixth sitting has nothing new left, and is still a full paper.
    const sixth = await startAttemptAction(assessment.id);
    expect(sixth.ok).toBe(true);
    if (!sixth.ok) return;

    const repeats = await db
      .select({ fresh: schema.assessmentAttemptQuestions.fresh })
      .from(schema.assessmentAttemptQuestions)
      .where(eq(schema.assessmentAttemptQuestions.attemptId, sixth.data.attemptId));

    expect(repeats).toHaveLength(10);
    expect(repeats.every((r) => r.fresh === false)).toBe(true);
  });

  it('fills a part-covered window with unseen questions first and tops the rest up', async () => {
    /* The brief's edge case, in miniature: 18 of 20 seen, a window of 5. */
    const cohort = await createTestCohort();
    const member = await createTestMember(cohort.cohort.id, { fullName: 'Deepa' });
    const { assessment, questions } = await createBankedAssessment(cohort.cohort.id, {
      bankSize: 20,
      questionsPerAttempt: 5,
    });

    state.user = sessionUser(member.user.id, 'student');
    const { startAttemptAction, submitAttemptAction } =
      await import('@/server/actions/assessments');

    // Sit until only two questions remain unseen.
    const seen = new Set<string>();
    while (seen.size < 18) {
      const started = await startAttemptAction(assessment.id);
      if (!started.ok) throw new Error(started.message);
      for (const id of await paperOf(started.data.attemptId)) seen.add(id);
      await submitAttemptAction(started.data.attemptId);
    }
    expect(seen.size).toBe(20);

    // Reach back and pretend two were never served, to land exactly on the shortfall case.
    const unseenTwo = questions.slice(0, 2).map((q) => q.id);
    await db
      .delete(schema.assessmentAttemptQuestions)
      .where(eq(schema.assessmentAttemptQuestions.questionId, unseenTwo[0]!));
    await db
      .delete(schema.assessmentAttemptQuestions)
      .where(eq(schema.assessmentAttemptQuestions.questionId, unseenTwo[1]!));

    const started = await startAttemptAction(assessment.id);
    expect(started.ok).toBe(true);
    if (!started.ok) return;

    const rows = await db
      .select({
        questionId: schema.assessmentAttemptQuestions.questionId,
        fresh: schema.assessmentAttemptQuestions.fresh,
      })
      .from(schema.assessmentAttemptQuestions)
      .where(eq(schema.assessmentAttemptQuestions.attemptId, started.data.attemptId));

    expect(rows).toHaveLength(5);
    // Both remaining unseen questions are on it, marked as the fresh ones.
    expect(rows.filter((r) => r.fresh)).toHaveLength(2);
    expect(
      rows
        .filter((r) => r.fresh)
        .map((r) => r.questionId)
        .sort(),
    ).toEqual([...unseenTwo].sort());
    expect(rows.filter((r) => !r.fresh)).toHaveLength(3);
    expect(new Set(rows.map((r) => r.questionId)).size).toBe(5);
  });
});

describe('grading a drawn paper', () => {
  it('scores out of the questions asked, not the bank they came from', async () => {
    const cohort = await createTestCohort();
    const member = await createTestMember(cohort.cohort.id, { fullName: 'Esha' });
    const { assessment } = await createBankedAssessment(cohort.cohort.id, {
      bankSize: 100,
      questionsPerAttempt: 5,
    });

    state.user = sessionUser(member.user.id, 'student');
    const { startAttemptAction, submitAnswerAction, submitAttemptAction } =
      await import('@/server/actions/assessments');

    const started = await startAttemptAction(assessment.id);
    expect(started.ok).toBe(true);
    if (!started.ok) return;

    const paper = await paperOf(started.data.attemptId);
    for (const questionId of paper) {
      await submitAnswerAction({
        attemptId: started.data.attemptId,
        questionId,
        selectedIndex: 0,
      });
    }

    await submitAttemptAction(started.data.attemptId);

    const [attempt] = await db
      .select()
      .from(schema.assessmentAttempts)
      .where(eq(schema.assessmentAttempts.id, started.data.attemptId))
      .limit(1);

    // Five out of five — not five out of a hundred.
    expect(attempt?.autoTotal).toBe(5);
    expect(attempt?.autoScore).toBe(5);

    const { getAttemptDetail } = await import('@/server/queries/assessments');
    const detail = await getAttemptDetail({
      attemptId: started.data.attemptId,
      viewer: { kind: 'student', memberId: member.memberId },
    });

    expect(detail?.pct).toBe(100);
    expect(detail?.answers).toHaveLength(5);
    expect(detail?.unanswered).toBe(0);
  });
});

describe('reaching past the paper', () => {
  it('refuses a question from the bank that this attempt was not given', async () => {
    const cohort = await createTestCohort();
    const member = await createTestMember(cohort.cohort.id, { fullName: 'Farid' });
    const { assessment, questions } = await createBankedAssessment(cohort.cohort.id, {
      bankSize: 40,
      questionsPerAttempt: 5,
    });

    state.user = sessionUser(member.user.id, 'student');
    const { startAttemptAction, openQuestionAction, submitAnswerAction } =
      await import('@/server/actions/assessments');

    const started = await startAttemptAction(assessment.id);
    expect(started.ok).toBe(true);
    if (!started.ok) return;

    const paper = new Set(await paperOf(started.data.attemptId));
    const elsewhere = questions.find((q) => !paper.has(q.id))!;

    /*
     * The interesting failure this prevents: a client walking the bank one id at a time,
     * opening questions it was never given, and reading five hundred prompts out of a
     * twenty-question sitting.
     */
    const opened = await openQuestionAction(started.data.attemptId, elsewhere.id);
    expect(opened.ok).toBe(false);

    const answered = await submitAnswerAction({
      attemptId: started.data.attemptId,
      questionId: elsewhere.id,
      selectedIndex: 0,
    });
    expect(answered.ok).toBe(false);

    const stored = await db
      .select()
      .from(schema.assessmentAnswers)
      .where(eq(schema.assessmentAnswers.attemptId, started.data.attemptId));
    expect(stored).toHaveLength(0);
  });
});

describe('a restart against a bank', () => {
  it('re-serves the same paper rather than dealing a new one', async () => {
    const cohort = await createTestCohort();
    const member = await createTestMember(cohort.cohort.id, { fullName: 'Gita' });
    const { assessment } = await createBankedAssessment(cohort.cohort.id, {
      bankSize: 80,
      questionsPerAttempt: 8,
    });

    state.user = sessionUser(member.user.id, 'student');
    const { startAttemptAction, recordFocusEventAction } =
      await import('@/server/actions/assessments');

    const started = await startAttemptAction(assessment.id);
    expect(started.ok).toBe(true);
    if (!started.ok) return;

    const before = await paperOf(started.data.attemptId);

    // Well past the five-second grace: the attempt is invalidated and replaced.
    const focus = await recordFocusEventAction(started.data.attemptId, 30_000);
    expect(focus.ok).toBe(true);
    if (!focus.ok) return;
    expect(focus.data.restarted).toBe(true);

    const after = await paperOf(focus.data.newAttemptId!);

    // The same questions in the same order. A re-draw would make tabbing away a reroll.
    expect(after).toEqual(before);
  });
});

describe('building the bank up', () => {
  it('appends to a published assessment without disturbing a sitting in progress', async () => {
    const cohort = await createTestCohort();
    const admin = await createTestMember(cohort.cohort.id, { fullName: 'Lead', role: 'admin' });
    const member = await createTestMember(cohort.cohort.id, { fullName: 'Hari' });
    const { assessment } = await createBankedAssessment(cohort.cohort.id, {
      bankSize: 10,
      questionsPerAttempt: 5,
    });

    state.user = sessionUser(member.user.id, 'student');
    const { startAttemptAction, appendQuestionsAction } =
      await import('@/server/actions/assessments');
    const started = await startAttemptAction(assessment.id);
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const paperBefore = await paperOf(started.data.attemptId);

    state.user = sessionUser(admin.user.id, 'admin');
    const added = await appendQuestionsAction(
      cohort.cohort.id,
      assessment.id,
      Array.from({ length: 30 }, (_, i) => ({
        type: 'mcq',
        prompt: `Appended question ${i + 1}`,
        options: ['Right', 'Wrong'],
        correctIndex: 0,
        points: 1,
      })),
    );

    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(added.data.added).toBe(30);
    expect(added.data.bankSize).toBe(40);

    // Positions continue rather than colliding with the ten already there.
    const positions = await db
      .select({ position: schema.assessmentQuestions.position })
      .from(schema.assessmentQuestions)
      .where(eq(schema.assessmentQuestions.assessmentId, assessment.id))
      .orderBy(asc(schema.assessmentQuestions.position));
    expect(positions.map((p) => p.position)).toEqual(Array.from({ length: 40 }, (_, i) => i));

    // And the student mid-sitting still has the paper they started.
    expect(await paperOf(started.data.attemptId)).toEqual(paperBefore);
  });

  it('still refuses to replace the questions of a published paper wholesale', async () => {
    const cohort = await createTestCohort();
    const admin = await createTestMember(cohort.cohort.id, { fullName: 'Lead', role: 'admin' });
    const { assessment } = await createBankedAssessment(cohort.cohort.id, {
      bankSize: 10,
      questionsPerAttempt: 5,
    });

    state.user = sessionUser(admin.user.id, 'admin');
    const { saveQuestionsAction } = await import('@/server/actions/assessments');
    const result = await saveQuestionsAction(cohort.cohort.id, assessment.id, [
      { type: 'mcq', prompt: 'A replacement', options: ['Yes', 'No'], correctIndex: 0, points: 1 },
    ]);

    expect(result.ok).toBe(false);
    const remaining = await db
      .select()
      .from(schema.assessmentQuestions)
      .where(eq(schema.assessmentQuestions.assessmentId, assessment.id));
    expect(remaining).toHaveLength(10);
  });
});

describe('what the student is told beforehand', () => {
  it('quotes the sitting they are about to have, not the size of the bank', async () => {
    const cohort = await createTestCohort();
    const member = await createTestMember(cohort.cohort.id, { fullName: 'Ira' });
    const { assessment } = await createBankedAssessment(cohort.cohort.id, {
      bankSize: 200,
      questionsPerAttempt: 20,
    });

    const { getAssessmentBrief, getStudentAssessments } =
      await import('@/server/queries/assessments');

    const brief = await getAssessmentBrief({
      assessmentId: assessment.id,
      cohortId: cohort.cohort.id,
      memberId: member.memberId,
    });

    expect(brief?.questionCount).toBe(20);
    expect(brief?.bankSize).toBe(200);
    expect(brief?.seenCount).toBe(0);
    // 20 questions at the 60-second default, not 200.
    expect(brief?.questionSeconds).toBe(20 * 60);

    state.user = sessionUser(member.user.id, 'student');
    const { getMemberContext } = await import('@/server/context');
    const ctx = await getMemberContext(sessionUser(member.user.id, 'student'));
    const rows = await getStudentAssessments(ctx!);
    const row = rows.find((r) => r.id === assessment.id);

    expect(row?.questionCount).toBe(20);
    expect(row?.bankSize).toBe(200);
  });

  it('counts what this student has met, and nobody else', async () => {
    const cohort = await createTestCohort();
    const mine = await createTestMember(cohort.cohort.id, { fullName: 'Jaya' });
    const theirs = await createTestMember(cohort.cohort.id, { fullName: 'Kabir' });
    const { assessment } = await createBankedAssessment(cohort.cohort.id, {
      bankSize: 30,
      questionsPerAttempt: 10,
    });

    const { startAttemptAction } = await import('@/server/actions/assessments');
    state.user = sessionUser(theirs.user.id, 'student');
    const other = await startAttemptAction(assessment.id);
    expect(other.ok).toBe(true);

    const { getAssessmentBrief } = await import('@/server/queries/assessments');
    const brief = await getAssessmentBrief({
      assessmentId: assessment.id,
      cohortId: cohort.cohort.id,
      memberId: mine.memberId,
    });

    // Another student having sat ten of the thirty tells this student nothing.
    expect(brief?.seenCount).toBe(0);
  });
});

describe('assessments without a bank', () => {
  it('serves every question, in the order the admin wrote them', async () => {
    const cohort = await createTestCohort();
    const member = await createTestMember(cohort.cohort.id, { fullName: 'Latha' });
    const { assessment, questions } = await createBankedAssessment(cohort.cohort.id, {
      bankSize: 6,
      questionsPerAttempt: null,
    });

    state.user = sessionUser(member.user.id, 'student');
    const { startAttemptAction } = await import('@/server/actions/assessments');
    const started = await startAttemptAction(assessment.id);
    expect(started.ok).toBe(true);
    if (!started.ok) return;

    const { getAttemptRuntime } = await import('@/server/queries/assessments');
    const runtime = await getAttemptRuntime({
      attemptId: started.data.attemptId,
      memberId: member.memberId,
    });

    expect(runtime?.questions).toHaveLength(6);
    /*
     * Order matters here in a way it does not for a bank: a paper of six that an admin
     * sequenced deliberately must arrive in that sequence, however the draw shuffles.
     */
    expect(runtime?.questions.map((q) => q.prompt)).toEqual(questions.map((q) => q.prompt));
  });

  it('opens an attempt recorded before banks existed, reading it as the whole paper', async () => {
    const cohort = await createTestCohort();
    const member = await createTestMember(cohort.cohort.id, { fullName: 'Manu' });
    const { assessment, questions } = await createBankedAssessment(cohort.cohort.id, {
      bankSize: 4,
      questionsPerAttempt: null,
    });

    state.user = sessionUser(member.user.id, 'student');
    const { startAttemptAction } = await import('@/server/actions/assessments');
    const started = await startAttemptAction(assessment.id);
    expect(started.ok).toBe(true);
    if (!started.ok) return;

    // An attempt as it would have been written before this table existed: no paper at all.
    await db
      .delete(schema.assessmentAttemptQuestions)
      .where(eq(schema.assessmentAttemptQuestions.attemptId, started.data.attemptId));

    const { getAttemptRuntime } = await import('@/server/queries/assessments');
    const runtime = await getAttemptRuntime({
      attemptId: started.data.attemptId,
      memberId: member.memberId,
    });

    expect(runtime?.questions.map((q) => q.id)).toEqual(questions.map((q) => q.id));

    const { submitAttemptAction } = await import('@/server/actions/assessments');
    await submitAttemptAction(started.data.attemptId);

    const [attempt] = await db
      .select()
      .from(schema.assessmentAttempts)
      .where(
        and(
          eq(schema.assessmentAttempts.id, started.data.attemptId),
          eq(schema.assessmentAttempts.memberId, member.memberId),
        ),
      )
      .limit(1);

    // Graded out of all four, which is what that attempt was actually sat on.
    expect(attempt?.autoTotal).toBe(4);
  });
});
