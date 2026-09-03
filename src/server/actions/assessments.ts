'use server';

import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { db } from '@/db/client';
import {
  type QuestionType,
  assessmentAnswers,
  assessmentAttempts,
  assessmentIntegrityEvents,
  assessmentQuestions,
  assessments,
  cohortMembers,
} from '@/db/schema';
import { requireAdminAction, requireUserAction } from '@/lib/auth/guards';
import { isAutoGradable, questionDeadline } from '@/lib/assessments/grade';
import { parseQuestionBlock } from '@/lib/assessments/parse';
import {
  assessmentQuestionsSchema,
  assessmentReviewSchema,
  assessmentSchema,
  answerSubmissionSchema,
  fieldErrors,
} from '@/lib/validation';
import { getCohortContext, getMemberContext } from '@/server/context';

import { type Result, fail, guarded, ok, recordAudit } from './shared';

/* ------------------------------------------------------------------ admin */

async function adminContext(cohortId: string) {
  const user = await requireAdminAction();
  const ctx = await getCohortContext(cohortId);
  if (!ctx) throw new Error('That cohort could not be found.');
  return { user, ctx };
}

/** Confirms an assessment belongs to the cohort the admin is acting on. */
async function assertAssessmentInCohort(assessmentId: string, cohortId: string) {
  const [row] = await db
    .select({ id: assessments.id, status: assessments.status })
    .from(assessments)
    .where(and(eq(assessments.id, assessmentId), eq(assessments.cohortId, cohortId)))
    .limit(1);
  if (!row) throw new Error('That assessment is not in this cohort.');
  return row;
}

function revalidateAssessments(assessmentId?: string) {
  revalidatePath('/admin/assessments');
  if (assessmentId) revalidatePath(`/admin/assessments/${assessmentId}`);
  revalidatePath('/assessments');
}

export async function saveAssessmentAction(
  cohortId: string,
  assessmentId: string | null,
  _prev: unknown,
  formData: FormData,
): Promise<Result<{ id: string }>> {
  return guarded(async () => {
    const { user } = await adminContext(cohortId);
    const parsed = assessmentSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fail('Check the highlighted fields.', fieldErrors(parsed.error));

    const input = parsed.data;
    const values = {
      title: input.title,
      curriculumRef: input.curriculumRef ?? null,
      instructions: input.instructions ?? null,
      // Zero in the form means "no total limit" — the honest way to say it in a number input.
      totalTimeSeconds: input.totalTimeMinutes > 0 ? input.totalTimeMinutes * 60 : null,
      defaultQuestionSeconds: input.defaultQuestionSeconds,
      focusGraceSeconds: input.focusGraceSeconds,
      passMarkPct: input.passMarkPct,
      allowAnswerReview: input.allowAnswerReview,
      updatedAt: new Date(),
    };

    if (assessmentId) {
      await assertAssessmentInCohort(assessmentId, cohortId);
      await db.update(assessments).set(values).where(eq(assessments.id, assessmentId));
      await recordAudit({
        actorUserId: user.id,
        action: 'assessment.update',
        entity: 'assessment',
        entityId: assessmentId,
        payload: { title: input.title },
      });
      revalidateAssessments(assessmentId);
      return ok({ id: assessmentId });
    }

    const [created] = await db
      .insert(assessments)
      .values({ ...values, cohortId, createdByUserId: user.id, status: 'draft' })
      .returning({ id: assessments.id });

    await recordAudit({
      actorUserId: user.id,
      action: 'assessment.create',
      entity: 'assessment',
      entityId: created!.id,
      payload: { title: input.title },
    });

    revalidateAssessments(created!.id);
    return ok({ id: created!.id });
  }, 'We could not save that assessment. Please try again.');
}

/**
 * Replaces an assessment's questions wholesale.
 *
 * One write for the whole list rather than a call per question, because the builder and the
 * import preview both hand over a complete, already-ordered set and a partial application
 * would leave a published paper half-edited. Refused once the assessment is published: a
 * question that changes under a student mid-attempt would invalidate their answers.
 */
