import { describe, expect, it } from 'vitest';

import {
  type CardState,
  NEW_CARD,
  applyGrade,
  deckProgress,
  emptyMix,
  encouragement,
  estimatedMinutes,
  intervalLabel,
  isChoiceCard,
  nextReviewAt,
  sessionPoints,
  summarise,
} from '@/lib/domain/flashcards';

/**
 * The recall scheduler.
 *
 * What is worth proving here is not that the ladder has the numbers it has — that is
 * visible by reading it — but the behaviours a reviewer cannot see from the table: that
 * forgetting a card you knew costs you the whole ladder rather than one rung, that a card
 * flagged difficult has to be *earned* back rather than talked back, that the interval
 * printed on a button is the interval the database will actually record, and that a session
 * summary agrees with the difficult-card list sitting under it on the same screen.
 */

/** Replays a run of grades from a given starting point. */
function replay(grades: Parameters<typeof applyGrade>[1][], from: CardState = NEW_CARD): CardState {
  return grades.reduce((state, grade) => applyGrade(state, grade), from);
}

describe('applyGrade', () => {
  it('starts a new card on the bottom rung and walks it up', () => {
    const first = applyGrade(NEW_CARD, 'good');
    expect(first.intervalDays).toBe(3);
    expect(first.streak).toBe(1);
    expect(first.reps).toBe(1);
    expect(first.mastery).toBe('learning');
  });

  it('sends a forgotten card all the way back, not one rung back', () => {
    const known = replay(['good', 'good', 'good']);
    expect(known.intervalDays).toBeGreaterThan(7);

    const forgotten = applyGrade(known, 'again');
    expect(forgotten.intervalDays).toBe(0);
    expect(forgotten.streak).toBe(0);
    expect(forgotten.lapses).toBe(1);
  });

  it('flags a card difficult the moment it is forgotten, however well known it was', () => {
    const mastered = replay(['good', 'good', 'good']);
    expect(mastered.mastery).toBe('mastered');
    expect(applyGrade(mastered, 'again').mastery).toBe('difficult');
  });

  it('holds a card in place on hard rather than advancing it', () => {
    const once = applyGrade(NEW_CARD, 'good');
    const twice = applyGrade(once, 'hard');
    // The streak still counts — it was recalled — but the spacing does not widen.
    expect(twice.streak).toBe(2);
    expect(twice.intervalDays).toBe(once.intervalDays);
  });

  it('never lets hard alone clear the difficult flag', () => {
    const difficult = applyGrade(replay(['good', 'good']), 'again');
    expect(difficult.mastery).toBe('difficult');

    const stillDifficult = replay(['hard', 'hard', 'hard'], difficult);
    expect(stillDifficult.mastery).toBe('difficult');
  });

  it('clears the difficult flag after two clean recalls', () => {
    const difficult = applyGrade(replay(['good', 'good']), 'again');
    expect(applyGrade(difficult, 'good').mastery).toBe('difficult');
    expect(replay(['good', 'good'], difficult).mastery).toBe('learning');
  });

  it('counts every review, including the ones that went badly', () => {
    expect(replay(['good', 'again', 'hard', 'easy']).reps).toBe(4);
  });

  it('does not let a lucky easy on a lapsed card declare it mastered', () => {
    const difficult = applyGrade(replay(['good', 'good', 'good']), 'again');
    expect(applyGrade(difficult, 'easy').mastery).not.toBe('mastered');
  });
});

describe('nextReviewAt', () => {
  const now = new Date('2026-09-10T18:00:00.000Z');

  it('brings a forgotten card back inside the same sitting, not tomorrow', () => {
    const forgotten = applyGrade(NEW_CARD, 'again');
    const due = nextReviewAt(forgotten, now);
    expect(due.getTime() - now.getTime()).toBe(10 * 60 * 1000);
  });

  it('schedules a recalled card the stated number of days out', () => {
    const state = applyGrade(NEW_CARD, 'good');
    const due = nextReviewAt(state, now);
    const days = Math.round((due.getTime() - now.getTime()) / 86_400_000);
    expect(days).toBe(state.intervalDays);
  });
});

describe('intervalLabel', () => {
  /*
   * The promise on the button and the row in the database are produced by the same
   * function, and this is the test that keeps them that way: the label is asserted against
   * `applyGrade`'s own output rather than against a hardcoded string, so a change to the
   * ladder cannot leave the buttons advertising the old one.
   */
  it('states exactly what the scheduler will do', () => {
    for (const grade of ['again', 'hard', 'good', 'easy'] as const) {
      const days = applyGrade(NEW_CARD, grade).intervalDays;
      const label = intervalLabel(NEW_CARD, grade);
      if (days === 0) expect(label).toBe('10m');
      else if (days === 1) expect(label).toBe('1d');
      else if (days < 30) expect(label).toBe(`${days}d`);
      else expect(label).toBe(`${Math.round(days / 30)}mo`);
    }
  });

  it('always offers a longer wait for a better grade', () => {
    const state = replay(['good']);
    const days = (grade: Parameters<typeof applyGrade>[1]) => applyGrade(state, grade).intervalDays;
    expect(days('again')).toBeLessThanOrEqual(days('hard'));
    expect(days('hard')).toBeLessThanOrEqual(days('good'));
    expect(days('good')).toBeLessThanOrEqual(days('easy'));
  });
});

