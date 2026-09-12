import 'server-only';

import { and, asc, desc, eq, inArray, ne, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import type {
  AssessmentAudience,
  AttemptStatus,
  QuestionType,
  ReviewStatus,
  TimerMode,
} from '@/db/schema';
import {
  assessmentAnswers,
  assessmentAttempts,
  assessmentAudienceMembers,
  assessmentIntegrityEvents,
  assessmentQuestions,
  assessments,
  cohortMembers,
  subjects,
  users,
} from '@/db/schema';
import { paperSize } from '@/lib/assessments/draw';
import { isAutoGradable, questionDeadline, scorePercent } from '@/lib/assessments/grade';
import { FULLSCREEN_EXIT_LIMIT } from '@/lib/assessments/integrity';
import { visibleToMember } from '@/server/assessment-audience';
import { attemptQuestionIds, bankCoverage, inPaperOrder } from '@/server/assessment-paper';
import type { MemberContext } from '@/server/context';

/**
 * Reads for the assessment module.
 *
 * The privacy rule the brief sets runs through every function here and is worth stating
 * once: an attempt's score, answers, timings and integrity events belong to the student who
 * sat it and to the admin, and to nobody else. Every student-facing read below is therefore
 * scoped by `memberId` in its WHERE clause rather than filtered after the fact — there is
 * no query in this file that can return one student's result to another, and no shape that
 * carries a score into a list a classmate can see.
 */

type CohortCtx = { cohort: { id: string } };

/* ------------------------------------------------------------------ admin */

export type AdminAssessmentRow = {
  id: string;
  title: string;
  status: 'draft' | 'published' | 'archived';
  subjectName: string | null;
  curriculumRef: string | null;
  /** Everything in the bank. */
  questionCount: number;
  /** How many of them one sitting draws; null when every sitting serves the whole bank. */
  questionsPerAttempt: number | null;
  attemptCount: number;
  /** Attempts with written answers still waiting for the admin to mark them. */
  pendingReview: number;
  totalTimeSeconds: number | null;
  timerMode: TimerMode;
  /** 'selected' means only the named students can see it, even while published. */
  audience: AssessmentAudience;
  /** How many students it is narrowed to. Zero when the audience is everyone. */
  audienceCount: number;
  passMarkPct: number;
  updatedAt: Date;
};

export async function getAssessments(ctx: CohortCtx): Promise<AdminAssessmentRow[]> {
  const rows = await db
    .select({
      id: assessments.id,
      title: assessments.title,
      status: assessments.status,
      subjectName: subjects.name,
      curriculumRef: assessments.curriculumRef,
      totalTimeSeconds: assessments.totalTimeSeconds,
      timerMode: assessments.timerMode,
      audience: assessments.audience,
      questionsPerAttempt: assessments.questionsPerAttempt,
      passMarkPct: assessments.passMarkPct,
      updatedAt: assessments.updatedAt,
      audienceCount: sql<number>`(
        SELECT count(*)::int FROM ${assessmentAudienceMembers}
        WHERE ${assessmentAudienceMembers.assessmentId} = ${assessments.id}
      )`,
      questionCount: sql<number>`(
        SELECT count(*)::int FROM ${assessmentQuestions}
        WHERE ${assessmentQuestions.assessmentId} = ${assessments.id}
      )`,
      attemptCount: sql<number>`(
        SELECT count(*)::int FROM ${assessmentAttempts}
        WHERE ${assessmentAttempts.assessmentId} = ${assessments.id}
          AND ${assessmentAttempts.status} <> 'invalidated'
      )`,
      pendingReview: sql<number>`(
        SELECT count(*)::int FROM ${assessmentAttempts}
        WHERE ${assessmentAttempts.assessmentId} = ${assessments.id}
          AND ${assessmentAttempts.reviewStatus} = 'pending'
      )`,
    })
    .from(assessments)
    .leftJoin(subjects, eq(subjects.id, assessments.subjectId))
    .where(eq(assessments.cohortId, ctx.cohort.id))
    .orderBy(desc(assessments.updatedAt));

  return rows;
}

export type AdminQuestion = {
  id: string;
  position: number;
  type: QuestionType;
  prompt: string;
  imageUrl: string | null;
  options: string[];
  correctIndex: number | null;
  referenceAnswer: string | null;
  explanation: string | null;
  timeLimitSeconds: number | null;
  points: number;
};

export type AdminAssessmentDetail = {
  id: string;
  title: string;
  status: 'draft' | 'published' | 'archived';
  instructions: string | null;
  curriculumRef: string | null;
  totalTimeSeconds: number | null;
  timerMode: TimerMode;
  defaultQuestionSeconds: number;
  focusGraceSeconds: number;
  /** Null means every sitting serves the whole bank, in order. */
  questionsPerAttempt: number | null;
  passMarkPct: number;
  allowAnswerReview: boolean;
  audience: AssessmentAudience;
  /** The members named on the audience list, whether or not it is currently in force. */
  audienceMemberIds: string[];
  /**
   * Sittings open right now.
   *
   * The builder shows this because it is the one thing that stops a published paper being
   * edited: questions can be changed under a published assessment, but not under a student
   * who is part-way through one.
   */
  liveAttempts: number;
  questions: AdminQuestion[];
};

export async function getAssessmentDetail(
  ctx: CohortCtx,
  assessmentId: string,
): Promise<AdminAssessmentDetail | null> {
  const [row] = await db
    .select()
    .from(assessments)
    .where(and(eq(assessments.id, assessmentId), eq(assessments.cohortId, ctx.cohort.id)))
    .limit(1);
  if (!row) return null;

  const [questions, audience, live] = await Promise.all([
    db
      .select()
      .from(assessmentQuestions)
      .where(eq(assessmentQuestions.assessmentId, assessmentId))
      .orderBy(asc(assessmentQuestions.position)),
    db
      .select({ memberId: assessmentAudienceMembers.memberId })
      .from(assessmentAudienceMembers)
      .where(eq(assessmentAudienceMembers.assessmentId, assessmentId)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(assessmentAttempts)
      .where(
        and(
          eq(assessmentAttempts.assessmentId, assessmentId),
          eq(assessmentAttempts.status, 'in_progress'),
        ),
      ),
  ]);

  return {
    id: row.id,
    title: row.title,
    status: row.status,
    instructions: row.instructions,
    curriculumRef: row.curriculumRef,
    totalTimeSeconds: row.totalTimeSeconds,
    timerMode: row.timerMode,
    defaultQuestionSeconds: row.defaultQuestionSeconds,
    focusGraceSeconds: row.focusGraceSeconds,
    questionsPerAttempt: row.questionsPerAttempt,
    passMarkPct: row.passMarkPct,
    allowAnswerReview: row.allowAnswerReview,
    audience: row.audience,
    audienceMemberIds: audience.map((a) => a.memberId),
    liveAttempts: live[0]?.n ?? 0,
    questions: questions.map((q) => ({
      id: q.id,
      position: q.position,
      type: q.type,
      prompt: q.prompt,
      imageUrl: q.imageUrl,
      options: q.options,
      correctIndex: q.correctIndex,
      referenceAnswer: q.referenceAnswer,
      explanation: q.explanation,
      timeLimitSeconds: q.timeLimitSeconds,
      points: q.points,
    })),
  };
}

export type AudienceCandidate = {
  memberId: string;
  fullName: string;
  email: string;
  /** Already on this assessment's audience list. */
  selected: boolean;
};

/**
 * The cohort's active students, flagged with whether this assessment is already aimed at
 * them — everything the audience picker needs, in one read.
 *
 * The email is here because names in a cohort repeat and a test account is usually told
 * apart by its address rather than by its name. Admin-only, like everything above.
 */
export async function getAudienceCandidates(
  ctx: CohortCtx,
  assessmentId: string,
): Promise<AudienceCandidate[]> {
  return db
    .select({
      memberId: cohortMembers.id,
      fullName: users.fullName,
      email: users.email,
      selected: sql<boolean>`EXISTS (
        SELECT 1 FROM ${assessmentAudienceMembers}
        WHERE ${assessmentAudienceMembers.assessmentId} = ${assessmentId}
          AND ${assessmentAudienceMembers.memberId} = ${cohortMembers.id}
      )`,
    })
    .from(cohortMembers)
    .innerJoin(users, eq(users.id, cohortMembers.userId))
    .where(and(eq(cohortMembers.cohortId, ctx.cohort.id), eq(cohortMembers.status, 'active')))
    .orderBy(asc(users.fullName));
}

export type AdminAttemptRow = {
  attemptId: string;
  memberId: string;
  studentName: string;
  attemptNumber: number;
  status: AttemptStatus;
  reviewStatus: ReviewStatus;
  submittedAt: Date | null;
  restartCount: number;
  integrityEvents: number;
  pct: number;
  provisional: boolean;
};

/** Every sitting of one assessment, for the admin's results table. */
export async function getAssessmentAttempts(
  ctx: CohortCtx,
  assessmentId: string,
): Promise<AdminAttemptRow[]> {
  const rows = await db
    .select({
      attemptId: assessmentAttempts.id,
      memberId: assessmentAttempts.memberId,
      studentName: users.fullName,
      attemptNumber: assessmentAttempts.attemptNumber,
      status: assessmentAttempts.status,
      reviewStatus: assessmentAttempts.reviewStatus,
      submittedAt: assessmentAttempts.submittedAt,
      restartCount: assessmentAttempts.restartCount,
      autoScore: assessmentAttempts.autoScore,
      autoTotal: assessmentAttempts.autoTotal,
      manualScore: assessmentAttempts.manualScore,
      manualTotal: assessmentAttempts.manualTotal,
      integrityEvents: sql<number>`(
        SELECT count(*)::int FROM ${assessmentIntegrityEvents}
        WHERE ${assessmentIntegrityEvents.attemptId} = ${assessmentAttempts.id}
          AND ${assessmentIntegrityEvents.kind} <> 'focus_returned'
      )`,
    })
    .from(assessmentAttempts)
    .innerJoin(assessments, eq(assessments.id, assessmentAttempts.assessmentId))
    .innerJoin(cohortMembers, eq(cohortMembers.id, assessmentAttempts.memberId))
    .innerJoin(users, eq(users.id, cohortMembers.userId))
    .where(
      and(
        eq(assessmentAttempts.assessmentId, assessmentId),
        eq(assessments.cohortId, ctx.cohort.id),
      ),
    )
    .orderBy(asc(users.fullName), desc(assessmentAttempts.attemptNumber));

  return rows.map((r) => {
    const score = scorePercent(r, r.reviewStatus !== 'pending');
    return {
      attemptId: r.attemptId,
      memberId: r.memberId,
      studentName: r.studentName,
      attemptNumber: r.attemptNumber,
      status: r.status,
      reviewStatus: r.reviewStatus,
      submittedAt: r.submittedAt,
      restartCount: r.restartCount,
      integrityEvents: r.integrityEvents,
      pct: score.pct,
      provisional: score.provisional,
    };
  });
}

export type ReviewQueueRow = {
  attemptId: string;
  assessmentId: string;
  assessmentTitle: string;
  memberId: string;
  studentName: string;
  submittedAt: Date | null;
  /** Days between submission and now, on the server clock. */
  waitingDays: number;
  /** Written answers on this attempt that still carry no mark. */
  unmarked: number;
};

/**
 * Everything across the cohort still waiting for a human to mark it, oldest first.
 *
 * The per-assessment screens already carried a pending count, but nothing showed the whole
 * backlog in one place — so a paper set three weeks ago and never marked was invisible
 * unless somebody happened to open that assessment. The audit counted 107 ungraded answers
 * sitting behind that gap, and every one of them is a student looking at "Pending review" on
 * a result they sat and cannot see.
 *
 * Oldest first is the ordering that matters: the student who has waited longest is the one
 * the queue should hand you next.
 */
export async function getReviewQueue(ctx: CohortCtx, limit = 50): Promise<ReviewQueueRow[]> {
  const rows = await db
    .select({
      attemptId: assessmentAttempts.id,
      assessmentId: assessmentAttempts.assessmentId,
      assessmentTitle: assessments.title,
      memberId: assessmentAttempts.memberId,
      studentName: users.fullName,
      submittedAt: assessmentAttempts.submittedAt,
      /*
       * Aged in SQL, against the server clock — never handed to a component to subtract from
       * the browser's. Same rule as the sweep panel.
       */
      waitingDays: sql<number>`greatest(0, floor(extract(
        epoch FROM (now() - coalesce(${assessmentAttempts.submittedAt}, ${assessmentAttempts.startedAt}))
      ) / 86400))::int`,
      /*
       * Answers with something written in them and no mark yet. `is_correct IS NULL` is what
       * "not yet marked" means on an answer row — an answer marked wrong is `false`, which
       * is a decision somebody made and not a gap.
       */
      unmarked: sql<number>`(
        SELECT count(*)::int FROM ${assessmentAnswers}
        WHERE ${assessmentAnswers.attemptId} = ${assessmentAttempts.id}
          AND ${assessmentAnswers.isCorrect} IS NULL
          AND ${assessmentAnswers.textAnswer} IS NOT NULL
          AND length(btrim(${assessmentAnswers.textAnswer})) > 0
      )`,
    })
    .from(assessmentAttempts)
    .innerJoin(assessments, eq(assessments.id, assessmentAttempts.assessmentId))
    .innerJoin(cohortMembers, eq(cohortMembers.id, assessmentAttempts.memberId))
    .innerJoin(users, eq(users.id, cohortMembers.userId))
    .where(
      and(
        eq(assessments.cohortId, ctx.cohort.id),
        eq(assessmentAttempts.reviewStatus, 'pending'),
        // A sitting a restart threw away is not work anybody is waiting on.
        inArray(assessmentAttempts.status, ['submitted', 'expired']),
      ),
    )
    .orderBy(asc(assessmentAttempts.submittedAt))
    .limit(limit);

  return rows;
}

/* -------------------------------------------------- one attempt, in full */

export type AttemptAnswerView = {
  answerId: string;
  questionId: string;
  position: number;
  type: QuestionType;
  prompt: string;
  imageUrl: string | null;
  options: string[];
  /** Withheld from the student until the admin allows answer review. */
  correctIndex: number | null;
  explanation: string | null;
  referenceAnswer: string | null;
  selectedIndex: number | null;
  textAnswer: string | null;
  expired: boolean;
  isCorrect: boolean | null;
  awardedPoints: number;
  points: number;
  reviewerNote: string | null;
  secondsTaken: number | null;
};

export type AttemptDetail = {
  attemptId: string;
  assessmentId: string;
  assessmentTitle: string;
  memberId: string;
  studentName: string;
  attemptNumber: number;
  status: AttemptStatus;
  reviewStatus: ReviewStatus;
  startedAt: Date;
  submittedAt: Date | null;
  restartCount: number;
  /** Full-screen exits counted against the sitting, and the number that voids one. */
  fullscreenExits: number;
  fullscreenExitLimit: number;
  passMarkPct: number;
  allowAnswerReview: boolean;
  earned: number;
  outOf: number;
  pct: number;
  provisional: boolean;
  correct: number;
  incorrect: number;
  unanswered: number;
  secondsTaken: number | null;
  feedback: string | null;
  answers: AttemptAnswerView[];
  integrity: { kind: string; occurredAt: Date; awayMs: number | null }[];
};

/**
 * One attempt in full — the private result.
 *
 * `viewer` decides both *whether* the row is returned and how much of it is filled in. A
 * student may only ever load their own attempt (the member id becomes part of the WHERE
 * clause, so another student's id simply finds nothing), and even then the correct answers
 * and explanations are withheld unless the admin turned answer review on. An admin sees
 * everything, including the integrity log.
 */
export async function getAttemptDetail(args: {
  attemptId: string;
  viewer: { kind: 'student'; memberId: string } | { kind: 'admin'; cohortId: string };
}): Promise<AttemptDetail | null> {
  const { attemptId, viewer } = args;

  const scope =
    viewer.kind === 'student'
      ? eq(assessmentAttempts.memberId, viewer.memberId)
      : eq(assessments.cohortId, viewer.cohortId);

  const [attempt] = await db
    .select({
      attemptId: assessmentAttempts.id,
      assessmentId: assessmentAttempts.assessmentId,
      assessmentTitle: assessments.title,
      memberId: assessmentAttempts.memberId,
      studentName: users.fullName,
      attemptNumber: assessmentAttempts.attemptNumber,
      status: assessmentAttempts.status,
      reviewStatus: assessmentAttempts.reviewStatus,
      startedAt: assessmentAttempts.startedAt,
      submittedAt: assessmentAttempts.submittedAt,
      restartCount: assessmentAttempts.restartCount,
      fullscreenExits: assessmentAttempts.fullscreenExits,
      autoScore: assessmentAttempts.autoScore,
      autoTotal: assessmentAttempts.autoTotal,
      manualScore: assessmentAttempts.manualScore,
      manualTotal: assessmentAttempts.manualTotal,
      feedback: assessmentAttempts.feedback,
      passMarkPct: assessments.passMarkPct,
      allowAnswerReview: assessments.allowAnswerReview,
    })
    .from(assessmentAttempts)
    .innerJoin(assessments, eq(assessments.id, assessmentAttempts.assessmentId))
    .innerJoin(cohortMembers, eq(cohortMembers.id, assessmentAttempts.memberId))
    .innerJoin(users, eq(users.id, cohortMembers.userId))
    .where(and(eq(assessmentAttempts.id, attemptId), scope))
    .limit(1);

  if (!attempt) return null;

  const isAdmin = viewer.kind === 'admin';
  const reviewComplete = attempt.reviewStatus !== 'pending';
  const score = scorePercent(attempt, reviewComplete);

  /*
   * The paper this attempt was actually given. Reading the assessment's questions instead
   * would show a twenty-question sitting as five hundred rows, of which four hundred and
   * eighty were never asked and every one of them counted as unanswered.
   */
  const paperIds = await attemptQuestionIds(db, {
    attemptId,
    assessmentId: attempt.assessmentId,
  });

  const unordered = await db
    .select({
      answerId: assessmentAnswers.id,
      questionId: assessmentQuestions.id,
      position: assessmentQuestions.position,
      type: assessmentQuestions.type,
      prompt: assessmentQuestions.prompt,
      imageUrl: assessmentQuestions.imageUrl,
      options: assessmentQuestions.options,
      correctIndex: assessmentQuestions.correctIndex,
      explanation: assessmentQuestions.explanation,
      referenceAnswer: assessmentQuestions.referenceAnswer,
      points: assessmentQuestions.points,
      selectedIndex: assessmentAnswers.selectedIndex,
      textAnswer: assessmentAnswers.textAnswer,
      expired: assessmentAnswers.expired,
      isCorrect: assessmentAnswers.isCorrect,
      awardedPoints: assessmentAnswers.awardedPoints,
      reviewerNote: assessmentAnswers.reviewerNote,
      startedAt: assessmentAnswers.startedAt,
      answeredAt: assessmentAnswers.answeredAt,
    })
    .from(assessmentQuestions)
    .leftJoin(
      assessmentAnswers,
      and(
        eq(assessmentAnswers.questionId, assessmentQuestions.id),
        eq(assessmentAnswers.attemptId, attemptId),
      ),
    )
    .where(paperIds.length === 0 ? sql`false` : inArray(assessmentQuestions.id, paperIds));

  // Back into the order the student saw, which is the paper's order and not the bank's.
  const rows = inPaperOrder(
    unordered.map((r) => ({ ...r, id: r.questionId })),
    paperIds,
  );

  // Whether the student is allowed the breakdown at all. The admin always is.
  const showAnswers = isAdmin || attempt.allowAnswerReview;

  let correct = 0;
  let incorrect = 0;
  let unanswered = 0;

  const answers: AttemptAnswerView[] = rows.map((r, index) => {
    const answered =
      r.selectedIndex !== null || (r.textAnswer !== null && r.textAnswer.trim().length > 0);
    if (!answered) unanswered += 1;
    else if (r.isCorrect === true) correct += 1;
    else if (r.isCorrect === false) incorrect += 1;

    return {
      answerId: r.answerId ?? '',
      questionId: r.questionId,
      // Where it sat on this paper — "question 3 of 20" — not where it sits in the bank.
      position: index,
      type: r.type,
      prompt: r.prompt,
      imageUrl: r.imageUrl,
      options: r.options,
      correctIndex: showAnswers ? r.correctIndex : null,
      explanation: showAnswers ? r.explanation : null,
      // The model answer is a marking aid, not something a student is handed back.
      referenceAnswer: isAdmin ? r.referenceAnswer : null,
      selectedIndex: r.selectedIndex,
      textAnswer: r.textAnswer,
      expired: r.expired ?? false,
      isCorrect: r.isCorrect,
      awardedPoints: r.awardedPoints ?? 0,
      points: r.points,
      reviewerNote: r.reviewerNote,
      secondsTaken:
        r.startedAt && r.answeredAt
          ? Math.max(0, Math.round((r.answeredAt.getTime() - r.startedAt.getTime()) / 1000))
          : null,
    };
  });

  /*
   * Integrity events are for the admin. A student is told their attempt restarted — they
   * lived through it — but the log itself is part of the record the cohort lead reads, and
   * showing it back would turn a deterrent into a scoreboard for gaming it.
   */
  const integrity = isAdmin
    ? await db
        .select({
          kind: assessmentIntegrityEvents.kind,
          occurredAt: assessmentIntegrityEvents.occurredAt,
          awayMs: assessmentIntegrityEvents.awayMs,
        })
        .from(assessmentIntegrityEvents)
        .where(eq(assessmentIntegrityEvents.attemptId, attemptId))
        .orderBy(asc(assessmentIntegrityEvents.occurredAt))
    : [];

  return {
    ...attempt,
    fullscreenExitLimit: FULLSCREEN_EXIT_LIMIT,
    earned: score.earned,
    outOf: score.outOf,
    pct: score.pct,
    provisional: score.provisional,
    correct,
    incorrect,
    unanswered,
    secondsTaken: attempt.submittedAt
      ? Math.max(
          0,
          Math.round((attempt.submittedAt.getTime() - attempt.startedAt.getTime()) / 1000),
        )
      : null,
    answers,
    integrity,
  };
}

/* ---------------------------------------------------------------- student */

export type StudentAssessmentRow = {
  id: string;
  title: string;
  subjectName: string | null;
  /** Questions on one sitting — the number the student will actually answer. */
  questionCount: number;
  /** The bank behind it, when a sitting draws from one. Null when the paper is the bank. */
  bankSize: number | null;
  totalTimeSeconds: number | null;
  passMarkPct: number;
  /** The student's own latest finished attempt, if any. Never another student's. */
  lastAttempt: {
    attemptId: string;
    submittedAt: Date | null;
    pct: number;
    provisional: boolean;
    passed: boolean;
  } | null;
  /** An attempt they walked away from and can resume. */
  inProgressAttemptId: string | null;
};

/** Published assessments this student can sit, with their own history against each. */
export async function getStudentAssessments(ctx: MemberContext): Promise<StudentAssessmentRow[]> {
  const rows = await db
    .select({
      id: assessments.id,
      title: assessments.title,
      subjectName: subjects.name,
      totalTimeSeconds: assessments.totalTimeSeconds,
      passMarkPct: assessments.passMarkPct,
      questionsPerAttempt: assessments.questionsPerAttempt,
      bankCount: sql<number>`(
        SELECT count(*)::int FROM ${assessmentQuestions}
        WHERE ${assessmentQuestions.assessmentId} = ${assessments.id}
      )`,
    })
    .from(assessments)
    .leftJoin(subjects, eq(subjects.id, assessments.subjectId))
    .where(
      and(
        eq(assessments.cohortId, ctx.cohort.id),
        eq(assessments.status, 'published'),
        // Narrowly-published papers never reach this list at all — see `visibleToMember`.
        visibleToMember(ctx.memberId),
      ),
    )
    .orderBy(desc(assessments.publishedAt));

  if (rows.length === 0) return [];

  // Scoped to this member. There is no code path here that could return anyone else's.
  const attempts = await db
    .select({
      id: assessmentAttempts.id,
      assessmentId: assessmentAttempts.assessmentId,
      status: assessmentAttempts.status,
      reviewStatus: assessmentAttempts.reviewStatus,
      submittedAt: assessmentAttempts.submittedAt,
      attemptNumber: assessmentAttempts.attemptNumber,
      autoScore: assessmentAttempts.autoScore,
      autoTotal: assessmentAttempts.autoTotal,
      manualScore: assessmentAttempts.manualScore,
      manualTotal: assessmentAttempts.manualTotal,
    })
    .from(assessmentAttempts)
    .where(
      and(
        eq(assessmentAttempts.memberId, ctx.memberId),
        inArray(
          assessmentAttempts.assessmentId,
          rows.map((r) => r.id),
        ),
      ),
    )
    .orderBy(desc(assessmentAttempts.attemptNumber));

  return rows.map((row) => {
    const { questionsPerAttempt, bankCount, ...rest } = row;
    const mine = attempts.filter((a) => a.assessmentId === row.id);
    const live = mine.find((a) => a.status === 'in_progress') ?? null;
    const finished = mine.find((a) => a.status === 'submitted' || a.status === 'expired') ?? null;
    const score = finished ? scorePercent(finished, finished.reviewStatus !== 'pending') : null;

    return {
      ...rest,
      questionCount: paperSize({ bankSize: bankCount, questionsPerAttempt }),
      bankSize: questionsPerAttempt && questionsPerAttempt < bankCount ? bankCount : null,
      inProgressAttemptId: live?.id ?? null,
      lastAttempt:
        finished && score
          ? {
              attemptId: finished.id,
              submittedAt: finished.submittedAt,
              pct: score.pct,
              provisional: score.provisional,
              passed: score.pct >= row.passMarkPct,
            }
          : null,
    };
  });
}

export type RuntimeQuestion = {
  id: string;
  position: number;
  type: QuestionType;
  prompt: string;
  imageUrl: string | null;
  options: string[];
  points: number;
  /**
   * This question's own allowance. Null under one clock for the whole paper, where the
   * question has no deadline of its own at all.
   */
  timeLimitSeconds: number | null;
  /** Server-derived deadline once the question has been opened; null until then. */
  deadline: string | null;
  selectedIndex: number | null;
  textAnswer: string | null;
  expired: boolean;
  /** The student flagged this one to come back to. */
  markedForReview: boolean;
  /** Whether this question has ever been on screen — what separates skipped from unseen. */
  seen: boolean;
};

export type AttemptRuntime = {
  attemptId: string;
  assessmentId: string;
  title: string;
  instructions: string | null;
  attemptNumber: number;
  restartCount: number;
  focusGraceSeconds: number;
  /**
   * Which clock this paper runs on.
   *
   * The runner reads it for more than the countdown: under one clock for the whole paper
   * every question stays open, so a student can skip forward, mark one to come back to, and
   * change an answer they have already given. Under per-question timers a question locks
   * when its own allowance runs out, wherever the student happens to be at the time.
   */
  timerMode: TimerMode;
  defaultQuestionSeconds: number;
  /** Full-screen exits already counted against this sitting. */
  fullscreenExits: number;
  /** Exits that void the attempt. Sent so the warning quotes the rule the server applies. */
  fullscreenExitLimit: number;
  /** ISO instant the whole paper closes, if there is a total limit. */
  expiresAt: string | null;
  /** The server's clock at render, so the client seeds its countdown from ours. */
  serverNow: string;
  questions: RuntimeQuestion[];
};

/**
 * Everything the timed runtime needs, and nothing it must not have.
 *
 * Notably absent: `correctIndex`, `explanation` and `referenceAnswer`. They are never sent
 * to a student mid-attempt — a correct answer sitting in the page payload is an open book
 * however carefully the interface hides it.
 */
export async function getAttemptRuntime(args: {
  attemptId: string;
  memberId: string;
}): Promise<AttemptRuntime | null> {
  const [attempt] = await db
    .select({
      attemptId: assessmentAttempts.id,
      assessmentId: assessmentAttempts.assessmentId,
      attemptNumber: assessmentAttempts.attemptNumber,
      restartCount: assessmentAttempts.restartCount,
      fullscreenExits: assessmentAttempts.fullscreenExits,
      status: assessmentAttempts.status,
      expiresAt: assessmentAttempts.expiresAt,
      title: assessments.title,
      instructions: assessments.instructions,
      focusGraceSeconds: assessments.focusGraceSeconds,
      timerMode: assessments.timerMode,
      defaultQuestionSeconds: assessments.defaultQuestionSeconds,
    })
    .from(assessmentAttempts)
    .innerJoin(assessments, eq(assessments.id, assessmentAttempts.assessmentId))
    .where(
      and(
        eq(assessmentAttempts.id, args.attemptId),
        eq(assessmentAttempts.memberId, args.memberId),
      ),
    )
    .limit(1);

  if (!attempt || attempt.status !== 'in_progress') return null;

  // This attempt's own paper. Also the reason a reload cannot reshuffle: the draw happened
  // once, when the attempt opened, and this reads it back.
  const paperIds = await attemptQuestionIds(db, {
    attemptId: attempt.attemptId,
    assessmentId: attempt.assessmentId,
  });

  const unordered = await db
    .select({
      id: assessmentQuestions.id,
      position: assessmentQuestions.position,
      type: assessmentQuestions.type,
      prompt: assessmentQuestions.prompt,
      imageUrl: assessmentQuestions.imageUrl,
      options: assessmentQuestions.options,
      points: assessmentQuestions.points,
      timeLimitSeconds: assessmentQuestions.timeLimitSeconds,
      startedAt: assessmentAnswers.startedAt,
      selectedIndex: assessmentAnswers.selectedIndex,
      textAnswer: assessmentAnswers.textAnswer,
      expired: assessmentAnswers.expired,
      markedForReview: assessmentAnswers.markedForReview,
    })
    .from(assessmentQuestions)
    .leftJoin(
      assessmentAnswers,
      and(
        eq(assessmentAnswers.questionId, assessmentQuestions.id),
        eq(assessmentAnswers.attemptId, args.attemptId),
      ),
    )
    .where(paperIds.length === 0 ? sql`false` : inArray(assessmentQuestions.id, paperIds));

  const rows = inPaperOrder(unordered, paperIds);

  return {
    attemptId: attempt.attemptId,
    assessmentId: attempt.assessmentId,
    title: attempt.title,
    instructions: attempt.instructions,
    attemptNumber: attempt.attemptNumber,
    restartCount: attempt.restartCount,
    focusGraceSeconds: attempt.focusGraceSeconds,
    timerMode: attempt.timerMode,
    defaultQuestionSeconds: attempt.defaultQuestionSeconds,
    fullscreenExits: attempt.fullscreenExits,
    fullscreenExitLimit: FULLSCREEN_EXIT_LIMIT,
    expiresAt: attempt.expiresAt?.toISOString() ?? null,
    serverNow: new Date().toISOString(),
    questions: rows.map((r, index) => ({
      id: r.id,
      // Numbered by where it sits on this paper. The bank position is meaningless to a
      // student who was handed twenty of five hundred.
      position: index,
      type: r.type,
      prompt: r.prompt,
      imageUrl: r.imageUrl,
      options: isAutoGradable(r.type) ? r.options : [],
      points: r.points,
      /*
       * Under one clock for the whole paper a question has no allowance of its own, and
       * saying so with a null rather than quietly sending the default is what keeps the
       * runner from rendering a countdown that means nothing and locking a question a
       * student is still entitled to change.
       */
      timeLimitSeconds:
        attempt.timerMode === 'whole_paper'
          ? null
          : (r.timeLimitSeconds ?? attempt.defaultQuestionSeconds),
      deadline:
        attempt.timerMode === 'whole_paper' || !r.startedAt
          ? null
          : questionDeadline(
              r.startedAt,
              r.timeLimitSeconds,
              attempt.defaultQuestionSeconds,
            ).toISOString(),
      selectedIndex: r.selectedIndex,
      textAnswer: r.textAnswer,
      expired: r.expired ?? false,
      markedForReview: r.markedForReview ?? false,
      // The answer row is written the first time a question is opened, so its existence is
      // the record of having been shown one — which is what makes "skipped" distinguishable
      // from "never reached" in the palette.
      seen: r.startedAt !== null,
    })),
  };
}

/**
 * The rules screen: what a student is told before the clock starts.
 *
 * Every number here describes the sitting they are about to have, not the assessment behind
 * it. A bank of five hundred with a window of twenty is a twenty-question paper, and a
 * screen that said "500 questions · 8 hours" because that is what the table holds would be
 * a lie about the next twenty minutes of their life.
 *
 * `memberId` is what makes the coverage line possible — how much of the bank this student
 * has already met — and it is their own count and nobody else's.
 */
export async function getAssessmentBrief(args: {
  assessmentId: string;
  cohortId: string;
  memberId?: string;
}) {
  const [row] = await db
    .select({
      id: assessments.id,
      title: assessments.title,
      status: assessments.status,
      instructions: assessments.instructions,
      subjectName: subjects.name,
      timerMode: assessments.timerMode,
      totalTimeSeconds: assessments.totalTimeSeconds,
      defaultQuestionSeconds: assessments.defaultQuestionSeconds,
      focusGraceSeconds: assessments.focusGraceSeconds,
      passMarkPct: assessments.passMarkPct,
      questionsPerAttempt: assessments.questionsPerAttempt,
      bankSize: sql<number>`(
        SELECT count(*)::int FROM ${assessmentQuestions}
        WHERE ${assessmentQuestions.assessmentId} = ${assessments.id}
      )`,
      /** Mean per-question allowance across the bank, for the estimate below. */
      meanQuestionSeconds: sql<number>`(
        SELECT coalesce(avg(coalesce(${assessmentQuestions.timeLimitSeconds}, ${assessments.defaultQuestionSeconds})), 0)::float
        FROM ${assessmentQuestions}
        WHERE ${assessmentQuestions.assessmentId} = ${assessments.id}
      )`,
    })
    .from(assessments)
    .leftJoin(subjects, eq(subjects.id, assessments.subjectId))
    .where(
      and(
        eq(assessments.id, args.assessmentId),
        eq(assessments.cohortId, args.cohortId),
        // A student who is not an audience for this gets nothing back, so the rules screen
        // 404s rather than describing a paper they will not be allowed to start.
        args.memberId ? visibleToMember(args.memberId) : undefined,
      ),
    )
    .limit(1);

  if (!row) return null;

  const { bankSize, meanQuestionSeconds, questionsPerAttempt, ...rest } = row;
  const questionCount = paperSize({ bankSize, questionsPerAttempt });

  /*
   * An estimate rather than a sum, and deliberately so: which questions this sitting will
   * hold is not decided until the student presses the button, so the honest thing to show
   * beforehand is the bank's average allowance across however many they will be asked.
   * When the window is the whole bank this is the exact total again.
   */
  const questionSeconds = Math.round(meanQuestionSeconds * questionCount);

  const coverage =
    args.memberId && questionsPerAttempt
      ? await bankCoverage({ assessmentId: args.assessmentId, memberId: args.memberId })
      : null;

  return {
    ...rest,
    questionCount,
    questionSeconds,
    /** The bank behind the paper, or null when the paper *is* the bank. */
    bankSize: questionsPerAttempt && questionsPerAttempt < bankSize ? bankSize : null,
    /** How many of the bank's questions this student has already been served. */
    seenCount: coverage?.seenCount ?? null,
  };
}

/** A student's own attempt history for one assessment. Never anyone else's. */
export async function getStudentAttemptHistory(args: {
  assessmentId: string;
  memberId: string;
}): Promise<
  { attemptId: string; attemptNumber: number; status: AttemptStatus; submittedAt: Date | null }[]
> {
  return db
    .select({
      attemptId: assessmentAttempts.id,
      attemptNumber: assessmentAttempts.attemptNumber,
      status: assessmentAttempts.status,
      submittedAt: assessmentAttempts.submittedAt,
    })
    .from(assessmentAttempts)
    .where(
      and(
        eq(assessmentAttempts.assessmentId, args.assessmentId),
        eq(assessmentAttempts.memberId, args.memberId),
        ne(assessmentAttempts.status, 'in_progress'),
      ),
    )
    .orderBy(desc(assessmentAttempts.attemptNumber));
}
