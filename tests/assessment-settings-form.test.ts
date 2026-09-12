import { describe, expect, it } from 'vitest';

import { assessmentSchema } from '@/lib/validation';

/**
 * The settings form, as `Object.fromEntries(formData)` hands it over.
 *
 * Every value arrives as a string, including the empty one a cleared number input sends,
 * and that empty string is what made this worth a test of its own: it coerces to zero,
 * which used to trip the per-question floor and refuse the save with "expected number to be
 * >=5" — against a field the admin had deliberately emptied, on a paper whose timing means
 * the engine will never read it.
 */

const form = (over: Record<string, string> = {}) => ({
  title: 'Mock paper',
  curriculumRef: '',
  instructions: '',
  totalTimeMinutes: '50',
  defaultQuestionSeconds: '60',
  passMarkPct: '60',
  questionsPerAttempt: '0',
  focusGraceSeconds: '5',
  allowAnswerReview: 'true',
  ...over,
});

describe('choosing one clock for the whole paper', () => {
  it('saves when the per-question default is left blank', () => {
    const parsed = assessmentSchema.safeParse(
      form({ timerMode: 'whole_paper', defaultQuestionSeconds: '' }),
    );

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    // Blank means "I am not setting one", so the column keeps the same sixty an untouched
    // form would have sent rather than a zero that no question could ever be answered in.
    expect(parsed.data.defaultQuestionSeconds).toBe(60);
    expect(parsed.data.timerMode).toBe('whole_paper');
  });

  it('insists on a total, because it is the only deadline there is', () => {
    const parsed = assessmentSchema.safeParse(
      form({ timerMode: 'whole_paper', totalTimeMinutes: '0' }),
    );

    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    const issue = parsed.error.issues[0];
    expect(issue?.path).toEqual(['totalTimeMinutes']);
    // Said in words an admin can act on, against the field they have to fix.
    expect(issue?.message).toContain('needs a total time');
  });
});

describe('per-question timing', () => {
  it('still treats a blank default as sixty rather than refusing the save', () => {
    const parsed = assessmentSchema.safeParse(
      form({ timerMode: 'per_question', defaultQuestionSeconds: '' }),
    );

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.defaultQuestionSeconds).toBe(60);
  });

  it('keeps the floor for a number that was actually typed', () => {
    // Zero is still refused when somebody means it: a one-second question is a bug.
    const parsed = assessmentSchema.safeParse(
      form({ timerMode: 'per_question', defaultQuestionSeconds: '1' }),
    );
    expect(parsed.success).toBe(false);
  });

  it('leaves the total optional', () => {
    const parsed = assessmentSchema.safeParse(
      form({ timerMode: 'per_question', totalTimeMinutes: '0' }),
    );
    expect(parsed.success).toBe(true);
  });
});

describe('a form that does not mention the timing at all', () => {
  it('leaves the mode alone rather than resetting it', () => {
    // The action writes the column only when the field is present, so an older tab or a
    // panel that never offered the choice cannot silently undo a mock exam's single clock.
    const parsed = assessmentSchema.safeParse(form());
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.timerMode).toBeUndefined();
  });
});
