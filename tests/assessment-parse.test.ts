import { describe, expect, it } from 'vitest';

import {
  hasBlockingIssues,
  parseDuration,
  parseQuestionBlock,
  summariseParse,
} from '@/lib/assessments/parse';

/**
 * The bulk importer, against what language models actually emit.
 *
 * The parser's whole job is to be forgiving about surface detail and strict about
 * substance, so these tests are mostly the messy shapes a real paste arrives in — and the
 * cases where the honest answer is "flag it, do not guess".
 */

const CLEAN = `Q1. Which nerve supplies the deltoid muscle?
TYPE: MCQ
A. Musculocutaneous nerve
B. Axillary nerve
C. Radial nerve
D. Median nerve
ANSWER: B
TIME: 45 seconds
EXPLANATION: The axillary nerve (C5-C6) supplies deltoid and teres minor.

Q2. Which artery is the direct continuation of the axillary artery?
TYPE: MCQ
A. Brachial artery
B. Radial artery
C. Ulnar artery
D. Subclavian artery
ANSWER: A
TIME: 30 seconds`;

describe('parseQuestionBlock', () => {
  it('reads the documented format', () => {
    const result = parseQuestionBlock(CLEAN);

    expect(result.questions).toHaveLength(2);
    expect(hasBlockingIssues(result)).toBe(false);

    const [first, second] = result.questions;
    expect(first!.prompt).toBe('Which nerve supplies the deltoid muscle?');
    expect(first!.type).toBe('mcq');
    expect(first!.options).toEqual([
      'Musculocutaneous nerve',
      'Axillary nerve',
      'Radial nerve',
      'Median nerve',
    ]);
    expect(first!.correctIndex).toBe(1);
    expect(first!.timeLimitSeconds).toBe(45);
    expect(first!.explanation).toContain('axillary nerve');

    expect(second!.correctIndex).toBe(0);
    expect(second!.timeLimitSeconds).toBe(30);
  });

  it('survives the decoration a chat model adds', () => {
    const messy = `Sure! Here are 2 questions on the upper limb:

**Q1.** Which nerve supplies the deltoid muscle?
**TYPE:** MCQ
- A) Musculocutaneous nerve
- B) Axillary nerve
- C) Radial nerve
- D) Median nerve
**ANSWER:** B
**TIME:** 45s

2) Which artery continues as the brachial artery?
(A) Axillary artery
(B) Radial artery
ANSWER: (A)`;

    const result = parseQuestionBlock(messy);

    expect(result.questions).toHaveLength(2);
    expect(hasBlockingIssues(result)).toBe(false);
    expect(result.questions[0]!.prompt).toBe('Which nerve supplies the deltoid muscle?');
    expect(result.questions[0]!.correctIndex).toBe(1);
    expect(result.questions[0]!.timeLimitSeconds).toBe(45);
    // The preamble is dropped rather than becoming question 1.
    expect(result.questions[0]!.number).toBe(1);
    expect(result.questions[1]!.correctIndex).toBe(0);
  });

  it('resolves an answer given as text rather than a letter', () => {
    const result = parseQuestionBlock(`Q1. Which nerve supplies the deltoid?
A. Radial nerve
B. Axillary nerve
ANSWER: Axillary nerve`);

    expect(result.questions[0]!.correctIndex).toBe(1);
    expect(hasBlockingIssues(result)).toBe(false);
  });

  it('resolves "B) Axillary nerve", which is both letter and text', () => {
    const result = parseQuestionBlock(`Q1. Which nerve supplies the deltoid?
A. Radial nerve
B. Axillary nerve
ANSWER: B) Axillary nerve`);

    expect(result.questions[0]!.correctIndex).toBe(1);
  });

  it('flags a missing answer rather than guessing one', () => {
    const result = parseQuestionBlock(`Q1. Which nerve supplies the deltoid?
A. Radial nerve
B. Axillary nerve`);

    const question = result.questions[0]!;
    expect(question.correctIndex).toBeNull();
    expect(question.issues.some((i) => i.level === 'error')).toBe(true);
    expect(hasBlockingIssues(result)).toBe(true);
  });

  it('flags an answer that matches no option', () => {
    const result = parseQuestionBlock(`Q1. Which nerve supplies the deltoid?
A. Radial nerve
B. Axillary nerve
ANSWER: E`);

    expect(result.questions[0]!.correctIndex).toBeNull();
    expect(hasBlockingIssues(result)).toBe(true);
  });

  it('flags duplicate option labels', () => {
    const result = parseQuestionBlock(`Q1. Pick one.
A. First
B. Second
B. Third
ANSWER: A`);

    const question = result.questions[0]!;
    expect(question.issues.some((i) => /duplicate/i.test(i.message))).toBe(true);
    expect(hasBlockingIssues(result)).toBe(true);
  });

  it('flags a multiple-choice question with too few options', () => {
    const result = parseQuestionBlock(`Q1. Pick one.
TYPE: MCQ
A. The only option
ANSWER: A`);

    expect(hasBlockingIssues(result)).toBe(true);
  });

  it('reads subjective questions and keeps the model answer', () => {
    const result = parseQuestionBlock(`Q1. Describe the boundaries of the cubital fossa.
TYPE: SHORT_ANSWER
ANSWER: Laterally brachioradialis, medially pronator teres.
TIME: 3 minutes

Q2. Discuss the management of acute pancreatitis.
TYPE: LONG_ANSWER
ANSWER: Fluids, analgesia, and treating the underlying cause.
TIME: 10 min`);

    const [short, long] = result.questions;
    expect(short!.type).toBe('short_answer');
    expect(short!.options).toEqual([]);
    expect(short!.referenceAnswer).toContain('brachioradialis');
    expect(short!.timeLimitSeconds).toBe(180);
    expect(long!.type).toBe('long_answer');
    expect(long!.timeLimitSeconds).toBe(600);
    expect(hasBlockingIssues(result)).toBe(false);
  });

  it('infers the type from the shape when TYPE is missing', () => {
    const result = parseQuestionBlock(`Q1. Which nerve?
A. Radial
B. Axillary
ANSWER: B

Q2. Explain the axillary nerve's course.
ANSWER: It winds around the surgical neck of the humerus.`);

    expect(result.questions[0]!.type).toBe('mcq');
    expect(result.questions[1]!.type).toBe('short_answer');
  });

  it('does not start a new question on a numbered option', () => {
    const result = parseQuestionBlock(`Q1. Which of these is correct?
A. First
B. Second
1. Not a new question
ANSWER: A`);

    expect(result.questions).toHaveLength(1);
  });

  it('leaves the timer null when none was given, so the default applies', () => {
    const result = parseQuestionBlock(`Q1. Which nerve?
A. Radial
B. Axillary
ANSWER: B`);

    expect(result.questions[0]!.timeLimitSeconds).toBeNull();
  });

  it('warns rather than fails on an unreadable timer', () => {
    const result = parseQuestionBlock(`Q1. Which nerve?
A. Radial
B. Axillary
ANSWER: B
TIME: as long as you like`);

    const question = result.questions[0]!;
    expect(question.timeLimitSeconds).toBeNull();
    expect(question.issues.some((i) => i.level === 'warning')).toBe(true);
    expect(hasBlockingIssues(result)).toBe(false);
  });

  it('keeps a multi-line explanation together', () => {
    const result = parseQuestionBlock(`Q1. Which nerve?
A. Radial
B. Axillary
ANSWER: B
EXPLANATION: The axillary nerve arises from the posterior cord.
It winds around the surgical neck of the humerus.`);

    expect(result.questions[0]!.explanation).toBe(
      'The axillary nerve arises from the posterior cord. It winds around the surgical neck of the humerus.',
    );
  });

  it('reads an image question', () => {
    const result = parseQuestionBlock(`Q1. Identify the structure arrowed.
TYPE: IMAGE_MCQ
IMAGE: https://example.org/specimen.png
A. Liver
B. Spleen
ANSWER: B`);

    const question = result.questions[0]!;
    expect(question.type).toBe('image_mcq');
    expect(question.imageUrl).toBe('https://example.org/specimen.png');
    expect(hasBlockingIssues(result)).toBe(false);
  });

  it('refuses an empty paste', () => {
    const result = parseQuestionBlock('   ');
    expect(result.questions).toHaveLength(0);
    expect(hasBlockingIssues(result)).toBe(true);
  });

  it('refuses prose with no question structure', () => {
    const result = parseQuestionBlock('Here are some thoughts about the brachial plexus.');
    expect(result.questions).toHaveLength(0);
    expect(hasBlockingIssues(result)).toBe(true);
  });

  it('summarises what needs attention', () => {
    const result = parseQuestionBlock(`Q1. Fine question?
A. One
B. Two
ANSWER: B

Q2. Broken question?
A. One
B. Two`);

    expect(summariseParse(result)).toMatchObject({ total: 2, withErrors: 1 });
  });

  it('handles a fifteen-question paste in one go', () => {
    const block = Array.from({ length: 15 }, (_, i) => {
      const n = i + 1;
      return `Q${n}. Question number ${n}?\nTYPE: MCQ\nA. Alpha\nB. Beta\nC. Gamma\nD. Delta\nANSWER: ${'ABCD'[i % 4]}\nTIME: 45 seconds`;
    }).join('\n\n');

    const result = parseQuestionBlock(block);

    expect(result.questions).toHaveLength(15);
    expect(hasBlockingIssues(result)).toBe(false);
    expect(result.questions.map((q) => q.correctIndex)).toEqual(
      Array.from({ length: 15 }, (_, i) => i % 4),
    );
  });
});

describe('parseDuration', () => {
  it.each([
    ['45', 45],
    ['45 seconds', 45],
    ['45s', 45],
    ['90 secs', 90],
    ['2 min', 120],
    ['2 minutes', 120],
    ['1 minute 30 seconds', 90],
    ['1h', 3600],
  ])('reads %s as %d seconds', (input, expected) => {
    expect(parseDuration(input)).toBe(expected);
  });

  it.each(['', 'ages', 'as long as you like', '0'])('returns null for %s', (input) => {
    expect(parseDuration(input)).toBeNull();
  });
});
