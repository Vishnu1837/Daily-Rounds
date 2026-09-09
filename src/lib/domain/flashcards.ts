/**
 * Flashcards — the recall model.
 *
 * Everything in this file is pure. It takes what the database knows about a card and what
 * the student just said about it, and returns what the database should know next. No
 * clock, no I/O, no React: the whole scheduler is testable from a plain object, which is
 * the same rule `points.ts` and `consistency.ts` already hold to.
 *
 * The scheduler is a deliberately small SM-2 derivative. Full SuperMemo carries an ease
 * factor tuned over decades of daily reviews on decks of thousands; a student here meets a
 * deck of twenty-four cards a handful of times before an exam. A six-decimal ease factor
 * would be false precision on that much data, so the interval ladder below is coarse,
 * legible, and — the part that matters — explainable on screen: pressing Good tells you
 * you will see the card again in four days, and it means it.
 */

/** How well the card came back. Ordered worst to best; the order is load-bearing. */
export const GRADES = ['again', 'hard', 'good', 'easy'] as const;
export type Grade = (typeof GRADES)[number];

/**
 * Where a card stands for one student.
 *
 * `difficult` is not a stage of learning — it is a *flag*, and it is the reason this state
 * exists as its own value rather than as a low ease number. The end-of-session offer to
 * "review the difficult cards" has to be able to name them, and a threshold on a float is
 * not a name. A card becomes difficult by being forgotten, and stops being difficult by
 * being remembered twice; nothing else moves it.
 */
export const MASTERY_STATES = ['new', 'learning', 'difficult', 'mastered'] as const;
export type Mastery = (typeof MASTERY_STATES)[number];

/** The kinds of card the deck can hold. One design system, seven interaction models. */
export const CARD_TYPES = [
  'definition',
  'question',
  'cloze',
  'multiple_choice',
  'true_false',
  'image',
  'concept',
] as const;
export type CardType = (typeof CARD_TYPES)[number];

/**
 * The card types the student answers by *choosing* rather than by self-assessing.
 *
 * They still finish on the same four grades — a student who guessed right should be able
 * to say so — but the reveal is triggered by the choice, and the card knows whether the
 * choice was right. Everything else about them is identical, which is why this is a set
 * membership test and not a second card component.
 */
const CHOICE_TYPES: readonly CardType[] = ['multiple_choice', 'true_false'];

export function isChoiceCard(type: CardType): boolean {
  return CHOICE_TYPES.includes(type);
}

/** What the scheduler knows about one card, for one student, before a review. */
export type CardState = {
  mastery: Mastery;
  /** Consecutive non-`again` reviews. Reset to zero by a lapse. */
  streak: number;
  /** Total reviews ever. */
  reps: number;
  /** Times the card has been forgotten after having been known. */
  lapses: number;
  /** Days until the next sighting, from the last review. */
  intervalDays: number;
};

export const NEW_CARD: CardState = {
  mastery: 'new',
  streak: 0,
  reps: 0,
  lapses: 0,
  intervalDays: 0,
};

/**
 * The interval ladder, in days, indexed by how many times in a row the card has come back.
 *
 * Rungs rather than a multiplier because a multiplier compounds its own rounding: three
 * Goods on a 1.3x ease is 2.2 days, which the UI has to round to 2 and then cannot explain
 * why the next one is 3. A ladder says "same day, tomorrow, in three days, in a week" and
 * every step of that is a sentence a student can read.
 */
const LADDER = [0, 1, 3, 7, 14, 30, 60] as const;

/** Grade-specific movement along the ladder. */
const STEP: Record<Grade, number> = {
  again: -99, // Straight back to the bottom, not one rung down.
  hard: 0, // Held in place: seen again at the same spacing.
  good: 1,
  easy: 2,
};

function rung(streak: number): number {
  return LADDER[Math.min(streak, LADDER.length - 1)] ?? 0;
}

/**
 * Applies a grade to a card's state.
 *
 * Mastery moves on the *streak*, not on the grade alone, so a single lucky Easy on a card
 * that has been forgotten twice does not declare it mastered — and a single Again on a
 * long-known card marks it difficult immediately, because forgetting something you knew is
 * the most informative event the scheduler ever gets.
 */
export function applyGrade(state: CardState, grade: Grade): CardState {
  const reps = state.reps + 1;

  if (grade === 'again') {
    return {
      mastery: 'difficult',
      streak: 0,
      reps,
      lapses: state.lapses + 1,
      intervalDays: 0,
    };
  }

  const streak = state.streak + 1;
  const target = Math.max(0, Math.min(streak + STEP[grade], LADDER.length - 1));

  return {
    mastery: nextMastery(state, grade, streak),
    streak,
    reps,
    lapses: state.lapses,
    intervalDays: rung(target),
  };
}

function nextMastery(state: CardState, grade: Grade, streak: number): Mastery {
  /*
   * A card that was flagged difficult has to earn its way out, and `hard` is not earning
   * it: "I got there eventually" is the honest report of a card that is still difficult.
   * Two clean recalls clear the flag.
   */
  if (state.mastery === 'difficult') {
    return grade !== 'hard' && streak >= 2 ? 'learning' : 'difficult';
  }
  if (grade === 'hard') return 'learning';
  if (streak >= 3 || (grade === 'easy' && streak >= 2)) return 'mastered';
  return 'learning';
}

