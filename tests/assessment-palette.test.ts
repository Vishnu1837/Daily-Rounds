import { describe, expect, it } from 'vitest';

import {
  type PaletteEntry,
  questionState,
  submitSummary,
  tallyStates,
} from '@/lib/assessments/palette';

/**
 * The question palette's vocabulary.
 *
 * Worth testing away from React because the ordering is a product rule rather than a
 * rendering detail: these are the six words a student navigates a timed paper by, and the
 * grid, the key underneath it and the submit confirmation all have to mean the same thing
 * by each of them.
 */

const entry = (over: Partial<PaletteEntry> = {}): PaletteEntry => ({
  answered: false,
  markedForReview: false,
  seen: false,
  locked: false,
  ...over,
});

describe('what state a question is in', () => {
  it('calls an untouched question unseen, and a visited empty one skipped', () => {
    expect(questionState(entry())).toBe('unseen');
    expect(questionState(entry({ seen: true }))).toBe('skipped');
  });

  it('lets being answered outrank being marked', () => {
    // A marked, answered question must not look like work still to do.
    expect(questionState(entry({ seen: true, answered: true, markedForReview: true }))).toBe(
      'answered_marked',
    );
    expect(questionState(entry({ seen: true, markedForReview: true }))).toBe('marked');
  });

  it('lets a run-out clock outrank everything', () => {
    // Because it is the only state that changes what the student can still do. Sending
    // somebody back to a "skipped" question they cannot answer would be the palette lying.
    expect(
      questionState(entry({ seen: true, answered: true, markedForReview: true, locked: true })),
    ).toBe('locked');
  });
});

describe('the counts under the grid', () => {
  it('puts every question in exactly one bucket', () => {
    const entries = [
      entry(),
      entry({ seen: true }),
      entry({ seen: true, answered: true }),
      entry({ seen: true, answered: true, markedForReview: true }),
      entry({ seen: true, markedForReview: true }),
      entry({ seen: true, locked: true }),
    ];

    const tally = tallyStates(entries);
    expect(tally).toEqual({
      unseen: 1,
      skipped: 1,
      answered: 1,
      answered_marked: 1,
      marked: 1,
      locked: 1,
    });
    expect(Object.values(tally).reduce((a, b) => a + b, 0)).toBe(entries.length);
  });
});

describe('the submit confirmation', () => {
  it('counts a locked, empty question as left blank', () => {
    /*
     * From where the student is sitting a question whose clock ran out with nothing in it
     * will score nothing, and a confirmation that quietly left those out of the total would
     * be understating what they are about to hand in at the one moment it matters.
     */
    const summary = submitSummary([
      entry({ seen: true, answered: true }),
      entry({ seen: true, locked: true }),
      entry(),
    ]);

    expect(summary).toEqual({ answered: 1, unanswered: 2, marked: 0 });
  });

  it('counts a marked question whether or not it was answered', () => {
    const summary = submitSummary([
      entry({ seen: true, answered: true, markedForReview: true }),
      entry({ seen: true, markedForReview: true }),
    ]);

    expect(summary).toEqual({ answered: 1, unanswered: 1, marked: 2 });
  });
});
