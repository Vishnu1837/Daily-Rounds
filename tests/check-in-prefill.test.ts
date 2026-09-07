import { describe, expect, it } from 'vitest';

import {
  type CheckInEvidence,
  buildCheckInPrefill,
  hasEvidence,
  inferCompletion,
  suggestedMinutes,
  suggestedWhatStudied,
} from '@/lib/domain/check-in';

/**
 * What the check-in may offer to answer on the student's behalf.
 *
 * The audit's finding behind this: real work vanishes when a form is not filled in, because
 * the check-in is where several numbers come from. The pre-fill reduces that — but a
 * suggestion arriving under the student's own name is a claim about their day, so the rules
 * about what it may *not* say matter more than the rules about what it says.
 */

function evidence(overrides: Partial<CheckInEvidence> = {}): CheckInEvidence {
  return {
    assignedTopics: [],
    sessionMinutes: 0,
    grownRounds: 0,
    groveMinutes: 0,
    targetCompleted: false,
    ...overrides,
  };
}

describe('suggestedMinutes', () => {
  it('offers nothing when nothing was tracked', () => {
    expect(suggestedMinutes(evidence())).toBeNull();
  });

  it('takes the larger measure, never the sum', () => {
    // A round sat *inside* a block is counted by both. Adding them would hand almost every
    // student roughly twice the minutes they actually did.
    const both = evidence({ sessionMinutes: 50, groveMinutes: 50 });
    expect(suggestedMinutes(both)).toBe(50);
  });

  it('uses grove minutes when there was no block, and vice versa', () => {
    expect(suggestedMinutes(evidence({ groveMinutes: 25 }))).toBe(25);
    expect(suggestedMinutes(evidence({ sessionMinutes: 90 }))).toBe(90);
  });
});

describe('inferCompletion', () => {
  it('offers "completed" only for the student\'s own explicit act', () => {
    expect(inferCompletion(evidence({ targetCompleted: true }))).toBe('completed');
  });

  it('offers "partial" for tracked time alone', () => {
    expect(inferCompletion(evidence({ sessionMinutes: 30 }))).toBe('partial');
    expect(inferCompletion(evidence({ groveMinutes: 25 }))).toBe('partial');
  });

  it('never pre-fills a day as "none"', () => {
    // The absence of a record is not evidence that nothing happened, and a form opening with
    // "I did nothing" selected is one bad tap from writing that down. This is the single most
    // important rule in the module.
    expect(inferCompletion(evidence())).toBeNull();
    expect(buildCheckInPrefill(evidence()).completion).not.toBe('none');
  });

  it('a completed target outranks a short block', () => {
    expect(inferCompletion(evidence({ targetCompleted: true, sessionMinutes: 4 }))).toBe(
      'completed',
    );
  });
});

describe('suggestedWhatStudied', () => {
  it('offers nothing when no topic was assigned', () => {
    expect(suggestedWhatStudied(evidence({ sessionMinutes: 90 }))).toBeNull();
  });

  it("names the day's topics", () => {
    expect(suggestedWhatStudied(evidence({ assignedTopics: ['Inflammation'] }))).toBe(
      'Inflammation',
    );
    expect(
      suggestedWhatStudied(evidence({ assignedTopics: ['Inflammation', 'Pleural Disease'] })),
    ).toBe('Inflammation · Pleural Disease');
  });

  it('adds the rounds that grew, singular and plural', () => {
    expect(
      suggestedWhatStudied(evidence({ assignedTopics: ['Inflammation'], grownRounds: 1 })),
    ).toBe('Inflammation — 1 focus round');
    expect(
      suggestedWhatStudied(evidence({ assignedTopics: ['Inflammation'], grownRounds: 3 })),
    ).toBe('Inflammation — 3 focus rounds');
  });

  it('ignores blank topic titles rather than emitting stray separators', () => {
    expect(suggestedWhatStudied(evidence({ assignedTopics: ['', '  '] }))).toBeNull();
    expect(suggestedWhatStudied(evidence({ assignedTopics: ['Inflammation', ''] }))).toBe(
      'Inflammation',
    );
  });
});

describe('buildCheckInPrefill', () => {
  it('offers a fully empty prefill when nothing is known', () => {
    expect(buildCheckInPrefill(evidence())).toEqual({
      whatStudied: null,
      actualMinutes: null,
      completion: null,
      source: null,
    });
  });

  it('explains where its suggestion came from', () => {
    const prefill = buildCheckInPrefill(
      evidence({
        assignedTopics: ['Inflammation'],
        grownRounds: 2,
        groveMinutes: 50,
        sessionMinutes: 55,
        targetCompleted: true,
      }),
    );

    expect(prefill.whatStudied).toBe('Inflammation — 2 focus rounds');
    expect(prefill.actualMinutes).toBe(55);
    expect(prefill.completion).toBe('completed');
    expect(prefill.source).toContain('2 focus rounds');
    expect(prefill.source).toContain('55 min tracked');
    // It has to say it can be changed, or a pre-filled field reads as a decision made about
    // the student rather than a record they own.
    expect(prefill.source).toContain('Change anything');
  });

  it('says nothing about its source when it suggested nothing from activity', () => {
    // A topic was assigned but the student did no tracked work: the topic is still a useful
    // starting point, but there is no activity to cite for it.
    const prefill = buildCheckInPrefill(evidence({ assignedTopics: ['Inflammation'] }));
    expect(prefill.whatStudied).toBe('Inflammation');
    expect(prefill.source).toBeNull();
  });
});

describe('hasEvidence', () => {
  it('is false for an untouched day', () => {
    expect(hasEvidence(evidence())).toBe(false);
    // An assignment alone is not evidence of work — it is evidence of a plan.
    expect(hasEvidence(evidence({ assignedTopics: ['Inflammation'] }))).toBe(false);
  });

  it('is true once anything real happened', () => {
    expect(hasEvidence(evidence({ grownRounds: 1 }))).toBe(true);
    expect(hasEvidence(evidence({ sessionMinutes: 5 }))).toBe(true);
    expect(hasEvidence(evidence({ targetCompleted: true }))).toBe(true);
  });
});