/** The next review instant for a card, given when it was just reviewed. */
export function nextReviewAt(state: CardState, reviewedAt: Date): Date {
  const next = new Date(reviewedAt);
  /*
   * A zero-day interval is "again this session", not "in twenty-four hours". Ten minutes
   * is short enough that a student who keeps studying meets the card again in the same
   * sitting, and long enough that it does not come back as the very next card.
   */
  if (state.intervalDays === 0) return new Date(next.getTime() + 10 * 60 * 1000);
  next.setDate(next.getDate() + state.intervalDays);
  return next;
}

/** Human copy for the interval a grade would schedule. Shown on the grade buttons. */
export function intervalLabel(state: CardState, grade: Grade): string {
  const days = applyGrade(state, grade).intervalDays;
  if (days === 0) return '10m';
  if (days === 1) return '1d';
  if (days < 30) return `${days}d`;
  return `${Math.round(days / 30)}mo`;
}

/* ------------------------------------------------------------------ decks */

/**
 * Estimated study time for a deck, in whole minutes.
 *
 * Twelve seconds a card is what a session actually looks like once a student has seen a
 * deck once — read, flip, judge. It is rounded to the nearest minute and floored at one,
 * because "~0 min" on a deck card is worse than no estimate at all.
 */
export function estimatedMinutes(cardCount: number): number {
  return Math.max(1, Math.round((cardCount * 12) / 60));
}

/** The mastery mix of a deck, for the segmented meter on the deck card. */
export type MasteryMix = Record<Mastery, number>;

export function emptyMix(cardCount = 0): MasteryMix {
  return { new: cardCount, learning: 0, difficult: 0, mastered: 0 };
}

/**
 * How far through a deck a student is.
 *
 * A card counts as "handled" once it has left `new` — including the ones sitting in
 * `difficult`. Excluding them would make a student who is working hard on the cards they
 * keep forgetting watch their progress go *backwards*, which is precisely the moment the
 * product should be telling them they are doing the right thing.
 */
export function deckProgress(mix: MasteryMix): { done: number; total: number; percent: number } {
  const total = mix.new + mix.learning + mix.difficult + mix.mastered;
  const done = total - mix.new;
  return { done, total, percent: total === 0 ? 0 : Math.round((done / total) * 100) };
}

/* --------------------------------------------------------------- sessions */

export type ReviewOutcome = { cardId: string; grade: Grade };

export type SessionSummary = {
  reviewed: number;
  /** Cards graded `good` or `easy` — recalled without a stumble. */
  correct: number;
  accuracy: number;
  bestStreak: number;
  /** Cards graded `again` or `hard`, in the order they were met. */
  difficultCardIds: string[];
  perfect: boolean;
};

/**
 * Reduces a session's grades into the numbers the completion screen reports.
 *
 * `correct` counts `good` and `easy` only. Counting `hard` as correct would flatter the
 * student — the whole point of a four-way scale is that "I got there, painfully" is a
 * different fact from "I knew it" — and it would also make the accuracy figure disagree
 * with the difficult-cards list sitting directly beneath it on the same screen.
 */
export function summarise(outcomes: readonly ReviewOutcome[]): SessionSummary {
  let correct = 0;
  let streak = 0;
  let bestStreak = 0;
  const difficultCardIds: string[] = [];

  for (const { cardId, grade } of outcomes) {
    if (grade === 'good' || grade === 'easy') {
      correct += 1;
      streak += 1;
      bestStreak = Math.max(bestStreak, streak);
    } else {
      streak = 0;
      difficultCardIds.push(cardId);
    }
  }

  const reviewed = outcomes.length;
  return {
    reviewed,
    correct,
    accuracy: reviewed === 0 ? 0 : Math.round((correct / reviewed) * 100),
    bestStreak,
    difficultCardIds,
    perfect: reviewed > 0 && correct === reviewed,
  };
}

/**
 * The one line of encouragement a session is allowed to show, or nothing.
 *
 * Deliberately a pure function of the run so far, and deliberately sparse: it returns null
 * far more often than it returns copy. The product's own design rules put a hard ceiling on
 * celebration — a card that shouts about two things shouts about neither — and a streak
 * message that fires on every third card is wallpaper by the sixth.
 */
export function encouragement(streak: number, reviewed: number, total: number): string | null {
  if (streak >= 12) return 'Twelve straight. The whole deck is answering to you.';
  if (streak >= 8) return 'Eight in a row.';
  if (streak >= 5) return "You're locked in.";
  // Held back until the run is nearly over, so it reads as a finish rather than a nudge.
  if (streak >= 3 && reviewed >= total - 3 && reviewed < total) return 'Hold it to the end.';
  return null;
}

/**
 * XP for a completed session.
 *
 * Capped, and capped low. Flashcards are the cheapest thing in the product to repeat — a
 * deck can be run five times in an evening — so an uncapped per-card award would make them
 * the fastest route up the leaderboard and quietly turn a revision tool into a farm. The
 * ceiling is the same argument the knowledge check makes: attempting is what is rewarded,
 * and the leaderboard measures consistency rather than volume.
 */
export function sessionPoints(summary: SessionSummary, perSession: number): number {
  if (summary.reviewed < 5) return 0;
  const accuracyShare = summary.accuracy >= 80 ? 1 : summary.accuracy >= 50 ? 0.6 : 0.3;
  return Math.max(1, Math.round(perSession * accuracyShare));
}
