'use server';

import { asc, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { db } from '@/db/client';
import { quizAttempts, quizQuestions } from '@/db/schema';
import { requireUserAction } from '@/lib/auth/guards';
import { ledgerKey, quizPoints } from '@/lib/domain/points';
import { fieldErrors, quizSubmissionSchema } from '@/lib/validation';
import { getMemberContext } from '@/server/context';
import { awardPoints, settleDay } from '@/server/scoring';

import { type Result, fail, guarded, ok } from './shared';

export type QuizResult = {
  score: number;
  total: number;
  pointsAwarded: number;
  review: {
    prompt: string;
    correctIndex: number;
    chosenIndex: number;
    explanation: string | null;
  }[];
};

/**
 * Grades a knowledge check. Correct answers are only ever known server-side, and the
 * points on offer are small by design — attempting is what is being rewarded.
 */
export async function submitQuizAction(input: {
  quizId: string;
  answers: number[];
}): Promise<Result<QuizResult>> {
  return guarded(async () => {
    const user = await requireUserAction();
    const ctx = await getMemberContext(user);
    if (!ctx) return fail('You are not in an active cohort yet.');

    const parsed = quizSubmissionSchema.safeParse(input);
    if (!parsed.success) return fail('That submission was not valid.', fieldErrors(parsed.error));

    const questions = await db
      .select()
      .from(quizQuestions)
      .where(eq(quizQuestions.quizId, parsed.data.quizId))
      .orderBy(asc(quizQuestions.id));

    if (questions.length === 0) return fail('That knowledge check could not be found.');

    let score = 0;
    const review = questions.map((q, i) => {
      const chosen = parsed.data.answers[i] ?? -1;
      if (chosen === q.correctIndex) score += 1;
      return {
        prompt: q.prompt,
        correctIndex: q.correctIndex,
        chosenIndex: chosen,
        explanation: q.explanation,
      };
    });

    await db.insert(quizAttempts).values({
      memberId: ctx.memberId,
      quizId: parsed.data.quizId,
      date: ctx.today,
      score,
      total: questions.length,
      answers: parsed.data.answers,
    });

    const { attempt, bonus } = quizPoints(score, questions.length, ctx.rules);
    let pointsAwarded = 0;

    if (
      await awardPoints({
        memberId: ctx.memberId,
        event: 'quiz_attempt',
        points: attempt,
        occurredOn: ctx.today,
        idempotencyKey: ledgerKey.quizAttempt(ctx.memberId, parsed.data.quizId, ctx.today),
      })
    ) {
      pointsAwarded += attempt;
    }

    if (
      bonus > 0 &&
      (await awardPoints({
        memberId: ctx.memberId,
        event: 'quiz_bonus',
        points: bonus,
        occurredOn: ctx.today,
        idempotencyKey: ledgerKey.quizBonus(ctx.memberId, parsed.data.quizId, ctx.today),
        metadata: { score, total: questions.length },
      }))
    ) {
      pointsAwarded += bonus;
    }

    await settleDay({
      memberId: ctx.memberId,
      date: ctx.today,
      calendar: ctx.calendar,
      rules: ctx.rules,
    });

    revalidatePath('/today');
    return ok({ score, total: questions.length, pointsAwarded, review });
  }, 'We could not save your answers. Please try again.');
}