describe('summarise', () => {
  it('counts only good and easy as recalled', () => {
    const summary = summarise([
      { cardId: 'a', grade: 'good' },
      { cardId: 'b', grade: 'hard' },
      { cardId: 'c', grade: 'easy' },
      { cardId: 'd', grade: 'again' },
    ]);
    expect(summary.correct).toBe(2);
    expect(summary.accuracy).toBe(50);
  });

  it('lists exactly the cards the accuracy figure excluded', () => {
    const outcomes = [
      { cardId: 'a', grade: 'good' as const },
      { cardId: 'b', grade: 'hard' as const },
      { cardId: 'c', grade: 'again' as const },
    ];
    const summary = summarise(outcomes);
    // The completion screen shows both of these at once; they must agree.
    expect(summary.difficultCardIds).toEqual(['b', 'c']);
    expect(summary.reviewed - summary.correct).toBe(summary.difficultCardIds.length);
  });

  it('reports the best run rather than the last one', () => {
    const summary = summarise([
      { cardId: 'a', grade: 'good' },
      { cardId: 'b', grade: 'good' },
      { cardId: 'c', grade: 'good' },
      { cardId: 'd', grade: 'again' },
      { cardId: 'e', grade: 'good' },
    ]);
    expect(summary.bestStreak).toBe(3);
  });

  it('is not perfect when a card merely scraped through', () => {
    expect(summarise([{ cardId: 'a', grade: 'hard' }]).perfect).toBe(false);
    expect(summarise([{ cardId: 'a', grade: 'good' }]).perfect).toBe(true);
  });

  it('reports an empty run as zero rather than as a division by zero', () => {
    const summary = summarise([]);
    expect(summary.accuracy).toBe(0);
    expect(summary.perfect).toBe(false);
  });
});

describe('sessionPoints', () => {
  const run = (reviewed: number, correct: number) =>
    summarise(
      Array.from({ length: reviewed }, (_, i) => ({
        cardId: `c${i}`,
        grade: i < correct ? ('good' as const) : ('again' as const),
      })),
    );

  it('pays nothing for a token run', () => {
    expect(sessionPoints(run(4, 4), 5)).toBe(0);
  });

  it('pays the full rate for an accurate run', () => {
    expect(sessionPoints(run(10, 9), 5)).toBe(5);
  });

  it('pays less for a poor run, but never nothing', () => {
    expect(sessionPoints(run(10, 2), 5)).toBeGreaterThan(0);
    expect(sessionPoints(run(10, 2), 5)).toBeLessThan(5);
  });

  it('cannot be farmed by running a longer deck', () => {
    // The ceiling is per session, so a 200-card run pays the same as a 10-card one.
    expect(sessionPoints(run(200, 200), 5)).toBe(sessionPoints(run(10, 10), 5));
  });
});

describe('deck maths', () => {
  it('counts a difficult card as progress, not as a card still to start', () => {
    const mix = { ...emptyMix(), new: 4, learning: 2, difficult: 3, mastered: 1 };
    // Working hard on the cards you keep forgetting must never move the bar backwards.
    expect(deckProgress(mix).done).toBe(6);
    expect(deckProgress(mix).total).toBe(10);
    expect(deckProgress(mix).percent).toBe(60);
  });

  it('reports an untouched deck as zero without dividing by nothing', () => {
    expect(deckProgress(emptyMix(0)).percent).toBe(0);
  });

  it('never estimates a deck at zero minutes', () => {
    expect(estimatedMinutes(1)).toBeGreaterThanOrEqual(1);
    expect(estimatedMinutes(0)).toBeGreaterThanOrEqual(1);
    expect(estimatedMinutes(120)).toBe(24);
  });
});

describe('encouragement', () => {
  it('stays silent for most of a run', () => {
    expect(encouragement(0, 1, 24)).toBeNull();
    expect(encouragement(2, 4, 24)).toBeNull();
  });

  it('speaks only once a run is worth naming', () => {
    expect(encouragement(5, 8, 24)).toBe("You're locked in.");
    expect(encouragement(8, 10, 24)).toBe('Eight in a row.');
  });

  it('does not congratulate a finished deck mid-sentence', () => {
    // The completion screen has its own verdict; this line must be gone by then.
    expect(encouragement(3, 24, 24)).toBeNull();
  });
});

describe('card types', () => {
  it('treats only the choose-an-option types as scored', () => {
    expect(isChoiceCard('multiple_choice')).toBe(true);
    expect(isChoiceCard('true_false')).toBe(true);
    expect(isChoiceCard('cloze')).toBe(false);
    expect(isChoiceCard('definition')).toBe(false);
  });
});
