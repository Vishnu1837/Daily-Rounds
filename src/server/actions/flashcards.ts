'use server';

import { and, eq, inArray } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { db } from '@/db/client';
import { flashcardProgress, flashcardReviews, flashcardSessions, flashcards } from '@/db/schema';
import { requireUserAction } from '@/lib/auth/guards';
import {
  type CardState,
  NEW_CARD,
  applyGrade,
  nextReviewAt,
  sessionPoints,
  summarise,
} from '@/lib/domain/flashcards';
import { ledgerKey } from '@/lib/domain/points';
import { fieldErrors, flashcardSessionSchema } from '@/lib/validation';
import { getMemberContext } from '@/server/context';
import { awardPoints } from '@/server/scoring';

import { type Result, fail, guarded, ok } from './shared';

export type FlashcardSessionResult = {
  reviewed: number;
  correct: number;
  accuracy: number;
  bestStreak: number;
  pointsAwarded: number;
  /** True when every card was recalled without a stumble. */
  perfect: boolean;
  /** Cards graded `again` or `hard`, for the "review the difficult ones" offer. */
  difficultCardIds: string[];
  /** Where the deck's cards stand now, for the completion screen's mastery readout. */
  mastered: number;
  learning: number;
  difficult: number;
};

/**
 * Records a run through a deck.
 *
 * Sent once, at the end of the run, rather than per card. The alternative — a round trip on
 * every flip — would put a network request between a student and the next card at exactly
 * the moment the interaction is supposed to feel instant, and would make the session
 * unusable on the patchy connections this product is actually used on. The cost of batching
 * is that a closed tab loses the run, which is why the screen also flushes when the student
 * leaves deliberately.
 *
 * Grades are replayed through the same pure scheduler the UI used to *label* the buttons,
 * so what the student was promised ("Good — 4d") and what the database records cannot drift.
 * The client's own arithmetic is never trusted: only the ordered list of grades is.
 */
