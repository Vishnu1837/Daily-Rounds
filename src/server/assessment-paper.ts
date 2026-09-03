import 'server-only';

import { and, asc, eq, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import { assessmentAttemptQuestions, assessmentAttempts, assessmentQuestions } from '@/db/schema';
import { drawPaper, paperSize } from '@/lib/assessments/draw';

/**
 * The paper a student sits, on the server side of the line.
 *
 * Two facts hold this module together. The paper is drawn exactly once, in the transaction
 * that creates the attempt — so a reload cannot reshuffle it and a grader cannot mark
 * against questions nobody was asked. And every read of an attempt's questions goes through
 * `attemptQuestionIds` here rather than querying `assessment_questions` by assessment id,
 * because with a bank of five hundred the two answer very different questions: the second
 * would grade a twenty-question sitting out of five hundred.
 */

/** Either the connection or an open transaction — every function here works in both. */
type Conn = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * The questions this attempt was actually given, in the order it saw them.
 *
 * An empty paper means the attempt predates question banks, and the honest reading of it is
 * the one that was true when it was sat: the whole assessment, in position order. That
 * fallback is what keeps every result recorded before this feature existed openable.
 */
export async function attemptQuestionIds(
  conn: Conn,
  args: { attemptId: string; assessmentId: string },
): Promise<string[]> {
  const drawn = await conn
    .select({ questionId: assessmentAttemptQuestions.questionId })
    .from(assessmentAttemptQuestions)
    .where(eq(assessmentAttemptQuestions.attemptId, args.attemptId))
    .orderBy(asc(assessmentAttemptQuestions.position));

  if (drawn.length > 0) return drawn.map((r) => r.questionId);

  const all = await conn
    .select({ id: assessmentQuestions.id })
    .from(assessmentQuestions)
    .where(eq(assessmentQuestions.assessmentId, args.assessmentId))
    .orderBy(asc(assessmentQuestions.position));

  return all.map((r) => r.id);
}

/**
 * Draws this attempt's paper and writes it down.
 *
 * Runs inside the caller's transaction so that an attempt can never exist without the paper
 * it is meant to serve — an attempt row with no questions would be a sitting that opens on
 * an empty screen, and the draw being random, nothing could re-derive it afterwards.
 *
 * "Seen" is read back out of this same table across every one of the student's earlier
 * attempts, invalidated ones included: a restart takes the paper away but not the memory of
 * having read it, and treating those questions as unseen would hand the same set straight
 * back to a student who tabbed away.
 */
export async function drawAttemptPaper(
  conn: Conn,
  args: {
    attemptId: string;
    assessmentId: string;
    memberId: string;
    questionsPerAttempt: number | null;
  },
): Promise<{ size: number; freshCount: number; repeatCount: number }> {
  const pool = await conn
    .select({ id: assessmentQuestions.id })
    .from(assessmentQuestions)
    .where(eq(assessmentQuestions.assessmentId, args.assessmentId))
    .orderBy(asc(assessmentQuestions.position));

  if (pool.length === 0) return { size: 0, freshCount: 0, repeatCount: 0 };

  const seen = await conn
    .selectDistinct({ questionId: assessmentAttemptQuestions.questionId })
    .from(assessmentAttemptQuestions)
    .innerJoin(assessmentAttempts, eq(assessmentAttempts.id, assessmentAttemptQuestions.attemptId))
    .where(
      and(
        eq(assessmentAttempts.assessmentId, args.assessmentId),
        eq(assessmentAttempts.memberId, args.memberId),
      ),
    );

  const seenIds = new Set(seen.map((s) => s.questionId));

  /*
   * No window means the paper *is* the list, and it keeps the order the admin wrote it in.
   * Shuffling here would quietly break every existing assessment whose questions build on
   * each other — a stem followed by three questions about it, a case that unfolds — for no
   * benefit, since a paper that serves all of itself has nothing to vary.
   */
  const drawn = args.questionsPerAttempt
    ? drawPaper({
        poolIds: pool.map((q) => q.id),
        seenIds: [...seenIds],
        size: paperSize({
          bankSize: pool.length,
          questionsPerAttempt: args.questionsPerAttempt,
        }),
      })
    : pool.map((q) => ({ questionId: q.id, fresh: !seenIds.has(q.id) }));

  for (let i = 0; i < drawn.length; i += 200) {
    await conn.insert(assessmentAttemptQuestions).values(
      drawn.slice(i, i + 200).map((q, offset) => ({
        attemptId: args.attemptId,
        questionId: q.questionId,
        position: i + offset,
        fresh: q.fresh,
      })),
    );
  }

  return {
    size: drawn.length,
    freshCount: drawn.filter((q) => q.fresh).length,
    repeatCount: drawn.filter((q) => !q.fresh).length,
  };
}

/**
 * Carries a paper over to the attempt that replaces it.
 *
 * A restart is a consequence, not a reroll. Drawing fresh questions for the replacement
 * would make tabbing away the cheapest way out of a paper you did not like the look of, so
 * the student sits the same questions again, in the same order, with the clocks back at the
 * start — which is the whole of the penalty.
 *
 * Returns false when there was nothing to copy, i.e. an attempt from before banks existed.
 * The caller need do nothing about it: the empty-paper fallback in `attemptQuestionIds`
 * already reads that as "the whole assessment".
 */
export async function copyAttemptPaper(
  conn: Conn,
  args: { fromAttemptId: string; toAttemptId: string },
): Promise<boolean> {
  const rows = await conn
    .select({
      questionId: assessmentAttemptQuestions.questionId,
      position: assessmentAttemptQuestions.position,
      fresh: assessmentAttemptQuestions.fresh,
    })
    .from(assessmentAttemptQuestions)
    .where(eq(assessmentAttemptQuestions.attemptId, args.fromAttemptId))
    .orderBy(asc(assessmentAttemptQuestions.position));

  if (rows.length === 0) return false;

  for (let i = 0; i < rows.length; i += 200) {
    await conn.insert(assessmentAttemptQuestions).values(
      rows.slice(i, i + 200).map((r) => ({
        attemptId: args.toAttemptId,
        questionId: r.questionId,
        position: r.position,
        fresh: r.fresh,
      })),
    );
  }
  return true;
}

/**
 * How much of the bank this student has left to meet.
 *
 * Shown on the rules screen, because a student sitting the eleventh paper of a bank they
 * have nearly exhausted deserves to know why questions are starting to come round again,
 * rather than assuming the thing is broken.
 */
export async function bankCoverage(args: {
  assessmentId: string;
  memberId: string;
}): Promise<{ bankSize: number; seenCount: number }> {
  const [bank] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(assessmentQuestions)
    .where(eq(assessmentQuestions.assessmentId, args.assessmentId));

  const [seen] = await db
    .select({ n: sql<number>`count(DISTINCT ${assessmentAttemptQuestions.questionId})::int` })
    .from(assessmentAttemptQuestions)
    .innerJoin(assessmentAttempts, eq(assessmentAttempts.id, assessmentAttemptQuestions.attemptId))
    .where(
      and(
        eq(assessmentAttempts.assessmentId, args.assessmentId),
        eq(assessmentAttempts.memberId, args.memberId),
      ),
    );

  const bankSize = bank?.n ?? 0;
  return { bankSize, seenCount: Math.min(seen?.n ?? 0, bankSize) };
}

/** Orders question rows the way the paper had them, whatever order the query returned. */
export function inPaperOrder<T extends { id: string }>(rows: T[], orderedIds: string[]): T[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  return orderedIds.map((id) => byId.get(id)).filter((r): r is T => r !== undefined);
}