export async function saveQuestionsAction(
  cohortId: string,
  assessmentId: string,
  questions: unknown,
): Promise<Result<{ count: number }>> {
  return guarded(async () => {
    const { user } = await adminContext(cohortId);
    const assessment = await assertAssessmentInCohort(assessmentId, cohortId);

    if (assessment.status === 'published') {
      return fail(
        'Unpublish this assessment before changing its questions. Students may be part-way through it.',
      );
    }

    const parsed = assessmentQuestionsSchema.safeParse(questions);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      const where = typeof first?.path[0] === 'number' ? ` (question ${first.path[0] + 1})` : '';
      return fail(`${first?.message ?? 'Those questions are not valid.'}${where}`);
    }

    const rows = parsed.data.map((q, index) => {
      const choice = isAutoGradable(q.type as QuestionType);
      return {
        assessmentId,
        position: index,
        type: q.type as QuestionType,
        prompt: q.prompt,
        imageUrl: q.imageUrl ?? null,
        options: choice ? q.options.filter((o) => o.trim().length > 0) : [],
        correctIndex: choice ? (q.correctIndex ?? null) : null,
        referenceAnswer: choice ? null : (q.referenceAnswer ?? null),
        explanation: q.explanation ?? null,
        timeLimitSeconds: q.timeLimitSeconds ?? null,
        points: q.points,
      };
    });

    await db.transaction(async (tx) => {
      await tx
        .delete(assessmentQuestions)
        .where(eq(assessmentQuestions.assessmentId, assessmentId));
      for (let i = 0; i < rows.length; i += 100) {
        await tx.insert(assessmentQuestions).values(rows.slice(i, i + 100));
      }
      await tx
        .update(assessments)
        .set({ updatedAt: new Date() })
        .where(eq(assessments.id, assessmentId));
    });

    await recordAudit({
      actorUserId: user.id,
      action: 'assessment.questions.save',
      entity: 'assessment',
      entityId: assessmentId,
      payload: { count: rows.length },
    });

    revalidateAssessments(assessmentId);
    return ok({ count: rows.length });
  }, 'We could not save those questions. Please try again.');
}

/**
 * Parses a pasted question block, on the server, without writing anything.
 *
 * The preview step the brief insists on: paste, look, fix, *then* save. This exists as an
 * action rather than as client-only code so the same parser decides what will be written as
 * decided what was shown — a preview produced by different logic than the save is a preview
 * of nothing.
 */
export async function previewImportAction(
  cohortId: string,
  raw: string,
): Promise<Result<ReturnType<typeof parseQuestionBlock>>> {
  return guarded(async () => {
    await adminContext(cohortId);
    if (typeof raw !== 'string') return fail('Paste your questions into the box first.');
    return ok(parseQuestionBlock(raw));
  }, 'We could not read that paste. Please try again.');
}

export async function setAssessmentStatusAction(
  cohortId: string,
  assessmentId: string,
  status: 'draft' | 'published' | 'archived',
): Promise<Result> {
  return guarded(async () => {
    const { user } = await adminContext(cohortId);
    await assertAssessmentInCohort(assessmentId, cohortId);

    if (status === 'published') {
      const [count] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(assessmentQuestions)
        .where(eq(assessmentQuestions.assessmentId, assessmentId));
      if ((count?.n ?? 0) === 0) {
        return fail('Add at least one question before publishing.');
      }
    }

    await db
      .update(assessments)
      .set({
        status,
        // Stamped once, on the first publish, so "when did students first see this" survives
        // an unpublish-and-republish cycle.
        publishedAt:
          status === 'published' ? sql`coalesce(${assessments.publishedAt}, now())` : undefined,
        updatedAt: new Date(),
      })
      .where(eq(assessments.id, assessmentId));

    await recordAudit({
      actorUserId: user.id,
      action: `assessment.${status}`,
      entity: 'assessment',
      entityId: assessmentId,
      payload: {},
    });

    revalidateAssessments(assessmentId);
    return ok();
  }, 'We could not change that assessment. Please try again.');
}