export async function recordFlashcardSessionAction(input: {
  deckId: string;
  completed: boolean;
  outcomes: { cardId: string; grade: 'again' | 'hard' | 'good' | 'easy' }[];
}): Promise<Result<FlashcardSessionResult>> {
  return guarded(async () => {
    const user = await requireUserAction();
    const ctx = await getMemberContext(user);
    if (!ctx) return fail('You are not in an active cohort yet.');

    const parsed = flashcardSessionSchema.safeParse(input);
    if (!parsed.success) return fail('That session could not be saved.', fieldErrors(parsed.error));

    const { deckId, completed, outcomes } = parsed.data;

    /*
     * Card ids are checked against the deck before anything is written. Without this a
     * crafted request could advance a student's standing on cards in a deck they have never
     * opened — the ids are all the client sends, and they are all it would need.
     */
    const cardIds = [...new Set(outcomes.map((o) => o.cardId))];
    const owned = await db
      .select({ id: flashcards.id })
      .from(flashcards)
      .where(and(eq(flashcards.deckId, deckId), inArray(flashcards.id, cardIds)));

    const ownedIds = new Set(owned.map((c) => c.id));
    const accepted = outcomes.filter((o) => ownedIds.has(o.cardId));
    if (accepted.length === 0) return fail('Those cards are not in that deck.');

    const summary = summarise(accepted);
    const reviewedAt = new Date();

    // Existing standings for the cards touched, so the replay starts where they left off.
    const existing = await db
      .select()
      .from(flashcardProgress)
      .where(
        and(
          eq(flashcardProgress.memberId, ctx.memberId),
          inArray(flashcardProgress.cardId, [...ownedIds]),
        ),
      );

    const states = new Map<string, CardState>(
      existing.map((row) => [
        row.cardId,
        {
          mastery: row.mastery,
          streak: row.streak,
          reps: row.reps,
          lapses: row.lapses,
          intervalDays: row.intervalDays,
        },
      ]),
    );

    const lastGrade = new Map<string, 'again' | 'hard' | 'good' | 'easy'>();
    for (const outcome of accepted) {
      const before = states.get(outcome.cardId) ?? { ...NEW_CARD };
      states.set(outcome.cardId, applyGrade(before, outcome.grade));
      lastGrade.set(outcome.cardId, outcome.grade);
    }

    const [session] = await db
      .insert(flashcardSessions)
      .values({
        memberId: ctx.memberId,
        deckId,
        date: ctx.today,
        reviewed: summary.reviewed,
        correct: summary.correct,
        bestStreak: summary.bestStreak,
        completed,
      })
      .returning({ id: flashcardSessions.id });

    await db.insert(flashcardReviews).values(
      accepted.map((outcome) => ({
        memberId: ctx.memberId,
        cardId: outcome.cardId,
        sessionId: session?.id ?? null,
        grade: outcome.grade,
        occurredOn: ctx.today,
      })),
    );

    /*
     * One upsert per card rather than one statement per review: the replay above has
     * already collapsed a card met three times into its final standing, and writing the
     * intermediate states would be three round trips to arrive at the same row.
     */
    for (const [cardId, state] of states) {
      const grade = lastGrade.get(cardId);
      if (!grade) continue;
      const row = {
        memberId: ctx.memberId,
        cardId,
        mastery: state.mastery,
        streak: state.streak,
        reps: state.reps,
        lapses: state.lapses,
        intervalDays: state.intervalDays,
        lastGrade: grade,
        lastReviewedAt: reviewedAt,
        nextReviewAt: nextReviewAt(state, reviewedAt),
      };
      await db
        .insert(flashcardProgress)
        .values(row)
        .onConflictDoUpdate({
          target: [flashcardProgress.memberId, flashcardProgress.cardId],
          set: {
            mastery: row.mastery,
            streak: row.streak,
            reps: row.reps,
            lapses: row.lapses,
            intervalDays: row.intervalDays,
            lastGrade: row.lastGrade,
            lastReviewedAt: row.lastReviewedAt,
            nextReviewAt: row.nextReviewAt,
          },
        });
    }

    /*
     * XP is paid for a *finished* run only, and only once per session row.
     *
     * Abandoning half a deck still advances the scheduler — those reviews were real and the
     * cards genuinely came back — but it does not pay, because a product that pays for
     * three cards and an exit teaches students to open and close decks rather than to
     * study them. There is no `settleDay` call: flashcards are not a behaviour event, so a
     * session cannot change the day's consistency score in either direction.
     */
    let pointsAwarded = 0;
    const points = completed ? sessionPoints(summary, ctx.rules.flashcard_session) : 0;

    if (
      points > 0 &&
      session &&
      (await awardPoints({
        memberId: ctx.memberId,
        event: 'flashcard_session',
        points,
        occurredOn: ctx.today,
        idempotencyKey: ledgerKey.flashcardSession(ctx.memberId, session.id),
        metadata: { deckId, reviewed: summary.reviewed, accuracy: summary.accuracy },
      }))
    ) {
      pointsAwarded = points;
    }

    // The deck's standing after the run, for the completion screen.
    const deckCards = await db
      .select({ id: flashcards.id })
      .from(flashcards)
      .where(eq(flashcards.deckId, deckId));

    const after = await db
      .select({ cardId: flashcardProgress.cardId, mastery: flashcardProgress.mastery })
      .from(flashcardProgress)
      .where(
        and(
          eq(flashcardProgress.memberId, ctx.memberId),
          inArray(
            flashcardProgress.cardId,
            deckCards.map((c) => c.id),
          ),
        ),
      );

    const counts = { mastered: 0, learning: 0, difficult: 0 };
    for (const row of after) {
      if (row.mastery === 'mastered') counts.mastered += 1;
      else if (row.mastery === 'difficult') counts.difficult += 1;
      else if (row.mastery === 'learning') counts.learning += 1;
    }

    revalidatePath('/flashcards');
    revalidatePath('/today');

    return ok({
      reviewed: summary.reviewed,
      correct: summary.correct,
      accuracy: summary.accuracy,
      bestStreak: summary.bestStreak,
      perfect: summary.perfect,
      pointsAwarded,
      difficultCardIds: summary.difficultCardIds,
      ...counts,
    });
  }, 'We could not save that session. Your progress on those cards may not have been recorded.');
}
