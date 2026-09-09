import 'server-only';

import { and, asc, eq, inArray, isNotNull, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import {
  flashcardDecks,
  flashcardProgress,
  flashcardSessions,
  flashcards,
  roadmapTopics,
  roadmaps,
  subjects,
} from '@/db/schema';
import { isSameBranch, resolveRef } from '@/lib/curriculum';
import {
  type CardType,
  type Mastery,
  type MasteryMix,
  emptyMix,
  estimatedMinutes,
} from '@/lib/domain/flashcards';
import type { MemberContext } from '@/server/context';

export type DeckSummary = {
  id: string;
  title: string;
  description: string | null;
  subjectName: string | null;
  subjectSlug: string | null;
  topicLabel: string | null;
  cardCount: number;
  estimatedMinutes: number;
  mix: MasteryMix;
  /** Cards whose next review has come due. Zero for a deck never opened. */
  due: number;
  lastStudiedAt: Date | null;
  /** Consecutive days this student has run at least one deck. */
  studyStreak: number;
};

/**
 * Every deck on this student's roadmap, with their own standing in each.
 *
 * The branch filter is done in memory for the same reason `getAvailableQuizzes` does it:
 * "one ref contains the other, either way round" against a list of the student's refs is a
 * pile of OR'd LIKEs in SQL, and the deck catalogue is cohort content in the hundreds
 * rather than rows per student. Reading it whole is both cheaper and legible.
 */
export async function getDecks(ctx: MemberContext): Promise<DeckSummary[]> {
  const [topicRefs, deckRows, cardRows, progressRows, sessionRows] = await Promise.all([
    db
      .select({ ref: roadmapTopics.curriculumRef })
      .from(roadmapTopics)
      .innerJoin(roadmaps, eq(roadmaps.id, roadmapTopics.roadmapId))
      .where(eq(roadmaps.memberId, ctx.memberId)),
    db
      .select({
        id: flashcardDecks.id,
        title: flashcardDecks.title,
        description: flashcardDecks.description,
        curriculumRef: flashcardDecks.curriculumRef,
        subjectName: subjects.name,
        subjectSlug: subjects.slug,
      })
      .from(flashcardDecks)
      .leftJoin(subjects, eq(subjects.id, flashcardDecks.subjectId))
      .where(isNotNull(flashcardDecks.curriculumRef)),
    db
      .select({ deckId: flashcards.deckId, id: flashcards.id })
      .from(flashcards)
      .orderBy(asc(flashcards.position)),
    db
      .select({
        cardId: flashcardProgress.cardId,
        mastery: flashcardProgress.mastery,
        nextReviewAt: flashcardProgress.nextReviewAt,
        lastReviewedAt: flashcardProgress.lastReviewedAt,
      })
      .from(flashcardProgress)
      .where(eq(flashcardProgress.memberId, ctx.memberId)),
    db
      .select({ date: flashcardSessions.date, deckId: flashcardSessions.deckId })
      .from(flashcardSessions)
      .where(eq(flashcardSessions.memberId, ctx.memberId)),
  ]);

  const refs = [...new Set(topicRefs.map((t) => t.ref).filter((r): r is string => r !== null))];
  if (refs.length === 0 || deckRows.length === 0) return [];

  const onMyRoadmap = deckRows.filter(
    (d) => d.curriculumRef !== null && refs.some((ref) => isSameBranch(ref, d.curriculumRef!)),
  );
  if (onMyRoadmap.length === 0) return [];

  const cardsByDeck = new Map<string, string[]>();
  for (const card of cardRows) {
    const list = cardsByDeck.get(card.deckId) ?? [];
    list.push(card.id);
    cardsByDeck.set(card.deckId, list);
  }

  const progressByCard = new Map(progressRows.map((p) => [p.cardId, p]));
  const studyStreak = consecutiveDays(
    sessionRows.map((s) => s.date),
    ctx.today,
  );
  const now = Date.now();

  return onMyRoadmap
    .map((deck): DeckSummary => {
      const cardIds = cardsByDeck.get(deck.id) ?? [];
      const mix = emptyMix();
      let due = 0;
      let lastStudiedAt: Date | null = null;

      for (const cardId of cardIds) {
        const progress = progressByCard.get(cardId);
        if (!progress) {
          mix.new += 1;
          continue;
        }
        mix[progress.mastery as Mastery] += 1;
        if (progress.nextReviewAt && progress.nextReviewAt.getTime() <= now) due += 1;
        if (
          progress.lastReviewedAt &&
          (!lastStudiedAt || progress.lastReviewedAt > lastStudiedAt)
        ) {
          lastStudiedAt = progress.lastReviewedAt;
        }
      }

      return {
        id: deck.id,
        title: deck.title,
        description: deck.description,
        subjectName: deck.subjectName,
        subjectSlug: deck.subjectSlug,
        topicLabel: resolveRef(deck.curriculumRef)?.label ?? null,
        cardCount: cardIds.length,
        estimatedMinutes: estimatedMinutes(cardIds.length),
        mix,
        due,
        lastStudiedAt,
        studyStreak,
      };
    })
    .filter((deck) => deck.cardCount > 0)
    .sort((a, b) => {
      // Started-but-unfinished decks first: the thing you already began is the thing you
      // most likely came here for. Untouched decks then, finished ones last.
      const rank = (d: DeckSummary) =>
        d.mix.new === d.cardCount ? 1 : d.mix.new === 0 && d.mix.difficult === 0 ? 2 : 0;
      return rank(a) - rank(b) || a.title.localeCompare(b.title);
    });
}

/** A card as the session screen receives it. */
export type SessionCard = {
  id: string;
  type: CardType;
  front: string;
  back: string;
  explanation: string | null;
  imageUrl: string | null;
  options: string[];
  correctOption: number | null;
  state: {
    mastery: Mastery;
    streak: number;
    reps: number;
    lapses: number;
    intervalDays: number;
  };
};

export type DeckDetail = {
  id: string;
  title: string;
  description: string | null;
  subjectName: string | null;
  topicLabel: string | null;
  cards: SessionCard[];
  mix: MasteryMix;
};

/**
 * One deck, with this student's standing folded into each card.
 *
 * The whole deck is sent, not a due-only subset. A student who opens a deck has decided to
 * study it, and being told "nothing is due, come back Thursday" is the single fastest way
 * to teach someone that opening the app is pointless. Due cards are ordered first instead —
 * the scheduler shapes the run rather than gating it.
 */
export async function getDeck(
  ctx: MemberContext,
  deckId: string,
  /** Restricts the run to specific cards — how "review the difficult ones" is served. */
  onlyCardIds?: string[],
): Promise<DeckDetail | null> {
  const [deckRow] = await db
    .select({
      id: flashcardDecks.id,
      title: flashcardDecks.title,
      description: flashcardDecks.description,
      curriculumRef: flashcardDecks.curriculumRef,
      subjectName: subjects.name,
    })
    .from(flashcardDecks)
    .leftJoin(subjects, eq(subjects.id, flashcardDecks.subjectId))
    .where(eq(flashcardDecks.id, deckId))
    .limit(1);

  if (!deckRow) return null;

  const [cardRows, progressRows] = await Promise.all([
    db
      .select()
      .from(flashcards)
      .where(
        onlyCardIds && onlyCardIds.length > 0
          ? and(eq(flashcards.deckId, deckId), inArray(flashcards.id, onlyCardIds))
          : eq(flashcards.deckId, deckId),
      )
      .orderBy(asc(flashcards.position)),
    db.select().from(flashcardProgress).where(eq(flashcardProgress.memberId, ctx.memberId)),
  ]);

  if (cardRows.length === 0) return null;

  const progressByCard = new Map(progressRows.map((p) => [p.cardId, p]));
  const mix = emptyMix();

  const cards = cardRows.map((card): SessionCard => {
    const progress = progressByCard.get(card.id);
    mix[(progress?.mastery ?? 'new') as Mastery] += 1;
    return {
      id: card.id,
      type: card.type as CardType,
      front: card.front,
      back: card.back,
      explanation: card.explanation,
      imageUrl: card.imageUrl,
      options: card.options ?? [],
      correctOption: card.correctOption,
      state: {
        mastery: (progress?.mastery ?? 'new') as Mastery,
        streak: progress?.streak ?? 0,
        reps: progress?.reps ?? 0,
        lapses: progress?.lapses ?? 0,
        intervalDays: progress?.intervalDays ?? 0,
      },
    };
  });

  /*
   * Order: overdue first, then the cards being learned, then new ones, then what is already
   * mastered. Within each band the author's own order is preserved — a deck is often
   * written to build on itself, and shuffling it would break arguments that run across
   * three cards.
   */
  const now = Date.now();
  const band = (card: SessionCard): number => {
    const progress = progressByCard.get(card.id);
    if (progress?.nextReviewAt && progress.nextReviewAt.getTime() <= now) return 0;
    if (card.state.mastery === 'difficult') return 1;
    if (card.state.mastery === 'learning') return 2;
    if (card.state.mastery === 'new') return 3;
    return 4;
  };
  cards.sort((a, b) => band(a) - band(b));

  return {
    id: deckRow.id,
    title: deckRow.title,
    description: deckRow.description,
    subjectName: deckRow.subjectName,
    topicLabel: resolveRef(deckRow.curriculumRef)?.label ?? null,
    cards,
    mix,
  };
}

/**
 * The longest run of consecutive study days ending today or yesterday.
 *
 * Yesterday counts as still alive for the same reason the product's other streaks do: a
 * student who studied last night and has not yet opened the app today has not broken
 * anything, and telling them at 9am that their streak is zero is both wrong and the surest
 * way to make it true.
 */
function consecutiveDays(dates: string[], today: string): number {
  if (dates.length === 0) return 0;
  const days = new Set(dates);
  const cursor = new Date(`${today}T00:00:00Z`);

  if (!days.has(today)) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
    if (!days.has(cursor.toISOString().slice(0, 10))) return 0;
  }

  let streak = 0;
  while (days.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

/** Deck and card totals for the empty state and the materials cross-link. */
export async function getFlashcardTotals(): Promise<{ decks: number; cards: number }> {
  const [row] = await db
    .select({
      decks: sql<number>`count(distinct ${flashcardDecks.id})::int`,
      cards: sql<number>`count(${flashcards.id})::int`,
    })
    .from(flashcardDecks)
    .leftJoin(flashcards, eq(flashcards.deckId, flashcardDecks.id));

  return { decks: row?.decks ?? 0, cards: row?.cards ?? 0 };
}