export async function deleteAssessmentAction(
  cohortId: string,
  assessmentId: string,
): Promise<Result> {
  return guarded(async () => {
    const { user } = await adminContext(cohortId);
    await assertAssessmentInCohort(assessmentId, cohortId);

    const [attempts] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(assessmentAttempts)
      .where(eq(assessmentAttempts.assessmentId, assessmentId));

    /*
     * Refused once anyone has sat it. Deleting cascades to their attempts, answers and
     * integrity events — the audit trail the brief requires to remain readable. Archiving
     * takes it off the students' list and keeps all of that.
     */
    if ((attempts?.n ?? 0) > 0) {
      return fail(
        'Students have already attempted this assessment. Archive it instead — deleting would erase their results and integrity history.',
      );
    }

    await db.delete(assessments).where(eq(assessments.id, assessmentId));
    await recordAudit({
      actorUserId: user.id,
      action: 'assessment.delete',
      entity: 'assessment',
      entityId: assessmentId,
      payload: {},
    });

    revalidateAssessments();
    return ok();
  }, 'We could not delete that assessment. Please try again.');
}

/**
 * Marks the written answers on one attempt and releases the final result.
 *
 * Subjective questions sit at "Pending review" on the student's private result until this
 * runs, which is why it also recomputes the totals: the percentage the student sees is the
 * one derived from what has actually been marked.
 */
export async function reviewAttemptAction(
  cohortId: string,
  input: unknown,
): Promise<Result<{ manualScore: number }>> {
  return guarded(async () => {
    const { user } = await adminContext(cohortId);
    const parsed = assessmentReviewSchema.safeParse(input);
    if (!parsed.success) return fail('Check the marks you entered.', fieldErrors(parsed.error));

    const { attemptId, marks, feedback } = parsed.data;

    const [attempt] = await db
      .select({ id: assessmentAttempts.id, assessmentId: assessmentAttempts.assessmentId })
      .from(assessmentAttempts)
      .innerJoin(assessments, eq(assessments.id, assessmentAttempts.assessmentId))
      .where(and(eq(assessmentAttempts.id, attemptId), eq(assessments.cohortId, cohortId)))
      .limit(1);
    if (!attempt) return fail('That attempt is not in this cohort.');

    // Ownership: every answer marked must belong to this attempt. A tampered id is simply
    // not found and cannot reach another student's paper.
    const answerRows = await db
      .select({ id: assessmentAnswers.id, questionId: assessmentAnswers.questionId })
      .from(assessmentAnswers)
      .where(eq(assessmentAnswers.attemptId, attemptId));
    const owned = new Set(answerRows.map((a) => a.id));

    let manualScore = 0;
    for (const mark of marks) {
      if (!owned.has(mark.answerId)) continue;
      await db
        .update(assessmentAnswers)
        .set({
          awardedPoints: mark.awardedPoints,
          isCorrect: mark.awardedPoints > 0,
          reviewerNote: mark.reviewerNote ?? null,
        })
        .where(eq(assessmentAnswers.id, mark.answerId));
      manualScore += mark.awardedPoints;
    }

    await db
      .update(assessmentAttempts)
      .set({
        manualScore,
        reviewStatus: 'reviewed',
        reviewedByUserId: user.id,
        reviewedAt: new Date(),
        feedback: feedback ?? null,
      })
      .where(eq(assessmentAttempts.id, attemptId));

    await recordAudit({
      actorUserId: user.id,
      action: 'assessment.review',
      entity: 'assessment_attempt',
      entityId: attemptId,
      payload: { manualScore },
    });

    revalidateAssessments(attempt.assessmentId);
    revalidatePath('/assessments');
    return ok({ manualScore });
  }, 'We could not save that review. Please try again.');
}

/* ---------------------------------------------------------------- student */

async function studentContext() {
  const user = await requireUserAction();
  const ctx = await getMemberContext(user);
  if (!ctx) throw new Error('You are not in a cohort.');
  return ctx;
}

/**
 * Loads an attempt and proves it belongs to the caller.
 *
 * Every student-facing write goes through here. The membership join is the authorisation:
 * an attempt id belonging to someone else returns no row, so a tampered request cannot read
 * or write another student's paper — which is the rule the private-results requirement
 * ultimately rests on.
 */
