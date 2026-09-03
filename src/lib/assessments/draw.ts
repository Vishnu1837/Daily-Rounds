/**
 * Which questions one sitting gets.
 *
 * A bank of five hundred questions and a window of twenty means the interesting work is not
 * "pick twenty" but "pick twenty that respect what this student has already been asked".
 * The rule, in order:
 *
 *  1. unseen first — a student meets new material for as long as there is any left;
 *  2. when the unseen pool cannot fill the window, take all of it and top the paper up from
 *     the whole bank at random. Ten unseen left and a window of twenty gives ten unseen and
 *     ten repeats, which is the brief's own example;
 *  3. shuffle the result. A paper with the new questions first and the repeats bunched at
 *     the end tells the student which is which, and a student who can spot a repeat can
 *     skip it — so the two are interleaved and only the database knows the difference.
 *
 * Pure, with the randomness injected, because "does this actually stop repeating until it
 * has to" is the one thing worth testing exhaustively and a `Math.random` buried in a query
 * cannot be tested at all.
 */

/** Returns a float in [0, 1) — `Math.random` in production, a fixed sequence in tests. */
export type Random = () => number;

export type DrawnQuestion = {
  questionId: string;
  /** False for a question this student has already been served on an earlier attempt. */
  fresh: boolean;
};

/**
 * Fisher–Yates, on a copy.
 *
 * Written out rather than reached for via `sort(() => random() - 0.5)`, which is not a
 * shuffle: comparison-sort with an inconsistent comparator leaves the front of the array
 * heavily biased towards where it started, so the same "random" questions would surface
 * again and again.
 */
export function shuffle<T>(items: readonly T[], random: Random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/**
 * Draws one sitting's paper.
 *
 * `size` is the window the admin configured. A window at or above the bank size means the
 * whole bank, still shuffled — the assessment is small enough that every sitting covers all
 * of it, and the only variation left to offer is the order.
 */
export function drawPaper(args: {
  /** Every question id in the assessment's bank. */
  poolIds: readonly string[];
  /** Ids this student has already been served, on any earlier attempt at this assessment. */
  seenIds: readonly string[];
  /** How many questions this sitting should hold. */
  size: number;
  random?: Random;
}): DrawnQuestion[] {
  const { poolIds, seenIds, size } = args;
  const random = args.random ?? Math.random;

  if (poolIds.length === 0 || size <= 0) return [];

  const seen = new Set(seenIds);
  const unseen = poolIds.filter((id) => !seen.has(id));

  const want = Math.min(size, poolIds.length);
  const fresh = shuffle(unseen, random).slice(0, want);

  const shortfall = want - fresh.length;
  if (shortfall === 0) {
    return shuffle(
      fresh.map((questionId) => ({ questionId, fresh: true })),
      random,
    );
  }

  /*
   * The top-up. Drawn from the whole bank minus what this paper already holds, rather than
   * from "the least recently seen" or "the ones they got wrong": the requirement is a
   * random pick, and a cleverer rule would quietly become a study plan the student could
   * game by answering badly on purpose.
   */
  const taken = new Set(fresh);
  const repeats = shuffle(
    poolIds.filter((id) => !taken.has(id)),
    random,
  ).slice(0, shortfall);

  return shuffle(
    [
      ...fresh.map((questionId) => ({ questionId, fresh: true })),
      ...repeats.map((questionId) => ({ questionId, fresh: false })),
    ],
    random,
  );
}

/**
 * How many questions a sitting of this assessment holds.
 *
 * One place, because the number is quoted on the rules screen before the draw happens and
 * has to match what the draw then produces. A window larger than the bank is not an error —
 * an admin who set twenty and has written twelve so far gets a paper of twelve.
 */
export function paperSize(args: { bankSize: number; questionsPerAttempt: number | null }): number {
  const { bankSize, questionsPerAttempt } = args;
  if (!questionsPerAttempt || questionsPerAttempt <= 0) return bankSize;
  return Math.min(questionsPerAttempt, bankSize);
}
