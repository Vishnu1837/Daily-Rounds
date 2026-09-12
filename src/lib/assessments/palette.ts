/**
 * The question palette's vocabulary.
 *
 * Pure, and in `lib` rather than in the runner, because "what state is this question in" is
 * a rule the product is judged on rather than a detail of one component: the grid of
 * numbers a student steers by, the "3 unanswered" line on the submit confirmation and the
 * counts under the grid all have to agree, and the only way they cannot drift is if one
 * function decides for all of them.
 */

export type QuestionState =
  /** Answered, and the student wants another look before submitting. */
  | 'answered_marked'
  /** Answered. Under one clock for the whole paper this is still changeable. */
  | 'answered'
  /** Seen, left unanswered, and flagged to come back to. */
  | 'marked'
  /** Seen and left unanswered — the deliberate skip. */
  | 'skipped'
  /** Never reached. */
  | 'unseen'
  /** Its own timer ran out. Readable, not answerable. Per-question timing only. */
  | 'locked';

export type PaletteEntry = {
  /** Whether anything has been entered — a choice made, or text typed. */
  answered: boolean;
  markedForReview: boolean;
  /** Whether the question has ever been on screen. */
  seen: boolean;
  /** Whether its per-question clock has run out. */
  locked: boolean;
};

/**
 * Which of the six states a question is in.
 *
 * Order matters and is the reason this is a function rather than a chain of ternaries at
 * the call site. `locked` wins over everything because it is the only state that changes
 * what the student can *do*, and telling somebody a question is merely "skipped" when its
 * clock ran out two minutes ago would send them back to a question they cannot answer.
 * Below that, being answered outranks being marked: the flag is a note to self, and a
 * palette that showed a marked-and-answered question in the same colour as an untouched one
 * would have a student hunting for work they have already done.
 */
export function questionState(entry: PaletteEntry): QuestionState {
  if (entry.locked) return 'locked';
  if (entry.answered) return entry.markedForReview ? 'answered_marked' : 'answered';
  if (entry.markedForReview) return 'marked';
  return entry.seen ? 'skipped' : 'unseen';
}

export type PaletteTally = Record<QuestionState, number>;

export function tallyStates(entries: PaletteEntry[]): PaletteTally {
  const tally: PaletteTally = {
    answered: 0,
    answered_marked: 0,
    marked: 0,
    skipped: 0,
    unseen: 0,
    locked: 0,
  };
  for (const entry of entries) tally[questionState(entry)] += 1;
  return tally;
}

/**
 * What the submit confirmation has to say out loud.
 *
 * `unanswered` deliberately counts locked questions in: from where the student is sitting,
 * a question whose clock ran out with nothing in it will score nothing, and a confirmation
 * that quietly left those out of the total would be understating what they are about to
 * hand in at the one moment it matters.
 */
export function submitSummary(entries: PaletteEntry[]): {
  answered: number;
  unanswered: number;
  marked: number;
} {
  return {
    answered: entries.filter((e) => e.answered).length,
    unanswered: entries.filter((e) => !e.answered).length,
    marked: entries.filter((e) => e.markedForReview).length,
  };
}

/** The label and swatch each state carries, so the grid and its key cannot disagree. */
export const STATE_LABELS: Record<QuestionState, string> = {
  answered: 'Answered',
  answered_marked: 'Answered · marked',
  marked: 'Marked for review',
  skipped: 'Skipped',
  unseen: 'Not seen yet',
  locked: 'Time up',
};