async function ownedAttempt(attemptId: string, memberId: string) {
  const [row] = await db
    .select({
      id: assessmentAttempts.id,
      assessmentId: assessmentAttempts.assessmentId,
      status: assessmentAttempts.status,
      startedAt: assessmentAttempts.startedAt,
      expiresAt: assessmentAttempts.expiresAt,
      attemptNumber: assessmentAttempts.attemptNumber,
      restartCount: assessmentAttempts.restartCount,
      focusGraceSeconds: assessments.focusGraceSeconds,
      defaultQuestionSeconds: assessments.defaultQuestionSeconds,
      totalTimeSeconds: assessments.totalTimeSeconds,
    })
    .from(assessmentAttempts)
    .innerJoin(assessments, eq(assessments.id, assessmentAttempts.assessmentId))
    .where(and(eq(assessmentAttempts.id, attemptId), eq(assessmentAttempts.memberId, memberId)))
    .limit(1);
  return row ?? null;
}

export type StartedAttempt = { attemptId: string; attemptNumber: number; restartCount: number };

/**
 * Opens an attempt, or hands back the one already running.
 *
 * Idempotent on purpose: the rules screen posts this on "Start assessment", and a student
 * who double-taps or reloads must land back in the same attempt with the same clock rather
 * than starting a second one with fresh time.
 */
export async function startAttemptAction(assessmentId: string): Promise<Result<StartedAttempt>> {
  return guarded(async () => {
    const ctx = await studentContext();

    const [assessment] = await db
      .select({
        id: assessments.id,
        status: assessments.status,
        totalTimeSeconds: assessments.totalTimeSeconds,
      })
      .from(assessments)
      .where(and(eq(assessments.id, assessmentId), eq(assessments.cohortId, ctx.cohort.id)))
      .limit(1);

    if (!assessment) return fail('That assessment could not be found.');
    if (assessment.status !== 'published') return fail('That assessment is not open.');

    const [live] = await db
      .select({
        id: assessmentAttempts.id,
        attemptNumber: assessmentAttempts.attemptNumber,
        restartCount: assessmentAttempts.restartCount,
      })
      .from(assessmentAttempts)
      .where(
        and(
          eq(assessmentAttempts.assessmentId, assessmentId),
          eq(assessmentAttempts.memberId, ctx.memberId),
          eq(assessmentAttempts.status, 'in_progress'),
        ),
      )
      .limit(1);

    if (live) {
      return ok({
        attemptId: live.id,
        attemptNumber: live.attemptNumber,
        restartCount: live.restartCount,
      });
    }

    const [previous] = await db
      .select({
        attemptNumber: assessmentAttempts.attemptNumber,
        restartCount: assessmentAttempts.restartCount,
      })
      .from(assessmentAttempts)
      .where(
        and(
          eq(assessmentAttempts.assessmentId, assessmentId),
          eq(assessmentAttempts.memberId, ctx.memberId),
        ),
      )
      .orderBy(desc(assessmentAttempts.attemptNumber))
      .limit(1);

    const startedAt = new Date();
    const [created] = await db
      .insert(assessmentAttempts)
      .values({
        assessmentId,
        memberId: ctx.memberId,
        attemptNumber: (previous?.attemptNumber ?? 0) + 1,
        restartCount: previous?.restartCount ?? 0,
        status: 'in_progress',
        startedAt,
        expiresAt: assessment.totalTimeSeconds
          ? new Date(startedAt.getTime() + assessment.totalTimeSeconds * 1000)
          : null,
      })
      .returning({
        id: assessmentAttempts.id,
        attemptNumber: assessmentAttempts.attemptNumber,
        restartCount: assessmentAttempts.restartCount,
      });

    revalidatePath('/assessments');
    return ok({
      attemptId: created!.id,
      attemptNumber: created!.attemptNumber,
      restartCount: created!.restartCount,
    });
  }, 'We could not start that assessment. Please try again.');
}

/**
 * Stamps the moment a question was first shown.
 *
 * The per-question deadline is derived from this server timestamp, never from the client's
 * clock, and the row is written once and never moved — so reloading the page re-derives the
 * same deadline instead of buying another full timer.
 */
export async function openQuestionAction(
  attemptId: string,
  questionId: string,
): Promise<Result<{ deadline: string }>> {
  return guarded(async () => {
    const ctx = await studentContext();
    const attempt = await ownedAttempt(attemptId, ctx.memberId);
    if (!attempt) return fail('That attempt could not be found.');
    if (attempt.status !== 'in_progress') return fail('That attempt is already finished.');

    const [question] = await db
      .select({
        id: assessmentQuestions.id,
        timeLimitSeconds: assessmentQuestions.timeLimitSeconds,
      })
      .from(assessmentQuestions)
      .where(
        and(
          eq(assessmentQuestions.id, questionId),
          eq(assessmentQuestions.assessmentId, attempt.assessmentId),
        ),
      )
      .limit(1);
    if (!question) return fail('That question is not part of this assessment.');

    const now = new Date();
    const [row] = await db
      .insert(assessmentAnswers)
      .values({ attemptId, questionId, startedAt: now })
      // Already open: the existing `startedAt` stands, which is the whole point.
      .onConflictDoUpdate({
        target: [assessmentAnswers.attemptId, assessmentAnswers.questionId],
        set: { questionId },
      })
      .returning({ startedAt: assessmentAnswers.startedAt });

    const deadline = questionDeadline(
      row?.startedAt ?? now,
      question.timeLimitSeconds,
      attempt.defaultQuestionSeconds,
    );
    return ok({ deadline: deadline.toISOString() });
  }, 'We could not open that question. Please try again.');
}

/**
 * Records an answer, or the fact that its timer ran out.
 *
 * The deadline is re-derived here from the server's own `startedAt` before anything is
 * accepted, so an answer that arrives late is stored as expired however convincing the
 * client was about the time. Grading happens on submission, not here — nothing in the
 * response tells the student whether they were right.
 */
export async function submitAnswerAction(input: unknown): Promise<Result<{ expired: boolean }>> {
  return guarded(async () => {
    const ctx = await studentContext();
    const parsed = answerSubmissionSchema.safeParse(input);
    if (!parsed.success) return fail('That answer could not be saved.');

    const { attemptId, questionId, selectedIndex, textAnswer } = parsed.data;
    const attempt = await ownedAttempt(attemptId, ctx.memberId);
    if (!attempt) return fail('That attempt could not be found.');
    if (attempt.status !== 'in_progress') return fail('That attempt is already finished.');

    const [question] = await db
      .select({
        id: assessmentQuestions.id,
        type: assessmentQuestions.type,
        timeLimitSeconds: assessmentQuestions.timeLimitSeconds,
      })
      .from(assessmentQuestions)
      .where(
        and(
          eq(assessmentQuestions.id, questionId),
          eq(assessmentQuestions.assessmentId, attempt.assessmentId),
        ),
      )
      .limit(1);
    if (!question) return fail('That question is not part of this assessment.');

    const [existing] = await db
      .select({ startedAt: assessmentAnswers.startedAt })
      .from(assessmentAnswers)
      .where(
        and(
          eq(assessmentAnswers.attemptId, attemptId),
          eq(assessmentAnswers.questionId, questionId),
        ),
      )
      .limit(1);

    const now = new Date();
    const startedAt = existing?.startedAt ?? now;
    const deadline = questionDeadline(
      startedAt,
      question.timeLimitSeconds,
      attempt.defaultQuestionSeconds,
    );
    const overall = attempt.expiresAt;
    const expired = now > deadline || (overall !== null && now > overall);

    const values = {
      attemptId,
      questionId,
      startedAt,
      selectedIndex: expired ? null : (selectedIndex ?? null),
      textAnswer: expired ? null : (textAnswer ?? null),
      answeredAt: expired ? null : now,
      expired,
    };

    await db
      .insert(assessmentAnswers)
      .values(values)
      .onConflictDoUpdate({
        target: [assessmentAnswers.attemptId, assessmentAnswers.questionId],
        set: {
          selectedIndex: values.selectedIndex,
          textAnswer: values.textAnswer,
          answeredAt: values.answeredAt,
          expired: values.expired,
        },
      });

    return ok({ expired });
  }, 'We could not save that answer. Please try again.');
}

/**
 * Logs what happened while the tab was hidden, and restarts the attempt if it went too far.
 *
 * The honest deal the brief asks for: this cannot prove a student was not reading a second
 * device, so it records rather than accuses, and the only automatic consequence is the
 * restart. The invalidated attempt is kept — the restart count and the event that caused it
 * are exactly what the admin needs to see.
 */
export async function recordFocusEventAction(
  attemptId: string,
  awayMs: number,
): Promise<Result<{ restarted: boolean; newAttemptId: string | null }>> {
  type Outcome = { restarted: boolean; newAttemptId: string | null };
  return guarded<Outcome>(async () => {
    const ctx = await studentContext();
    const attempt = await ownedAttempt(attemptId, ctx.memberId);
    if (!attempt) return fail('That attempt could not be found.');
    if (attempt.status !== 'in_progress') return ok({ restarted: false, newAttemptId: null });

    const away = Number.isFinite(awayMs) ? Math.max(0, Math.round(awayMs)) : 0;
    const thresholdMs = attempt.focusGraceSeconds * 1000;

    if (away < thresholdMs) {
      // Under the threshold: logged as a minor event and the attempt carries on.
      await db.insert(assessmentIntegrityEvents).values({
        attemptId,
        kind: 'focus_returned',
        awayMs: away,
        detail: { thresholdMs },
      });
      return ok({ restarted: false, newAttemptId: null });
    }

    await db.insert(assessmentIntegrityEvents).values({
      attemptId,
      kind: 'threshold_breached',
      awayMs: away,
      detail: { thresholdMs },
    });

    const restartCount = attempt.restartCount + 1;

    const created = await db.transaction(async (tx) => {
      await tx
        .update(assessmentAttempts)
        .set({ status: 'invalidated', submittedAt: new Date() })
        .where(eq(assessmentAttempts.id, attemptId));

      const startedAt = new Date();
      const [next] = await tx
        .insert(assessmentAttempts)
        .values({
          assessmentId: attempt.assessmentId,
          memberId: ctx.memberId,
          attemptNumber: attempt.attemptNumber + 1,
          restartCount,
          status: 'in_progress',
          startedAt,
          expiresAt: attempt.totalTimeSeconds
            ? new Date(startedAt.getTime() + attempt.totalTimeSeconds * 1000)
            : null,
        })
        .returning({ id: assessmentAttempts.id });

      await tx.insert(assessmentIntegrityEvents).values({
        attemptId: next!.id,
        kind: 'restarted',
        awayMs: away,
        detail: { previousAttemptId: attemptId, restartCount, reason: 'focus_threshold_breached' },
      });

      return next!;
    });

    revalidatePath('/assessments');
    return ok({ restarted: true, newAttemptId: created.id });
  }, 'We could not record that. Please try again.');
}

/**
 * Closes the attempt and grades everything that can be graded without a person.
 *
 * Marking happens here, once, rather than as each answer arrives — grading on the way in
 * would mean the server had already computed the score while the student was still sitting
 * the paper, and every "is this right?" request would be a side channel telling them.
 */
export async function submitAttemptAction(
  attemptId: string,
  reason: 'submitted' | 'expired' = 'submitted',
): Promise<Result<{ attemptId: string }>> {
  return guarded(async () => {
    const ctx = await studentContext();
    const attempt = await ownedAttempt(attemptId, ctx.memberId);
    if (!attempt) return fail('That attempt could not be found.');
    if (attempt.status !== 'in_progress') return ok({ attemptId });

    const questions = await db
      .select({
        id: assessmentQuestions.id,
        type: assessmentQuestions.type,
        correctIndex: assessmentQuestions.correctIndex,
        points: assessmentQuestions.points,
      })
      .from(assessmentQuestions)
      .where(eq(assessmentQuestions.assessmentId, attempt.assessmentId))
      .orderBy(asc(assessmentQuestions.position));

    const answers = await db
      .select({
        id: assessmentAnswers.id,
        questionId: assessmentAnswers.questionId,
        selectedIndex: assessmentAnswers.selectedIndex,
        textAnswer: assessmentAnswers.textAnswer,
      })
      .from(assessmentAnswers)
      .where(eq(assessmentAnswers.attemptId, attemptId));

    const answerBy = new Map(answers.map((a) => [a.questionId, a]));

    let autoScore = 0;
    let autoTotal = 0;
    let manualTotal = 0;
    let awaitingReview = 0;

    for (const question of questions) {
      const answer = answerBy.get(question.id) ?? null;

      if (isAutoGradable(question.type)) {
        autoTotal += question.points;
        const correct =
          answer?.selectedIndex !== null &&
          answer?.selectedIndex !== undefined &&
          question.correctIndex !== null &&
          answer.selectedIndex === question.correctIndex;

        if (answer) {
          await db
            .update(assessmentAnswers)
            .set({ isCorrect: correct, awardedPoints: correct ? question.points : 0 })
            .where(eq(assessmentAnswers.id, answer.id));
        }
        if (correct) autoScore += question.points;
        continue;
      }

      // Subjective. It counts towards the paper's total but stays unmarked, which is what
      // "Pending review" on the student's result means.
      manualTotal += question.points;
      if (answer?.textAnswer && answer.textAnswer.trim().length > 0) awaitingReview += 1;
    }

    await db
      .update(assessmentAttempts)
      .set({
        status: reason,
        submittedAt: new Date(),
        autoScore,
        autoTotal,
        manualTotal,
        reviewStatus: awaitingReview > 0 ? 'pending' : 'auto',
      })
      .where(eq(assessmentAttempts.id, attemptId));

    /*
     * Badges are evaluated by the scoring pass, which reads the attempt counts back out of
     * the database — so it has to run after the row above is written, and it deliberately
     * never sees the score itself.
     */
    const { settleDay } = await import('@/server/scoring');
    await settleDay({
      memberId: ctx.memberId,
      cohortId: ctx.cohort.id,
      date: ctx.today,
      calendar: ctx.calendar,
      rules: ctx.rules,
    });

    revalidatePath('/assessments');
    revalidatePath(`/assessments/${attempt.assessmentId}`);
    revalidatePath('/today');
    return ok({ attemptId });
  }, 'We could not submit that attempt. Please try again.');
}

/* ------------------------------------------- admin badge grant and revoke */

export async function setAchievementAction(
  cohortId: string,
  memberId: string,
  code: string,
  granted: boolean,
): Promise<Result> {
  return guarded(async () => {
    const { user, ctx } = await adminContext(cohortId);

    const [member] = await db
      .select({ id: cohortMembers.id })
      .from(cohortMembers)
      .where(and(eq(cohortMembers.id, memberId), eq(cohortMembers.cohortId, cohortId)))
      .limit(1);
    if (!member) return fail('That student is not in this cohort.');

    const { ACHIEVEMENTS_BY_CODE } = await import('@/lib/domain/achievements');
    if (!ACHIEVEMENTS_BY_CODE.has(code)) return fail('That is not a badge.');

    const { studentAchievements } = await import('@/db/schema');

    if (granted) {
      // Idempotent: the same milestone can never produce two copies of one badge.
      await db
        .insert(studentAchievements)
        .values({ memberId, code, earnedOn: ctx.today, metadata: { grantedBy: 'admin' } })
        .onConflictDoNothing({
          target: [studentAchievements.memberId, studentAchievements.code],
        });
    } else {
      await db
        .delete(studentAchievements)
        .where(and(eq(studentAchievements.memberId, memberId), eq(studentAchievements.code, code)));
    }

    await recordAudit({
      actorUserId: user.id,
      action: granted ? 'achievement.grant' : 'achievement.revoke',
      entity: 'cohort_member',
      entityId: memberId,
      payload: { code },
    });

    revalidatePath(`/admin/students/${memberId}`);
    revalidatePath('/admin/students');
    revalidatePath('/progress');
    revalidatePath('/leaderboard');
    return ok();
  }, 'We could not change that badge. Please try again.');
}

/** Ids the runtime needs to reopen an in-progress attempt after a reload. */
export async function activeAttemptIdsAction(assessmentId: string): Promise<Result<string[]>> {
  return guarded(async () => {
    const ctx = await studentContext();
    const rows = await db
      .select({ id: assessmentAttempts.id })
      .from(assessmentAttempts)
      .where(
        and(
          eq(assessmentAttempts.assessmentId, assessmentId),
          eq(assessmentAttempts.memberId, ctx.memberId),
          inArray(assessmentAttempts.status, ['in_progress']),
        ),
      );
    return ok(rows.map((r) => r.id));
  }, 'We could not check that attempt. Please try again.');
}
